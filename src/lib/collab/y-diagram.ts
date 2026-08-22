import * as Y from 'yjs';
import type { Diagram } from '@/lib/domain/diagram';
import type { DBTable } from '@/lib/domain/db-table';
import type { DBField } from '@/lib/domain/db-field';
import type { DBIndex } from '@/lib/domain/db-index';
import type { DBCheckConstraint } from '@/lib/domain/db-check-constraint';
import type { DBRelationship } from '@/lib/domain/db-relationship';
import type { DBDependency } from '@/lib/domain/db-dependency';
import type { Area } from '@/lib/domain/area';
import type { DBCustomType } from '@/lib/domain/db-custom-type';
import type { Note } from '@/lib/domain/note';

/**
 * Phase 2 (docs/design/realtime-collaboration.md §10) — pure projection
 * between a `Diagram` and a `Y.Doc`. No provider/React wiring here; this is
 * step 1 of Phase 2, verified by round-trip and concurrent-merge tests
 * before anything touches `chartdb-provider.tsx`.
 *
 * Shape (one level deeper than §5.2's diagram, for Appendix B #2). Every
 * name below is a genuine top-level `doc.getMap(name)` — matches §5.2,
 * code and doc agree:
 *
 *   doc.getMap('diagram')       -> scalar diagram props
 *   doc.getMap('tables')        -> Y.Map<tableId, Y.Map<...>>
 *     each table's Y.Map        -> scalar table props, plus:
 *       .get('fields')          -> Y.Map<fieldId, Y.Map<field props>>
 *       .get('indexes')         -> Y.Map<indexId, Y.Map<index props>>
 *       .get('checkConstraints')-> Y.Map<ccId, Y.Map<cc props>> (see below)
 *   doc.getMap('relationships') -> Y.Map<id, Y.Map<...>>
 *   doc.getMap('dependencies')  -> Y.Map<id, Y.Map<...>>
 *   doc.getMap('areas')         -> Y.Map<id, Y.Map<...>>
 *   doc.getMap('customTypes')   -> Y.Map<id, Y.Map<...>>
 *   doc.getMap('notes')         -> Y.Map<id, Y.Map<...>>
 *
 * This is what makes appendix-b:2 real: a concurrent field-rename and a
 * concurrent index-add on the *same table* land in two different Y.Maps
 * (`fields` vs `indexes`) and merge independently — neither write can
 * clobber the other, unlike today's single `fields: DBField[]` blob.
 *
 * Field order: `fields`/`indexes`/`checkConstraints` (and every top-level
 * collection) are Y.Maps, which have no order. We stamp an internal
 * `__order` ordinal onto each entry's Y.Map and sort by it on read, so
 * array order round-trips exactly regardless of `createdAt` collisions.
 * `__order` is never exposed on the decoded domain object.
 *
 * `__order` ceiling (ponytail: known, not yet a problem): it's an absolute
 * index, not a fractional/rebalanced key. `upsertItem` appends new items
 * at `size`, so a create is always correct; but `removeItemFromCollection`
 * leaves a gap (removing the 2nd of 3 leaves orders 0, 2), and nothing
 * currently closes gaps or lets a caller reorder existing items. Both are
 * fine for `updateField`-shaped patches (order never changes) but must be
 * addressed — a full re-stamp of every sibling's `__order`, or a switch to
 * fractional indexing — before wiring `removeField`/reordering UI.
 */

const ORDER_KEY = '__order';
const CHECK_CONSTRAINTS_NULL_KEY = 'checkConstraintsIsNull';

type PlainRecord = Record<string, unknown>;

function encodeFlat<T extends PlainRecord>(item: T): PlainRecord {
    // ponytail: every collection here (relationships, dependencies, areas,
    // customTypes, notes, and a table's own scalar props) is already
    // JSON-plain — no nested Date/Map/etc — so a shallow copy is the whole
    // encode step. Only DBTable's fields/indexes/checkConstraints need
    // real per-item handling, done separately below.
    return { ...item };
}

