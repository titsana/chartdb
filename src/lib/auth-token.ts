import { AZURE_AD_ENABLED } from '@/lib/env';
import { msalInstance, loginRequest } from '@/lib/msal-config';
import { InteractionRequiredAuthError } from '@azure/msal-browser';

// Shared by api-storage-provider.tsx (REST Authorization header) and
// collaboration-provider.tsx (socket handshake auth) so both attach the same
// Azure AD access token instead of each re-implementing MSAL's silent/popup fallback.
export async function getAccessToken(): Promise<string | undefined> {
    if (!AZURE_AD_ENABLED) return undefined;

    const account = msalInstance.getAllAccounts()[0];
    if (!account) return undefined;

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
