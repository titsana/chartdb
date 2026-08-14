import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import { useParams } from 'react-router-dom';
import { STORAGE_PROVIDER, WS_URL } from '@/lib/env';
import { getAccessToken } from '@/lib/auth-token';
import { getOrCreateIdentity } from '@/lib/collab-identity';
import type {
    CollabPresence,
    RemoteCursor,
    RemoteSelection,
    RemoteViewport,
} from './collaboration-context';
import { collaborationContext } from './collaboration-context';

const CLOBBER_WINDOW_MS = 5000;
const CURSOR_EMIT_THROTTLE_MS = 50;
const CURSOR_IDLE_MS = 5000;
const VIEWPORT_EMIT_THROTTLE_MS = 50;

// Field-level keys only (see collaboration design decision: entity-level
// add/remove never triggers a clobber notification, only same-field updates).
function fieldKeysFor(op: string, args: Record<string, unknown>): string[] {
    if (!op.startsWith('update')) return [];
    const entityType = op.slice('update'.length);
    const id = args.id as string | undefined;
    const attributes = args.attributes as Record<string, unknown> | undefined;
    if (!id || !attributes) return [];
    return Object.keys(attributes).map(
        (field) => `${entityType}:${id}:${field}`
    );
}

// Entity-level version key — carried by ops that can race a concurrent write
// on the same row (see storage.service.ts's versionedUpdate). add* has no
// prior state to conflict with; updateDiagram is exempt (no version column).
const VERSIONED_UPDATE_OPS = new Set([
    'updateTable',
    'putTable',
    'deleteTable',
    'updateRelationship',
    'deleteRelationship',
    'updateDependency',
    'deleteDependency',
    'updateArea',
    'deleteArea',
    'updateCustomType',
    'deleteCustomType',
    'updateNote',
    'deleteNote',
]);

// A conflict correction may arrive as a same-op patch ({id, attributes}) or,
// for putTable/deleteTable, as an addTable upsert ({table: {...}}) — see the
// gateway comment on why deletes/puts restore via addTable. Strip whichever
// known verb prefix the op has so both shapes key into the same version slot.
function entityTypeOf(op: string): string {
    for (const prefix of ['update', 'delete', 'put', 'add']) {
        if (op.startsWith(prefix)) return op.slice(prefix.length);
    }
    return op;
}

function idFor(op: string, args: Record<string, unknown>): string | undefined {
    if (typeof args.id === 'string') return args.id;
    if (op === 'putTable' || op === 'addTable') {
        return (args.table as { id?: string } | undefined)?.id;
    }
    return undefined;
}

function versionKeyFor(op: string, id: string): string {
    return `${entityTypeOf(op)}:${id}`;
}

