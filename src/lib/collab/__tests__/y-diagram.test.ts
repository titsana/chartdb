import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { DatabaseType } from '@/lib/domain/database-type';
import type { Diagram } from '@/lib/domain/diagram';
import type { DBTable } from '@/lib/domain/db-table';
import type { DBField } from '@/lib/domain/db-field';
import type { DBIndex } from '@/lib/domain/db-index';
import { diagramToYDoc, yDocToDiagram } from '../y-diagram';

/**
 * Phase 2 step 1/2 (docs/design/realtime-collaboration.md §10): pure
 * round-trip fidelity for `y-diagram.ts`'s Diagram <-> Y.Doc projection,
 * then the actual appendix-b:2 proof — two independent in-memory Y.Docs
 * merging a concurrent field edit and a concurrent index add on the same
 * table without either clobbering the other.
 */

const field = (overrides: Partial<DBField>): DBField => ({
    id: 'field-1',
    name: 'field',
    type: { id: 'integer', name: 'integer' },
    primaryKey: false,
    unique: false,
    nullable: true,
    createdAt: 1,
    ...overrides,
});

const index = (overrides: Partial<DBIndex>): DBIndex => ({
    id: 'index-1',
    name: 'index',
    unique: false,
    fieldIds: ['field-1'],
    createdAt: 1,
    ...overrides,
});

const table = (overrides: Partial<DBTable>): DBTable => ({
    id: 'table-1',
    name: 'table_1',
    schema: 'public',
    x: 0,
    y: 0,
    fields: [],
    indexes: [],
    color: '#000000',
    isView: false,
    createdAt: 1,
    ...overrides,
});

const diagram = (overrides: Partial<Diagram>): Diagram => ({
    id: 'diagram-1',
    name: 'my diagram',
    databaseType: DatabaseType.GENERIC,
    tables: [],
    relationships: [],
    dependencies: [],
    areas: [],
    customTypes: [],
    notes: [],
    createdAt: new Date(1000),
    updatedAt: new Date(2000),
    ...overrides,
});

// pulls tableId's fields Y.Map out of a doc built by diagramToYDoc — the
// only way to simulate a "concurrent peer" mutation before Phase 2 has a
// provider wired up to Y.Doc.
function getTableMap(doc: Y.Doc, tableId: string): Y.Map<unknown> {
    return doc.getMap<unknown>('tables').get(tableId) as Y.Map<unknown>;
}

function getFieldMap(
    doc: Y.Doc,
    tableId: string,
    fieldId: string
): Y.Map<unknown> {
    const fieldsMap = getTableMap(doc, tableId).get('fields') as Y.Map<unknown>;
    return fieldsMap.get(fieldId) as Y.Map<unknown>;
}

function sync(a: Y.Doc, b: Y.Doc): void {
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
}

describe('y-diagram round-trip', () => {
    it('round-trips a diagram with no tables', () => {
        const d = diagram({});
        const result = yDocToDiagram(diagramToYDoc(d));
        expect(result).toEqual(d);
    });

    it('round-trips fields, indexes, and preserves array order', () => {
        const f1 = field({ id: 'f1', name: 'id' });
        const f2 = field({ id: 'f2', name: 'created_at' });
        const f3 = field({ id: 'f3', name: 'name' });
        const i1 = index({ id: 'i1', name: 'pk_idx', fieldIds: ['f1'] });
        const i2 = index({ id: 'i2', name: 'name_idx', fieldIds: ['f3'] });
        const d = diagram({
            tables: [table({ fields: [f1, f2, f3], indexes: [i1, i2] })],
        });

        const result = yDocToDiagram(diagramToYDoc(d));

        expect(result.tables![0].fields).toEqual([f1, f2, f3]);
        expect(result.tables![0].indexes).toEqual([i1, i2]);
    });

    it('round-trips the three checkConstraints states: absent, null, and present', () => {
        const absent = table({ id: 't-absent' });
        delete absent.checkConstraints;
        const isNull = table({ id: 't-null', checkConstraints: null });
        const present = table({
            id: 't-present',
            checkConstraints: [
                { id: 'cc1', expression: 'x > 0', createdAt: 1 },
            ],
        });
        const empty = table({ id: 't-empty', checkConstraints: [] });

        const d = diagram({ tables: [absent, isNull, present, empty] });
        const result = yDocToDiagram(diagramToYDoc(d));
        const byId = (id: string) => result.tables!.find((t) => t.id === id)!;

        expect('checkConstraints' in byId('t-absent')).toBe(false);
        expect(byId('t-null').checkConstraints).toBeNull();
        expect(byId('t-present').checkConstraints).toEqual(
            present.checkConstraints
        );
        expect(byId('t-empty').checkConstraints).toEqual([]);
    });

    it('round-trips relationships, dependencies, areas, customTypes, notes, and table order', () => {
        const d = diagram({
            tables: [
                table({ id: 't1', order: 0 }),
                table({ id: 't2', order: 1 }),
            ],
            relationships: [
                {
                    id: 'r1',
                    name: 'rel',
                    sourceTableId: 't1',
                    targetTableId: 't2',
                    sourceFieldId: 'f1',
                    targetFieldId: 'f2',
                    sourceCardinality: 'one',
                    targetCardinality: 'many',
                    createdAt: 1,
                },
            ],
            dependencies: [
                {
                    id: 'dep1',
                    tableId: 't1',
                    dependentTableId: 't2',
                    createdAt: 1,
                },
            ],
            areas: [
                {
                    id: 'a1',
                    name: 'area',
                    x: 0,
                    y: 0,
                    width: 10,
                    height: 10,
                    color: '#fff',
                },
            ],
            customTypes: [
                {
                    id: 'ct1',
                    name: 'my_enum',
                    kind: 'enum' as never,
                    values: ['a', 'b'],
                },
            ],
            notes: [
                {
                    id: 'n1',
                    content: 'note',
                    x: 0,
                    y: 0,
                    width: 10,
                    height: 10,
                    color: '#fff',
                },
            ],
        });

        const result = yDocToDiagram(diagramToYDoc(d));

        expect(result.tables!.map((t) => t.id)).toEqual(['t1', 't2']);
        expect(result.relationships).toEqual(d.relationships);
        expect(result.dependencies).toEqual(d.dependencies);
        expect(result.areas).toEqual(d.areas);
        expect(result.customTypes).toEqual(d.customTypes);
        expect(result.notes).toEqual(d.notes);
    });
});

