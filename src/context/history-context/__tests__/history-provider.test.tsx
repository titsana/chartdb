import React, { useContext } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { chartDBContext } from '@/context/chartdb-context/chartdb-context';
import type { ChartDBContext } from '@/context/chartdb-context/chartdb-context';
import { DatabaseType } from '@/lib/domain/database-type';
import { historyContext } from '../history-context';
import { HistoryProvider } from '../history-provider';
import { RedoUndoStackProvider } from '../redo-undo-stack-provider';
import { useRedoUndoStack } from '@/hooks/use-redo-undo-stack';
import type { RedoUndoAction } from '../redo-undo-action';

/**
 * Phase 0 (docs/design/realtime-collaboration.md §10) regression net for
 * HistoryProvider, ahead of Phase 1's data-model fixes. Every ChartDBContext
 * method HistoryProvider can call is a spy here, not a real ChartDBProvider —
 * we're pinning HistoryProvider's own undo/redo wiring, not re-testing CRUD.
 *
 * Tests tagged `appendix-b:<n>` pin *current, known-broken* behavior a later
 * phase is expected to flip (see design doc Appendix B, finding n). Everything
 * else here is a true regression guard: it must stay green through Phase 1.
 */

function makeMockChartDB(): ChartDBContext {
    const emptyFn = vi.fn();
    return {
        diagramId: 'diagram-1',
        diagramName: 'Test',
        databaseType: DatabaseType.GENERIC,
        tables: [],
        schemas: [],
        relationships: [],
        dependencies: [],
        areas: [],
        customTypes: [],
        notes: [],
        currentDiagram: {
            id: 'diagram-1',
            name: 'Test',
            databaseType: DatabaseType.GENERIC,
            createdAt: new Date(0),
            updatedAt: new Date(0),
        },
        events: { useSubscription: vi.fn(), emit: vi.fn() } as never,
        highlightCustomTypeId: emptyFn,

        updateDiagramId: vi.fn(),
        updateDiagramName: vi.fn(),
        loadDiagram: vi.fn(),
        loadDiagramFromData: vi.fn(),
        updateDiagramUpdatedAt: vi.fn(),
        clearDiagramData: vi.fn(),
        deleteDiagram: vi.fn(),
        updateDiagramData: vi.fn(),

        updateDatabaseType: vi.fn(),
        updateDatabaseEdition: vi.fn(),

        createTable: vi.fn(),
        addTable: vi.fn(),
        addTables: vi.fn(),
        getTable: vi.fn(),
        removeTable: vi.fn(),
        removeTables: vi.fn(),
        updateTable: vi.fn(),
        updateTablesState: vi.fn(),

        getField: vi.fn(),
        updateField: vi.fn(),
        removeField: vi.fn(),
        createField: vi.fn(),
        addField: vi.fn(),

        createIndex: vi.fn(),
        addIndex: vi.fn(),
        getIndex: vi.fn(),
        removeIndex: vi.fn(),
        updateIndex: vi.fn(),

        createCheckConstraint: vi.fn(),
        addCheckConstraint: vi.fn(),
        removeCheckConstraint: vi.fn(),
        updateCheckConstraint: vi.fn(),

        createRelationship: vi.fn(),
        addRelationship: vi.fn(),
        addRelationships: vi.fn(),
        getRelationship: vi.fn(),
        removeRelationship: vi.fn(),
        removeRelationships: vi.fn(),
        updateRelationship: vi.fn(),

        createDependency: vi.fn(),
        addDependency: vi.fn(),
        addDependencies: vi.fn(),
        getDependency: vi.fn(),
        removeDependency: vi.fn(),
        removeDependencies: vi.fn(),
        updateDependency: vi.fn(),

        createArea: vi.fn(),
        addArea: vi.fn(),
        addAreas: vi.fn(),
        getArea: vi.fn(),
        removeArea: vi.fn(),
        removeAreas: vi.fn(),
        updateArea: vi.fn(),

        createNote: vi.fn(),
        addNote: vi.fn(),
        addNotes: vi.fn(),
        getNote: vi.fn(),
        removeNote: vi.fn(),
        removeNotes: vi.fn(),
        updateNote: vi.fn(),

        createCustomType: vi.fn(),
        addCustomType: vi.fn(),
        addCustomTypes: vi.fn(),
        getCustomType: vi.fn(),
        removeCustomType: vi.fn(),
        removeCustomTypes: vi.fn(),
        updateCustomType: vi.fn(),
    } as unknown as ChartDBContext;
}

function renderHistory(mockChartDB: ChartDBContext) {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <chartDBContext.Provider value={mockChartDB}>
            <RedoUndoStackProvider>
                <HistoryProvider>{children}</HistoryProvider>
            </RedoUndoStackProvider>
        </chartDBContext.Provider>
    );

    return renderHook(
        () => ({
            history: useContext(historyContext),
            stack: useRedoUndoStack(),
        }),
        { wrapper }
    );
}

const updateDiagramNameAction = (name: string): RedoUndoAction => ({
    action: 'updateDiagramName',
    redoData: { name },
    undoData: { name: `previous-${name}` },
});

