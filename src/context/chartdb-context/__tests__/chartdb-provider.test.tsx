import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { EventEmitter } from 'ahooks/lib/useEventEmitter';
import { ChartDBProvider } from '../chartdb-provider';
import { useChartDB } from '@/hooks/use-chartdb';
import { RedoUndoStackProvider } from '@/context/history-context/redo-undo-stack-provider';
import { diffContext } from '@/context/diff-context/diff-context';
import type { DiffContext } from '@/context/diff-context/diff-context';
import {
    storageContext,
    storageInitialValue,
} from '@/context/storage-context/storage-context';
import type { StorageContext } from '@/context/storage-context/storage-context';
import { DatabaseType } from '@/lib/domain/database-type';
import type { DBTable } from '@/lib/domain/db-table';

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

    it('appendix-b:1 — updateTablesState with forceOverride replaces the whole array, dropping a table added after the snapshot was taken', async () => {
        // Pins chartdb-provider.tsx:522-524: when forceOverride is true, the
        // updater's result replaces `tables` verbatim regardless of what's
        // live at flush time. Undo replays exactly this way (see
        // history-provider.tsx:274-285): User A's undo snapshot is taken
        // before User B adds a table; replaying it as a full-array override
        // silently deletes B's table. Phase 1 must close this — this
        // assertion should flip once the merge is scoped to the fields the
        // original action touched instead of the whole collection.
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

    it('appendix-b:2 — updateField writes the whole recomputed fields array back as one blob, not a per-field patch', async () => {
        // Pins chartdb-provider.tsx:656-705. Once `db` is a Y.Doc adapter,
        // this write shape overwrites every field in the Y.Map under one
        // key — a concurrent field/index add from another peer would be
        // silently dropped. Phase 1 must re-model fields as a keyed
        // collection before this write can be trusted under concurrency.
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
