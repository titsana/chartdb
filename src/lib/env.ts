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
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? '/api';
// ponytail: defaults to API_BASE_URL when it's an absolute origin (the
// common case: REST and WS are the same backend) since socket.io-client
// takes an origin, not a path prefix — '/api' isn't a valid one, so that
// case falls back to same-origin (behind a reverse proxy). Set VITE_WS_URL
// explicitly if the WS server ever lives on a different origin than the API.
export const WS_URL: string =
    import.meta.env.VITE_WS_URL ??
    (API_BASE_URL.startsWith('http') ? API_BASE_URL : '');
export const STORAGE_PROVIDER: 'dexie' | 'api' =
    import.meta.env.VITE_STORAGE_PROVIDER === 'api' ? 'api' : 'dexie';
export const AZURE_AD_CLIENT_ID: string = import.meta.env
    .VITE_AZURE_AD_CLIENT_ID;
export const AZURE_AD_TENANT_ID: string = import.meta.env
    .VITE_AZURE_AD_TENANT_ID;
// ponytail: Azure AD is opt-in — unset either var and the app runs with no auth, as before.
export const AZURE_AD_ENABLED: boolean = Boolean(
    AZURE_AD_CLIENT_ID && AZURE_AD_TENANT_ID
);
