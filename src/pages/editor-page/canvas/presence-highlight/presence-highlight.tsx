import React from 'react';
import type { PresencePeer } from '@/hooks/use-presence';

const FALLBACK_COLOR = '#8eb7ff';

// ponytail: only the first peer's color/name is used when more than one
// peer has the same node selected at once — "someone's here" is enough
// for this pass; upgrade to a stacked-avatar/multi-ring display if
// simultaneous multi-peer edits on one node turn out common.

/** Name-label badge, same visual language as RemoteCursors' pointer label. */
export const PresenceHighlightBadge: React.FC<{ peers: PresencePeer[] }> = ({
    peers,
}) => {
    if (peers.length === 0) return null;
    return (
        <div
            className="absolute -top-6 left-0 z-10 max-w-full truncate rounded px-1.5 py-0.5 text-xs font-medium text-white shadow"
            style={{ backgroundColor: peers[0].color ?? FALLBACK_COLOR }}
        >
            {peers[0].displayName ?? 'Guest'}
        </div>
    );
};
