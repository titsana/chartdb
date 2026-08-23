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
 * before rendering anything that could reach this, so an active account
 * should always exist. acquireTokenPopup is still here as a fallback for
 * the rarer case (e.g. the silent-refresh token itself expired) where
 * interaction is required again.
 */
export async function getEntraAccessToken(): Promise<string> {
    const account = msalInstance.getActiveAccount();
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
