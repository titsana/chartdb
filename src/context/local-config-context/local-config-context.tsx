import { createContext } from 'react';
import { emptyFn } from '@/lib/utils';
import type { Theme } from '../theme-context/theme-context';

export type ScrollAction = 'pan' | 'zoom';

export interface LocalConfigContext {
    theme: Theme;
    setTheme: (theme: Theme) => void;

    scrollAction: ScrollAction;
    setScrollAction: (action: ScrollAction) => void;

    showDBViews: boolean;
    setShowDBViews: (showViews: boolean) => void;

    showCardinality: boolean;
    setShowCardinality: (showCardinality: boolean) => void;

    showFieldAttributes: boolean;
    setShowFieldAttributes: (showFieldAttributes: boolean) => void;

    githubRepoOpened: boolean;
    setGithubRepoOpened: (githubRepoOpened: boolean) => void;

    starUsDialogLastOpen: number;
    setStarUsDialogLastOpen: (lastOpen: number) => void;

    showMiniMapOnCanvas: boolean;
    setShowMiniMapOnCanvas: (showMiniMapOnCanvas: boolean) => void;

    // Phase 5 (docs/design/realtime-collaboration.md §10): presence
    // display identity — a per-browser preference with no server-side
    // owner, same reasoning as everything else in this context (and as
    // config/diagram_filters post-Phase-4.5: no auth means no per-user
    // account to hang this off server-side).
    displayName: string;
    setDisplayName: (displayName: string) => void;
    presenceColor: string;
    setPresenceColor: (color: string) => void;
}

export const LocalConfigContext = createContext<LocalConfigContext>({
    theme: 'system',
    setTheme: emptyFn,

    scrollAction: 'pan',
    setScrollAction: emptyFn,

    showDBViews: false,
    setShowDBViews: emptyFn,

    showCardinality: true,
    setShowCardinality: emptyFn,

    showFieldAttributes: true,
    setShowFieldAttributes: emptyFn,

    githubRepoOpened: false,
    setGithubRepoOpened: emptyFn,

    starUsDialogLastOpen: 0,
    setStarUsDialogLastOpen: emptyFn,

    showMiniMapOnCanvas: false,
    setShowMiniMapOnCanvas: emptyFn,

    displayName: '',
    setDisplayName: emptyFn,
    presenceColor: '',
    setPresenceColor: emptyFn,
});
