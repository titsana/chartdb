import {
    PublicClientApplication,
    type Configuration,
} from '@azure/msal-browser';
import {
    AUTH_MODE,
    ENTRA_CLIENT_ID,
    ENTRA_TENANT_ID,
    ENTRA_API_SCOPE,
} from './env';

// Only constructed when AUTH_MODE === 'azure-ad' — see auth-gate.tsx, the
// only place that imports msalInstance. Throwing here (rather than
// silently falling back to public) matches config.ts's server-side
// validation: an explicit "azure-ad" with missing credentials is a
// misconfiguration to surface loudly, not paper over.
if (AUTH_MODE === 'azure-ad' && (!ENTRA_TENANT_ID || !ENTRA_CLIENT_ID)) {
    throw new Error(
        'AUTH_MODE=azure-ad requires VITE_ENTRA_TENANT_ID and VITE_ENTRA_CLIENT_ID.'
    );
}

const msalConfig: Configuration = {
    auth: {
        clientId: ENTRA_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${ENTRA_TENANT_ID}`,
        redirectUri: window.location.origin,
    },
    cache: {
        cacheLocation: 'sessionStorage',
    },
};

export const msalInstance = new PublicClientApplication(msalConfig);

export const loginRequest = {
    scopes: ENTRA_API_SCOPE ? [ENTRA_API_SCOPE] : [],
};
