import React, { useContext } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { EventEmitter } from 'ahooks/lib/useEventEmitter';
import { ChartDBProvider } from '../chartdb-provider';
import { useChartDB } from '@/hooks/use-chartdb';
import { RedoUndoStackProvider } from '@/context/history-context/redo-undo-stack-provider';
import { HistoryProvider } from '@/context/history-context/history-provider';
import { historyContext } from '@/context/history-context/history-context';
import { diffContext } from '@/context/diff-context/diff-context';
import type { DiffContext } from '@/context/diff-context/diff-context';
import {
    storageContext,
    storageInitialValue,
} from '@/context/storage-context/storage-context';
import type { StorageContext } from '@/context/storage-context/storage-context';
import { DatabaseType } from '@/lib/domain/database-type';
import type { DBTable } from '@/lib/domain/db-table';
import type { DBRelationship } from '@/lib/domain/db-relationship';

/**
 * Phase 0/1 (docs/design/realtime-collaboration.md §10) tests for
 * ChartDBProvider. `storageContext` is stubbed directly (same pattern as
 * `use-storage.ts`'s plain useContext) — no Dexie/indexedDB involved, so no
 * fake-indexeddb dependency needed.
 *
 * Tests titled `appendix-b:<n>` (Phase 0) pin *current, known-broken*
 * behavior Phase 1 is expected to flip. Tests titled `fix for
 * appendix-b:<n>` (Phase 1) are regression guards for a finding that's
 * already been fixed — see design doc Appendix B, finding n, for either.
 */

function makeMockDiff(): DiffContext {
    return {
        newDiagram: null,
        originalDiagram: null,
        diffMap: new Map(),
        hasDiff: false,
        isSummaryOnly: false,
        relationshipIdMap: new Map(),
        calculateDiff: vi.fn(() => ({ foundDiff: false })),
        resetDiff: vi.fn(),
        checkIfTableHasChange: vi.fn(() => false),
        checkIfNewTable: vi.fn(() => false),
        checkIfTableRemoved: vi.fn(() => false),
        getTableNewName: vi.fn(() => null),
        getTableNewColor: vi.fn(() => null),
        checkIfFieldHasChange: vi.fn(() => false),
        checkIfFieldRemoved: vi.fn(() => false),
        checkIfNewField: vi.fn(() => false),
        getFieldNewName: vi.fn(() => null),
        getFieldNewType: vi.fn(() => null),
        getFieldNewPrimaryKey: vi.fn(() => null),
        getFieldNewNullable: vi.fn(() => null),
        getFieldNewCharacterMaximumLength: vi.fn(() => null),
        getFieldNewScale: vi.fn(() => null),
        getFieldNewPrecision: vi.fn(() => null),
        getFieldNewIsArray: vi.fn(() => null),
        checkIfRelationshipHasChange: vi.fn(() => false),
        checkIfNewRelationship: vi.fn(() => false),
        checkIfRelationshipRemoved: vi.fn(() => false),
        getRelationshipNewName: vi.fn(() => null),
        checkIfNewArea: vi.fn(() => false),
        checkIfAreaRemoved: vi.fn(() => false),
        events: new EventEmitter(),
    };
}

function renderChartDB(storage: StorageContext, diff = makeMockDiff()) {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <diffContext.Provider value={diff}>
            <storageContext.Provider value={storage}>
                <RedoUndoStackProvider>
                    <ChartDBProvider>{children}</ChartDBProvider>
                </RedoUndoStackProvider>
            </storageContext.Provider>
        </diffContext.Provider>
    );

    return renderHook(() => useChartDB(), { wrapper });
}

function renderChartDBWithHistory(
    storage: StorageContext,
    diff = makeMockDiff()
) {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <diffContext.Provider value={diff}>
            <storageContext.Provider value={storage}>
                <RedoUndoStackProvider>
                    <ChartDBProvider>
                        <HistoryProvider>{children}</HistoryProvider>
                    </ChartDBProvider>
                </RedoUndoStackProvider>
            </storageContext.Provider>
        </diffContext.Provider>
    );

    return renderHook(
        () => ({
            chartdb: useChartDB(),
            history: useContext(historyContext),
        }),
        { wrapper }
    );
}

