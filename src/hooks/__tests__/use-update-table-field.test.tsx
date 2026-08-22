import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { chartDBContext } from '@/context/chartdb-context/chartdb-context';
import type { ChartDBContext } from '@/context/chartdb-context/chartdb-context';
import { DatabaseType } from '@/lib/domain/database-type';
import type { DBField } from '@/lib/domain/db-field';
import type { DBTable } from '@/lib/domain/db-table';
import { useUpdateTableField } from '../use-update-table-field';

/**
 * Phase 1 (docs/design/realtime-collaboration.md §10) regression guards
 * for the appendix-b:5 and appendix-b:7 fixes in useUpdateTableField.
 */

const baseField = (overrides: Partial<DBField>): DBField => ({
    id: 'field-1',
    name: 'field',
    type: { id: 'integer', name: 'integer' },
    primaryKey: false,
    nullable: true,
    unique: false,
    createdAt: Date.now(),
    ...overrides,
});

const baseTable = (fields: DBField[]): DBTable => ({
    id: 'table-1',
    name: 'table_1',
    schema: 'public',
    x: 0,
    y: 0,
    fields,
    indexes: [],
    color: '#000000',
    createdAt: Date.now(),
    isView: false,
});

function renderUseUpdateTableField(
    table: DBTable,
    field: DBField,
    updateField = vi.fn()
) {
    const mockChartDB = {
        databaseType: DatabaseType.GENERIC,
        customTypes: [],
        updateField,
        removeField: vi.fn(),
    } as unknown as ChartDBContext;

    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <chartDBContext.Provider value={mockChartDB}>
            {children}
        </chartDBContext.Provider>
    );

    const hook = renderHook(() => useUpdateTableField(table, field), {
        wrapper,
    });
    return { ...hook, updateField };
}

describe('useUpdateTableField', () => {
    it('fix for appendix-b:5 — the PK-implies-not-null correction does not push its own undo entry', async () => {
        // Previously this effect called updateField without options,
        // defaulting to updateHistory: true — so the auto-correction
        // silently added an entry to the undo stack the user never asked
        // for, and their next "undo" could revert it instead of their
        // actual last visible action.
        const field = baseField({ primaryKey: true, nullable: true });
        const table = baseTable([field]);
        const { updateField } = renderUseUpdateTableField(table, field);

        await waitFor(() => {
            expect(updateField).toHaveBeenCalledWith(
                'table-1',
                'field-1',
                { nullable: false },
                { updateHistory: false }
            );
        });
    });

    it('fix for appendix-b:7 — a lone PK field gets unique corrected to true from the live count, not a pre-write guess', async () => {
        const field = baseField({ primaryKey: true, unique: false });
        const table = baseTable([field]);
        const { updateField } = renderUseUpdateTableField(table, field);

        await waitFor(() => {
            expect(updateField).toHaveBeenCalledWith(
                'table-1',
                'field-1',
                { unique: true },
                { updateHistory: false }
            );
        });
    });

    it('fix for appendix-b:7 — a composite PK member gets unique corrected to false, not left as an accidental single-column unique constraint', async () => {
        const fieldA = baseField({
            id: 'field-a',
            primaryKey: true,
            unique: true, // as if two concurrent toggles both guessed "I'm the only PK"
        });
        const fieldB = baseField({
            id: 'field-b',
            primaryKey: true,
            unique: true,
        });
        const table = baseTable([fieldA, fieldB]);
        const { updateField } = renderUseUpdateTableField(table, fieldA);

        await waitFor(() => {
            expect(updateField).toHaveBeenCalledWith(
                'table-1',
                'field-a',
                { unique: false },
                { updateHistory: false }
            );
        });
    });

    it('fix for appendix-b:7 — toggling PK on no longer guesses `unique` at write time', async () => {
        // Two fields toggled to PK in the same tick both see the same
        // pre-write primaryKeyCount === 0 under the old code and both set
        // unique: true — a real composite-PK race. The fix removes the
        // guess from this write path entirely; the dedicated effect above
        // is what corrects `unique` afterward, from the committed count.
        const field = baseField({ primaryKey: false, unique: false });
        const table = baseTable([field]);
        const { result, updateField } = renderUseUpdateTableField(table, field);

        act(() => {
            result.current.handlePrimaryKeyToggle(true);
        });

        await waitFor(() => {
            expect(updateField).toHaveBeenCalledWith('table-1', 'field-1', {
                primaryKey: true,
                nullable: false,
            });
        });
        // no call ever set `unique` from this write path
        expect(
            updateField.mock.calls.some(
                (call) =>
                    call[2] &&
                    Object.prototype.hasOwnProperty.call(call[2], 'unique')
            )
        ).toBe(false);
    });

    it('fix for appendix-b:6 — a remote rename landing mid-debounce cancels the pending stale-overwrite instead of firing it later', () => {
        // Previously: debouncedNameUpdate's underlying debounce().cancel()
        // was a no-op, so when field.name changed underneath a pending
        // debounced write (recreating the callback via its dep array), the
        // OLD pending timeout still fired later — comparing against and
        // unconditionally overwriting whatever field.name had *become* by
        // then, discarding a concurrent rename with no signal at all.
        vi.useFakeTimers();
        try {
            const updateField = vi.fn();
            const mockChartDB = {
                databaseType: DatabaseType.GENERIC,
                customTypes: [],
                updateField,
                removeField: vi.fn(),
            } as unknown as ChartDBContext;

            const wrapper = ({ children }: { children: React.ReactNode }) => (
                <chartDBContext.Provider value={mockChartDB}>
                    {children}
                </chartDBContext.Provider>
            );

            const table = baseTable([baseField({ name: 'original' })]);
            const { result, rerender } = renderHook(
                ({ field }) => useUpdateTableField(table, field),
                {
                    wrapper,
                    initialProps: { field: baseField({ name: 'original' }) },
                }
            );

            act(() => {
                result.current.handleNameChange('typed-by-this-user');
            });

            // a remote peer's rename lands before the 300ms debounce fires
            rerender({ field: baseField({ name: 'renamed-by-peer' }) });

            act(() => {
                vi.advanceTimersByTime(300);
            });

            // the stale local edit never overwrote the peer's rename
            expect(updateField).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });
});
