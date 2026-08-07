import { createContext } from 'react';
import type { Socket } from 'socket.io-client';
import { emptyFn } from '@/lib/utils/utils';
import type { CollabIdentity } from '@/lib/collab-identity';

export interface CollabPresence {
    socketId: string;
    name: string;
    color: string;
}

export interface CollaborationContext {
    connected: boolean;
    // Bumps on every reconnect after a drop (not on the initial connect) —
    // consumers (see use-diagram-loader.tsx) use this to trigger a full
    // REST refetch, since any broadcasts missed while disconnected are gone.
    reconnectCount: number;
    presence: CollabPresence[];
    identity: CollabIdentity;
    socket: Socket | null;
    emitOp: (op: string, args: Record<string, unknown>) => Promise<void>;
    emitDrag: (tableId: string, x: number, y: number) => void;
    // Field-level clobber tracking — every op this tab sends records the
    // fields it touched; every op this tab receives checks against that.
    recordOwnEdit: (op: string, args: Record<string, unknown>) => void;
    checkClobber: (op: string, args: Record<string, unknown>) => string[];
}

export const collaborationInitialValue: CollaborationContext = {
    connected: false,
    reconnectCount: 0,
    presence: [],
    identity: { name: '', color: '' },
    socket: null,
    emitOp: emptyFn,
    emitDrag: emptyFn,
    recordOwnEdit: emptyFn,
    checkClobber: (): string[] => [],
};

export const collaborationContext = createContext<CollaborationContext>(
    collaborationInitialValue
);
