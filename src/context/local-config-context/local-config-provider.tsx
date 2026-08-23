import React, { useEffect } from 'react';
import type { ScrollAction } from './local-config-context';
import { LocalConfigContext } from './local-config-context';
import type { Theme } from '../theme-context/theme-context';
import { randomColor } from '@/lib/colors';
import { displayNameKey, initialDisplayName } from './initial-display-name';

const themeKey = 'theme';
const scrollActionKey = 'scroll_action';
const showCardinalityKey = 'show_cardinality';
const showFieldAttributesKey = 'show_field_attributes';
const githubRepoOpenedKey = 'github_repo_opened';
const starUsDialogLastOpenKey = 'star_us_dialog_last_open';
const showMiniMapOnCanvasKey = 'show_minimap_on_canvas';
const showDBViewsKey = 'show_db_views';
const presenceColorKey = 'presence_color';

export const LocalConfigProvider: React.FC<React.PropsWithChildren> = ({
    children,
}) => {
    const [theme, setTheme] = React.useState<Theme>(
        (localStorage.getItem(themeKey) as Theme) || 'system'
    );

    const [scrollAction, setScrollAction] = React.useState<ScrollAction>(
        (localStorage.getItem(scrollActionKey) as ScrollAction) || 'pan'
    );

    const [showDBViews, setShowDBViews] = React.useState<boolean>(
        (localStorage.getItem(showDBViewsKey) || 'false') === 'true'
    );

    const [showCardinality, setShowCardinality] = React.useState<boolean>(
        (localStorage.getItem(showCardinalityKey) || 'true') === 'true'
    );

    const [showFieldAttributes, setShowFieldAttributes] =
        React.useState<boolean>(
            (localStorage.getItem(showFieldAttributesKey) || 'true') === 'true'
        );

    const [githubRepoOpened, setGithubRepoOpened] = React.useState<boolean>(
        (localStorage.getItem(githubRepoOpenedKey) || 'false') === 'true'
    );

    const [starUsDialogLastOpen, setStarUsDialogLastOpen] =
        React.useState<number>(
            parseInt(localStorage.getItem(starUsDialogLastOpenKey) || '0')
        );

    const [showMiniMapOnCanvas, setShowMiniMapOnCanvas] =
        React.useState<boolean>(
            (localStorage.getItem(showMiniMapOnCanvasKey) || 'true') === 'true'
        );

    const [displayName, setDisplayName] =
        React.useState<string>(initialDisplayName);

    const [presenceColor, setPresenceColor] = React.useState<string>(
        localStorage.getItem(presenceColorKey) || randomColor()
    );

    useEffect(() => {
        localStorage.setItem(
            starUsDialogLastOpenKey,
            starUsDialogLastOpen.toString()
        );
    }, [starUsDialogLastOpen]);

    useEffect(() => {
        localStorage.setItem(githubRepoOpenedKey, githubRepoOpened.toString());
    }, [githubRepoOpened]);

    useEffect(() => {
        localStorage.setItem(themeKey, theme);
    }, [theme]);

    useEffect(() => {
        localStorage.setItem(scrollActionKey, scrollAction);
    }, [scrollAction]);

    useEffect(() => {
        localStorage.setItem(showDBViewsKey, showDBViews.toString());
    }, [showDBViews]);

    useEffect(() => {
        localStorage.setItem(showCardinalityKey, showCardinality.toString());
    }, [showCardinality]);

    useEffect(() => {
        localStorage.setItem(
            showMiniMapOnCanvasKey,
            showMiniMapOnCanvas.toString()
        );
    }, [showMiniMapOnCanvas]);

    useEffect(() => {
        localStorage.setItem(displayNameKey, displayName);
    }, [displayName]);

    useEffect(() => {
        localStorage.setItem(presenceColorKey, presenceColor);
    }, [presenceColor]);

    return (
        <LocalConfigContext.Provider
            value={{
                theme,
                setTheme,
                scrollAction,
                setScrollAction,
                showDBViews,
                setShowDBViews,
                showCardinality,
                setShowCardinality,
                showFieldAttributes,
                setShowFieldAttributes,
                setGithubRepoOpened,
                githubRepoOpened,
                starUsDialogLastOpen,
                setStarUsDialogLastOpen,
                showMiniMapOnCanvas,
                setShowMiniMapOnCanvas,
                displayName,
                setDisplayName,
                presenceColor,
                setPresenceColor,
            }}
        >
            {children}
        </LocalConfigContext.Provider>
    );
};
