import { useCallback, useState, useEffect, useRef } from 'react';
import { useChartDB } from './use-chartdb';
import { useDebounce } from './use-debounce-v2';
import type { DBTable } from '@/lib/domain';

// Hook for updating table properties with debouncing for performance
export const useUpdateTable = (table: DBTable) => {
    const { updateTable: chartDBUpdateTable } = useChartDB();
    const [localTableName, setLocalTableName] = useState(table.name);
    const localTableNameRef = useRef(localTableName);
    localTableNameRef.current = localTableName;

    const commitName = useCallback(
        (value: string) => {
            if (value.trim() && value.trim() !== table.name) {
                chartDBUpdateTable(table.id, { name: value.trim() });
            }
        },
        [chartDBUpdateTable, table.id, table.name]
    );

    // Debounced update function
    const debouncedUpdate = useDebounce(commitName, 1000 /* ms */);

    // Update local state immediately for responsive UI
    const handleTableNameChange = useCallback(
        (value: string) => {
            setLocalTableName(value);
            debouncedUpdate(value);
        },
        [debouncedUpdate]
    );

    // Flush a pending rename on unmount. The table-edit-mode panel
    // (canvas double-click) unmounts this hook's owner as soon as it
    // closes (X button, click-away, or Escape — table-edit-mode.tsx),
    // but useDebounce's cleanup only *cancels* the pending 1000ms write,
    // it never fires it (use-debounce-v2.ts) — so typing a new name and
    // closing before the debounce elapsed silently dropped the rename.
    // Sidebar rename doesn't debounce at all (commits on blur/Enter), so
    // it never hit this. commitName is re-created per render (table.id/
    // table.name deps); read it via a ref so this effect's cleanup
    // (registered once, on mount) doesn't call a stale closure.
    const commitNameRef = useRef(commitName);
    commitNameRef.current = commitName;
    useEffect(() => {
        return () => {
            commitNameRef.current(localTableNameRef.current);
        };
    }, []);

    // Update local state when table name changes externally
    useEffect(() => {
        setLocalTableName(table.name);
    }, [table.name]);

    return {
        tableName: localTableName,
        handleTableNameChange,
    };
};
