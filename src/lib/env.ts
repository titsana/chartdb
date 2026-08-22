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
// diagram) — falls back to the Phase 3 server's own default local port
// (`server/src/config.ts`'s `port: ... ?? 1234`) so a local `npm run dev`
// against a locally-running `server/` just works with no extra
// configuration; a real deployment must set this explicitly (window.env,
// via public/config.js — see default.conf.template/entrypoint.sh — or
// VITE_COLLAB_WS_URL at build time) the same way OPENAI_API_KEY etc. do.
export const COLLAB_WS_URL: string =
    window?.env?.COLLAB_WS_URL ||
    import.meta.env.VITE_COLLAB_WS_URL ||
    'ws://localhost:1234';
