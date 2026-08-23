import React from 'react';
import { useReactFlow, useViewport } from '@xyflow/react';
import type { PresencePeer } from '@/hooks/use-presence';

export interface RemoteCursorsProps {
    peers: PresencePeer[];
}

/**
 * Phase 5 (docs/design/realtime-collaboration.md §10): renders every other
 * peer's cursor as a labeled pointer, positioned via `flowToScreenPosition`
 * (the inverse of `screenToFlowPosition`, already used elsewhere in
 * canvas.tsx for the temp-floating-edge cursor) rather than as a React
 * Flow node — cursors don't need a `Handle`/edge-anchor, just a plain
 * absolutely-positioned overlay. `flowToScreenPosition` returns the same
 * coordinate space as `event.clientX`/`clientY` (viewport pixels), so a
 * `position: fixed` element can use its result directly as `left`/`top`.
 *
 * `useViewport()` is called for its own re-render trigger on pan/zoom —
 * cursor coordinates are stored in flow space (see `PresenceState`'s doc
 * comment), so a remote cursor's on-screen position has to be recomputed
 * whenever this client's own viewport changes, not just when the peer's
 * data changes.
 */
export const RemoteCursors: React.FC<RemoteCursorsProps> = ({ peers }) => {
    const { flowToScreenPosition } = useReactFlow();
    useViewport();

    const visiblePeers = peers.filter((peer) => peer.cursor);

    if (visiblePeers.length === 0) {
        return null;
    }

    return (
        <div
            className="pointer-events-none fixed inset-0 z-50"
            aria-hidden="true"
        >
            {visiblePeers.map((peer) => {
                const screenPosition = flowToScreenPosition(peer.cursor!);
                const color = peer.color ?? '#8eb7ff';
                return (
                    <div
                        key={peer.clientId}
                        className="absolute -translate-x-0.5 -translate-y-0.5"
                        style={{
                            left: screenPosition.x,
                            top: screenPosition.y,
                        }}
                    >
                        <svg
                            width="20"
                            height="20"
                            viewBox="0 0 20 20"
                            fill="none"
                        >
                            <path
                                d="M1 1L1 15.5L5.5 12L8.5 18L11 16.5L8 10.5L14.5 10.5L1 1Z"
                                fill={color}
                                stroke="white"
                                strokeWidth="1"
                            />
                        </svg>
                        <div
                            className="ml-4 whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium text-white shadow"
                            style={{ backgroundColor: color }}
                        >
                            {peer.displayName ?? 'Guest'}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
