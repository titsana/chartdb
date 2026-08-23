import React from 'react';
import type { PresencePeer } from '@/hooks/use-presence';
import { cn } from '@/lib/utils';
import {
    Tooltip,
    TooltipTrigger,
    TooltipContent,
} from '@/components/tooltip/tooltip';

const FALLBACK_COLOR = '#8eb7ff';

/**
 * Phase 5: Figma-style "follow this person's viewport" entry point. Click
 * a peer's avatar to jump this client's camera onto theirs and keep
 * re-snapping onto it every time their viewport updates (canvas.tsx's
 * follow effect) — panning/zooming manually in between does NOT cancel
 * it, by explicit product decision; only clicking the (now-highlighted)
 * avatar again stops following.
 *
 * `followingPeerId` is purely local UI state owned by canvas.tsx, never
 * broadcast — nobody else needs to know who's following whom for this to
 * work, so there's nothing to add to `PresenceState` for it (unlike
 * `viewport` itself, which IS broadcast, since that's the data being
 * followed).
 */
export const PresenceAvatarBar: React.FC<{
    peers: PresencePeer[];
    followingPeerId: number | null;
    onFollow: (clientId: number) => void;
    onStopFollow: () => void;
}> = ({ peers, followingPeerId, onFollow, onStopFollow }) => {
    if (peers.length === 0) return null;

    return (
        <div className="fixed right-4 top-4 z-50 flex items-center gap-1.5 rounded-lg bg-background/95 p-1.5 shadow-md">
            {peers.map((peer) => {
                const isFollowing = peer.clientId === followingPeerId;
                const color = peer.color ?? FALLBACK_COLOR;
                const name = peer.displayName ?? 'Guest';
                return (
                    <Tooltip key={peer.clientId}>
                        <TooltipTrigger asChild>
                            <button
                                type="button"
                                onClick={() =>
                                    isFollowing
                                        ? onStopFollow()
                                        : onFollow(peer.clientId)
                                }
                                className={cn(
                                    'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white',
                                    isFollowing && 'ring-2 ring-offset-2'
                                )}
                                style={{
                                    backgroundColor: color,
                                    ...(isFollowing
                                        ? ({
                                              '--tw-ring-color': color,
                                          } as React.CSSProperties)
                                        : {}),
                                }}
                            >
                                {name.charAt(0).toUpperCase()}
                            </button>
                        </TooltipTrigger>
                        <TooltipContent>
                            {isFollowing
                                ? `Following ${name} — click to stop`
                                : `Follow ${name}`}
                        </TooltipContent>
                    </Tooltip>
                );
            })}
        </div>
    );
};