const baseTable = (overrides: Partial<DBTable>): DBTable => ({
    id: 'table-1',
    name: 'table_1',
    schema: 'public',
    x: 0,
    y: 0,
    fields: [],
    indexes: [],
    color: '#000000',
    createdAt: Date.now(),
    isView: false,
    ...overrides,
});

const baseRelationship = (
    overrides: Partial<DBRelationship>
): DBRelationship => ({
    id: 'rel-1',
    name: 'relationship',
    sourceSchema: 'public',
    sourceTableId: 'table-a',
    sourceFieldId: 'field-1',
    targetSchema: 'public',
    targetTableId: 'table-b',
    targetFieldId: 'field-2',
    sourceCardinality: 'many',
    targetCardinality: 'one',
    createdAt: Date.now(),
    ...overrides,
});

describe('ChartDBProvider', () => {
    it('addTable + removeTables round-trip: table appears then disappears', async () => {
        const { result } = renderChartDB({ ...storageInitialValue });

        await act(async () => {
            await result.current.addTable(baseTable({}));
        });
        expect(result.current.tables.map((t) => t.id)).toEqual(['table-1']);

        await act(async () => {
            await result.current.removeTables(['table-1']);
        });
        expect(result.current.tables).toEqual([]);
    });

    it('fix for appendix-b:3 — removeTables drops a relationship added to the deleted table in the same tick, not just ones in its precomputed removal list', async () => {
        // Simulates the audit's break scenario without a second client:
        // addRelationship and removeTables both fire in the same act(),
        // neither awaited before the other starts, so removeTables's
        // internal relationshipsToRemove (computed from a closure snapshot
        // taken before either call's state updates land) can't know about
        // the relationship addRelationship is about to add. The old code
        // filtered by that stale precomputed list; the fix filters by
        // `ids` directly, re-evaluated against whatever is live when React
        // applies the update — so it catches the relationship regardless.
        const { result } = renderChartDB({ ...storageInitialValue });

        await act(async () => {
            await result.current.addTable(baseTable({ id: 'table-a' }));
            await result.current.addTable(baseTable({ id: 'table-b' }));
        });

        await act(async () => {
            const addRelPromise = result.current.addRelationship(
                baseRelationship({}),
                { updateHistory: false }
            );
            const removePromise = result.current.removeTables(['table-a']);
            await Promise.all([addRelPromise, removePromise]);
        });

        expect(result.current.tables.map((t) => t.id)).toEqual(['table-b']);
        // the relationship pointing at the now-deleted table-a must not
        // survive, even though it didn't exist when removeTables captured
        // its closure
        expect(result.current.relationships).toEqual([]);
    });

    it('fix for appendix-b:3 — updateTablesState drops a relationship added to a table it deletes in the same tick', async () => {
        const { result } = renderChartDB({ ...storageInitialValue });

        await act(async () => {
            await result.current.addTable(baseTable({ id: 'table-a' }));
            await result.current.addTable(baseTable({ id: 'table-b' }));
        });

        await act(async () => {
            const addRelPromise = result.current.addRelationship(
                baseRelationship({}),
                { updateHistory: false }
            );
            const updatePromise = result.current.updateTablesState(
                (current) => current.filter((t) => t.id !== 'table-a'),
                { updateHistory: false }
            );
            await Promise.all([addRelPromise, updatePromise]);
        });

        expect(result.current.tables.map((t) => t.id)).toEqual(['table-b']);
        expect(result.current.relationships).toEqual([]);
    });

    it('fix for appendix-b:4 — createRelationship throws instead of creating a relationship pointing at a deleted table', async () => {
        const { result } = renderChartDB({ ...storageInitialValue });

        await act(async () => {
            await result.current.addTable(baseTable({ id: 'table-a' }));
        });
        // table-b never created — simulates a remote peer deleting the
        // target table between UI-render-time validation and this commit

        await expect(
            result.current.createRelationship({
                sourceTableId: 'table-a',
                targetTableId: 'table-b',
                sourceFieldId: 'does-not-exist',
                targetFieldId: 'does-not-exist',
            })
        ).rejects.toThrow();

        expect(result.current.relationships).toEqual([]);
    });

    it('fix for appendix-b:4 — createDependency throws instead of creating a dependency pointing at a deleted table', async () => {
        const { result } = renderChartDB({ ...storageInitialValue });

        await act(async () => {
            await result.current.addTable(baseTable({ id: 'table-a' }));
        });

        await expect(
            result.current.createDependency({
                tableId: 'table-a',
                dependentTableId: 'table-b', // never created
            })
        ).rejects.toThrow();

        expect(result.current.dependencies).toEqual([]);
    });

    it('fix for appendix-b:12 — a diff-preview (readonly) session never mutates live tables/relationships/areas state', async () => {
        // diffCalculatedHandler previously mutated tables/relationships/
        // areas state unconditionally, regardless of `readonly` — only
        // the storage layer was gated. The obvious way to build the
        // eventual Y.Doc adapter (add*/update* write through the Y.Doc
        // instead of raw state) would have broadcast one user's private
        // diff-preview scratch state to every connected peer.
        const diff = makeMockDiff();
        diff.hasDiff = true; // readonly derives from hasDiff when no explicit prop
        const { result } = renderChartDB({ ...storageInitialValue }, diff);

        act(() => {
            diff.events.emit({
                action: 'diff_calculated',
                data: {
                    tablesToAdd: [baseTable({ id: 'table-from-diff' })],
                    fieldsToAdd: new Map(),
                    relationshipsToAdd: [],
                    areasToAdd: [],
                },
            });
        });

        expect(result.current.tables).toEqual([]);
    });

    it('fix for appendix-b:12 — a non-readonly session still applies the diff-preview event (regression guard)', async () => {
        const diff = makeMockDiff();
        diff.hasDiff = false;
        const { result } = renderChartDB({ ...storageInitialValue }, diff);

        act(() => {
            diff.events.emit({
                action: 'diff_calculated',
                data: {
                    tablesToAdd: [baseTable({ id: 'table-from-diff' })],
                    fieldsToAdd: new Map(),
                    relationshipsToAdd: [],
                    areasToAdd: [],
                },
            });
        });

        expect(result.current.tables.map((t) => t.id)).toEqual([
            'table-from-diff',
        ]);
    });

    it('appendix-b:1 (raw mechanism) — updateTablesState with forceOverride replaces the whole array verbatim, regardless of what is live', async () => {
        // Pins chartdb-provider.tsx:522-524: this raw mechanism is
        // unchanged by the appendix-b:1 fix and still exists — a caller
        // that passes an updateFn ignoring its `currentTables` argument
        // (like `() => snapshotBeforeConcurrentAdd` below) still clobbers
        // concurrent state. The fix is entirely on the caller side: see
        // history-provider.tsx's undo/redo handlers (exercised in
        // history-provider.test.tsx and this file's "(end-to-end)" test
        // below), which now construct their updateFn FROM `currentTables`
        // instead of ignoring it. This test documents that using
        // forceOverride naively is still a footgun for any future caller.
        const { result } = renderChartDB({ ...storageInitialValue });

        await act(async () => {
            await result.current.addTable(baseTable({ id: 'table-a' }));
        });
        const snapshotBeforeConcurrentAdd = result.current.tables;

        // simulates a concurrent peer adding a table after the snapshot was
        // captured but before the undo/replay below is applied
        await act(async () => {
            await result.current.addTable(baseTable({ id: 'table-b' }));
        });
        expect(result.current.tables.map((t) => t.id).sort()).toEqual([
            'table-a',
            'table-b',
        ]);

        await act(async () => {
            await result.current.updateTablesState(
                () => snapshotBeforeConcurrentAdd,
                { forceOverride: true, updateHistory: false }
            );
        });

        // table-b is gone even though this replay never touched it
        expect(result.current.tables.map((t) => t.id)).toEqual(['table-a']);
    });

    it('fix for appendix-b:9 — concurrent createTable() calls get distinct default names, not the same stale-closure count', async () => {
        // chartdb-provider.tsx previously derived the default name from
        // `tables.filter(...).length` read at call time: two calls fired
        // before either re-rendered both saw `tables.length === 0` and both
        // named their table `table_1`. Fixed by a monotonic ref-based
        // counter that's incremented synchronously, never re-derived from
        // the array. This is the regression guard for that fix.
        const { result } = renderChartDB({ ...storageInitialValue });

        let created: DBTable[] = [];
        await act(async () => {
            created = await Promise.all([
                result.current.createTable(),
                result.current.createTable(),
                result.current.createTable(),
            ]);
        });

        expect(created.map((t) => t.name).sort()).toEqual([
            'table_1',
            'table_2',
            'table_3',
        ]);
        expect(new Set(created.map((t) => t.id)).size).toBe(3); // ids never collide
    });

    it('fix for appendix-b:9 — same counter fix applies to createField/createIndex/createArea/createCustomType', async () => {
        const { result } = renderChartDB({ ...storageInitialValue });

        const table = await act(async () => result.current.createTable());

        let fields: { name: string }[] = [];
        let indexes: { name: string }[] = [];
        await act(async () => {
            fields = await Promise.all([
                result.current.createField(table.id),
                result.current.createField(table.id),
            ]);
            indexes = await Promise.all([
                result.current.createIndex(table.id),
                result.current.createIndex(table.id),
            ]);
        });
        // the table already has one seed field/index (its PK column and PK
        // index), so the first two user-created ones start at 2/3, not 1/2
        expect(fields.map((f) => f.name).sort()).toEqual([
            'field_2',
            'field_3',
        ]);
        expect(indexes.map((i) => i.name).sort()).toEqual([
            'index_2',
            'index_3',
        ]);

        let areas: { name: string }[] = [];
        let customTypes: { name: string }[] = [];
        await act(async () => {
            areas = await Promise.all([
                result.current.createArea(),
                result.current.createArea(),
            ]);
            customTypes = await Promise.all([
                result.current.createCustomType(),
                result.current.createCustomType(),
            ]);
        });
        expect(areas.map((a) => a.name).sort()).toEqual(['Area 1', 'Area 2']);
        expect(customTypes.map((c) => c.name).sort()).toEqual([
            'type_1',
            'type_2',
        ]);
    });

    it("fix for appendix-b:9 — loading a new diagram resets the counters instead of carrying over the previous diagram's count", async () => {
        const { result } = renderChartDB({ ...storageInitialValue });

        await act(async () => {
            await result.current.createTable();
            await result.current.createTable();
        });
        expect(result.current.tables.map((t) => t.name)).toEqual([
            'table_1',
            'table_2',
        ]);

        act(() => {
            result.current.loadDiagramFromData({
                id: 'diagram-2',
                name: 'Second',
                databaseType: DatabaseType.GENERIC,
                tables: [],
                createdAt: new Date(0),
                updatedAt: new Date(0),
            });
        });

        const nextTable = await act(async () => result.current.createTable());
        expect(nextTable.name).toBe('table_1'); // not 'table_3'
    });

    it('fix for appendix-b:1 (end-to-end) — undoing an updateTablesState edit does not drop a table a concurrent peer added afterward', async () => {
        const { result } = renderChartDBWithHistory({ ...storageInitialValue });

        const tableA = await act(async () =>
            result.current.chartdb.createTable()
        );

        await act(async () => {
            await result.current.chartdb.updateTablesState(
                (current) =>
                    current.map((t) =>
                        t.id === tableA.id ? { ...t, name: 'renamed' } : t
                    ),
                { updateHistory: true }
            );
        });
        expect(
            result.current.chartdb.tables.find((t) => t.id === tableA.id)?.name
        ).toBe('renamed');

        // a concurrent peer's table arrives (updateHistory: false — like a
        // remote-synced change, it never enters the local undo stack; a
        // second local createTable() would instead become the *next* undo
        // entry and this test would just undo that action instead)
        const tableB = baseTable({ id: 'table-from-peer' });
        await act(async () => {
            await result.current.chartdb.addTable(tableB, {
                updateHistory: false,
            });
        });

        await act(async () => {
            await result.current.history.undo();
        });

        expect(
            result.current.chartdb.tables.find((t) => t.id === tableA.id)?.name
        ).toBe(tableA.name); // reverted
        expect(
            result.current.chartdb.tables.find((t) => t.id === tableB.id)
        ).toBeDefined(); // survives — this is the appendix-b:1 clobber, now fixed
    });

    it('appendix-b:2 — updateField writes the whole recomputed fields array back as one blob, not a per-field patch', async () => {
        // Pins chartdb-provider.tsx:656-705. Once `db` is a Y.Doc adapter,
        // this write shape overwrites every field in the Y.Map under one
        // key — a concurrent field/index add from another peer would be
        // silently dropped. Re-modeling fields as a keyed Y.Map collection
        // is Phase 2's first task (moved out of Phase 1 — see §10), and
        // this write must be re-verified against that adapter before it can
        // be trusted under concurrency.
        const existingField = {
            id: 'field-1',
            name: 'old_name',
            type: { id: 'integer', name: 'integer' },
            primaryKey: false,
            nullable: true,
            unique: false,
            createdAt: Date.now(),
        };
        const otherField = { ...existingField, id: 'field-2', name: 'other' };
        const table = baseTable({
            fields: [existingField, otherField],
        });

        const updateTable = vi.fn<StorageContext['updateTable']>(
            async () => {}
        );
        const storage: StorageContext = {
            ...storageInitialValue,
            getTable: vi.fn(async () => table),
            updateTable,
            updateDiagram: vi.fn(async () => {}),
        };

        const { result } = renderChartDB(storage);

        await act(async () => {
            result.current.loadDiagramFromData({
                id: 'diagram-1',
                name: 'Test',
                databaseType: DatabaseType.GENERIC,
                tables: [table],
                createdAt: new Date(0),
                updatedAt: new Date(0),
            });
        });

        await act(async () => {
            await result.current.updateField('table-1', 'field-1', {
                name: 'new_name',
            });
        });

        expect(updateTable).toHaveBeenCalledTimes(1);
        const [{ attributes }] = updateTable.mock.calls[0];
        // the write carries BOTH fields, keyed by nothing but array position —
        // `otherField` (untouched by this edit) rides along in the same blob.
        const fields = attributes.fields ?? [];
        expect(fields).toHaveLength(2);
        expect(fields.map((f) => f.id)).toEqual(['field-1', 'field-2']);
    });
});

