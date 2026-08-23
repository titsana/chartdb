import { useEffect, useRef, useState } from 'react';
import type { Awareness } from 'y-protocols/awareness';
import equal from 'fast-deep-equal';

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
 *
 * Perf fix found via manual testing on a large imported diagram
 * (hundreds of tables): `table-node.tsx`/`area-node.tsx`/`note-node.tsx`
 * each call this hook once (via `useSelectingPeers`), so N nodes means
 * N+1 independent subscriptions to the SAME `awareness.on('change', ...)`
 * event. `y-protocols/awareness`'s `setLocalState`/`setLocalStateField`
 * emit `'change'` for the LOCAL client's own writes too (confirmed by
 * reading awareness.js — not just remote peers'), and canvas.tsx
 * broadcasts this client's own cursor/viewport on every mousemove/pan
 * frame. Without the `equal(...)` bail-out below, every one of those
 * frames called `setPeers()` with a brand-new array of brand-new
 * objects — a new reference every time even when the *content* (which
 * excludes this client's own state already) hadn't actually changed —
 * re-rendering every single node component on every mouse-move/pan
 * frame, purely from panning ALONE with zero other peers connected.
 * `readPeers()`'s result only genuinely differs when a REMOTE peer's
 * state changed, so skipping the `setPeers` call when it's deep-equal to
 * the last one eliminates that self-inflicted churn entirely.
 */
export function usePresence(awareness: Awareness | null): PresencePeer[] {
    const [peers, setPeers] = useState<PresencePeer[]>([]);
    const peersRef = useRef(peers);

    useEffect(() => {
        if (!awareness) {
            peersRef.current = [];
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

        const applyPeers = () => {
            const next = readPeers();
            if (equal(next, peersRef.current)) return;
            peersRef.current = next;
            setPeers(next);
        };

        applyPeers();

        awareness.on('change', applyPeers);
        return () => awareness.off('change', applyPeers);
    }, [awareness]);

    return peers;
}
