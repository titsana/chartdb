import type { CSSProperties } from 'react';
import type { PresencePeer } from '@/hooks/use-presence';

const FALLBACK_COLOR = '#8eb7ff';

// ponytail: only the first peer's color is used when more than one peer
// has the same node selected at once — see presence-highlight.tsx.

/** Ring style for a table/area/note box that a peer currently has selected. */
export function presenceRingStyle(
    peers: PresencePeer[]
): CSSProperties | undefined {
    if (peers.length === 0) return undefined;
    return { boxShadow: `0 0 0 2px ${peers[0].color ?? FALLBACK_COLOR}` };
}
