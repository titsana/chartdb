import { createHash, randomBytes } from 'node:crypto';
import type { Response } from 'express';
import type { Pool } from 'pg';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type {
    AuthorizationParams,
    OAuthServerProvider,
} from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type {
    OAuthClientInformationFull,
    OAuthTokenRevocationRequest,
    OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import {
    InvalidClientMetadataError,
    InvalidGrantError,
    InvalidScopeError,
    InvalidTargetError,
    InvalidTokenError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { renderConsentPage } from './consent-page';

/**
 * docs/design/mcp-oauth.md: chartdb's own OAuth authorization server for
 * MCP clients, brokering the actual login to Entra. Tokens it issues are
 * opaque, stored only as SHA-256 hashes (D1), and accepted only on routes
 * marked @AcceptsMcpToken() (the MCP endpoint), never on the REST API.
 */

export const MCP_SCOPE = 'mcp';
const ACCESS_TTL_MS = 60 * 60 * 1000; // D2
const FAMILY_TTL_MS = 30 * 24 * 60 * 60 * 1000; // D3
const REQUEST_TTL_MS = 10 * 60 * 1000; // consent -> callback window
const CODE_TTL_MS = 60 * 1000;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const MAX_CLIENT_NAME = 100;

export function randomToken(prefix = ''): string {
    return prefix + randomBytes(32).toString('base64url');
}

export function sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

/** D6: only local apps (Claude Code CLI/Desktop) can receive codes. */
function isLoopbackRedirect(uri: string): boolean {
    try {
        const url = new URL(uri);
        return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname);
    } catch {
        return false;
    }
}

export interface McpUser {
    oid: string;
    upn: string | null;
}

export interface PendingRequest {
    id: string;
    client_id: string;
    redirect_uri: string;
    client_state: string | null;
    csrf: string;
    status: string;
}

export class EntraBroker implements OAuthServerProvider {
    constructor(
        private readonly pool: Pool,
        /** Normalized via URL.href, e.g. "https://host/api/mcp". */
        readonly resourceUrl: URL,
        /** Exact `issuer` string from our AS metadata (RFC 9207 `iss`). */
        readonly issuer: string,
        private readonly secureCookies: boolean
    ) {}

    get clientsStore(): OAuthRegisteredClientsStore {
        return {
            getClient: async (clientId) => {
                const { rows } = await this.pool.query<{
                    client_info: OAuthClientInformationFull;
                }>(
                    'SELECT client_info FROM mcp_oauth_clients WHERE client_id = $1',
                    [clientId]
                );
                return rows[0]?.client_info;
            },
            registerClient: async (client) => {
                const full = client as OAuthClientInformationFull;
                if (full.redirect_uris.length === 0) {
                    throw new InvalidClientMetadataError(
                        'redirect_uris is required'
                    );
                }
                if (
                    !full.redirect_uris.every((u) =>
                        isLoopbackRedirect(String(u))
                    )
                ) {
                    throw new InvalidClientMetadataError(
                        'only loopback http redirect_uris (localhost, 127.0.0.1, [::1]) are allowed'
                    );
                }
                if ((full.client_name ?? '').length > MAX_CLIENT_NAME) {
                    throw new InvalidClientMetadataError(
                        'client_name is too long'
                    );
                }
                await this.pool.query(
                    'INSERT INTO mcp_oauth_clients (client_id, client_info) VALUES ($1, $2)',
                    [full.client_id, full]
                );
                return full;
            },
        };
    }

    /**
     * D9: never forwards to Entra directly — renders chartdb's own consent
     * page first (MCP security best practices, "Confused Deputy Problem").
     * The Entra `state` is minted only after the user approves, in
     * approveConsent().
     */
    async authorize(
        client: OAuthClientInformationFull,
        params: AuthorizationParams,
        res: Response
    ): Promise<void> {
        if (params.resource && params.resource.href !== this.resourceUrl.href) {
            throw new InvalidTargetError('unknown resource');
        }
        if (params.scopes?.some((s) => s !== MCP_SCOPE)) {
            throw new InvalidScopeError(
                `only the "${MCP_SCOPE}" scope is supported`
            );
        }
        const id = randomToken();
        const csrf = randomToken();
        await this.pool.query(
            `INSERT INTO mcp_oauth_requests
               (id, client_id, redirect_uri, code_challenge, client_state, status, csrf, expires_at)
             VALUES ($1, $2, $3, $4, $5, 'consent', $6, $7)`,
            [
                id,
                client.client_id,
                // The exact URI from this request, not the registered one:
                // the SDK lets a loopback redirect's port differ (RFC 8252).
                params.redirectUri,
                params.codeChallenge,
                params.state ?? null,
                csrf,
                new Date(Date.now() + REQUEST_TTL_MS),
            ]
        );
        res.setHeader('Set-Cookie', this.cookie(this.csrfCookieName, csrf));
        res.setHeader('X-Frame-Options', 'DENY');
        // No form-action: the approval POST answers with a 302 to Entra, which
        // some browsers block under form-action 'self'.
        res.setHeader(
            'Content-Security-Policy',
            "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'"
        );
        res.status(200)
            .type('html')
            .send(
                renderConsentPage({
                    requestId: id,
                    csrf,
                    clientName: client.client_name ?? 'Unnamed MCP client',
                    redirectUri: params.redirectUri,
                })
            );
    }

    get csrfCookieName(): string {
        return this.secureCookies
            ? '__Host-chartdb_mcp_csrf'
            : 'chartdb_mcp_csrf_insecure';
    }

    get stateCookieName(): string {
        return this.secureCookies
            ? '__Host-chartdb_mcp_state'
            : 'chartdb_mcp_state_insecure';
    }

    cookie(name: string, value: string, maxAgeSeconds = 600): string {
        // __Host- cookies must be Path=/ (and Secure, so https only — the
        // http fallback names differ so a local test can't pass by accident).
        const parts = [
            `${name}=${value}`,
            'Path=/',
            'HttpOnly',
            'SameSite=Lax',
            `Max-Age=${maxAgeSeconds}`,
        ];
        if (this.secureCookies) parts.push('Secure');
        return parts.join('; ');
    }

    /** Loads a request still waiting for consent, or null. */
    async pendingConsent(id: string): Promise<PendingRequest | null> {
        const { rows } = await this.pool.query<PendingRequest>(
            `SELECT id, client_id, redirect_uri, client_state, csrf, status
               FROM mcp_oauth_requests
              WHERE id = $1 AND status = 'consent' AND expires_at > now()`,
            [id]
        );
        return rows[0] ?? null;
    }

    async denyConsent(id: string): Promise<void> {
        await this.pool.query('DELETE FROM mcp_oauth_requests WHERE id = $1', [
            id,
        ]);
    }

    /** Moves an approved request to "upstream" and binds a fresh Entra state/nonce/PKCE to it. */
    async approveConsent(
        id: string
    ): Promise<{ state: string; nonce: string; verifier: string } | null> {
        const upstream = {
            state: randomToken(),
            nonce: randomToken(),
            verifier: randomToken(),
        };
        const { rowCount } = await this.pool.query(
            `UPDATE mcp_oauth_requests
                SET status = 'upstream', entra_state = $2, entra_nonce = $3, entra_verifier = $4
              WHERE id = $1 AND status = 'consent' AND expires_at > now()`,
            [id, upstream.state, upstream.nonce, upstream.verifier]
        );
        return rowCount === 1 ? upstream : null;
    }

    /** Single-use: claims the request for this Entra state, or returns null. */
    async claimUpstream(
        state: string
    ): Promise<
        | (PendingRequest & { entra_nonce: string; entra_verifier: string })
        | null
    > {
        const { rows } = await this.pool.query(
            `UPDATE mcp_oauth_requests
                SET status = 'callback', entra_state = NULL
              WHERE entra_state = $1 AND status = 'upstream' AND expires_at > now()
          RETURNING id, client_id, redirect_uri, client_state, csrf, status,
                    entra_nonce, entra_verifier`,
            [state]
        );
        return rows[0] ?? null;
    }

    /** After a verified Entra login: records consent and mints our one-time code. */
    async issueCode(
        requestId: string,
        clientId: string,
        user: McpUser
    ): Promise<string> {
        const code = randomToken();
        await this.pool.query(
            `INSERT INTO mcp_oauth_consents (oid, client_id) VALUES ($1, $2)
             ON CONFLICT (oid, client_id) DO UPDATE SET approved_at = now()`,
            [user.oid, clientId]
        );
        await this.pool.query(
            `UPDATE mcp_oauth_requests
                SET status = 'code', code_hash = $2, oid = $3, upn = $4, expires_at = $5
              WHERE id = $1 AND status = 'callback'`,
            [
                requestId,
                sha256(code),
                user.oid,
                user.upn,
                new Date(Date.now() + CODE_TTL_MS),
            ]
        );
        return code;
    }

    async challengeForAuthorizationCode(
        client: OAuthClientInformationFull,
        authorizationCode: string
    ): Promise<string> {
        const { rows } = await this.pool.query<{ code_challenge: string }>(
            `SELECT code_challenge FROM mcp_oauth_requests
              WHERE code_hash = $1 AND client_id = $2 AND status = 'code' AND expires_at > now()`,
            [sha256(authorizationCode), client.client_id]
        );
        if (!rows[0]) throw new InvalidGrantError('invalid authorization code');
        return rows[0].code_challenge;
    }

    async exchangeAuthorizationCode(
        client: OAuthClientInformationFull,
        authorizationCode: string,
        _codeVerifier?: string,
        redirectUri?: string,
        resource?: URL
    ): Promise<OAuthTokens> {
        if (resource && resource.href !== this.resourceUrl.href) {
            throw new InvalidTargetError('unknown resource');
        }
        // Consume and check ownership in one statement: a code is single use.
        const { rows } = await this.pool.query<{
            redirect_uri: string;
            oid: string;
            upn: string | null;
        }>(
            `UPDATE mcp_oauth_requests SET status = 'used'
              WHERE code_hash = $1 AND client_id = $2 AND status = 'code' AND expires_at > now()
          RETURNING redirect_uri, oid, upn`,
            [sha256(authorizationCode), client.client_id]
        );
        const row = rows[0];
        if (!row) throw new InvalidGrantError('invalid authorization code');
        if (redirectUri !== row.redirect_uri) {
            throw new InvalidGrantError(
                'redirect_uri does not match the authorization request'
            );
        }
        const familyExpiresAt = new Date(Date.now() + FAMILY_TTL_MS);
        return this.mintTokens(
            client.client_id,
            { oid: row.oid, upn: row.upn },
            randomToken(),
            familyExpiresAt
        );
    }

    async exchangeRefreshToken(
        client: OAuthClientInformationFull,
        refreshToken: string,
        scopes?: string[],
        resource?: URL
    ): Promise<OAuthTokens> {
        if (resource && resource.href !== this.resourceUrl.href) {
            throw new InvalidTargetError('unknown resource');
        }
        if (scopes?.some((s) => s !== MCP_SCOPE)) {
            throw new InvalidScopeError(
                `only the "${MCP_SCOPE}" scope is supported`
            );
        }
        const hash = sha256(refreshToken);
        const { rows } = await this.pool.query<{
            family_id: string;
            client_id: string;
            oid: string;
            upn: string | null;
            family_expires_at: Date;
            used_at: Date | null;
        }>(
            `SELECT family_id, client_id, oid, upn, family_expires_at, used_at
               FROM mcp_oauth_tokens WHERE token_hash = $1 AND kind = 'refresh'`,
            [hash]
        );
        const row = rows[0];
        if (!row || row.client_id !== client.client_id) {
            throw new InvalidGrantError('invalid refresh token');
        }
        if (row.family_expires_at.getTime() <= Date.now()) {
            await this.revokeFamily(row.family_id);
            throw new InvalidGrantError('refresh token expired, sign in again');
        }
        // Rotation (D3): mark used atomically. Losing the race, or presenting
        // an already-used token, means it leaked — revoke the whole family.
        const claimed = await this.pool.query(
            `UPDATE mcp_oauth_tokens SET used_at = now()
              WHERE token_hash = $1 AND used_at IS NULL`,
            [hash]
        );
        if (row.used_at || claimed.rowCount !== 1) {
            await this.revokeFamily(row.family_id);
            throw new InvalidGrantError('refresh token was already used');
        }
        return this.mintTokens(
            client.client_id,
            { oid: row.oid, upn: row.upn },
            row.family_id,
            row.family_expires_at
        );
    }

    async verifyAccessToken(token: string): Promise<AuthInfo> {
        const { rows } = await this.pool.query<{
            client_id: string;
            oid: string;
            upn: string | null;
            expires_at: Date;
        }>(
            `SELECT client_id, oid, upn, expires_at FROM mcp_oauth_tokens
              WHERE token_hash = $1 AND kind = 'access' AND expires_at > now()`,
            [sha256(token)]
        );
        const row = rows[0];
        if (!row) throw new InvalidTokenError('invalid or expired token');
        return {
            token,
            clientId: row.client_id,
            scopes: [MCP_SCOPE],
            expiresAt: Math.floor(row.expires_at.getTime() / 1000),
            resource: this.resourceUrl,
            extra: { oid: row.oid, upn: row.upn },
        };
    }

    async revokeToken(
        client: OAuthClientInformationFull,
        request: OAuthTokenRevocationRequest
    ): Promise<void> {
        await this.pool.query(
            'DELETE FROM mcp_oauth_tokens WHERE token_hash = $1 AND client_id = $2',
            [sha256(request.token), client.client_id]
        );
    }

    /** Deletes expired requests and tokens. Run on an interval. */
    async sweep(): Promise<void> {
        await this.pool.query(
            'DELETE FROM mcp_oauth_requests WHERE expires_at < now()'
        );
        await this.pool.query(
            'DELETE FROM mcp_oauth_tokens WHERE expires_at < now() OR family_expires_at < now()'
        );
    }

    private async revokeFamily(familyId: string): Promise<void> {
        await this.pool.query(
            'DELETE FROM mcp_oauth_tokens WHERE family_id = $1',
            [familyId]
        );
    }

    private async mintTokens(
        clientId: string,
        user: McpUser,
        familyId: string,
        familyExpiresAt: Date
    ): Promise<OAuthTokens> {
        const accessToken = randomToken('cdb_at_');
        const refreshToken = randomToken('cdb_rt_');
        const accessExpiresAt = new Date(
            Math.min(Date.now() + ACCESS_TTL_MS, familyExpiresAt.getTime())
        );
        await this.pool.query(
            `INSERT INTO mcp_oauth_tokens
               (token_hash, kind, family_id, client_id, oid, upn, expires_at, family_expires_at)
             VALUES ($1, 'access',  $3, $4, $5, $6, $7, $8),
                    ($2, 'refresh', $3, $4, $5, $6, $8, $8)`,
            [
                sha256(accessToken),
                sha256(refreshToken),
                familyId,
                clientId,
                user.oid,
                user.upn,
                accessExpiresAt,
                familyExpiresAt,
            ]
        );
        return {
            access_token: accessToken,
            token_type: 'Bearer',
            expires_in: Math.floor(
                (accessExpiresAt.getTime() - Date.now()) / 1000
            ),
            refresh_token: refreshToken,
            scope: MCP_SCOPE,
        };
    }
}
