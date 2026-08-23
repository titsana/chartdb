import React, { useEffect, useState } from 'react';
import { MsalProvider, useIsAuthenticated, useMsal } from '@azure/msal-react';
import { AUTH_MODE } from '@/lib/env';
import { msalInstance } from '@/lib/msal-config';
import { SignInPage } from '@/pages/sign-in-page/sign-in-page';

interface AuthGateProps {
    /** Defaults to the real env-derived AUTH_MODE — overridable so tests
     * can exercise the 'azure-ad' branch without mocking @/lib/env. */
    authMode?: 'azure-ad' | 'public';
}

/**
 * Phase 7: gates the whole app behind Entra sign-in when
 * AUTH_MODE === 'azure-ad' (the user's own choice, confirmed via
 * AskUserQuestion — /examples and /templates are gated too, not just the
 * editor). AUTH_MODE === 'public' (the default) renders children directly
 * with zero MSAL involvement — no behavior change from before this phase.
 */
export const AuthGate: React.FC<React.PropsWithChildren<AuthGateProps>> = ({
    children,
    authMode = AUTH_MODE,
}) => {
    if (authMode !== 'azure-ad') {
        return <>{children}</>;
    }
    return (
        <MsalProvider instance={msalInstance}>
            <EntraGate>{children}</EntraGate>
        </MsalProvider>
    );
};

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
