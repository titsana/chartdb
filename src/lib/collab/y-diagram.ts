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
 * one past the current max (NOT `collectionMap.size` — a prior delete
 * leaves a gap, e.g. removing the 2nd of 3 leaves orders 0, 2, and `size`
 * after that delete is 2, which would collide with the surviving order-2
 * item), so a create always lands strictly last. But nothing currently
 * closes the gap itself or lets a caller reorder existing items — fine
 * for `updateField`-shaped patches (order never changes) but must be
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

/**
 * `Note`/`Area`/`DBCustomType`/`DBTable` all carry their own optional
 * `order` domain field, separate from this module's internal `__order`
 * — the domain one is user-facing (e.g. the notes side panel's
 * drag-to-reorder writes it via `updateNote`), the internal one only
 * exists so an otherwise-orderless Y.Map round-trips array position at
 * all. When a decoded item has an explicit domain `order`, it must win
 * the sort — otherwise a drag-reorder appears to work (the observer
 * patches the field) and then silently reverts on the next structural
 * change, which re-sorts by `__order` and ignores it.
 */
function sortKeyFor(value: unknown, internalOrder: number): number {
    const domainOrder = (value as { order?: unknown } | null)?.order;
    return typeof domainOrder === 'number' ? domainOrder : internalOrder;
}

/**
 * Stable comparator for re-sorting an already-decoded array after a
 * non-structural (single-entry) observer update — e.g. a drag-reorder
 * that only patched one item's `order` field. Items without an explicit
 * `order` sort as if `+Infinity`; combined with `Array.prototype.sort`'s
 * spec-guaranteed stability, that preserves their existing relative
 * position (which already reflects the last correct `__order`-based
 * sort) instead of needing the internal ordinal at this layer too.
 */
export function compareByDomainOrder<T extends { order?: number | null }>(
    a: T,
    b: T
): number {
    const orderA = typeof a.order === 'number' ? a.order : Infinity;
    const orderB = typeof b.order === 'number' ? b.order : Infinity;
    return orderA - orderB;
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
        const internalOrder =
            (itemMap.get(ORDER_KEY) as number | undefined) ?? 0;
        const value = decode(raw);
        entries.push({ order: sortKeyFor(value, internalOrder), id, value });
    });
    // tie-break by id for a fully deterministic order across peers, even
    // in the (should-never-happen) case of a duplicate order.
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
 * (no existing entry for `item.id`) appends at the end (`__order` = one
 * past the current max, NOT `collectionMap.size` — a prior delete leaves
 * a gap, so `size` collides with the last remaining item's order); an
 * update to an existing entry preserves its current `__order`. Safe for
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
    const order = existing?.get(ORDER_KEY) as number | undefined;
    const nextOrder = order ?? nextOrderFor(collectionMap);
    const encoded = encode(item);
    Object.entries(encoded).forEach(([k, v]) => itemMap.set(k, v));
    itemMap.set(ORDER_KEY, nextOrder);
    if (!existing) collectionMap.set(item.id, itemMap);
}

