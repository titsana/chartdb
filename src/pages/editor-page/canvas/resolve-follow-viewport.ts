import type { PresencePeer } from '@/hooks/use-presence';

export type FollowViewportResult =
    | { action: 'apply'; center: { x: number; y: number; zoom: number } }
    | { action: 'clear' } // followed peer is gone — stop following
    | { action: 'none' }; // not following, or nothing to apply yet

/**
 * Pure decision logic for top-navbar.tsx's "follow this peer" effect:
 * given who's being followed and that peer's current presence entry
 * (already looked up by the caller — it has to do that lookup anyway to
 * derive the primitive x/y/zoom values its effect depends on, see its own
 * comment on why it can't depend on the peer object/array reference
 * directly), what should happen? Separated from the effect itself so this
 * can be unit-tested without a React Flow render harness — neither
 * top-navbar.tsx nor canvas.tsx (this file's other consumer, for the
 * broadcast side) has one.
 *
 * `followedPeer: undefined` while `followingPeerId` is non-null means the
 * peer left the room mid-follow → `'clear'`. `'none'` also covers a peer
 * who hasn't panned/zoomed since loading — they simply have no
 * `viewportCenter` field broadcast yet (fixed at the call site by
 * broadcasting an initial one on mount, not by anything here); this
 * function only reports "nothing to apply," it doesn't know or care why.
 *
 * Returns a flow-space center point + zoom (`'apply'`'s `center`), for
 * the caller to hand to React Flow's `setCenter` — NOT a raw
 * `{x, y, zoom}` transform for `setViewport`. See `PresenceState.
 * viewportCenter`'s doc comment for why a raw transform is wrong here
 * (it's window-size-dependent; a center point + zoom isn't).
 */
/**
 * Inverts React Flow's own `setCenter` formula
 * (`x: width / 2 - centerX * zoom`) to get the flow-space center point a
 * given `{x, y, zoom}` transform is showing, on a container of this size.
 * Broadcast-side counterpart to `resolveFollowViewport`'s `setCenter`
 * consumption — see `PresenceState.viewportCenter`'s doc comment for why
 * broadcasting the transform itself (not its center) breaks across
 * different window sizes.
 */
export function viewportToCenter(
    viewport: { x: number; y: number; zoom: number },
    width: number,
    height: number
): { x: number; y: number; zoom: number } {
    return {
        x: (width / 2 - viewport.x) / viewport.zoom,
        y: (height / 2 - viewport.y) / viewport.zoom,
        zoom: viewport.zoom,
    };
}

export function resolveFollowViewport(
    followingPeerId: number | null,
    followedPeer: PresencePeer | undefined
): FollowViewportResult {
    if (followingPeerId === null) return { action: 'none' };
    if (!followedPeer) return { action: 'clear' };
    if (!followedPeer.viewportCenter) return { action: 'none' };

    return { action: 'apply', center: followedPeer.viewportCenter };
}