describe('Phase 2 (docs/design/realtime-collaboration.md §10) — notes are Y.Doc-backed', () => {
    it('createNote adds the note to state', async () => {
        const { result } = renderChartDB({ ...storageInitialValue });

        let created: Awaited<ReturnType<typeof result.current.createNote>>;
        await act(async () => {
            created = await result.current.createNote({ content: 'first' });
        });

        expect(result.current.notes.map((n) => n.id)).toEqual([created!.id]);
        expect(result.current.notes[0].content).toBe('first');
    });

    it('fix for appendix-b:2 (notes slice) — undo after createNote removes the note from the Y.Doc itself, not just from React state', async () => {
        // The discriminating check for "did the undo write into the doc,
        // or did it just call setNotes()": force a SECOND, unrelated
        // structural doc change afterward. A structural change makes the
        // observer fully re-derive `notes` from the live doc — if the
        // first undo had only patched React state (bug: a handler calling
        // setNotes directly instead of writing into notesYDocRef), the
        // undone note would still be sitting in the doc and this second
        // create's re-derivation would silently resurrect it.
        const { result } = renderChartDBWithHistory({ ...storageInitialValue });

        let noteA: Awaited<
            ReturnType<typeof result.current.chartdb.createNote>
        >;
        await act(async () => {
            noteA = await result.current.chartdb.createNote({
                content: 'A',
            });
        });
        expect(result.current.chartdb.notes.map((n) => n.id)).toEqual([
            noteA!.id,
        ]);

        await act(async () => {
            await result.current.history.undo();
        });
        expect(result.current.chartdb.notes).toEqual([]);

        let noteB: Awaited<
            ReturnType<typeof result.current.chartdb.createNote>
        >;
        await act(async () => {
            noteB = await result.current.chartdb.createNote({
                content: 'B',
            });
        });

        expect(result.current.chartdb.notes.map((n) => n.id)).toEqual([
            noteB!.id,
        ]);
    });

    it('fix for appendix-b:2 (notes slice) — undo after updateNote reverts the Y.Doc entry itself, not just React state', async () => {
        const { result } = renderChartDBWithHistory({ ...storageInitialValue });

        let noteA: Awaited<
            ReturnType<typeof result.current.chartdb.createNote>
        >;
        await act(async () => {
            noteA = await result.current.chartdb.createNote({
                content: 'original',
            });
        });
        await act(async () => {
            await result.current.chartdb.updateNote(noteA!.id, {
                content: 'edited',
            });
        });
        expect(result.current.chartdb.notes[0].content).toBe('edited');

        // the edit itself must land in the doc, not just React state —
        // force a structural resync (a second note, unrelated) and
        // confirm 'edited' survives it. If updateNote had written straight
        // to React state (bug) instead of patching the doc, the doc's
        // copy would still say 'original' and this resync would revert
        // the visible content right back to it, before undo ever runs.
        await act(async () => {
            await result.current.chartdb.createNote({ content: 'spacer' });
        });
        expect(
            result.current.chartdb.notes.find((n) => n.id === noteA!.id)!
                .content
        ).toBe('edited');

        // undo the spacer creation first, so the next undo below targets
        // the actual updateNote action.
        await act(async () => {
            await result.current.history.undo();
        });
        expect(result.current.chartdb.notes.map((n) => n.id)).toEqual([
            noteA!.id,
        ]);

        await act(async () => {
            await result.current.history.undo();
        });
        expect(result.current.chartdb.notes[0].content).toBe('original');

        // force a second structural re-derivation and confirm the
        // reverted content survives it too.
        await act(async () => {
            await result.current.chartdb.createNote({
                content: 'forces a resync',
            });
        });
        const reverted = result.current.chartdb.notes.find(
            (n) => n.id === noteA!.id
        )!;
        expect(reverted.content).toBe('original');
    });

    it('editing one note does not change the object identity of an untouched sibling note', async () => {
        // Guards the object-identity decision in the design doc: a
        // non-structural doc change (an existing note's field edited)
        // must only rebuild the one changed entry, not re-derive the
        // whole notes array — otherwise every note gets a new reference
        // on every keystroke anywhere in the diagram, and ReactFlow
        // re-renders every node.
        const { result } = renderChartDB({ ...storageInitialValue });

        let noteA: Awaited<ReturnType<typeof result.current.createNote>>;
        let noteB: Awaited<ReturnType<typeof result.current.createNote>>;
        await act(async () => {
            noteA = await result.current.createNote({ content: 'A' });
        });
        await act(async () => {
            noteB = await result.current.createNote({ content: 'B' });
        });

        const beforeB = result.current.notes.find((n) => n.id === noteB!.id);

        await act(async () => {
            await result.current.updateNote(noteA!.id, {
                content: 'A-edited',
            });
        });

        const afterB = result.current.notes.find((n) => n.id === noteB!.id);
        expect(afterB).toBe(beforeB);
        expect(
            result.current.notes.find((n) => n.id === noteA!.id)!.content
        ).toBe('A-edited');
    });

    it('reordering a note via updateNote({ order }) — a non-structural patch — re-sorts the array immediately, not just on the next structural change', async () => {
        // The notes side panel's drag-to-reorder calls updateNote(id,
        // { order: index }) — this arrives at the observer as a
        // non-structural change (no note added/removed), which normally
        // only patches one entry in place without resorting. `order` is
        // the exception: it must take effect immediately, or a drag
        // would appear to do nothing until some unrelated note gets
        // created/removed later and forces a full resync.
        const { result } = renderChartDB({ ...storageInitialValue });

        let noteA: Awaited<ReturnType<typeof result.current.createNote>>;
        let noteB: Awaited<ReturnType<typeof result.current.createNote>>;
        await act(async () => {
            noteA = await result.current.createNote({ content: 'A' });
        });
        await act(async () => {
            noteB = await result.current.createNote({ content: 'B' });
        });
        expect(result.current.notes.map((n) => n.id)).toEqual([
            noteA!.id,
            noteB!.id,
        ]);

        // drag B above A
        await act(async () => {
            await result.current.updateNote(noteB!.id, { order: 0 });
        });
        await act(async () => {
            await result.current.updateNote(noteA!.id, { order: 1 });
        });

        expect(result.current.notes.map((n) => n.id)).toEqual([
            noteB!.id,
            noteA!.id,
        ]);
    });

    it('removeNotes removes the note from state, and undo restores it', async () => {
        const { result } = renderChartDBWithHistory({ ...storageInitialValue });

        let noteA: Awaited<
            ReturnType<typeof result.current.chartdb.createNote>
        >;
        await act(async () => {
            noteA = await result.current.chartdb.createNote({
                content: 'A',
            });
        });

        await act(async () => {
            await result.current.chartdb.removeNote(noteA!.id);
        });
        expect(result.current.chartdb.notes).toEqual([]);

        await act(async () => {
            await result.current.history.undo();
        });
        expect(result.current.chartdb.notes.map((n) => n.id)).toEqual([
            noteA!.id,
        ]);
    });

    it("loading a new diagram rebuilds the notes Y.Doc instead of carrying over the previous diagram's notes", async () => {
        const { result } = renderChartDB({ ...storageInitialValue });

        await act(async () => {
            await result.current.createNote({ content: 'from diagram A' });
        });
        expect(result.current.notes).toHaveLength(1);

        act(() => {
            result.current.loadDiagramFromData({
                id: 'diagram-2',
                name: 'Second',
                databaseType: DatabaseType.GENERIC,
                notes: [],
                createdAt: new Date(0),
                updatedAt: new Date(0),
            });
        });
        expect(result.current.notes).toEqual([]);

        // the discriminating check: force a structural resync on the new
        // diagram's doc. If loadDiagramFromData had only called
        // setNotes([]) without replacing notesYDocRef's doc, diagram A's
        // note would still be sitting in the old doc and would resurface
        // here.
        await act(async () => {
            await result.current.createNote({ content: 'from diagram B' });
        });
        expect(result.current.notes.map((n) => n.content)).toEqual([
            'from diagram B',
        ]);
    });
});