/** Populates an existing (already-attached) collection Y.Map from scratch. Build-only — see writeNestedCollection. */
function populateCollection<T extends { id: string }>(
    collectionMap: Y.Map<unknown>,
    items: T[],
    encode: (item: T) => PlainRecord
): void {
    items.forEach((item, index) => {
        const itemMap = new Y.Map<unknown>();
        const encoded = encode(item);
        Object.entries(encoded).forEach(([k, v]) => itemMap.set(k, v));
        itemMap.set(ORDER_KEY, index);
        collectionMap.set(item.id, itemMap);
    });
}

/**
 * Creates a *new* nested Y.Map under `key` on `parent` and populates it.
 * Build-only: calling this on a parent that already has `key` set REPLACES
 * the whole nested map (same whole-blob hazard appendix-b:2 is about, one
 * level down). Only reachable from the fresh-doc build path below — for
 * incremental writes against a live doc, get the existing map via
 * `parent.get(key)` and call `upsertItem`/`patchItem` on it directly.
 */
function writeNestedCollection<T extends { id: string }>(
    parent: Y.Map<unknown>,
    key: string,
    items: T[] | undefined,
    encode: (item: T) => PlainRecord = encodeFlat
): void {
    if (!items) return;
    const collectionMap = new Y.Map<unknown>();
    populateCollection(collectionMap, items, encode);
    parent.set(key, collectionMap);
}

/**
 * Decodes an entire collection Y.Map back to a sorted array. Exported —
 * this is also how a live provider re-derives full state after a
 * structural change (an entry added/removed), as opposed to `readItem`
 * for a surgical single-entry update. See `y-diagram.test.ts` and the
 * usage note on `readItem` below.
 */
export function readCollection<T>(
    collectionMap: Y.Map<unknown> | undefined,
    decode: (raw: PlainRecord) => T
): T[] {
    if (!collectionMap) return [];

    const entries: Array<{ order: number; id: string; value: T }> = [];
    collectionMap.forEach((itemMapRaw, id) => {
        const itemMap = itemMapRaw as Y.Map<unknown>;
        const raw: PlainRecord = { id };
        itemMap.forEach((v, k) => {
            if (k !== ORDER_KEY) raw[k] = v;
        });
        const order = (itemMap.get(ORDER_KEY) as number | undefined) ?? 0;
        entries.push({ order, id, value: decode(raw) });
    });
    // tie-break by id for a fully deterministic order across peers, even
    // in the (should-never-happen) case of a duplicate __order.
    entries.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));
    return entries.map((e) => e.value);
}

function readNestedCollection<T>(
    parent: Y.Map<unknown> | undefined,
    key: string,
    decode: (raw: PlainRecord) => T
): T[] {
    return readCollection(
        parent?.get(key) as Y.Map<unknown> | undefined,
        decode
    );
}

/**
 * Decodes exactly one entry out of a collection Y.Map, without touching
 * the rest — what an observer uses for a non-structural change (an
 * existing entry's fields changed, nothing added/removed), so untouched
 * sibling entries keep their object identity in React state instead of
 * every entry getting rebuilt on every edit.
 */
export function readItem<T>(
    collectionMap: Y.Map<unknown>,
    id: string,
    decode: (raw: PlainRecord) => T
): T | undefined {
    const itemMap = collectionMap.get(id) as Y.Map<unknown> | undefined;
    if (!itemMap) return undefined;
    const raw: PlainRecord = { id };
    itemMap.forEach((v, k) => {
        if (k !== ORDER_KEY) raw[k] = v;
    });
    return decode(raw);
}

// ---- Incremental (live-doc) helpers — step 3 (provider wiring) uses these ----

/** Gets `key` on `parent` as a Y.Map, creating an empty one in place if absent. Never replaces an existing map. */
export function getOrCreateNestedMap(
    parent: Y.Map<unknown>,
    key: string
): Y.Map<unknown> {
    const existing = parent.get(key) as Y.Map<unknown> | undefined;
    if (existing) return existing;
    const created = new Y.Map<unknown>();
    parent.set(key, created);
    return created;
}

