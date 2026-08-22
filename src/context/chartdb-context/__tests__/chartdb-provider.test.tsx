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
 * Phase 0 (docs/design/realtime-collaboration.md §10) regression net for
 * ChartDBProvider, ahead of Phase 1's data-model fixes. `storageContext` is
 * stubbed directly (same pattern as `use-storage.ts`'s plain useContext) —
 * no Dexie/indexedDB involved, so no fake-indexeddb dependency needed.
 *
 * Tests tagged `appendix-b:<n>` pin *current, known-broken* behavior a later
 * phase is expected to flip (see design doc Appendix B, finding n).
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

    it('appendix-b:9 — concurrent createTable() calls derive the default name from the same stale closure, producing duplicates', async () => {
        // Pins chartdb-provider.tsx:341-343: count = tables.filter(...).length + 1
        // is read from the render-time closure. Two calls fired before either
        // has re-rendered both see `tables.length === 0` and both name their
        // table `table_1`. Phase 1 must derive this from a merged counter
        // instead of array length.
        const { result } = renderChartDB({ ...storageInitialValue });

        let created: DBTable[] = [];
        await act(async () => {
            created = await Promise.all([
                result.current.createTable(),
                result.current.createTable(),
            ]);
        });

        expect(created.map((t) => t.name)).toEqual(['table_1', 'table_1']);
        expect(created[0].id).not.toEqual(created[1].id); // ids never collide
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
