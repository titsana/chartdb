import jwt, { type JwtHeader, type SigningKeyCallback } from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

export interface EntraTokenPayload {
    sub?: string;
    scp?: string;
    [claim: string]: unknown;
}

export type EntraVerifier = (token: string) => Promise<EntraTokenPayload>;

/**
 * Phase 7: verifies an Azure AD (Entra ID) access token against the
 * tenant's own signing keys.
 *
 * Deliberately NOT accepting the bare client id as a valid `aud` — only
 * `entraApiAudience` (e.g. `api://<client-id>`, matching
 * VITE_ENTRA_API_SCOPE's prefix). An ID token issued to this same app also
 * carries `aud === client id`; ID tokens are meant for the browser, not as
 * bearer credentials for this API, so accepting that value here would let
 * a client swap an ID token in and pass. This was raised in review before
 * writing this file, not found after.
 *
 * `scp` is checked for the exact scope the client requests (see
 * msal-config.ts's loginRequest) — an access token minted for some other
 * API exposed by the same app registration would still pass the audience
 * check alone.
 */
const REQUIRED_SCOPE = 'access_as_user';

export function createEntraVerifier(
    tenantId: string,
    apiAudience: string
): EntraVerifier {
    const client = jwksClient({
        jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
        cache: true,
        rateLimit: true,
    });

    function getSigningKey(
        header: JwtHeader,
        callback: SigningKeyCallback
    ): void {
        if (!header.kid) {
            callback(new Error('token header is missing kid'));
            return;
        }
        client.getSigningKey(header.kid, (err, key) => {
            if (err) {
                callback(err);
                return;
            }
            callback(null, key?.getPublicKey());
        });
    }

    return function verifyEntraToken(
        token: string
    ): Promise<EntraTokenPayload> {
        return new Promise((resolve, reject) => {
            jwt.verify(
                token,
                getSigningKey,
                {
                    audience: apiAudience,
                    issuer: [
                        `https://login.microsoftonline.com/${tenantId}/v2.0`,
                        `https://sts.windows.net/${tenantId}/`,
                    ],
                    algorithms: ['RS256'],
                },
                (err, decoded) => {
                    if (err || !decoded || typeof decoded === 'string') {
                        reject(err ?? new Error('token did not decode to an object'));
                        return;
                    }
                    const payload = decoded as EntraTokenPayload;
                    const scopes = (payload.scp ?? '').split(' ');
                    if (!scopes.includes(REQUIRED_SCOPE)) {
                        reject(
                            new Error(
                                `token is missing required scope "${REQUIRED_SCOPE}"`
                            )
                        );
                        return;
                    }
                    resolve(payload);
                }
            );
        });
    };
}
