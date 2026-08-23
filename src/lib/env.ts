export const OPENAI_API_KEY: string = import.meta.env.VITE_OPENAI_API_KEY;
export const OPENAI_API_ENDPOINT: string = import.meta.env
    .VITE_OPENAI_API_ENDPOINT;
export const LLM_MODEL_NAME: string = import.meta.env.VITE_LLM_MODEL_NAME;
export const IS_CHARTDB_IO: boolean =
    import.meta.env.VITE_IS_CHARTDB_IO === 'true';
export const APP_URL: string = import.meta.env.VITE_APP_URL;
export const HOST_URL: string = import.meta.env.VITE_HOST_URL ?? '';
export const HIDE_CHARTDB_CLOUD: boolean =
    (window?.env?.HIDE_CHARTDB_CLOUD ??
        import.meta.env.VITE_HIDE_CHARTDB_CLOUD) === 'true';
export const DISABLE_ANALYTICS: boolean =
    (window?.env?.DISABLE_ANALYTICS ??
        import.meta.env.VITE_DISABLE_ANALYTICS) === 'true';

// Phase 4 (docs/design/realtime-collaboration.md §10): the Phase 3
// collaboration server's WebSocket URL. Connecting is on by default (every
// diagram). window.env (via /config.js — see config-js.controller.ts in a
// single-container deploy, or the older nginx default.conf.template/
// entrypoint.sh) and VITE_COLLAB_WS_URL both still override this
// explicitly, same as OPENAI_API_KEY etc.
//
// Phase 7 (single-container deploy): with no override at all, the default
// depends on how this bundle is being served. Vite's own dev server runs
// on a different port than the standalone collab server (default 1234) —
// `npm run dev` against a locally-running `server/` needs that literal
// address to find it. A production build has no such thing: NestJS now
// serves this same bundle itself (ServeStaticModule, server/src/
// app.module.ts) on whatever single origin the browser already loaded the
// page from, so deriving the collab URL from that origin needs no
// configuration at all for the common "one container, one domain" case —
// unlike the old default (`ws://localhost:1234`), which only ever made
// sense on the machine actually running `server/` locally, never in any
// real deployment.
// Extracted (rather than inlined below) so the actual protocol-mapping
// logic is testable without stubbing import.meta.env.DEV — a Vite-derived
// flag that isn't reliably mockable per-test.
export function wsUrlForOrigin(
    location: Pick<Location, 'protocol' | 'host'>
): string {
    const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${location.host}`;
}

function defaultCollabWsUrl(): string {
    if (import.meta.env.DEV) return 'ws://localhost:1234';
    return wsUrlForOrigin(window.location);
}

export const COLLAB_WS_URL: string =
    window?.env?.COLLAB_WS_URL ||
    import.meta.env.VITE_COLLAB_WS_URL ||
    defaultCollabWsUrl();

// Phase 4.5 (docs/design/realtime-collaboration.md §10): the same Phase
// 3/4 collab server also exposes a plain REST API (GET/POST/PATCH/DELETE
// /diagrams — see server/src/diagrams) on the same port as the WebSocket
// upgrade (server/src/main.ts's single Nest app listens once for both) —
// derived from COLLAB_WS_URL by swapping the protocol rather than a second
// env var, so there's exactly one place to configure "where's the collab
// server" instead of two that could drift out of sync.
export const COLLAB_API_URL: string = COLLAB_WS_URL.replace(/^ws/, 'http');

// Phase 7 (docs/design/realtime-collaboration.md): explicit opt-in toggle —
// unset/anything-other-than-"azure-ad" means "public" (today's behavior,
// every deploy before this phase). "azure-ad" with missing tenant/client id
// is a misconfiguration, not a silent fallback to public — see
// msal-config.ts, which throws rather than guessing.
export const AUTH_MODE: 'azure-ad' | 'public' =
    (window?.env?.AUTH_MODE ?? import.meta.env.VITE_AUTH_MODE) === 'azure-ad'
        ? 'azure-ad'
        : 'public';
export const ENTRA_TENANT_ID: string =
    window?.env?.ENTRA_TENANT_ID || import.meta.env.VITE_ENTRA_TENANT_ID || '';
export const ENTRA_CLIENT_ID: string =
    window?.env?.ENTRA_CLIENT_ID || import.meta.env.VITE_ENTRA_CLIENT_ID || '';
// e.g. `api://<client-id>/access_as_user` — must match server's
// ENTRA_API_AUDIENCE prefix (server/src/config.ts).
export const ENTRA_API_SCOPE: string =
    window?.env?.ENTRA_API_SCOPE || import.meta.env.VITE_ENTRA_API_SCOPE || '';
