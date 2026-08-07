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
import type { CollabPresence } from './collaboration-context';
import { collaborationContext } from './collaboration-context';

const CLOBBER_WINDOW_MS = 5000;

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

export const CollaborationProvider: React.FC<React.PropsWithChildren> = ({
    children,
}) => {
    const { diagramId } = useParams<{ diagramId: string }>();
    const [connected, setConnected] = useState(false);
    const [reconnectCount, setReconnectCount] = useState(0);
    const [presence, setPresence] = useState<CollabPresence[]>([]);
    const socketRef = useRef<Socket | null>(null);
    const ownEditsRef = useRef<Map<string, number>>(new Map());
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
            socket.on('presence:leave', ({ socketId }: { socketId: string }) =>
                setPresence((prev) =>
                    prev.filter((x) => x.socketId !== socketId)
                )
            );
        })();

        return () => {
            cancelled = true;
            socket?.disconnect();
            socketRef.current = null;
            setConnected(false);
            setPresence([]);
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
            console.log('emitOp', { op, args });
            return new Promise<void>((resolve, reject) => {
                socket.emit(
                    'op',
                    { diagramId, op, args },
                    (ack: { ok: boolean; error?: string }) => {
                        if (ack?.ok) resolve();
                        else
                            reject(
                                new Error(ack?.error ?? `op "${op}" failed`)
                            );
                    }
                );
            });
        },
        [diagramId]
    );

    const emitDrag = useCallback(
        (tableId: string, x: number, y: number) => {
            const socket = socketRef.current;
            if (!socket || !socket.connected || !diagramId) return;
            socket.emit('drag', { diagramId, tableId, x, y });
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
            recordOwnEdit,
            checkClobber,
        }),
        [
            connected,
            reconnectCount,
            presence,
            identity,
            emitOp,
            emitDrag,
            recordOwnEdit,
            checkClobber,
        ]
    );

    return (
        <collaborationContext.Provider value={value}>
            {children}
        </collaborationContext.Provider>
    );
};