describe('y-diagram concurrent merge (appendix-b:2 proof)', () => {
    it('a concurrent field rename and a concurrent index add on the same table both survive the merge', () => {
        const f1 = field({ id: 'f1', name: 'original_name' });
        const baseDiagram = diagram({
            tables: [table({ id: 't1', fields: [f1], indexes: [] })],
        });
        const baseDoc = diagramToYDoc(baseDiagram);

        // two independent peers, each starting from the same synced state
        const docA = new Y.Doc();
        Y.applyUpdate(docA, Y.encodeStateAsUpdate(baseDoc));
        const docB = new Y.Doc();
        Y.applyUpdate(docB, Y.encodeStateAsUpdate(baseDoc));

        // peer A renames the field
        docA.transact(() => {
            getFieldMap(docA, 't1', 'f1').set('name', 'renamed_by_a');
        });

        // peer B, concurrently (before seeing A's edit), adds a new index
        // to the same table
        docB.transact(() => {
            const indexesMap = getTableMap(docB, 't1').get(
                'indexes'
            ) as Y.Map<unknown>;
            const newIndexMap = new Y.Map<unknown>();
            const newIndex = index({ id: 'i-new', fieldIds: ['f1'] });
            Object.entries(newIndex).forEach(([k, v]) => newIndexMap.set(k, v));
            newIndexMap.set('__order', indexesMap.size);
            indexesMap.set('i-new', newIndexMap);
        });

        sync(docA, docB);

        const merged = yDocToDiagram(docA);
        const mergedTable = merged.tables![0];

        // neither peer's write was silently dropped — this is the bug
        // appendix-b:2 describes: today's `fields: DBField[]` whole-array
        // write from A would have raced with B's whole-array write and one
        // would have won outright, discarding the other's change entirely.
        expect(mergedTable.fields[0].name).toBe('renamed_by_a');
        expect(mergedTable.indexes.map((i) => i.id)).toEqual(['i-new']);
    });

    it('concurrent primary-key assignment on two different fields of the same table both survive the merge', () => {
        const f1 = field({ id: 'f1', primaryKey: false });
        const f2 = field({ id: 'f2', primaryKey: false });
        const baseDiagram = diagram({
            tables: [table({ id: 't1', fields: [f1, f2] })],
        });
        const baseDoc = diagramToYDoc(baseDiagram);

        const docA = new Y.Doc();
        Y.applyUpdate(docA, Y.encodeStateAsUpdate(baseDoc));
        const docB = new Y.Doc();
        Y.applyUpdate(docB, Y.encodeStateAsUpdate(baseDoc));

        docA.transact(() => {
            getFieldMap(docA, 't1', 'f1').set('primaryKey', true);
        });
        docB.transact(() => {
            getFieldMap(docB, 't1', 'f2').set('primaryKey', true);
        });

        sync(docA, docB);

        const merged = yDocToDiagram(docA);
        const byId = (id: string) =>
            merged.tables![0].fields.find((f) => f.id === id)!;

        expect(byId('f1').primaryKey).toBe(true);
        expect(byId('f2').primaryKey).toBe(true);
    });

    it('concurrent table creation by two peers both survive the merge', () => {
        const baseDiagram = diagram({ tables: [] });
        const baseDoc = diagramToYDoc(baseDiagram);

        const docA = new Y.Doc();
        Y.applyUpdate(docA, Y.encodeStateAsUpdate(baseDoc));
        const docB = new Y.Doc();
        Y.applyUpdate(docB, Y.encodeStateAsUpdate(baseDoc));

        docA.transact(() => {
            const tablesMap = docA.getMap<unknown>('tables');
            const newTable = table({ id: 'ta', name: 'table_a', order: 0 });
            const tableMap = new Y.Map<unknown>();
            const { fields, indexes, ...scalars } = newTable;
            Object.entries(scalars).forEach(([k, v]) => tableMap.set(k, v));
            const fieldsMap = new Y.Map<unknown>();
            const indexesMap = new Y.Map<unknown>();
            tableMap.set('fields', fieldsMap);
            tableMap.set('indexes', indexesMap);
            void fields;
            void indexes;
            tablesMap.set('ta', tableMap);
        });
        docB.transact(() => {
            const tablesMap = docB.getMap<unknown>('tables');
            const newTable = table({ id: 'tb', name: 'table_b', order: 0 });
            const tableMap = new Y.Map<unknown>();
            const { fields, indexes, ...scalars } = newTable;
            Object.entries(scalars).forEach(([k, v]) => tableMap.set(k, v));
            const fieldsMap = new Y.Map<unknown>();
            const indexesMap = new Y.Map<unknown>();
            tableMap.set('fields', fieldsMap);
            tableMap.set('indexes', indexesMap);
            void fields;
            void indexes;
            tablesMap.set('tb', tableMap);
        });

        sync(docA, docB);

        const merged = yDocToDiagram(docA);
        expect(merged.tables!.map((t) => t.id).sort()).toEqual(['ta', 'tb']);
    });
});
