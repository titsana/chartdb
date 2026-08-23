import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthGate } from '../auth-gate';

/**
 * Phase 7: pins the wiring AuthGate is actually for — public mode never
 * touches MSAL at all, azure-ad mode shows SignInPage until
 * useIsAuthenticated flips true. Mocks @azure/msal-react and
 * @/lib/msal-config entirely rather than constructing a real
 * PublicClientApplication — that would need real Entra credentials to do
 * anything meaningful, and this test isn't the place to verify MSAL's own
 * behavior, only that this component calls it correctly.
 */
const mockInitialize = vi.fn().mockResolvedValue(undefined);
let mockIsAuthenticated = false;

vi.mock('@/lib/msal-config', () => ({
    msalInstance: {},
    loginRequest: { scopes: [] },
    isMsalConfigured: true,
}));

vi.mock('@azure/msal-react', () => ({
    MsalProvider: ({ children }: { children: React.ReactNode }) => children,
    useMsal: () => ({
        instance: {
            initialize: mockInitialize,
            getAllAccounts: () => [],
            setActiveAccount: vi.fn(),
        },
    }),
    useIsAuthenticated: () => mockIsAuthenticated,
}));

describe('AuthGate', () => {
    it('public mode renders children directly — no MSAL init call at all', () => {
        render(
            <AuthGate authMode="public">
                <div>the app</div>
            </AuthGate>
        );
        expect(screen.getByText('the app')).toBeTruthy();
        expect(mockInitialize).not.toHaveBeenCalled();
    });

    it('azure-ad mode, not authenticated: shows the sign-in page, not the app', async () => {
        mockIsAuthenticated = false;
        render(
            <AuthGate authMode="azure-ad">
                <div>the app</div>
            </AuthGate>
        );
        await waitFor(() => expect(mockInitialize).toHaveBeenCalled());
        expect(await screen.findByText(/sign in with microsoft/i)).toBeTruthy();
        expect(screen.queryByText('the app')).toBeNull();
    });

    it('azure-ad mode, authenticated: renders the app, not the sign-in page', async () => {
        mockIsAuthenticated = true;
        render(
            <AuthGate authMode="azure-ad">
                <div>the app</div>
            </AuthGate>
        );
        expect(await screen.findByText('the app')).toBeTruthy();
        expect(screen.queryByText(/sign in with microsoft/i)).toBeNull();
    });

    // Hit in a real production deploy: AUTH_MODE=azure-ad set without
    // ENTRA_TENANT_ID/ENTRA_CLIENT_ID configured. msal-config.ts used to
    // throw at import time for this — before React mounts anything, so
    // nothing on the page ever communicated it; the user just saw a blank
    // white page with a console error. This is the fix: a real, visible
    // message, and neither MsalProvider nor MSAL's own init should run
    // against config that's already known to be invalid.
    it('azure-ad mode, misconfigured (missing tenant/client id): shows an error message, not a blank page or the sign-in flow', () => {
        render(
            <AuthGate authMode="azure-ad" msalConfigured={false}>
                <div>the app</div>
            </AuthGate>
        );
        expect(screen.getByText(/misconfigured/i)).toBeTruthy();
        expect(screen.queryByText('the app')).toBeNull();
        expect(screen.queryByText(/sign in with microsoft/i)).toBeNull();
    });
});
