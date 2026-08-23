import {
    PublicClientApplication,
    type Configuration,
} from '@azure/msal-browser';
import { ENTRA_CLIENT_ID, ENTRA_TENANT_ID } from './env';

// Only meaningfully used when AUTH_MODE === 'azure-ad' — see auth-gate.tsx,
// the only place that imports msalInstance. An explicit "azure-ad" with
// missing tenant/client id is a misconfiguration to surface loudly, not
// paper over — matches config.ts's server-side validation. But it must
// surface as an on-page message, not a throw: this module is evaluated at
// import time (this file sits at the top of app.tsx's import chain via
// auth-gate.tsx), before React has mounted anything and before any error
// boundary could exist to catch it. Hit in a real production deploy: the
// user saw a blank white page and only a console error — throwing here
// silently killed the entire app instead of the intended "clear
// misconfiguration message." auth-gate.tsx checks isMsalConfigured and
// renders a real message instead of constructing MsalProvider/msalInstance
// against invalid config.
export const isMsalConfigured = Boolean(ENTRA_TENANT_ID && ENTRA_CLIENT_ID);

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

// Derived from ENTRA_CLIENT_ID (api://<client-id>/access_as_user) rather
// than a separately-configured scope string — one fewer value to keep in
// sync with the server's own audience check (server/src/auth/entra-jwt.ts
// derives its expected `aud` the same way). Assumes the app registration's
// Application ID URI was left at its default `api://<client-id>` shape.
export const loginRequest = {
    scopes: ENTRA_CLIENT_ID ? [`api://${ENTRA_CLIENT_ID}/access_as_user`] : [],
};
