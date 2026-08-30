import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { chartDBContext } from '@/context/chartdb-context/chartdb-context';
import type { ChartDBContext } from '@/context/chartdb-context/chartdb-context';
import type { DBTable } from '@/lib/domain/db-table';
import { useUpdateTable } from '../use-update-table';

const baseTable = (overrides: Partial<DBTable> = {}): DBTable => ({
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

function renderUseUpdateTable(table: DBTable, updateTable = vi.fn()) {
    const mockChartDB = { updateTable } as unknown as ChartDBContext;
    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <chartDBContext.Provider value={mockChartDB}>
            {children}
        </chartDBContext.Provider>
    );
    return {
        ...renderHook(() => useUpdateTable(table), { wrapper }),
        updateTable,
    };
}

describe('useUpdateTable', () => {
    it('commits the rename after the debounce elapses', () => {
        vi.useFakeTimers();
        try {
            const table = baseTable();
            const { result, updateTable } = renderUseUpdateTable(table);

            act(() => {
                result.current.handleTableNameChange('renamed');
            });
            expect(updateTable).not.toHaveBeenCalled();

            act(() => {
                vi.advanceTimersByTime(1000);
            });
            expect(updateTable).toHaveBeenCalledWith('table-1', {
                name: 'renamed',
            });
        } finally {
            vi.useRealTimers();
        }
    });

    it('regression: closing the editor right after typing still commits the rename, instead of the pending debounce being silently dropped', () => {
        // The table-edit-mode panel (canvas double-click) unmounts its
        // owner as soon as it closes (X button/click-away/Escape). Before
        // this fix, useDebounce's unmount cleanup only *cancelled* the
        // pending 1000ms write — it never fired it — so a rename typed
        // just before closing never reached chartDBUpdateTable at all.
        vi.useFakeTimers();
        try {
            const table = baseTable();
            const { result, unmount, updateTable } =
                renderUseUpdateTable(table);

            act(() => {
                result.current.handleTableNameChange('renamed');
            });
            // closed well before the 1000ms debounce would have fired
            act(() => {
                vi.advanceTimersByTime(200);
            });
            expect(updateTable).not.toHaveBeenCalled();

            unmount();

            expect(updateTable).toHaveBeenCalledWith('table-1', {
                name: 'renamed',
            });
        } finally {
            vi.useRealTimers();
        }
    });

    it('does not commit on unmount when the name was never changed', () => {
        const table = baseTable();
        const { unmount, updateTable } = renderUseUpdateTable(table);

        unmount();

        expect(updateTable).not.toHaveBeenCalled();
    });
});
