import 'dotenv/config';

/**
 * Phase 7: real auth, opt-in via AUTH_MODE. §5.3/§9's "no real auth yet" /
 * "anonymous access is an accepted risk" notes were true through Phase 6 —
 * this supersedes them for anyone who sets AUTH_MODE=azure-ad.
 * AUTH_MODE=public (the default — unset means public, matching every
 * deploy before this phase) keeps today's behavior exactly:
 * WEBSOCKET_ORIGIN_ALLOWLIST remains the only access control.
 */
export type AuthMode = 'azure-ad' | 'public';

/**
 * Phase 3 (docs/design/realtime-collaboration.md §10): no real auth yet
 * (§5.3 — "Identity: no real auth"), so `WEBSOCKET_ORIGIN_ALLOWLIST` is the
 * one access control this phase actually has. §9 flags anonymous access as
 * a known, accepted risk for this iteration, not an oversight — this is the
 * cheap mitigation that risk note calls for, so it's enforced even though
 * nothing else about auth exists yet.
 */
export interface CollabConfig {
    port: number;
    databaseUrl: string;
    /** Empty allowlist means "allow every origin" (e.g. local dev with no .env set). */
    originAllowlist: string[];
    authMode: AuthMode;
    /** Only set (and only required) when authMode === 'azure-ad'. */
    entraTenantId?: string;
    /** Expected `aud` claim on the access token, e.g. `api://<client-id>`. */
    entraApiAudience?: string;
}

function readAllowlist(raw: string | undefined): string[] {
    if (!raw) return [];
    return raw
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0);
}

function readAuthMode(raw: string | undefined): AuthMode {
    if (!raw || raw === 'public') return 'public';
    if (raw === 'azure-ad') return 'azure-ad';
    throw new Error(
        `AUTH_MODE must be "azure-ad" or "public" (or unset, which means "public") — got "${raw}"`
    );
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): CollabConfig {
    const databaseUrl = env.DATABASE_URL;
    if (!databaseUrl) {
        throw new Error(
            'DATABASE_URL is required (see server/.env.example) — Phase 3 has no in-memory-only mode.'
        );
    }

    const authMode = readAuthMode(env.AUTH_MODE);
    // Explicit AUTH_MODE=azure-ad with missing credentials fails the
    // process at boot rather than silently degrading to open access —
    // the whole point of making the toggle explicit (see the AskUserQuestion
    // exchange this design came from) is that a misconfigured "azure-ad"
    // should be loud, not quietly behave like "public".
    if (authMode === 'azure-ad' && (!env.ENTRA_TENANT_ID || !env.ENTRA_API_AUDIENCE)) {
        throw new Error(
            'AUTH_MODE=azure-ad requires ENTRA_TENANT_ID and ENTRA_API_AUDIENCE (see server/.env.example).'
        );
    }

    return {
        port: env.PORT ? Number(env.PORT) : 1234,
        databaseUrl,
        originAllowlist: readAllowlist(env.WEBSOCKET_ORIGIN_ALLOWLIST),
        authMode,
        entraTenantId: env.ENTRA_TENANT_ID,
        entraApiAudience: env.ENTRA_API_AUDIENCE,
    };
}

/**
 * A missing `Origin` header is allowed through even with a non-empty
 * allowlist — a deliberate policy choice, not an oversight. Real browsers
 * always send `Origin` on a cross-origin WebSocket handshake, which is the
 * thing this allowlist exists to stop (an unlisted web page's script
 * silently opening a collaboration connection). A non-browser client (a
 * server-to-server caller, a CLI tool, `@hocuspocus/provider` used from
 * Node rather than a browser — exactly what this repo's own integration
 * test is) never sends one and would otherwise be unconditionally locked
 * out regardless of the allowlist's contents. The trade-off this accepts:
 * any non-browser client bypasses the allowlist entirely. That's an
 * acceptable gap for now — Phase 3 has no real auth at all yet (§5.3) — but
 * it means this allowlist is a browser-origin check, not a general access
 * control, and shouldn't be read as more than that.
 */
export function isOriginAllowed(
    allowlist: string[],
    origin: string | undefined
): boolean {
    if (allowlist.length === 0) return true;
    if (!origin) return true;
    return allowlist.includes(origin);
}
