import React, { useEffect, useState } from 'react';
import { MsalProvider, useIsAuthenticated, useMsal } from '@azure/msal-react';
import { AUTH_MODE } from '@/lib/env';
import { msalInstance, isMsalConfigured } from '@/lib/msal-config';
import { SignInPage } from '@/pages/sign-in-page/sign-in-page';

interface AuthGateProps {
    /** Defaults to the real env-derived AUTH_MODE — overridable so tests
     * can exercise the 'azure-ad' branch without mocking @/lib/env. */
    authMode?: 'azure-ad' | 'public';
    /** Defaults to the real msal-config.ts check — overridable for the
     * same reason as authMode. */
    msalConfigured?: boolean;
}

/**
 * Phase 7: gates the whole app behind Entra sign-in when
 * AUTH_MODE === 'azure-ad' (the user's own choice, confirmed via
 * AskUserQuestion — /examples and /templates are gated too, not just the
 * editor). AUTH_MODE === 'public' (the default) renders children directly
 * with zero MSAL involvement — no behavior change from before this phase.
 *
 * Checks `msalConfigured` before rendering MsalProvider at all — hit in a
 * real deploy: AUTH_MODE=azure-ad was set without ENTRA_TENANT_ID/
 * ENTRA_CLIENT_ID, and msal-config.ts used to throw at import time for
 * exactly this case. That throw happens before React mounts anything and
 * before any error boundary could exist to catch it, so the user saw a
 * blank white page with only a console error — the misconfiguration
 * detection worked, but nothing communicated it to anyone actually looking
 * at the page. This renders a real, visible message instead.
 */
export const AuthGate: React.FC<React.PropsWithChildren<AuthGateProps>> = ({
    children,
    authMode = AUTH_MODE,
    msalConfigured = isMsalConfigured,
}) => {
    if (authMode !== 'azure-ad') {
        return <>{children}</>;
    }
    if (!msalConfigured) {
        return <AuthMisconfiguredPage />;
    }
    return (
        <MsalProvider instance={msalInstance}>
            <EntraGate>{children}</EntraGate>
        </MsalProvider>
    );
};

const AuthMisconfiguredPage: React.FC = () => (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-2 p-8 text-center">
        <h1 className="text-xl font-semibold">Sign-in is misconfigured</h1>
        <p className="max-w-md text-muted-foreground">
            AUTH_MODE is set to azure-ad, but the Entra tenant/client id
            aren&apos;t configured. Contact your administrator.
        </p>
    </div>
);

// MSAL v3+ requires `initialize()` (handles the redirect-response
// processing internally) before anything reads auth state — split out of
// AuthGate so the "public mode: skip MSAL entirely" branch above never
// even imports/constructs this initialization path.
const EntraGate: React.FC<React.PropsWithChildren> = ({ children }) => {
    const { instance } = useMsal();
    const isAuthenticated = useIsAuthenticated();
    const [initialized, setInitialized] = useState(false);

    useEffect(() => {
        instance.initialize().then(() => {
            const account = instance.getAllAccounts()[0];
            if (account) instance.setActiveAccount(account);
            setInitialized(true);
        });
    }, [instance]);

    if (!initialized) return null;
    if (!isAuthenticated) return <SignInPage />;
    return <>{children}</>;
};