/**
 * Creates or fully replaces one item's entry in `collectionMap`. A create
 * (no existing entry for `item.id`) appends at the end (`__order = size`);
 * an update to an existing entry preserves its current `__order`. Safe for
 * concurrent use across different item ids — only ever touches the one
 * entry keyed by `item.id`, never the collection map itself.
 */
export function upsertItem<T extends { id: string }>(
    collectionMap: Y.Map<unknown>,
    item: T,
    encode: (item: T) => PlainRecord = encodeFlat
): void {
    const existing = collectionMap.get(item.id) as Y.Map<unknown> | undefined;
    const itemMap = existing ?? new Y.Map<unknown>();
    const order =
        (existing?.get(ORDER_KEY) as number | undefined) ?? collectionMap.size;
    const encoded = encode(item);
    Object.entries(encoded).forEach(([k, v]) => itemMap.set(k, v));
    itemMap.set(ORDER_KEY, order);
    if (!existing) collectionMap.set(item.id, itemMap);
}

/**
 * Patches only the given keys on an existing item — the real per-field
 * write `updateField` needs, as opposed to `upsertItem`'s whole-object
 * replace. No-ops (does not throw) if `id` isn't in the collection, since
 * a concurrent delete racing a patch is a legitimate outcome to just drop.
 */
export function patchItem(
    collectionMap: Y.Map<unknown>,
    id: string,
    patch: PlainRecord
): void {
    const itemMap = collectionMap.get(id) as Y.Map<unknown> | undefined;
    if (!itemMap) return;
    Object.entries(patch).forEach(([k, v]) => itemMap.set(k, v));
}

/** Removes one item from a collection. See the `__order` ceiling note above — this leaves a gap, doesn't renumber. */
export function removeItemFromCollection(
    collectionMap: Y.Map<unknown>,
    id: string
): void {
    collectionMap.delete(id);
}

// ---- Whole-table helpers (nested fields/indexes/checkConstraints) ----

function encodeTable(table: DBTable): {
    scalars: PlainRecord;
    fields: DBField[];
    indexes: DBIndex[];
    checkConstraints: DBCheckConstraint[] | null | undefined;
} {
    const { fields, indexes, checkConstraints, ...scalars } = table;
    return { scalars, fields, indexes, checkConstraints };
}

function writeTable(tablesMap: Y.Map<unknown>, table: DBTable): void {
    const { scalars, fields, indexes, checkConstraints } = encodeTable(table);

    const tableMap = new Y.Map<unknown>();
    Object.entries(scalars).forEach(([k, v]) => tableMap.set(k, v));

    writeNestedCollection(tableMap, 'fields', fields);
    writeNestedCollection(tableMap, 'indexes', indexes);

    if (checkConstraints === null) {
        tableMap.set(CHECK_CONSTRAINTS_NULL_KEY, true);
    } else if (checkConstraints !== undefined) {
        writeNestedCollection(tableMap, 'checkConstraints', checkConstraints);
    }
    // else: absent entirely — neither key nor nested map is written, and
    // readTable below reproduces "absent" for that case.

    tablesMap.set(table.id, tableMap);
}

function readTable(id: string, tableMap: Y.Map<unknown>): DBTable {
    const scalars: PlainRecord = { id };
    tableMap.forEach((v, k) => {
        if (
            k === 'fields' ||
            k === 'indexes' ||
            k === 'checkConstraints' ||
            k === CHECK_CONSTRAINTS_NULL_KEY
        ) {
            return;
        }
        scalars[k] = v;
    });

    const fields = readNestedCollection<DBField>(
        tableMap,
        'fields',
        (r) => r as unknown as DBField
    );
    const indexes = readNestedCollection<DBIndex>(
        tableMap,
        'indexes',
        (r) => r as unknown as DBIndex
    );

    const table = { ...scalars, fields, indexes } as DBTable;

    if (tableMap.has('checkConstraints')) {
        table.checkConstraints = readNestedCollection<DBCheckConstraint>(
            tableMap,
            'checkConstraints',
            (r) => r as unknown as DBCheckConstraint
        );
    } else if (tableMap.get(CHECK_CONSTRAINTS_NULL_KEY) === true) {
        table.checkConstraints = null;
    }
    // else: leave the property unset — matches "absent" on the source.

    return table;
}

