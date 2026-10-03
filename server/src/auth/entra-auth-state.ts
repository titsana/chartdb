import type { AuthMode } from '../config';
import { loadConfig } from '../config';
import { createEntraVerifier, type EntraVerifier } from './entra-jwt';
import { createPool } from '../db/pool';
import { EntraBroker } from '../mcp-auth/entra-broker';
import { EntraUpstream } from '../mcp-auth/entra-upstream';

export interface EntraAuthState {
    authMode: AuthMode;
    /** Non-null iff authMode === 'azure-ad' (config.ts guarantees the
     * tenant/client id env vars exist whenever that mode is selected). */
    verify: EntraVerifier | null;
    /** MCP OAuth broker (docs/design/mcp-oauth.md); null unless configured. */
    mcpBroker: { broker: EntraBroker; upstream: EntraUpstream } | null;
}

/** Pure — calling loadConfig() here (rather than injecting CollabModule's
 * COLLAB_CONFIG) avoids a circular module dependency: CollabModule needs
 * this state for its Hocuspocus onAuthenticate hook, and AuthModule has no
 * need for anything CollabModule provides. loadConfig() is a cheap,
 * deterministic env read — nothing wrong with calling it more than once. */
export function buildEntraAuthState(): EntraAuthState {
    const config = loadConfig();
    return {
        authMode: config.authMode,
        verify:
            config.authMode === 'azure-ad'
                ? createEntraVerifier(
                      // config.ts's loadConfig already throws at boot if
                      // authMode is 'azure-ad' and either is missing.
                      config.entraTenantId!,
                      config.entraClientId!
                  )
                : null,
        mcpBroker: buildMcpBroker(config),
    };
}

function buildMcpBroker(
    config: ReturnType<typeof loadConfig>
): EntraAuthState['mcpBroker'] {
    if (!config.mcpOAuth) return null;
    const { publicUrl, entraClientSecret, entraAuthority } = config.mcpOAuth;
    // ponytail: a second, small pg Pool just for token lookups — AuthModule
    // can't import CollabModule's PG_POOL without an import cycle
    // (CollabModule imports AuthModule). Share it if pool count ever matters.
    const pool = createPool(config.databaseUrl);
    const broker = new EntraBroker(
        pool,
        new URL('/api/mcp', publicUrl),
        // Must equal the SDK metadata's `issuer` exactly (it uses .href).
        new URL(publicUrl).href,
        publicUrl.protocol === 'https:'
    );
    setInterval(
        () => {
            broker
                .sweep()
                .catch((error) =>
                    console.error('MCP OAuth sweep failed:', error)
                );
        },
        60 * 60 * 1000
    ).unref();
    const upstream = new EntraUpstream(
        entraAuthority,
        config.entraTenantId!,
        config.entraClientId!,
        entraClientSecret,
        new URL('/oauth/callback', publicUrl).href
    );
    return { broker, upstream };
}
