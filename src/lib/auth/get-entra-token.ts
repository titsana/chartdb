import { InteractionRequiredAuthError } from '@azure/msal-browser';
import { msalInstance, loginRequest } from '../msal-config';

/**
 * Shared by storage-provider.tsx's apiFetch (Authorization header) and
 * every HocuspocusProvider construction site (`token` option) — one place
 * to acquire an access token so both channels use the same account/scope
 * and the same silent-then-popup fallback.
 *
 * Only ever called when AUTH_MODE === 'azure-ad' (callers check that
 * first) — by that point AuthGate has already forced a successful sign-in
 * before rendering anything that could reach this, so an authenticated
 * account should always exist. acquireTokenPopup is still here as a
 * fallback for the rarer case (e.g. the silent-refresh token itself
 * expired) where interaction is required again.
 *
 * Falls back to getAllAccounts()[0] before giving up — raised in review:
 * EntraGate's initialize().then() sets the active account, but whether
 * MSAL's redirect-response processing (inside initialize()) has already
 * populated the account cache by the time that .then() runs was never
 * verified against a real tenant. If it hadn't, useIsAuthenticated() (which
 * only checks the account cache, not "is one active") would still read
 * true — rendering the app instead of the sign-in page — while this threw
 * on a null active account, and use-diagram-loader.tsx's catch swallows
 * that into the same generic "Could not load diagram" toast a real bug
 * caused earlier in this same session. Same symptom, different cause, no
 * stack trace to tell them apart. This fallback removes the failure mode
 * regardless of which way that race actually resolves.
 */
export async function getEntraAccessToken(): Promise<string> {
    const account =
        msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0];
    if (!account) {
        throw new Error('no active Entra account — user is not signed in');
    }
    try {
        const result = await msalInstance.acquireTokenSilent({
            ...loginRequest,
            account,
        });
        return result.accessToken;
    } catch (err) {
        if (err instanceof InteractionRequiredAuthError) {
            const result = await msalInstance.acquireTokenPopup(loginRequest);
            return result.accessToken;
        }
        throw err;
    }
}
