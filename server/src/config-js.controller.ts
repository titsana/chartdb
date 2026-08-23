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
 */
@Controller()
export class ConfigJsController {
    @Public()
    @Get('config.js')
    @Header('Content-Type', 'application/javascript')
    serve(): string {
        const env: Record<string, string> = {};
        for (const key of CLIENT_ENV_VARS) {
            env[key] = process.env[key] ?? '';
        }
        return `window.env = ${JSON.stringify(env)};`;
    }
}
