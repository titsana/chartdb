import React, { useCallback, useMemo } from 'react';
import type { StorageContext } from './storage-context';
import { storageContext } from './storage-context';
import { useApiStorage } from './api-storage-provider';
import { useCollaboration } from '@/hooks/use-collaboration';

// Write methods that route through the collaboration socket instead of REST
// once connected — the server persists via the same StorageService the REST
// controller uses, then broadcasts to other clients in the diagram's room.
// Reads, and diagram/group lifecycle ops (create/delete a whole diagram,
// folder management) stay on REST — they're not part of live concurrent
// editing of an already-open diagram.
const COLLAB_WRITE_OPS = [
    'addTable',
    'updateTable',
    'putTable',
    'deleteTable',
    'addRelationship',
    'updateRelationship',
    'deleteRelationship',
    'addDependency',
    'updateDependency',
    'deleteDependency',
    'addArea',
    'updateArea',
    'deleteArea',
    'addCustomType',
    'updateCustomType',
    'deleteCustomType',
    'addNote',
    'updateNote',
    'deleteNote',
    'updateDiagram',
] as const satisfies ReadonlyArray<keyof StorageContext>;

export const CollabStorageProvider: React.FC<React.PropsWithChildren> = ({
    children,
}) => {
    const api = useApiStorage();
    const { emitOp, connected, recordOwnEdit } = useCollaboration();

    const writeOp = useCallback(
        (op: string, args: Record<string, unknown>): Promise<void> => {
            if (!connected) {
                return Promise.reject(
                    new Error(
                        'Collaboration socket disconnected — editing is paused until reconnect.'
                    )
                );
            }
            recordOwnEdit(op, args);
            return emitOp(op, args);
        },
        [connected, emitOp, recordOwnEdit]
    );

    const value = useMemo<StorageContext>(() => {
        const overrides = Object.fromEntries(
            COLLAB_WRITE_OPS.map((op) => [
                op,
                (args: Record<string, unknown>) => writeOp(op, args),
            ])
        ) as Pick<StorageContext, (typeof COLLAB_WRITE_OPS)[number]>;

        return { ...api, ...overrides };
    }, [api, writeOp]);

    return (
        <storageContext.Provider value={value}>
            {children}
        </storageContext.Provider>
    );
};
