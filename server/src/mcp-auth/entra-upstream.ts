import { createHash } from 'node:crypto';
import jwt, { type JwtHeader, type SigningKeyCallback } from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import type { McpUser } from './entra-broker';

interface OidcDiscovery {
    issuer: string;
    authorization_endpoint: string;
    token_endpoint: string;
    jwks_uri: string;
}

/**
 * The broker's side of the Entra login: an ordinary confidential-client
 * authorization-code flow with PKCE, `response_mode=query` (form_post would
 * POST cross-site back to /oauth/callback, and SameSite=Lax cookies — our
 * state binding — aren't sent on that).
 */
export class EntraUpstream {
    private discovery?: Promise<OidcDiscovery>;
    private jwks?: jwksClient.JwksClient;

    constructor(
        private readonly authority: string,
        private readonly tenantId: string,
        private readonly clientId: string,
        private readonly clientSecret: string,
        private readonly callbackUrl: string
    ) {}

    private discover(): Promise<OidcDiscovery> {
        this.discovery ??= fetch(
            `${this.authority}/.well-known/openid-configuration`
        )
            .then((res) => {
                if (!res.ok)
                    throw new Error(`OIDC discovery failed: ${res.status}`);
                return res.json() as Promise<OidcDiscovery>;
            })
            .catch((error) => {
                this.discovery = undefined; // retry next time
                throw error;
            });
        return this.discovery;
    }

    async authorizeUrl(
        state: string,
        nonce: string,
        verifier: string
    ): Promise<string> {
        const { authorization_endpoint } = await this.discover();
        const url = new URL(authorization_endpoint);
        url.search = new URLSearchParams({
            client_id: this.clientId,
            response_type: 'code',
            response_mode: 'query',
            redirect_uri: this.callbackUrl,
            scope: 'openid profile',
            state,
            nonce,
            code_challenge: createHash('sha256')
                .update(verifier)
                .digest('base64url'),
            code_challenge_method: 'S256',
        }).toString();
        return url.toString();
    }

    /** Redeems the Entra code and returns the verified user. Throws on anything off. */
    async redeem(
        code: string,
        verifier: string,
        nonce: string
    ): Promise<McpUser> {
        const discovery = await this.discover();
        const res = await fetch(discovery.token_endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: this.clientId,
                client_secret: this.clientSecret,
                grant_type: 'authorization_code',
                code,
                redirect_uri: this.callbackUrl,
                code_verifier: verifier,
                scope: 'openid profile',
            }),
        });
        if (!res.ok) {
            // Entra's error_codes/error_description name the cause (e.g.
            // AADSTS7000215 wrong secret value, AADSTS9002326 callback
            // registered as SPA instead of Web). They carry no secrets.
            const err = (await res.json().catch(() => ({}))) as {
                error?: string;
                error_codes?: number[];
                error_description?: string;
            };
            const codes = (err.error_codes ?? [])
                .map((c) => `AADSTS${c}`)
                .join(',');
            const description = err.error_description?.split('\n')[0] ?? '';
            throw new Error(
                `Entra token exchange failed: ${res.status} ${err.error ?? ''} ${codes} ${description}`.trim()
            );
        }
        const body = (await res.json()) as { id_token?: string };
        if (!body.id_token) throw new Error('Entra returned no id_token');

        this.jwks ??= jwksClient({
            jwksUri: discovery.jwks_uri,
            cache: true,
            rateLimit: true,
        });
        const jwks = this.jwks;
        const claims = await new Promise<Record<string, unknown>>(
            (resolve, reject) => {
                jwt.verify(
                    body.id_token!,
                    (header: JwtHeader, cb: SigningKeyCallback) => {
                        if (!header.kid)
                            return cb(new Error('id_token has no kid'));
                        jwks.getSigningKey(header.kid, (err, key) =>
                            cb(err, key?.getPublicKey())
                        );
                    },
                    {
                        algorithms: ['RS256'],
                        audience: this.clientId,
                        issuer: discovery.issuer,
                    },
                    (err, decoded) =>
                        err || !decoded || typeof decoded === 'string'
                            ? reject(err ?? new Error('bad id_token'))
                            : resolve(decoded as Record<string, unknown>)
                );
            }
        );
        if (claims.nonce !== nonce) throw new Error('id_token nonce mismatch');
        if (claims.tid !== this.tenantId)
            throw new Error('id_token from another tenant');
        if (typeof claims.oid !== 'string' || !claims.oid)
            throw new Error('id_token has no oid');
        return {
            oid: claims.oid,
            upn:
                typeof claims.preferred_username === 'string'
                    ? claims.preferred_username
                    : null,
        };
    }
}
