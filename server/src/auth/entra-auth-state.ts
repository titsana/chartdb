import type { AuthMode } from '../config';
import { loadConfig } from '../config';
import { createEntraVerifier, type EntraVerifier } from './entra-jwt';

export interface EntraAuthState {
    authMode: AuthMode;
    /** Non-null iff authMode === 'azure-ad' (config.ts guarantees the
     * tenant/client id env vars exist whenever that mode is selected). */
    verify: EntraVerifier | null;
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
    };
}