export const CollaborationProvider: React.FC<React.PropsWithChildren> = ({
    children,
}) => {
    const { diagramId } = useParams<{ diagramId: string }>();
    const [connected, setConnected] = useState(false);
    const [reconnectCount, setReconnectCount] = useState(0);
    const [presence, setPresence] = useState<CollabPresence[]>([]);
    const [remoteCursors, setRemoteCursors] = useState<
        Map<string, RemoteCursor>
    >(new Map());
    const [remoteSelections, setRemoteSelections] = useState<
        Map<string, RemoteSelection>
    >(new Map());
    const [remoteViewports, setRemoteViewports] = useState<
        Map<string, RemoteViewport>
    >(new Map());
    const [followMap, setFollowMap] = useState<Map<string, string>>(new Map());
    const [followingSocketId, setFollowingSocketId] = useState<string | null>(
        null
    );
    // socketId -> "EntityType:id:field" the field currently focused there.
    const [remoteFieldFocus, setRemoteFieldFocus] = useState<
        Map<string, string>
    >(new Map());
    const socketRef = useRef<Socket | null>(null);
    const ownEditsRef = useRef<Map<string, number>>(new Map());
    const versionsRef = useRef<Map<string, number>>(new Map());
    const lastCursorEmitRef = useRef(0);
    const lastViewportEmitRef = useRef(0);
    const identity = useMemo(() => getOrCreateIdentity(), []);

    // ponytail: collaboration is scoped to API-storage-mode diagrams only —
    // local/Dexie diagrams have no server to relay through.
    const enabled = STORAGE_PROVIDER === 'api' && Boolean(diagramId);

    useEffect(() => {
        if (!enabled || !diagramId) return;

        let cancelled = false;
        let socket: Socket | undefined;

        (async () => {
            const token = await getAccessToken();
            if (cancelled) return;

            console.log('Connecting to collaboration socket', WS_URL, {
                diagramId,
                identity,
            });

            socket = io(WS_URL, {
                query: { diagramId },
                auth: { ...identity, token },
            });
            socketRef.current = socket;

            socket.on('connect', () => setConnected(true));
            socket.on('disconnect', () => setConnected(false));
            // Manager-level 'reconnect' — fires only after a drop + successful
            // re-establish, never on the initial connect.
            socket.io.on('reconnect', () =>
                setReconnectCount((count) => count + 1)
            );
            socket.on('presence:list', (list: CollabPresence[]) =>
                setPresence(list)
            );
            socket.on('presence:join', (p: CollabPresence) =>
                setPresence((prev) => [
                    ...prev.filter((x) => x.socketId !== p.socketId),
                    p,
                ])
            );
            socket.on(
                'presence:leave',
                ({ socketId }: { socketId: string }) => {
                    setPresence((prev) =>
                        prev.filter((x) => x.socketId !== socketId)
                    );
                    setRemoteCursors((prev) => {
                        if (!prev.has(socketId)) return prev;
                        const next = new Map(prev);
                        next.delete(socketId);
                        return next;
                    });
                    setRemoteSelections((prev) => {
                        if (!prev.has(socketId)) return prev;
                        const next = new Map(prev);
                        next.delete(socketId);
                        return next;
                    });
                    setRemoteViewports((prev) => {
                        if (!prev.has(socketId)) return prev;
                        const next = new Map(prev);
                        next.delete(socketId);
                        return next;
                    });
                    setFollowMap((prev) => {
                        let changed = false;
                        const next = new Map(prev);
                        for (const [follower, target] of prev) {
                            if (follower === socketId || target === socketId) {
                                next.delete(follower);
                                changed = true;
                            }
                        }
                        return changed ? next : prev;
                    });
                    setFollowingSocketId((prev) =>
                        prev === socketId ? null : prev
                    );
                    setRemoteFieldFocus((prev) => {
                        if (!prev.has(socketId)) return prev;
                        const next = new Map(prev);
                        next.delete(socketId);
                        return next;
                    });
                }
            );
            socket.on(
                'cursor',
                ({
                    socketId,
                    x,
                    y,
                }: {
                    socketId: string;
                    x: number;
                    y: number;
                }) =>
                    setRemoteCursors((prev) => {
                        const next = new Map(prev);
                        next.set(socketId, { x, y, lastMoved: Date.now() });
                        return next;
                    })
            );
            socket.on(
                'selection',
                ({
                    socketId,
                    ...selection
                }: { socketId: string } & RemoteSelection) =>
                    setRemoteSelections((prev) => {
                        const next = new Map(prev);
                        next.set(socketId, selection);
                        return next;
                    })
            );
            socket.on(
                'viewport',
                ({
                    socketId,
                    x,
                    y,
                    zoom,
                }: {
                    socketId: string;
                    x: number;
                    y: number;
                    zoom: number;
                }) =>
                    setRemoteViewports((prev) => {
                        const next = new Map(prev);
                        next.set(socketId, { x, y, zoom });
                        return next;
                    })
            );
            // Track the latest known version per entity regardless of who
            // wrote it — otherwise this tab's next edit would send a stale
            // baseVersion and get rejected even though it's not stale.
            socket.on(
                'op',
                ({
                    op,
                    args,
                    newVersion,
                }: {
                    op: string;
                    args: Record<string, unknown>;
                    newVersion?: number;
                }) => {
                    const id = idFor(op, args);
                    if (id && newVersion !== undefined) {
                        versionsRef.current.set(
                            versionKeyFor(op, id),
                            newVersion
                        );
                    }
                }
            );
            // This tab's own write was rejected as stale — adopt the
            // server's version so the retry (if any) isn't rejected again.
            socket.on(
                'op:rejected',
                ({
                    op,
                    args,
                    version,
                }: {
                    op: string;
                    args: Record<string, unknown>;
                    version: number;
                }) => {
                    const id = idFor(op, args);
                    if (id)
                        versionsRef.current.set(versionKeyFor(op, id), version);
                }
            );
            socket.on(
                'follow',
                ({
                    socketId,
                    targetSocketId,
                }: {
                    socketId: string;
                    targetSocketId: string | null;
                }) =>
                    setFollowMap((prev) => {
                        const next = new Map(prev);
                        if (targetSocketId) next.set(socketId, targetSocketId);
                        else next.delete(socketId);
                        return next;
                    })
            );
            socket.on(
                'field:focus',
                ({ socketId, key }: { socketId: string; key: string | null }) =>
                    setRemoteFieldFocus((prev) => {
                        const next = new Map(prev);
                        if (key) next.set(socketId, key);
                        else next.delete(socketId);
                        return next;
                    })
            );
        })();

        // ponytail: sweeps stale cursors on a fixed tick instead of a
        // per-cursor timer — simplest way to satisfy "hide after ~5s idle".
        const idleSweep = setInterval(() => {
            setRemoteCursors((prev) => {
                const now = Date.now();
                let changed = false;
                const next = new Map(prev);
                for (const [socketId, cursor] of prev) {
                    if (now - cursor.lastMoved > CURSOR_IDLE_MS) {
                        next.delete(socketId);
                        changed = true;
                    }
                }
                return changed ? next : prev;
            });
        }, 1000);

        return () => {
            cancelled = true;
            clearInterval(idleSweep);
            socket?.disconnect();
            socketRef.current = null;
            setConnected(false);
            setPresence([]);
            setRemoteCursors(new Map());
            setRemoteSelections(new Map());
            setRemoteViewports(new Map());
            setFollowMap(new Map());
            setFollowingSocketId(null);
            setRemoteFieldFocus(new Map());
        };
    }, [enabled, diagramId, identity]);

    const emitOp = useCallback(
        (op: string, args: Record<string, unknown>): Promise<void> => {
            const socket = socketRef.current;
            if (!socket || !socket.connected || !diagramId) {
                return Promise.reject(
                    new Error(
                        'Collaboration socket disconnected — editing is paused until reconnect.'
                    )
                );
            }
            const id = idFor(op, args);
            const versioned = VERSIONED_UPDATE_OPS.has(op) && id;
            const sentArgs = versioned
                ? {
                      ...args,
                      version: versionsRef.current.get(versionKeyFor(op, id)),
                  }
                : args;
            return new Promise<void>((resolve, reject) => {
                socket.emit(
                    'op',
                    { diagramId, op, args: sentArgs },
                    (ack: {
                        ok: boolean;
                        error?: string;
                        newVersion?: number;
                    }) => {
                        if (ack?.ok) {
                            if (versioned && ack.newVersion !== undefined) {
                                versionsRef.current.set(
                                    versionKeyFor(op, id),
                                    ack.newVersion
                                );
                            }
                            resolve();
                        } else {
                            reject(
                                new Error(ack?.error ?? `op "${op}" failed`)
                            );
                        }
                    }
                );
            });
        },
        [diagramId]
    );

    const seedVersions = useCallback(
        (
            entries: Array<{
                entityType: string;
                id: string;
                version: number;
            }>
        ) => {
            for (const { entityType, id, version } of entries) {
                versionsRef.current.set(`${entityType}:${id}`, version);
            }
        },
        []
    );

    const emitDrag = useCallback(
        (tableId: string, x: number, y: number) => {
            const socket = socketRef.current;
            if (!socket || !socket.connected || !diagramId) return;
            socket.emit('drag', { diagramId, tableId, x, y });
        },
        [diagramId]
    );

    const emitCursor = useCallback(
        (x: number, y: number) => {
            const socket = socketRef.current;
            if (!socket || !socket.connected || !diagramId) return;
            const now = Date.now();
            if (now - lastCursorEmitRef.current < CURSOR_EMIT_THROTTLE_MS) {
                return;
            }
            lastCursorEmitRef.current = now;
            socket.emit('cursor', { diagramId, x, y });
        },
        [diagramId]
    );

    const emitSelection = useCallback(
        (selection: RemoteSelection) => {
            const socket = socketRef.current;
            if (!socket || !socket.connected || !diagramId) return;
            socket.emit('selection', { diagramId, ...selection });
        },
        [diagramId]
    );

    const emitViewport = useCallback(
        (x: number, y: number, zoom: number) => {
            const socket = socketRef.current;
            if (!socket || !socket.connected || !diagramId) return;
            const now = Date.now();
            if (now - lastViewportEmitRef.current < VIEWPORT_EMIT_THROTTLE_MS) {
                return;
            }
            lastViewportEmitRef.current = now;
            socket.emit('viewport', { diagramId, x, y, zoom });
        },
        [diagramId]
    );

    const followUser = useCallback(
        (socketId: string) => {
            const socket = socketRef.current;
            if (!socket || !socket.connected || !diagramId) return;
            setFollowingSocketId(socketId);
            socket.emit('follow', { diagramId, targetSocketId: socketId });
        },
        [diagramId]
    );

    const unfollowUser = useCallback(() => {
        const socket = socketRef.current;
        setFollowingSocketId(null);
        if (!socket || !socket.connected || !diagramId) return;
        socket.emit('follow', { diagramId, targetSocketId: null });
    }, [diagramId]);

    const emitFieldFocus = useCallback(
        (key: string | null) => {
            const socket = socketRef.current;
            if (!socket || !socket.connected || !diagramId) return;
            socket.emit('field:focus', { diagramId, key });
        },
        [diagramId]
    );

    const recordOwnEdit = useCallback(
        (op: string, args: Record<string, unknown>) => {
            const now = Date.now();
            for (const key of fieldKeysFor(op, args)) {
                ownEditsRef.current.set(key, now);
            }
        },
        []
    );

    const checkClobber = useCallback(
        (op: string, args: Record<string, unknown>): string[] => {
            const now = Date.now();
            const matched: string[] = [];
            for (const key of fieldKeysFor(op, args)) {
                const touchedAt = ownEditsRef.current.get(key);
                if (touchedAt && now - touchedAt < CLOBBER_WINDOW_MS) {
                    matched.push(key);
                    ownEditsRef.current.delete(key);
                }
            }
            return matched;
        },
        []
    );

    const value = useMemo(
        () => ({
            connected,
            reconnectCount,
            presence,
            identity,
            socket: socketRef.current,
            emitOp,
            emitDrag,
            emitCursor,
            emitSelection,
            emitViewport,
            remoteCursors,
            remoteSelections,
            remoteViewports,
            followMap,
            followingSocketId,
            followUser,
            unfollowUser,
            remoteFieldFocus,
            emitFieldFocus,
            recordOwnEdit,
            checkClobber,
            seedVersions,
        }),
        [
            connected,
            reconnectCount,
            presence,
            identity,
            emitOp,
            emitDrag,
            emitCursor,
            emitSelection,
            emitViewport,
            remoteCursors,
            remoteSelections,
            remoteViewports,
            followMap,
            followingSocketId,
            followUser,
            unfollowUser,
            remoteFieldFocus,
            emitFieldFocus,
            recordOwnEdit,
            checkClobber,
            seedVersions,
        ]
    );

    return (
        <collaborationContext.Provider value={value}>
            {children}
        </collaborationContext.Provider>
    );
};
