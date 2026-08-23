import { useMemo, useRef } from 'react';
import equal from 'fast-deep-equal';
import { useChartDB } from './use-chartdb';
import { usePresence, type PresencePeer } from './use-presence';

const EMPTY_PEERS: PresencePeer[] = [];

/**
 * Phase 5: peers (other than this client) who currently have `nodeId`
 * selected on their own canvas. Table/area/note nodes all share one
 * `selectedTableIds` awareness field (broadcast from canvas.tsx's node
 * selection state, despite the name — see `PresenceState`), so this one
 * hook covers all three node types.
 *
 * Perf fix found via manual testing with a real remote peer connected on
 * a large diagram, fully zoomed out (so no `onlyRenderVisibleElements`
 * virtualization is helping — every table is mounted): `usePresence`'s
 * own dedup (use-presence.ts) only skips a `setPeers` when NOTHING in the
 * peers array changed at all. A remote peer's cursor/viewport genuinely
 * DOES change every pan/mousemove frame while they're active — that's a
 * real change, not a false one — so `peers` legitimately gets a new
 * reference every one of those frames. Without the dedup below, `.filter`
 * ran fresh every time and returned a brand-new array (even when the
 * FILTERED result was unchanged, e.g. still empty for a table nobody has
 * selected), re-rendering every single table/area/note node on every
 * frame the remote peer moved anything — for however many peers are
 * connected, not just this client's own writes (already handled by
 * usePresence's fix). Comparing against the previous filtered result and
 * only returning a new reference when THAT actually changed collapses
 * this back down to "only the node(s) whose selecting-peers actually
 * changed re-render."
 */
export function useSelectingPeers(nodeId: string): PresencePeer[] {
    const { awareness } = useChartDB();
    const peers = usePresence(awareness);
    const filtered = useMemo(
        () => peers.filter((peer) => peer.selectedTableIds?.includes(nodeId)),
        [peers, nodeId]
    );

    const stableRef = useRef<PresencePeer[]>(EMPTY_PEERS);
    if (!equal(filtered, stableRef.current)) {
        stableRef.current = filtered;
    }
    return stableRef.current;
}
