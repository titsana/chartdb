import 'dotenv/config';

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
}

function readAllowlist(raw: string | undefined): string[] {
    if (!raw) return [];
    return raw
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): CollabConfig {
    const databaseUrl = env.DATABASE_URL;
    if (!databaseUrl) {
        throw new Error(
            'DATABASE_URL is required (see server/.env.example) — Phase 3 has no in-memory-only mode.'
        );
    }
    return {
        port: env.PORT ? Number(env.PORT) : 1234,
        databaseUrl,
        originAllowlist: readAllowlist(env.WEBSOCKET_ORIGIN_ALLOWLIST),
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
