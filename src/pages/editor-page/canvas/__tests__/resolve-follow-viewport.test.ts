import { describe, expect, it } from 'vitest';
import {
    resolveFollowViewport,
    viewportToCenter,
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
