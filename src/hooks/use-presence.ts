import { useEffect, useState } from 'react';
import type { Awareness } from 'y-protocols/awareness';

/**
 * Phase 5 (docs/design/realtime-collaboration.md §10): one remote peer's
 * shared presence state. `cursor` is in Y.Doc/flow coordinate space (not
 * screen pixels — the renderer is responsible for converting via React
 * Flow's `flowToScreenPosition`), so it stays meaningful independent of
 * each client's own pan/zoom.
 */
export interface PresenceState {
    displayName?: string;
    color?: string;
    cursor?: { x: number; y: number } | null;
}

export interface PresencePeer extends PresenceState {
    clientId: number;
}

/**
 * Projects a Hocuspocus room's `Awareness` into React state — the
 * presence equivalent of `useYCollectionSync`, but built on
 * `Awareness.on('change', ...)`/`getStates()` rather than `Y.Map`
 * observers (a different, non-Yjs-document API — see y-protocols'
 * `awareness.js`). Excludes this client's own entry; callers only ever
 * want to render *other* peers.
 *
 * No manual keepalive here: `Awareness`'s own constructor already
 * self-renews the local client's state and prunes peers that go stale for
 * 30s (see `outdatedTimeout` in awareness.js) — adding another interval on
 * top would be redundant, not defensive.
 */
export function usePresence(awareness: Awareness | null): PresencePeer[] {
    const [peers, setPeers] = useState<PresencePeer[]>([]);

    useEffect(() => {
        if (!awareness) {
            setPeers([]);
            return;
        }

        const readPeers = (): PresencePeer[] =>
            Array.from(awareness.getStates().entries())
                .filter(([clientId]) => clientId !== awareness.clientID)
                .map(([clientId, state]) => ({
                    clientId,
                    ...(state as PresenceState),
                }));

        setPeers(readPeers());

        const handler = () => setPeers(readPeers());
        awareness.on('change', handler);
        return () => awareness.off('change', handler);
    }, [awareness]);

    return peers;
}