describe('HistoryProvider', () => {
    let mockChartDB: ChartDBContext;

    beforeEach(() => {
        mockChartDB = makeMockChartDB();
    });

    it('undo on an empty stack is a no-op', async () => {
        const { result } = renderHistory(mockChartDB);

        expect(result.current.history.hasUndo).toBe(false);
        await act(async () => {
            await result.current.history.undo();
        });

        expect(mockChartDB.updateDiagramName).not.toHaveBeenCalled();
        expect(result.current.history.hasRedo).toBe(false);
    });

    it('undo pops LIFO, calls the matching handler with undoData, and moves the action to the redo stack', async () => {
        const { result } = renderHistory(mockChartDB);

        act(() => {
            result.current.stack.addUndoAction(updateDiagramNameAction('a'));
            result.current.stack.addUndoAction(updateDiagramNameAction('b'));
        });
        expect(result.current.history.hasUndo).toBe(true);

        await act(async () => {
            await result.current.history.undo();
        });

        // last pushed ('b') is undone first
        expect(mockChartDB.updateDiagramName).toHaveBeenCalledTimes(1);
        expect(mockChartDB.updateDiagramName).toHaveBeenCalledWith(
            'previous-b',
            { updateHistory: false }
        );
        expect(result.current.history.hasRedo).toBe(true);
        expect(result.current.history.hasUndo).toBe(true); // 'a' still pending
    });

    it('redo mirrors undo: pops the redo stack and calls the handler with redoData', async () => {
        const { result } = renderHistory(mockChartDB);

        act(() => {
            result.current.stack.addRedoAction(updateDiagramNameAction('a'));
        });

        await act(async () => {
            await result.current.history.redo();
        });

        expect(mockChartDB.updateDiagramName).toHaveBeenCalledWith('a', {
            updateHistory: false,
        });
        expect(result.current.history.hasUndo).toBe(true);
    });

    it('removeTables undo applies addTables/addRelationships/addDependencies concurrently, not sequentially', async () => {
        // Pins the Promise.all shape at history-provider.tsx:222-226. Phase 1/2
        // need to reason about this as three concurrent writes landing in the
        // same merge window, not a safe sequential replay.
        const order: string[] = [];
        let releaseAddTables: () => void = () => {};
        mockChartDB.addTables = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    releaseAddTables = () => {
                        order.push('addTables');
                        resolve();
                    };
                })
        );
        mockChartDB.addRelationships = vi.fn(async () => {
            order.push('addRelationships');
        });
        mockChartDB.addDependencies = vi.fn(async () => {
            order.push('addDependencies');
        });

        const { result } = renderHistory(mockChartDB);

        act(() => {
            result.current.stack.addUndoAction({
                action: 'removeTables',
                redoData: { tableIds: ['t1'] },
                undoData: { tables: [], relationships: [], dependencies: [] },
            } as RedoUndoAction);
        });

        let undoPromise!: Promise<void>;
        act(() => {
            undoPromise =
                result.current.history.undo() as unknown as Promise<void>;
        });

        // addRelationships/addDependencies must have started before addTables
        // resolves — proof they're fired via Promise.all, not awaited in turn.
        expect(mockChartDB.addRelationships).toHaveBeenCalledTimes(1);
        expect(mockChartDB.addDependencies).toHaveBeenCalledTimes(1);
        expect(order).not.toContain('addTables');

        await act(async () => {
            releaseAddTables();
            await undoPromise;
        });

        expect(order).toContain('addTables');
    });

    it('undo of updateTablesState calls the handler with forceOverride: true (call-shape pin, not the clobber itself)', async () => {
        // Pins history-provider.tsx:274-285's call shape only. The actual
        // whole-array-replay bug lives in chartdb-provider.tsx:522-524, where
        // `forceOverride: true` bypasses the per-id merge — that's exercised
        // against the real provider in chartdb-provider.test.tsx
        // (appendix-b:1), not here: this file stubs `updateTablesState` as a
        // spy, so it can only prove HistoryProvider *asks* for forceOverride
        // replay, not that the replay clobbers concurrent state.
        const snapshotTables = [{ id: 't1', name: 'orig' }];
        mockChartDB.updateTablesState = vi.fn();
        mockChartDB.addRelationships = vi.fn();
        mockChartDB.addDependencies = vi.fn();

        const { result } = renderHistory(mockChartDB);

        act(() => {
            result.current.stack.addUndoAction({
                action: 'updateTablesState',
                redoData: { tables: [] },
                undoData: {
                    tables: snapshotTables,
                    relationships: [],
                    dependencies: [],
                },
            } as unknown as RedoUndoAction);
        });

        await act(async () => {
            await result.current.history.undo();
        });

        expect(mockChartDB.updateTablesState).toHaveBeenCalledTimes(1);
        const [, options] = (
            mockChartDB.updateTablesState as ReturnType<typeof vi.fn>
        ).mock.calls[0];
        expect(options).toEqual({
            updateHistory: false,
            forceOverride: true,
        });
    });
});
