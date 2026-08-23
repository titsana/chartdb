import { Hocuspocus, type Configuration } from '@hocuspocus/server';
import type { Pool } from 'pg';
import { createPersistenceExtension } from './persistence-extension';
import type { EntraAuthState } from '../auth/entra-auth-state';

/** One Hocuspocus instance for the whole process — it multiplexes every
 * diagram's room internally (see durable-log.ts's header comment on why
 * the WebSocket URL itself doesn't need to carry the diagramId: Hocuspocus
 * reads it from each wire message instead).
 *
 * Phase 7: when auth.authMode === 'azure-ad', every connecting client must
 * present a valid token via HocuspocusProvider's `token` option — this is
 * the ONE hook Hocuspocus calls for every connection regardless of how it
 * reached the process (the REST-side EntraAuthGuard doesn't cover this;
 * ws-upgrade.service.ts's raw upgrade handler is a plain HTTP upgrade, not
 * a Nest route, so Nest guards never see it either — onAuthenticate is
 * Hocuspocus's own equivalent). Throwing here rejects the connection.
 *
 * When authMode === 'public', the `onAuthenticate` key is omitted from the
 * config entirely rather than set to a no-op function — left unconfirmed
 * whether Hocuspocus treats an explicitly-present-but-undefined key
 * differently from an absent one, so this doesn't take the risk.
 */
export function createHocuspocus(pool: Pool, auth: EntraAuthState): Hocuspocus {
    const config: Partial<Configuration> = {
        extensions: [createPersistenceExtension(pool)],
    };
    if (auth.authMode === 'azure-ad') {
        config.onAuthenticate = async ({ token }) => {
            if (!token) {
                throw new Error('missing token');
            }
            // verify is guaranteed non-null when authMode === 'azure-ad'.
            await auth.verify!(token);
        };
    }
    return new Hocuspocus(config);
}
