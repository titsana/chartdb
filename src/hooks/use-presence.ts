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
    // Phase 5: which table(s) this peer currently has selected on their own
    // canvas (mirrors React Flow's local `node.selected`, broadcast — see
    // canvas.tsx). Table-node.tsx filters peers by `id` to show "someone's
    // looking at this table" highlight.
    selectedTableIds?: string[];
    // Phase 5: the flow-space point this peer's camera is centered on, plus
    // their zoom level, broadcast on every pan/zoom (rAF-throttled, same
    // convention as `cursor`) so another client can "follow" them (see
    // top-navbar.tsx's follow effect and presence-avatar-bar.tsx).
    //
    // Deliberately flow-space (like `cursor`), NOT the raw `{x, y, zoom}`
    // transform React Flow's `getViewport`/`setViewport` use — a first
    // version broadcast the raw transform directly, which is wrong: that
    // transform is `{screenCenter - flowCenter * zoom}`, so the same
    // triple centers on a DIFFERENT flow-space point on a follower whose
    // window is a different pixel size than the leader's. Center point +
    // zoom has no such dependency; the follower reproduces it via
    // `setCenter(x, y, { zoom })`, which computes ITS OWN screen-space
    // offset from ITS OWN container size — the same reason `cursor` is
    // flow-space and not screen pixels.
    viewportCenter?: { x: number; y: number; zoom: number };
    // Phase 5: the clientId this peer is currently following (or
    // null/undefined if they aren't following anyone). Broadcast
    // specifically so `wouldCreateFollowCycle` (resolve-follow-viewport.ts)
    // can refuse a follow that would form a loop — direct (A follows B,
    // B tries to follow A back) or longer (A→B→C→A) — before it happens,
    // rather than let two or more clients' cameras fight forever. This is
    // the one exception to "follow state is local-only, never broadcast":
    // detecting a cycle needs each client to know what everyone ELSE is
    // following, not just its own target.
    following?: number | null;
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
