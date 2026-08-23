import { useMemo } from 'react';
import { useChartDB } from './use-chartdb';
import { usePresence, type PresencePeer } from './use-presence';

/**
 * Phase 5: peers (other than this client) who currently have `nodeId`
 * selected on their own canvas. Table/area/note nodes all share one
 * `selectedTableIds` awareness field (broadcast from canvas.tsx's node
 * selection state, despite the name — see `PresenceState`), so this one
 * hook covers all three node types.
 */
export function useSelectingPeers(nodeId: string): PresencePeer[] {
    const { awareness } = useChartDB();
    const peers = usePresence(awareness);
    return useMemo(
        () => peers.filter((peer) => peer.selectedTableIds?.includes(nodeId)),
        [peers, nodeId]
    );
}
