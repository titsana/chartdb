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
 * Shape (one level deeper than §5.2's diagram, for Appendix B #2):
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
 * `__order` ordinal (the item's index in the source array) onto each
 * entry's Y.Map at write time and sort by it on read, so array order
 * round-trips exactly regardless of `createdAt` collisions. `__order` is
 * never exposed on the decoded domain object.
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

function writeCollection<T extends { id: string }>(
    parent: Y.Map<unknown>,
    key: string,
    items: T[] | undefined,
    encode: (item: T) => PlainRecord = encodeFlat
): void {
    if (!items) return;
    const yMap = new Y.Map<unknown>();
    items.forEach((item, index) => {
        const itemMap = new Y.Map<unknown>();
        const encoded = encode(item);
        Object.entries(encoded).forEach(([k, v]) => itemMap.set(k, v));
        itemMap.set(ORDER_KEY, index);
        yMap.set(item.id, itemMap);
    });
    parent.set(key, yMap);
}

function readCollection<T>(
    parent: Y.Map<unknown> | undefined,
    key: string,
    decode: (raw: PlainRecord) => T
): T[] {
    const yMap = parent?.get(key) as Y.Map<unknown> | undefined;
    if (!yMap) return [];

    const entries: Array<{ order: number; id: string; value: T }> = [];
    yMap.forEach((itemMapRaw, id) => {
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

    writeCollection(tableMap, 'fields', fields);
    writeCollection(tableMap, 'indexes', indexes);

    if (checkConstraints === null) {
        tableMap.set(CHECK_CONSTRAINTS_NULL_KEY, true);
    } else if (checkConstraints !== undefined) {
        writeCollection(tableMap, 'checkConstraints', checkConstraints);
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

    const fields = readCollection<DBField>(
        tableMap,
        'fields',
        (r) => r as unknown as DBField
    );
    const indexes = readCollection<DBIndex>(
        tableMap,
        'indexes',
        (r) => r as unknown as DBIndex
    );

    const table = { ...scalars, fields, indexes } as DBTable;

    if (tableMap.has('checkConstraints')) {
        table.checkConstraints = readCollection<DBCheckConstraint>(
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

    writeCollection(
        doc.getMap<unknown>('root'),
        'relationships',
        diagram.relationships
    );
    writeCollection(
        doc.getMap<unknown>('root'),
        'dependencies',
        diagram.dependencies
    );
    writeCollection(doc.getMap<unknown>('root'), 'areas', diagram.areas);
    writeCollection(
        doc.getMap<unknown>('root'),
        'customTypes',
        diagram.customTypes
    );
    writeCollection(doc.getMap<unknown>('root'), 'notes', diagram.notes);

    return doc;
}

/** Projects a `Y.Doc` (built by `diagramToYDoc`, or merged from several) back to a `Diagram`. */
export function yDocToDiagram(doc: Y.Doc): Diagram {
    const diagramMap = doc.getMap<unknown>('diagram');
    const root = doc.getMap<unknown>('root');
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
            root,
            'relationships',
            (r) => r as unknown as DBRelationship
        ),
        dependencies: readCollection<DBDependency>(
            root,
            'dependencies',
            (r) => r as unknown as DBDependency
        ),
        areas: readCollection<Area>(root, 'areas', (r) => r as unknown as Area),
        customTypes: readCollection<DBCustomType>(
            root,
            'customTypes',
            (r) => r as unknown as DBCustomType
        ),
        notes: readCollection<Note>(root, 'notes', (r) => r as unknown as Note),
        createdAt: new Date(diagramMap.get('createdAt') as number),
        updatedAt: new Date(diagramMap.get('updatedAt') as number),
    };
}
