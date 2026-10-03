import express, {
    type Request,
    type RequestHandler,
    type Response,
} from 'express';
import { ipKeyGenerator } from 'express-rate-limit';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import type { EntraBroker } from './entra-broker';
import { MCP_SCOPE } from './entra-broker';
import type { EntraUpstream } from './entra-upstream';

/**
 * Rate limits key on CF-Connecting-IP (prod sits behind Cloudflare, so the
 * socket address is always a Cloudflare edge). That header is spoofable by
 * anyone who can reach the origin directly; acceptable for rate limiting,
 * which is all it's used for. Express `trust proxy` stays off.
 */
const rateLimit = {
    keyGenerator: (req: Request) =>
        ipKeyGenerator(
            (req.headers['cf-connecting-ip'] as string | undefined) ??
                req.socket.remoteAddress ??
                'unknown'
        ),
    validate: { xForwardedForHeader: false },
};

function readCookie(req: Request, name: string): string | undefined {
    for (const part of (req.headers.cookie ?? '').split(';')) {
        const [key, ...rest] = part.trim().split('=');
        if (key === name) return rest.join('=');
    }
    return undefined;
}

function redirectToClient(
    res: Response,
    redirectUri: string,
    params: Record<string, string | null | undefined>
): void {
    const url = new URL(redirectUri);
    for (const [key, value] of Object.entries(params)) {
        if (value != null) url.searchParams.set(key, value);
    }
    res.redirect(302, url.toString());
}

/**
 * Everything the MCP OAuth broker serves, mounted at the app root (OAuth
 * discovery paths are root-relative): the SDK's metadata, /authorize,
 * /token, /register and /revoke, plus our /oauth/consent and
 * /oauth/callback. app.module.ts's ServeStatic exclude list must keep
 * these out of the SPA fallback.
 */
export function createMcpOAuthRouter(
    broker: EntraBroker,
    upstream: EntraUpstream
): RequestHandler {
    const router = express.Router();

    router.use(
        mcpAuthRouter({
            provider: broker,
            issuerUrl: new URL(broker.issuer),
            resourceServerUrl: broker.resourceUrl,
            scopesSupported: [MCP_SCOPE],
            resourceName: 'ChartDB',
            authorizationOptions: { rateLimit },
            tokenOptions: { rateLimit },
            clientRegistrationOptions: { rateLimit },
            revocationOptions: { rateLimit },
        })
    );

    router.post(
        '/oauth/consent',
        express.urlencoded({ extended: false }),
        async (req: Request, res: Response) => {
            res.setHeader('Cache-Control', 'no-store');
            const { request_id, csrf, decision } = (req.body ?? {}) as Record<
                string,
                string
            >;
            const pending = request_id
                ? await broker.pendingConsent(request_id)
                : null;
            // Double-submit check: form field, cookie and stored value must all
            // agree. SameSite=Lax keeps the cookie off cross-site POSTs.
            if (
                !pending ||
                !csrf ||
                csrf !== pending.csrf ||
                readCookie(req, broker.csrfCookieName) !== pending.csrf
            ) {
                res.status(400)
                    .type('text')
                    .send(
                        'This sign-in link is invalid or expired. Start again from your MCP client.'
                    );
                return;
            }
            if (decision !== 'approve') {
                await broker.denyConsent(pending.id);
                redirectToClient(res, pending.redirect_uri, {
                    error: 'access_denied',
                    state: pending.client_state,
                    iss: broker.issuer,
                });
                return;
            }
            const approved = await broker.approveConsent(pending.id);
            if (!approved) {
                res.status(400)
                    .type('text')
                    .send('This sign-in link is invalid or expired.');
                return;
            }
            // The state cookie is set only now, after approval, right before
            // leaving for Entra; the callback requires it to match.
            res.setHeader('Set-Cookie', [
                broker.cookie(broker.csrfCookieName, '', 0),
                broker.cookie(broker.stateCookieName, approved.state),
            ]);
            res.redirect(
                302,
                await upstream.authorizeUrl(
                    approved.state,
                    approved.nonce,
                    approved.verifier
                )
            );
        }
    );

    router.get('/oauth/callback', async (req: Request, res: Response) => {
        res.setHeader('Cache-Control', 'no-store');
        const state =
            typeof req.query.state === 'string' ? req.query.state : '';
        const cookieState = readCookie(req, broker.stateCookieName);
        if (!state || state !== cookieState) {
            res.status(400)
                .type('text')
                .send(
                    'Sign-in state mismatch. Start again from your MCP client.'
                );
            return;
        }
        const pending = await broker.claimUpstream(state);
        res.setHeader(
            'Set-Cookie',
            broker.cookie(broker.stateCookieName, '', 0)
        );
        if (!pending) {
            res.status(400)
                .type('text')
                .send('This sign-in link is invalid or expired.');
            return;
        }
        const code = typeof req.query.code === 'string' ? req.query.code : '';
        if (!code) {
            // Entra reported an error (user cancelled, no access, ...).
            redirectToClient(res, pending.redirect_uri, {
                error: 'access_denied',
                state: pending.client_state,
                iss: broker.issuer,
            });
            return;
        }
        try {
            const user = await upstream.redeem(
                code,
                pending.entra_verifier,
                pending.entra_nonce
            );
            const ourCode = await broker.issueCode(
                pending.id,
                pending.client_id,
                user
            );
            redirectToClient(res, pending.redirect_uri, {
                code: ourCode,
                state: pending.client_state,
                iss: broker.issuer,
            });
        } catch (error) {
            console.error(
                'MCP OAuth callback failed:',
                (error as Error).message
            );
            redirectToClient(res, pending.redirect_uri, {
                error: 'server_error',
                state: pending.client_state,
                iss: broker.issuer,
            });
        }
    });

    return router;
}