function nextOrderFor(collectionMap: Y.Map<unknown>): number {
    let max = -1;
    collectionMap.forEach((itemMapRaw) => {
        const itemOrder = (itemMapRaw as Y.Map<unknown>).get(ORDER_KEY) as
            | number
            | undefined;
        if (itemOrder !== undefined && itemOrder > max) max = itemOrder;
    });
    return max + 1;
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

/**
 * Reconciles a flat collection Y.Map to exactly match `desiredItems`:
 * upserts every desired item (create-or-patch via `upsertItem` — an
 * existing entry keeps its `__order` and only its changed props are
 * touched; a new one is appended) and removes anything present in the
 * map but absent from `desiredItems`. This is what a doc-backed
 * "replace the whole array with this one" write becomes — the array
 * itself has no meaning against a Y.Map, but "make the map's contents
 * equal this array" does, and it's what `updateTablesState`'s
 * `forceOverride` replay (and every other whole-array-replace caller)
 * needs. Removal happens before upserting so a freed `__order` can't be
 * mistaken for a still-live item's order by `nextOrderFor`.
 */
export function reconcileCollection<T extends { id: string }>(
    collectionMap: Y.Map<unknown>,
    desiredItems: T[],
    encode: (item: T) => PlainRecord = encodeFlat
): void {
    const desiredIds = new Set(desiredItems.map((item) => item.id));
    const idsToRemove: string[] = [];
    collectionMap.forEach((_itemMap, id) => {
        if (!desiredIds.has(id)) idsToRemove.push(id);
    });
    idsToRemove.forEach((id) => collectionMap.delete(id));
    desiredItems.forEach((item) => upsertItem(collectionMap, item, encode));
}

/**
 * Removes every item from `collectionMap` that references one of `ids`
 * through any of `fieldNames` — e.g. a relationship whose sourceTableId
 * or targetTableId points at a table being deleted. This is the
 * appendix-b:3 cascade-delete (removeTables/updateTablesState), moved to
 * the doc: it reads the live `collectionMap` directly at the point the
 * caller's transaction runs, not a React-state closure snapshot from
 * before the transaction started, so a relationship/dependency added by
 * a concurrent write can't slip past it (the same guarantee the original
 * React-state fix gave, now against the doc instead of `setState`).
 */
export function removeItemsReferencing(
    collectionMap: Y.Map<unknown>,
    fieldNames: string[],
    ids: string[]
): void {
    const idsToRemove: string[] = [];
    collectionMap.forEach((itemMapRaw, itemId) => {
        const itemMap = itemMapRaw as Y.Map<unknown>;
        const references = fieldNames.some((field) =>
            ids.includes(itemMap.get(field) as string)
        );
        if (references) idsToRemove.push(itemId);
    });
    idsToRemove.forEach((id) => collectionMap.delete(id));
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

/**
 * Creates or fully reconciles one table's entry in `tablesMap` to match
 * `table`: scalar props are patched onto the table's own Y.Map (created
 * fresh if this is a new table id); `fields`/`indexes`/`checkConstraints`
 * are reconciled into their nested Y.Maps via `reconcileCollection`
 * (created fresh if absent, via `getOrCreateNestedMap` — never replaced
 * if they already exist, so untouched fields/indexes on an existing
 * table keep their `__order` and object identity). Safe against BOTH a
 * brand-new table id (behaves like a from-scratch build) and an
 * existing one (an in-place, per-entity diff) — this is the one
 * function every table-mutating provider method funnels through.
 */
export function upsertTable(tablesMap: Y.Map<unknown>, table: DBTable): void {
    const { scalars, fields, indexes, checkConstraints } = encodeTable(table);

    let tableMap = tablesMap.get(table.id) as Y.Map<unknown> | undefined;
    if (!tableMap) {
        tableMap = new Y.Map<unknown>();
        tablesMap.set(table.id, tableMap);
    }
    Object.entries(scalars).forEach(([k, v]) => tableMap!.set(k, v));

    reconcileCollection(getOrCreateNestedMap(tableMap, 'fields'), fields);
    reconcileCollection(getOrCreateNestedMap(tableMap, 'indexes'), indexes);

    if (checkConstraints === null) {
        tableMap.delete('checkConstraints');
        tableMap.set(CHECK_CONSTRAINTS_NULL_KEY, true);
    } else if (checkConstraints !== undefined) {
        tableMap.delete(CHECK_CONSTRAINTS_NULL_KEY);
        reconcileCollection(
            getOrCreateNestedMap(tableMap, 'checkConstraints'),
            checkConstraints
        );
    } else {
        // absent entirely — clear whichever representation an existing
        // table might have had; readTable reproduces "absent" only when
        // neither key is set.
        tableMap.delete('checkConstraints');
        tableMap.delete(CHECK_CONSTRAINTS_NULL_KEY);
    }
}

/**
 * Reconciles the whole `tables` map to exactly match `desiredTables` —
 * the table-level equivalent of `reconcileCollection`, for
 * `updateTablesState`'s `forceOverride` replay. Removing an id here
 * removes its entire nested subtree (fields/indexes/checkConstraints)
 * with it, which is exactly cascade-delete's intent.
 */
export function reconcileTables(
    tablesMap: Y.Map<unknown>,
    desiredTables: DBTable[]
): void {
    const desiredIds = new Set(desiredTables.map((t) => t.id));
    const idsToRemove: string[] = [];
    tablesMap.forEach((_tableMap, id) => {
        if (!desiredIds.has(id)) idsToRemove.push(id);
    });
    idsToRemove.forEach((id) => tablesMap.delete(id));
    desiredTables.forEach((table) => upsertTable(tablesMap, table));
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

/**
 * Decodes the whole `tables` map back to an array, sorted by each
 * table's own domain `order` field (tables have never used the internal
 * `__order` for their own top-level position — `order` already existed
 * on `DBTable` before Phase 2 and is what `createTable`'s counter
 * assigns). Exported for `useYCollectionSync`'s `readAll` — the
 * structural-change path for the `tables` collection.
 */
export function readTables(tablesMap: Y.Map<unknown>): DBTable[] {
    const tables: DBTable[] = [];
    tablesMap.forEach((tableMapRaw, id) => {
        tables.push(readTable(id, tableMapRaw as Y.Map<unknown>));
    });
    tables.sort((a, b) => {
        const orderA = a.order ?? 0;
        const orderB = b.order ?? 0;
        return orderA - orderB || (a.id < b.id ? -1 : 1);
    });
    return tables;
}

/**
 * Decodes exactly one table out of `tablesMap`, without touching the
 * rest — `useYCollectionSync`'s `readOne` for the `tables` collection,
 * used on a non-structural change (this table's own scalar props, or a
 * field/index/checkConstraint nested inside it, changed — nothing added
 * or removed at the top `tablesMap` level).
 */
export function readTableItem(
    tablesMap: Y.Map<unknown>,
    id: string
): DBTable | undefined {
    const tableMap = tablesMap.get(id) as Y.Map<unknown> | undefined;
    if (!tableMap) return undefined;
    return readTable(id, tableMap);
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
    (diagram.tables ?? []).forEach((table) => upsertTable(tablesMap, table));

    reconcileCollection(
        doc.getMap<unknown>('relationships'),
        diagram.relationships ?? []
    );
    reconcileCollection(
        doc.getMap<unknown>('dependencies'),
        diagram.dependencies ?? []
    );
    reconcileCollection(doc.getMap<unknown>('areas'), diagram.areas ?? []);
    reconcileCollection(
        doc.getMap<unknown>('customTypes'),
        diagram.customTypes ?? []
    );
    reconcileCollection(doc.getMap<unknown>('notes'), diagram.notes ?? []);

    return doc;
}

/** Projects a `Y.Doc` (built by `diagramToYDoc`, or merged from several) back to a `Diagram`. */
export function yDocToDiagram(doc: Y.Doc): Diagram {
    const diagramMap = doc.getMap<unknown>('diagram');
    const tables = readTables(doc.getMap<unknown>('tables'));

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
