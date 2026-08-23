import { describe, expect, it } from 'vitest';
import {
    resolveFollowViewport,
    viewportToCenter,
    wouldCreateFollowCycle,
} from '../resolve-follow-viewport';
import type { PresencePeer } from '@/hooks/use-presence';

const peer = (overrides: Partial<PresencePeer>): PresencePeer => ({
    clientId: 1,
    ...overrides,
});

describe('viewportToCenter', () => {
    // The actual bug reported after shipping: broadcasting the raw
    // transform instead of a center point means the same transform centers
    // on a DIFFERENT flow point depending on the viewer's window size.
    // viewportToCenter's whole job is to make the broadcast value
    // independent of that — same flow-space input, same center output,
    // regardless of which container size computed the transform.
    it('recovers the same flow-space center from two different container sizes', () => {
        const center = { x: 500, y: -300, zoom: 2 };
        // setCenter's own formula, inverted here to build the fixture:
        // what transform would this container size show for this center?
        const transformFor = (width: number, height: number) => ({
            x: width / 2 - center.x * center.zoom,
            y: height / 2 - center.y * center.zoom,
            zoom: center.zoom,
        });

        expect(viewportToCenter(transformFor(1920, 1080), 1920, 1080)).toEqual(
            center
        );
        expect(viewportToCenter(transformFor(800, 600), 800, 600)).toEqual(
            center
        );
    });
});

describe('resolveFollowViewport', () => {
    it('does nothing when not following anyone', () => {
        expect(resolveFollowViewport(null, undefined)).toEqual({
            action: 'none',
        });
    });

    it('clears follow when the followed peer is gone', () => {
        expect(resolveFollowViewport(1, undefined)).toEqual({
            action: 'clear',
        });
    });

    // The exact bug found before this shipped: a followed peer who hasn't
    // panned/zoomed since loading has no `viewportCenter` field at all yet
    // — this must be a no-op, not a crash, and NOT treated as "peer left".
    it('does nothing (not "clear") when the followed peer has no viewportCenter yet', () => {
        expect(
            resolveFollowViewport(
                1,
                peer({ clientId: 1, viewportCenter: undefined })
            )
        ).toEqual({ action: 'none' });
    });

    it('applies the followed peer viewport center when present', () => {
        const viewportCenter = { x: 10, y: -20, zoom: 1.5 };
        expect(
            resolveFollowViewport(1, peer({ clientId: 1, viewportCenter }))
        ).toEqual({ action: 'apply', center: viewportCenter });
    });
});

describe('wouldCreateFollowCycle', () => {
    const ME = 1;

    it('allows following someone who follows no one', () => {
        const peers = [peer({ clientId: 2, following: null })];
        expect(wouldCreateFollowCycle(ME, 2, peers)).toBe(false);
    });

    it('allows following someone who follows a third, unrelated party', () => {
        const peers = [
            peer({ clientId: 2, following: 3 }),
            peer({ clientId: 3, following: null }),
        ];
        expect(wouldCreateFollowCycle(ME, 2, peers)).toBe(false);
    });

    // The reported case: A and B try to follow each other.
    it('blocks the direct mutual-follow case', () => {
        const peers = [peer({ clientId: 2, following: ME })];
        expect(wouldCreateFollowCycle(ME, 2, peers)).toBe(true);
    });

    it('blocks a longer cycle (me -> 2 -> 3 -> me)', () => {
        const peers = [
            peer({ clientId: 2, following: 3 }),
            peer({ clientId: 3, following: ME }),
        ];
        expect(wouldCreateFollowCycle(ME, 2, peers)).toBe(true);
    });

    // A cycle exists among OTHER peers, but doesn't route through me —
    // not my problem, must not be blocked.
    it('does not block a cycle that exists elsewhere and never reaches me', () => {
        const peers = [
            peer({ clientId: 2, following: 3 }),
            peer({ clientId: 3, following: 2 }),
            peer({ clientId: 4, following: null }),
        ];
        expect(wouldCreateFollowCycle(ME, 4, peers)).toBe(false);
    });
});