/** Builds a fresh `Y.Doc` from a `Diagram`. Pure — does not mutate `diagram`. */
export function diagramToYDoc(diagram: Diagram): Y.Doc {
    const doc = new Y.Doc();

    const diagramMap = doc.getMap<unknown>('diagram');
    diagramMap.set('id', diagram.id);
    diagramMap.set('name', diagram.name);
    diagramMap.set('databaseType', diagram.databaseType);
    if (diagram.databaseEdition !== undefined) {
        diagramMap.set('databaseEdition', diagram.databaseEdition);
    }
    diagramMap.set('createdAt', diagram.createdAt.getTime());
    diagramMap.set('updatedAt', diagram.updatedAt.getTime());

    const tablesMap = doc.getMap<unknown>('tables');
    (diagram.tables ?? []).forEach((table) => writeTable(tablesMap, table));

    populateCollection(
        doc.getMap<unknown>('relationships'),
        diagram.relationships ?? [],
        encodeFlat
    );
    populateCollection(
        doc.getMap<unknown>('dependencies'),
        diagram.dependencies ?? [],
        encodeFlat
    );
    populateCollection(
        doc.getMap<unknown>('areas'),
        diagram.areas ?? [],
        encodeFlat
    );
    populateCollection(
        doc.getMap<unknown>('customTypes'),
        diagram.customTypes ?? [],
        encodeFlat
    );
    populateCollection(
        doc.getMap<unknown>('notes'),
        diagram.notes ?? [],
        encodeFlat
    );

    return doc;
}

/** Projects a `Y.Doc` (built by `diagramToYDoc`, or merged from several) back to a `Diagram`. */
export function yDocToDiagram(doc: Y.Doc): Diagram {
    const diagramMap = doc.getMap<unknown>('diagram');
    const tablesMap = doc.getMap<unknown>('tables');

    const tables: DBTable[] = [];
    tablesMap.forEach((tableMapRaw, id) => {
        tables.push(readTable(id, tableMapRaw as Y.Map<unknown>));
    });
    tables.sort((a, b) => {
        const orderA = a.order ?? 0;
        const orderB = b.order ?? 0;
        return orderA - orderB || (a.id < b.id ? -1 : 1);
    });

    return {
        id: diagramMap.get('id') as string,
        name: diagramMap.get('name') as string,
        databaseType: diagramMap.get('databaseType') as Diagram['databaseType'],
        databaseEdition: diagramMap.get(
            'databaseEdition'
        ) as Diagram['databaseEdition'],
        tables,
        relationships: readCollection<DBRelationship>(
            doc.getMap<unknown>('relationships'),
            (r) => r as unknown as DBRelationship
        ),
        dependencies: readCollection<DBDependency>(
            doc.getMap<unknown>('dependencies'),
            (r) => r as unknown as DBDependency
        ),
        areas: readCollection<Area>(
            doc.getMap<unknown>('areas'),
            (r) => r as unknown as Area
        ),
        customTypes: readCollection<DBCustomType>(
            doc.getMap<unknown>('customTypes'),
            (r) => r as unknown as DBCustomType
        ),
        notes: readCollection<Note>(
            doc.getMap<unknown>('notes'),
            (r) => r as unknown as Note
        ),
        createdAt: new Date(diagramMap.get('createdAt') as number),
        updatedAt: new Date(diagramMap.get('updatedAt') as number),
    };
}
