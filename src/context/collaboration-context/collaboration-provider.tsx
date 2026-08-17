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

const CURSOR_EMIT_THROTTLE_MS = 50;
const CURSOR_IDLE_MS = 5000;
const VIEWPORT_EMIT_THROTTLE_MS = 50;
const OP_ACK_TIMEOUT_MS = 15_000;

// Entity-level version key — carried by ops that can race a concurrent write
// on the same row (see storage.service.ts's versionedUpdate). add* has no
// prior state to conflict with.
const VERSIONED_UPDATE_OPS = new Set([
    'updateTable',
    'putTable',
    'deleteTable',
    'updateField',
    'deleteField',
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
    'updateDiagram',
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

// add*/putTable ops carry the entity nested under a lowercase key named
// after its type ({table: {...}}, {field: {...}}, {relationship: {...}}...)
// — same convention as RESTORE_OPS' argKey on the gateway
// (collaboration.gateway.ts) — instead of a top-level `id`.
function idFor(op: string, args: Record<string, unknown>): string | undefined {
    if (typeof args.id === 'string') return args.id;
    const entity = entityTypeOf(op);
    const key = entity.charAt(0).toLowerCase() + entity.slice(1);
    return (args[key] as { id?: string } | undefined)?.id;
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
    const versionsRef = useRef<Map<string, number>>(new Map());
    const lastCursorEmitRef = useRef(0);
    const lastViewportEmitRef = useRef(0);
    const identity = useMemo(() => getOrCreateIdentity(), []);

    // ponytail: collaboration is scoped to API-storage-mode diagrams only —
    // local/Dexie diagrams have no server to relay through.
    const enabled = STORAGE_PROVIDER === 'api' && Boolean(diagramId);

    useEffect(() => {
        if (!enabled || !diagramId) return;

        console.log('Connecting to collaboration socket', WS_URL, {
            diagramId,
            identity,
        });

        // Callback form (not a plain object) — socket.io calls this before
        // *every* connection attempt, including reconnects after a drop, so
        // a token that expired mid-session gets refreshed instead of the
        // same stale value being replayed on every retry forever.
        const socket: Socket = io(WS_URL, {
            query: { diagramId },
            auth: (cb) => {
                getAccessToken().then((token) => cb({ ...identity, token }));
            },
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
        socket.on('presence:leave', ({ socketId }: { socketId: string }) => {
            setPresence((prev) => prev.filter((x) => x.socketId !== socketId));
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
            setFollowingSocketId((prev) => (prev === socketId ? null : prev));
            setRemoteFieldFocus((prev) => {
                if (!prev.has(socketId)) return prev;
                const next = new Map(prev);
                next.delete(socketId);
                return next;
            });
        });
        socket.on(
            'cursor',
            ({ socketId, x, y }: { socketId: string; x: number; y: number }) =>
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
                    versionsRef.current.set(versionKeyFor(op, id), newVersion);
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
                if (id) versionsRef.current.set(versionKeyFor(op, id), version);
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
            clearInterval(idleSweep);
            socket.disconnect();
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
            const sentArgs: Record<string, unknown> = versioned
                ? {
                      ...args,
                      version: versionsRef.current.get(versionKeyFor(op, id)),
                  }
                : { ...args };
            // deleteField also writes the table's indexes/checkConstraints
            // as part of the same server-side transaction (see
            // StorageService.deleteField) — guard that write with the
            // table's own baseVersion too, or a concurrent edit to this
            // table's indexes gets silently overwritten with no conflict.
            if (op === 'deleteField' && typeof args.tableId === 'string') {
                sentArgs.tableVersion = versionsRef.current.get(
                    `Table:${args.tableId}`
                );
            }
            return new Promise<void>((resolve, reject) => {
                // .timeout() — without it, a dropped/crashed server (or one
                // that throws outside handleOp's own try/catch) never acks,
                // and this promise hangs forever; every caller `await`-ing
                // db.updateX(...) would then hang too, with no error, no
                // retry, nothing visible to the user.
                socket.timeout(OP_ACK_TIMEOUT_MS).emit(
                    'op',
                    { diagramId, op, args: sentArgs },
                    (
                        err: Error | null,
                        ack?: {
                            ok: boolean;
                            error?: string;
                            newVersion?: number;
                        }
                    ) => {
                        if (err) {
                            reject(
                                new Error(
                                    `op "${op}" timed out waiting for server ack`
                                )
                            );
                            return;
                        }
                        if (ack?.ok) {
                            // Seed regardless of `versioned` — add* ops now
                            // return their fresh row's version (always 0)
                            // too, not just update/delete/put ops, so this
                            // entity's *next* edit doesn't race unguarded
                            // with an undefined baseVersion.
                            if (id && ack.newVersion !== undefined) {
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
            seedVersions,
        ]
    );

    return (
        <collaborationContext.Provider value={value}>
            {children}
        </collaborationContext.Provider>
    );
};
