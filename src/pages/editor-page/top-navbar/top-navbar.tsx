import React, { useCallback, useEffect, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import ChartDBLogo from '@/assets/logo-light.png';
import ChartDBDarkLogo from '@/assets/logo-dark.png';
import { useTheme } from '@/hooks/use-theme';
import { useChartDB } from '@/hooks/use-chartdb';
import { usePresence } from '@/hooks/use-presence';
import { useToast } from '@/components/toast/use-toast';
import { DiagramName } from './diagram-name';
import { LastSaved } from './last-saved';
import { LanguageNav } from './language-nav/language-nav';
import { Menu } from './menu/menu';
import { PresenceAvatarBar } from '../canvas/presence-avatar-bar/presence-avatar-bar';
import {
    resolveFollowViewport,
    wouldCreateFollowCycle,
} from '../canvas/resolve-follow-viewport';

export interface TopNavbarProps {}

export const TopNavbar: React.FC<TopNavbarProps> = () => {
    const { effectiveTheme } = useTheme();
    const { awareness } = useChartDB();
    const presencePeers = usePresence(awareness);
    const { setCenter } = useReactFlow();
    const { toast } = useToast();

    // Phase 5: "follow this peer" — clicking their avatar below sets
    // `followingPeerId`; the canvas camera then re-snaps onto that peer's
    // broadcast viewport center every time it changes (canvas.tsx owns the
    // broadcast side, since that's tied to its own `<ReactFlow onMove>`;
    // this component only needs to consume it, which `setCenter` and
    // `usePresence` both work from anywhere inside the same
    // `ReactFlowProvider` — no need to live next to the canvas element
    // itself). Purely local UI state, never broadcast (see
    // presence-avatar-bar.tsx's doc comment for why). Manual pan/zoom in
    // between two of the leader's updates does NOT clear this — explicit
    // product decision, stop only via clicking the (highlighted) avatar
    // again.
    const [followingPeerId, setFollowingPeerId] = useState<number | null>(null);
    // resolveFollowViewport is a pure function (canvas/resolve-follow-
    // viewport.ts, unit-tested) — this effect is just wiring it up to
    // setCenter/setFollowingPeerId. Deliberately re-derived from primitive
    // x/y/zoom below, NOT from the `presencePeers` array reference: that
    // array gets a fresh object on every awareness change at all (e.g. the
    // leader's cursor moving), which would replay `setCenter` far more
    // often than the leader's viewport center actually changes, fighting
    // any manual pan the follower does in between.
    const followedPeer =
        followingPeerId !== null
            ? presencePeers.find((peer) => peer.clientId === followingPeerId)
            : undefined;
    const followedCenterX = followedPeer?.viewportCenter?.x;
    const followedCenterY = followedPeer?.viewportCenter?.y;
    const followedCenterZoom = followedPeer?.viewportCenter?.zoom;
    useEffect(() => {
        const result = resolveFollowViewport(followingPeerId, followedPeer);
        if (result.action === 'clear') {
            setFollowingPeerId(null);
        } else if (result.action === 'apply') {
            setCenter(result.center.x, result.center.y, {
                zoom: result.center.zoom,
                duration: 300,
            });
        }
        // `followedPeer` deliberately excluded — see the comment above.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        followingPeerId,
        followedCenterX,
        followedCenterY,
        followedCenterZoom,
        setCenter,
    ]);

    // Broadcasts who I'm following — the one exception to "follow state is
    // local-only, never broadcast" (see PresenceState.following's doc
    // comment): wouldCreateFollowCycle below needs to see everyone else's
    // target to refuse a follow that would loop back to me.
    useEffect(() => {
        if (!awareness) return;
        awareness.setLocalStateField('following', followingPeerId);
    }, [awareness, followingPeerId]);

    // Guards the click itself, before setFollowingPeerId ever runs — two
    // (or more) clients following each other would otherwise fight over
    // the camera forever, each snapping back the instant the other's
    // snap changes their own broadcast viewport center.
    const handleFollow = useCallback(
        (clientId: number) => {
            if (
                awareness &&
                wouldCreateFollowCycle(
                    awareness.clientID,
                    clientId,
                    presencePeers
                )
            ) {
                toast({
                    title: "Can't follow",
                    description:
                        'That would create a follow loop — someone in the chain is already following you.',
                    variant: 'destructive',
                });
                return;
            }
            setFollowingPeerId(clientId);
        },
        [awareness, presencePeers, toast]
    );

    const renderStars = useCallback(() => {
        return (
            <iframe
                src={`https://ghbtns.com/github-btn.html?user=chartdb&repo=chartdb&type=star&size=large&text=false`}
                width="40"
                height="30"
                title="GitHub"
            ></iframe>
        );
    }, []);

    return (
        <nav className="flex flex-col justify-between border-b px-3 md:h-12 md:flex-row md:items-center md:px-4">
            <div className="flex flex-1 flex-col justify-between gap-x-1 md:flex-row md:justify-normal">
                <div className="flex items-center justify-between pt-[8px] font-primary md:py-[10px]">
                    <a
                        href="https://chartdb.io"
                        className="cursor-pointer"
                        rel="noreferrer"
                    >
                        <img
                            src={
                                effectiveTheme === 'light'
                                    ? ChartDBLogo
                                    : ChartDBDarkLogo
                            }
                            alt="chartDB"
                            className="h-4 max-w-fit"
                        />
                    </a>
                </div>
                <Menu />
            </div>
            <DiagramName />
            <div className="hidden flex-1 items-center justify-end gap-2 sm:flex">
                <PresenceAvatarBar
                    peers={presencePeers}
                    followingPeerId={followingPeerId}
                    onFollow={handleFollow}
                    onStopFollow={() => setFollowingPeerId(null)}
                />
                <LastSaved />
                {renderStars()}
                <LanguageNav />
            </div>
        </nav>
    );
};