describe('Phase 2 (docs/design/realtime-collaboration.md §10) — customTypes are Y.Doc-backed', () => {
    it('createCustomType adds the type to state', async () => {
        const { result } = renderChartDB({ ...storageInitialValue });

        let created: Awaited<
            ReturnType<typeof result.current.createCustomType>
        >;
        await act(async () => {
            created = await result.current.createCustomType({
                name: 'status',
            });
        });

        expect(result.current.customTypes.map((t) => t.id)).toEqual([
            created!.id,
        ]);
        expect(result.current.customTypes[0].name).toBe('status');
    });

    it('fix for appendix-b:2 (customTypes slice) — undo after createCustomType removes the type from the Y.Doc itself, not just React state', async () => {
        const { result } = renderChartDBWithHistory({ ...storageInitialValue });

        let typeA: Awaited<
            ReturnType<typeof result.current.chartdb.createCustomType>
        >;
        await act(async () => {
            typeA = await result.current.chartdb.createCustomType({
                name: 'A',
            });
        });
        expect(result.current.chartdb.customTypes.map((t) => t.id)).toEqual([
            typeA!.id,
        ]);

        await act(async () => {
            await result.current.history.undo();
        });
        expect(result.current.chartdb.customTypes).toEqual([]);

        // discriminating check — see the equivalent notes test above for
        // why this is necessary, not redundant.
        let typeB: Awaited<
            ReturnType<typeof result.current.chartdb.createCustomType>
        >;
        await act(async () => {
            typeB = await result.current.chartdb.createCustomType({
                name: 'B',
            });
        });
        expect(result.current.chartdb.customTypes.map((t) => t.id)).toEqual([
            typeB!.id,
        ]);
    });

    it('fix for appendix-b:2 (customTypes slice) — undo after updateCustomType reverts the Y.Doc entry itself, not just React state', async () => {
        const { result } = renderChartDBWithHistory({ ...storageInitialValue });

        let typeA: Awaited<
            ReturnType<typeof result.current.chartdb.createCustomType>
        >;
        await act(async () => {
            typeA = await result.current.chartdb.createCustomType({
                name: 'original',
            });
        });
        await act(async () => {
            await result.current.chartdb.updateCustomType(typeA!.id, {
                name: 'edited',
            });
        });
        expect(result.current.chartdb.customTypes[0].name).toBe('edited');

        await act(async () => {
            await result.current.chartdb.createCustomType({ name: 'spacer' });
        });
        expect(
            result.current.chartdb.customTypes.find((t) => t.id === typeA!.id)!
                .name
        ).toBe('edited');

        await act(async () => {
            await result.current.history.undo();
        });
        expect(result.current.chartdb.customTypes.map((t) => t.id)).toEqual([
            typeA!.id,
        ]);

        await act(async () => {
            await result.current.history.undo();
        });
        expect(result.current.chartdb.customTypes[0].name).toBe('original');

        await act(async () => {
            await result.current.chartdb.createCustomType({
                name: 'forces a resync',
            });
        });
        expect(
            result.current.chartdb.customTypes.find((t) => t.id === typeA!.id)!
                .name
        ).toBe('original');
    });

    it('editing one custom type does not change the object identity of an untouched sibling', async () => {
        const { result } = renderChartDB({ ...storageInitialValue });

        let typeA: Awaited<ReturnType<typeof result.current.createCustomType>>;
        let typeB: Awaited<ReturnType<typeof result.current.createCustomType>>;
        await act(async () => {
            typeA = await result.current.createCustomType({ name: 'A' });
        });
        await act(async () => {
            typeB = await result.current.createCustomType({ name: 'B' });
        });

        const beforeB = result.current.customTypes.find(
            (t) => t.id === typeB!.id
        );

        await act(async () => {
            await result.current.updateCustomType(typeA!.id, {
                name: 'A-edited',
            });
        });

        expect(result.current.customTypes.find((t) => t.id === typeB!.id)).toBe(
            beforeB
        );
    });

    it('reordering a custom type via updateCustomType({ order }) re-sorts the array immediately', async () => {
        const { result } = renderChartDB({ ...storageInitialValue });

        let typeA: Awaited<ReturnType<typeof result.current.createCustomType>>;
        let typeB: Awaited<ReturnType<typeof result.current.createCustomType>>;
        await act(async () => {
            typeA = await result.current.createCustomType({ name: 'A' });
        });
        await act(async () => {
            typeB = await result.current.createCustomType({ name: 'B' });
        });

        await act(async () => {
            await result.current.updateCustomType(typeB!.id, { order: 0 });
        });
        await act(async () => {
            await result.current.updateCustomType(typeA!.id, { order: 1 });
        });

        expect(result.current.customTypes.map((t) => t.id)).toEqual([
            typeB!.id,
            typeA!.id,
        ]);
    });

    it('removeCustomTypes removes the type from state, and undo restores it', async () => {
        const { result } = renderChartDBWithHistory({ ...storageInitialValue });

        let typeA: Awaited<
            ReturnType<typeof result.current.chartdb.createCustomType>
        >;
        await act(async () => {
            typeA = await result.current.chartdb.createCustomType({
                name: 'A',
            });
        });

        await act(async () => {
            await result.current.chartdb.removeCustomType(typeA!.id);
        });
        expect(result.current.chartdb.customTypes).toEqual([]);

        await act(async () => {
            await result.current.history.undo();
        });
        expect(result.current.chartdb.customTypes.map((t) => t.id)).toEqual([
            typeA!.id,
        ]);
    });
});
