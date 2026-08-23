import { Controller, Get, Header } from '@nestjs/common';
import { Public } from './auth/public.decorator';

// Client-facing var names only (no VITE_ prefix — window.env bypasses
// Vite's build-time env entirely, same convention src/lib/env.ts already
// uses for every window.env.* read).
const CLIENT_ENV_VARS = [
    'OPENAI_API_KEY',
    'OPENAI_API_ENDPOINT',
    'LLM_MODEL_NAME',
    'HIDE_CHARTDB_CLOUD',
    'DISABLE_ANALYTICS',
    'COLLAB_WS_URL',
    'AUTH_MODE',
    'ENTRA_TENANT_ID',
    'ENTRA_CLIENT_ID',
    'ENTRA_API_SCOPE',
] as const;

/**
 * Single-container deploy (docs/design/realtime-collaboration.md §7):
 * this NestJS process now serves the built client too (ServeStaticModule,
 * app.module.ts), replacing the old nginx + entrypoint.sh/envsubst +
 * default.conf.template setup that only existed for the client-only
 * image. Reproduces that setup's one genuinely load-bearing behavior —
 * one built image, reconfigurable per environment via container env vars
 * with no rebuild — since nothing else in this new setup provides it
 * (Vite's own VITE_* vars are baked in at build time, same as before).
 *
 * Deliberately @Public(): the client needs this before it can know
 * whether AUTH_MODE requires signing in at all.
 *
 * Cache-Control: no-store — hit in a real deploy fronted by Cloudflare:
 * the `.js` extension is a strong "cache this as a static asset" signal
 * to CDNs/browsers by default, and Cloudflare cached a response from
 * before the container's env vars were fully configured for 4 hours
 * (its default TTL) — the origin was correctly reconfigured, but every
 * client kept getting the stale snapshot, showing the exact
 * "misconfigured" page a moment ago even though the config was fixed.
 * This endpoint's whole reason to exist is "reconfigurable without a
 * rebuild"; letting anything cache it defeats that on arrival.
 */
@Controller()
export class ConfigJsController {
    @Public()
    @Get('config.js')
    @Header('Content-Type', 'application/javascript')
    @Header('Cache-Control', 'no-store')
    serve(): string {
        const env: Record<string, string> = {};
        for (const key of CLIENT_ENV_VARS) {
            env[key] = process.env[key] ?? '';
        }
        return `window.env = ${JSON.stringify(env)};`;
    }
}
