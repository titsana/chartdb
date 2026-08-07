import { createContext } from 'react';
import type { Socket } from 'socket.io-client';
import { emptyFn } from '@/lib/utils/utils';
import type { CollabIdentity } from '@/lib/collab-identity';

export interface CollabPresence {
    socketId: string;
    name: string;
    color: string;
}

export interface RemoteCursor {
    x: number;
    y: number;
    lastMoved: number;
}

export interface RemoteSelection {
    tableIds: string[];
    relationshipIds: string[];
    areaIds: string[];
    noteIds: string[];
}

export interface RemoteViewport {
    x: number;
    y: number;
    zoom: number;
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
    emitCursor: (x: number, y: number) => void;
    emitSelection: (selection: RemoteSelection) => void;
    emitViewport: (x: number, y: number, zoom: number) => void;
    remoteCursors: Map<string, RemoteCursor>;
    remoteSelections: Map<string, RemoteSelection>;
    remoteViewports: Map<string, RemoteViewport>;
    // Who is following whom: followerSocketId -> targetSocketId.
    followMap: Map<string, string>;
    followingSocketId: string | null;
    followUser: (socketId: string) => void;
    unfollowUser: () => void;
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
    emitCursor: emptyFn,
    emitSelection: emptyFn,
    emitViewport: emptyFn,
    remoteCursors: new Map(),
    remoteSelections: new Map(),
    remoteViewports: new Map(),
    followMap: new Map(),
    followingSocketId: null,
    followUser: emptyFn,
    unfollowUser: emptyFn,
    recordOwnEdit: emptyFn,
    checkClobber: (): string[] => [],
};

export const collaborationContext = createContext<CollaborationContext>(
    collaborationInitialValue
);
