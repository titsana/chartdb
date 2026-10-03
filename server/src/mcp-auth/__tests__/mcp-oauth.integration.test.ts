import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { type ChildProcess, spawn } from 'node:child_process';
import { createServer as createHttpServer, type Server } from 'node:http';
import { createServer } from 'node:net';
import { join } from 'node:path';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from '../../db/pool';
import { loadConfig } from '../../config';

/**
 * docs/design/mcp-oauth.md §8: the MCP OAuth broker end to end, against the
 * real compiled server (dist/main.js) and real Postgres, with Entra replaced
 * by a fake OIDC provider running in this process (ENTRA_AUTHORITY points
 * at it). Skips without Postgres — check the output says "passed".
 *
 * Not covered here (needs a real browser + real Entra, see the design doc):
 * SameSite cookie behavior across the Entra redirect, CSP, Claude Code's
 * own client behavior.
 */

let databaseReachable = true;
try {
    const probe = createPool(loadConfig().databaseUrl);
    await probe.query('SELECT 1');
    await probe.end();
} catch {
    databaseReachable = false;
}

const TENANT = 'test-tenant';
const CLIENT_ID = 'test-client';
const CLIENT_SECRET = 'test-secret';
const CLIENT_REDIRECT = 'http://localhost:9999/callback';

async function freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = createServer();
        server.listen(0, () => {
            const port = (server.address() as { port: number }).port;
            server.close(() => resolve(port));
        });
        server.on('error', reject);
    });
}

const b64url = (buf: Buffer) => buf.toString('base64url');
const pkce = () => {
    const verifier = b64url(randomBytes(32));
    return {
        verifier,
        challenge: b64url(createHash('sha256').update(verifier).digest()),
    };
};

// ---- fake Entra ----

interface FakeOidc {
    url: string;
    /** Overrides claims of the next id_token(s), e.g. a foreign tenant. */
    claimOverrides: Record<string, unknown>;
    close(): Promise<void>;
}

async function startFakeOidc(): Promise<FakeOidc> {
    const port = await freePort();
    const url = `http://localhost:${port}`;
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
    });
    const jwk = {
        ...publicKey.export({ format: 'jwk' }),
        kid: 'k1',
        alg: 'RS256',
        use: 'sig',
    };
    const codes = new Map<
        string,
        { nonce: string; challenge: string; redirectUri: string }
    >();
    const fake: FakeOidc = { url, claimOverrides: {}, close: async () => {} };

    const server: Server = createHttpServer(async (req, res) => {
        const u = new URL(req.url!, url);
        const json = (status: number, body: unknown) => {
            res.writeHead(status, { 'Content-Type': 'application/json' }).end(
                JSON.stringify(body)
            );
        };
        if (u.pathname === '/.well-known/openid-configuration') {
            return json(200, {
                issuer: url,
                authorization_endpoint: `${url}/authorize`,
                token_endpoint: `${url}/token`,
                jwks_uri: `${url}/keys`,
            });
        }
        if (u.pathname === '/keys') return json(200, { keys: [jwk] });
        if (u.pathname === '/authorize') {
            // auto-approve, like a user with an existing Entra session
            const p = u.searchParams;
            if (
                p.get('client_id') !== CLIENT_ID ||
                p.get('response_mode') !== 'query'
            ) {
                return json(400, { error: 'bad authorize request' });
            }
            const code = b64url(randomBytes(16));
            codes.set(code, {
                nonce: p.get('nonce')!,
                challenge: p.get('code_challenge')!,
                redirectUri: p.get('redirect_uri')!,
            });
            const back = new URL(p.get('redirect_uri')!);
            back.searchParams.set('code', code);
            back.searchParams.set('state', p.get('state')!);
            res.writeHead(302, { Location: back.toString() }).end();
            return;
        }
        if (u.pathname === '/token' && req.method === 'POST') {
            let raw = '';
            for await (const chunk of req) raw += chunk;
            const p = new URLSearchParams(raw);
            const entry = codes.get(p.get('code') ?? '');
            codes.delete(p.get('code') ?? '');
            const challenge = b64url(
                createHash('sha256')
                    .update(p.get('code_verifier') ?? '')
                    .digest()
            );
            if (
                !entry ||
                p.get('client_secret') !== CLIENT_SECRET ||
                p.get('redirect_uri') !== entry.redirectUri ||
                challenge !== entry.challenge
            ) {
                return json(400, { error: 'invalid_grant' });
            }
            const idToken = jwt.sign(
                {
                    aud: CLIENT_ID,
                    iss: url,
                    nonce: entry.nonce,
                    tid: TENANT,
                    oid: 'user-oid-1',
                    preferred_username: 'alice@example.com',
                    ...fake.claimOverrides,
                },
                privateKey,
                { algorithm: 'RS256', keyid: 'k1', expiresIn: 300 }
            );
            return json(200, { id_token: idToken, token_type: 'Bearer' });
        }
        json(404, {});
    });
    await new Promise<void>((resolve) => server.listen(port, resolve));
    fake.close = () => new Promise((resolve) => server.close(() => resolve()));
    return fake;
}

// ---- chartdb server ----

interface TestServer {
    base: string;
    log: () => string;
    stop: () => Promise<void>;
}

async function startServer(env: Record<string, string>): Promise<TestServer> {
    const port = await freePort();
    const base = `http://localhost:${port}`;
    const child: ChildProcess = spawn(
        'node',
        [join(process.cwd(), 'dist/main.js')],
        {
            env: {
                ...process.env,
                PORT: String(port),
                AUTH_MODE: 'azure-ad',
                ENTRA_TENANT_ID: TENANT,
                ENTRA_CLIENT_ID: CLIENT_ID,
                ENTRA_CLIENT_SECRET: CLIENT_SECRET,
                PUBLIC_URL: base,
                ...env,
            },
            stdio: 'pipe',
        }
    );
    let output = '';
    child.stdout?.on('data', (c) => (output += c.toString()));
    child.stderr?.on('data', (c) => (output += c.toString()));
    const deadline = Date.now() + 10_000;
    for (;;) {
        try {
            if ((await fetch(`${base}/health`)).ok) break;
        } catch {
            // not up yet
        }
        if (Date.now() > deadline) {
            child.kill();
            throw new Error(`server never became healthy\n${output}`);
        }
        await new Promise((r) => setTimeout(r, 200));
    }
    return {
        base,
        log: () => output,
        stop: () =>
            new Promise((resolve) => {
                child.once('exit', () => resolve());
                child.kill();
            }),
    };
}

function cookiesFrom(res: Response): string {
    return res.headers
        .getSetCookie()
        .map((c) => c.split(';')[0])
        .filter((c) => !c.endsWith('='))
        .join('; ');
}

function hidden(html: string, name: string): string {
    return html.match(new RegExp(`name="${name}" value="([^"]*)"`))![1];
}

describe.skipIf(!databaseReachable)('MCP OAuth broker', () => {
    let fake: FakeOidc;
    let server: TestServer;
    const pool = databaseReachable
        ? createPool(loadConfig().databaseUrl)
        : null;

    beforeAll(async () => {
        fake = await startFakeOidc();
        server = await startServer({ ENTRA_AUTHORITY: fake.url });
    });

    afterAll(async () => {
        await server?.stop();
        await fake?.close();
        await pool?.query(
            `DELETE FROM mcp_oauth_clients WHERE client_info->>'client_name' LIKE 'test-%'`
        );
        await pool?.end();
    });

    const resource = () => `${server.base}/api/mcp`;

    async function register(
        overrides: Record<string, unknown> = {},
        headers: Record<string, string> = {}
    ): Promise<Response> {
        return fetch(`${server.base}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify({
                client_name: 'test-client-app',
                redirect_uris: [CLIENT_REDIRECT],
                token_endpoint_auth_method: 'none',
                grant_types: ['authorization_code', 'refresh_token'],
                response_types: ['code'],
                ...overrides,
            }),
        });
    }

    function authorizeUrl(
        clientId: string,
        challenge: string,
        extra: Record<string, string> = {}
    ) {
        const u = new URL(`${server.base}/authorize`);
        u.search = new URLSearchParams({
            response_type: 'code',
            client_id: clientId,
            redirect_uri: CLIENT_REDIRECT,
            code_challenge: challenge,
            code_challenge_method: 'S256',
            state: 'client-state-1',
            scope: 'mcp',
            resource: resource(),
            ...extra,
        }).toString();
        return u.toString();
    }

    /** Full browser leg: authorize → consent → fake Entra → callback. Returns our code. */
    async function login(clientId: string, challenge: string): Promise<URL> {
        const page = await fetch(authorizeUrl(clientId, challenge), {
            redirect: 'manual',
        });
        expect(page.status).toBe(200);
        const html = await page.text();
        const consent = await fetch(`${server.base}/oauth/consent`, {
            method: 'POST',
            redirect: 'manual',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Cookie: cookiesFrom(page),
            },
            body: new URLSearchParams({
                request_id: hidden(html, 'request_id'),
                csrf: hidden(html, 'csrf'),
                decision: 'approve',
            }),
        });
        expect(consent.status).toBe(302);
        const atEntra = await fetch(consent.headers.get('location')!, {
            redirect: 'manual',
        });
        expect(atEntra.status).toBe(302);
        const callback = await fetch(atEntra.headers.get('location')!, {
            redirect: 'manual',
            headers: { Cookie: cookiesFrom(consent) },
        });
        expect(callback.status, server.log()).toBe(302);
        return new URL(callback.headers.get('location')!);
    }

    async function token(params: Record<string, string>): Promise<Response> {
        return fetch(`${server.base}/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(params),
        });
    }

    async function mcpToolsList(accessToken?: string): Promise<Response> {
        return fetch(`${server.base}/api/mcp`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json, text/event-stream',
                ...(accessToken
                    ? { Authorization: `Bearer ${accessToken}` }
                    : {}),
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/list',
            }),
        });
    }

    async function fullLogin(): Promise<{
        clientId: string;
        tokens: Record<string, string>;
    }> {
        const { client_id: clientId } = await (await register()).json();
        const { verifier, challenge } = pkce();
        const back = await login(clientId, challenge);
        const res = await token({
            grant_type: 'authorization_code',
            client_id: clientId,
            code: back.searchParams.get('code')!,
            code_verifier: verifier,
            redirect_uri: CLIENT_REDIRECT,
            resource: resource(),
        });
        expect(res.status).toBe(200);
        return { clientId, tokens: await res.json() };
    }

    it('401 on /api/mcp points at metadata that leads to this broker', async () => {
        const res = await mcpToolsList();
        expect(res.status).toBe(401);
        const header = res.headers.get('www-authenticate')!;
        const metadataUrl = header.match(/resource_metadata="([^"]+)"/)![1];
        expect(metadataUrl).toBe(
            `${server.base}/.well-known/oauth-protected-resource/api/mcp`
        );

        const prm = await (await fetch(metadataUrl)).json();
        expect(prm.resource).toBe(resource());
        const asMeta = await (
            await fetch(`${server.base}/.well-known/oauth-authorization-server`)
        ).json();
        expect(prm.authorization_servers).toContain(asMeta.issuer);
        expect(asMeta.registration_endpoint).toBe(`${server.base}/register`);
    });

    it('happy path: register, consent, Entra login, token, tools/list; iss and state echoed', async () => {
        const { client_id: clientId } = await (await register()).json();
        const { verifier, challenge } = pkce();
        const back = await login(clientId, challenge);
        expect(back.origin + back.pathname).toBe(CLIENT_REDIRECT);
        expect(back.searchParams.get('state')).toBe('client-state-1');
        const asMeta = await (
            await fetch(`${server.base}/.well-known/oauth-authorization-server`)
        ).json();
        expect(back.searchParams.get('iss')).toBe(asMeta.issuer);

        const res = await token({
            grant_type: 'authorization_code',
            client_id: clientId,
            code: back.searchParams.get('code')!,
            code_verifier: verifier,
            redirect_uri: CLIENT_REDIRECT,
            resource: resource(),
        });
        const tokens = await res.json();
        expect(res.status, JSON.stringify(tokens)).toBe(200);
        expect(tokens.token_type).toBe('Bearer');
        expect((await mcpToolsList(tokens.access_token)).status).toBe(200);
    });

    it('PKCE: wrong verifier rejected; a code works once', async () => {
        const { client_id: clientId } = await (await register()).json();
        const { verifier, challenge } = pkce();
        const code = (await login(clientId, challenge)).searchParams.get(
            'code'
        )!;
        const base = {
            grant_type: 'authorization_code',
            client_id: clientId,
            code,
            redirect_uri: CLIENT_REDIRECT,
        };
        expect(
            (await token({ ...base, code_verifier: pkce().verifier })).status
        ).toBe(400);
        expect((await token({ ...base, code_verifier: verifier })).status).toBe(
            200
        );
        expect((await token({ ...base, code_verifier: verifier })).status).toBe(
            400
        );
    });

    it('redirect safety: non-loopback registration, unregistered and mismatched redirect_uri', async () => {
        expect(
            (
                await register({
                    redirect_uris: ['https://attacker.example.com/cb'],
                })
            ).status
        ).toBe(400);
        expect((await register({ redirect_uris: [] })).status).toBe(400);

        const { client_id: clientId } = await (await register()).json();
        const bad = await fetch(
            authorizeUrl(clientId, pkce().challenge, {
                redirect_uri: 'http://localhost:9999/other',
            }),
            { redirect: 'manual' }
        );
        expect(bad.status).toBe(400);

        const { verifier, challenge } = pkce();
        const code = (await login(clientId, challenge)).searchParams.get(
            'code'
        )!;
        const res = await token({
            grant_type: 'authorization_code',
            client_id: clientId,
            code,
            code_verifier: verifier,
            redirect_uri: 'http://localhost:1234/callback',
        });
        expect(res.status).toBe(400);
    });

    it('resource: a foreign resource is rejected at /authorize and /token', async () => {
        const { client_id: clientId } = await (await register()).json();
        const bad = await fetch(
            authorizeUrl(clientId, pkce().challenge, {
                resource: 'https://elsewhere.example.com/mcp',
            }),
            { redirect: 'manual' }
        );
        expect(bad.status).toBe(302);
        expect(
            new URL(bad.headers.get('location')!).searchParams.get('error')
        ).toBe('invalid_target');

        const { verifier, challenge } = pkce();
        const code = (await login(clientId, challenge)).searchParams.get(
            'code'
        )!;
        const res = await token({
            grant_type: 'authorization_code',
            client_id: clientId,
            code,
            code_verifier: verifier,
            redirect_uri: CLIENT_REDIRECT,
            resource: 'https://elsewhere.example.com/mcp',
        });
        expect(res.status).toBe(400);
    });

    it('consent page: escapes client_name, anti-framing, CSRF-checked', async () => {
        const { client_id: clientId } = await (
            await register({ client_name: 'test-<script>alert(1)</script>' })
        ).json();
        const page = await fetch(authorizeUrl(clientId, pkce().challenge), {
            redirect: 'manual',
        });
        const html = await page.text();
        expect(html).not.toContain('<script>alert(1)</script>');
        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(html).toContain(CLIENT_REDIRECT);
        expect(page.headers.get('x-frame-options')).toBe('DENY');
        expect(page.headers.get('content-security-policy')).toContain(
            "frame-ancestors 'none'"
        );

        const form = {
            request_id: hidden(html, 'request_id'),
            csrf: hidden(html, 'csrf'),
            decision: 'approve',
        };
        const post = (body: Record<string, string>, cookie?: string) =>
            fetch(`${server.base}/oauth/consent`, {
                method: 'POST',
                redirect: 'manual',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    ...(cookie ? { Cookie: cookie } : {}),
                },
                body: new URLSearchParams(body),
            });
        // no cookie (cross-site POST), wrong csrf: rejected, nothing sent to Entra
        expect((await post(form)).status).toBe(400);
        expect(
            (await post({ ...form, csrf: 'nope' }, cookiesFrom(page))).status
        ).toBe(400);
        // deny goes back to the client with access_denied
        const denied = await post(
            { ...form, decision: 'deny' },
            cookiesFrom(page)
        );
        expect(denied.status).toBe(302);
        expect(
            new URL(denied.headers.get('location')!).searchParams.get('error')
        ).toBe('access_denied');
    });

    it('callback: missing, mismatched or reused state is rejected', async () => {
        const { client_id: clientId } = await (await register()).json();
        const page = await fetch(authorizeUrl(clientId, pkce().challenge), {
            redirect: 'manual',
        });
        const html = await page.text();
        const consent = await fetch(`${server.base}/oauth/consent`, {
            method: 'POST',
            redirect: 'manual',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Cookie: cookiesFrom(page),
            },
            body: new URLSearchParams({
                request_id: hidden(html, 'request_id'),
                csrf: hidden(html, 'csrf'),
                decision: 'approve',
            }),
        });
        const atEntra = await fetch(consent.headers.get('location')!, {
            redirect: 'manual',
        });
        const callbackUrl = atEntra.headers.get('location')!;
        const cb = (cookie?: string) =>
            fetch(callbackUrl, {
                redirect: 'manual',
                headers: cookie ? { Cookie: cookie } : {},
            });

        expect((await cb()).status).toBe(400); // other browser: no state cookie
        expect((await cb('chartdb_mcp_state_insecure=forged')).status).toBe(
            400
        );
        expect((await cb(cookiesFrom(consent))).status).toBe(302);
        expect((await cb(cookiesFrom(consent))).status).toBe(400); // single use
    });

    it('rejects an id_token from another tenant', async () => {
        fake.claimOverrides = { tid: 'some-other-tenant' };
        try {
            const { client_id: clientId } = await (await register()).json();
            const back = await login(clientId, pkce().challenge);
            expect(back.searchParams.get('error')).toBe('server_error');
            expect(back.searchParams.get('code')).toBeNull();
        } finally {
            fake.claimOverrides = {};
        }
    });

    it('refresh: rotates; reusing an old refresh token revokes the family', async () => {
        const { clientId, tokens } = await fullLogin();
        const refresh = (rt: string) =>
            token({
                grant_type: 'refresh_token',
                client_id: clientId,
                refresh_token: rt,
            });

        const second = await refresh(tokens.refresh_token);
        expect(second.status).toBe(200);
        const rotated = await second.json();
        expect(rotated.refresh_token).not.toBe(tokens.refresh_token);
        expect((await mcpToolsList(rotated.access_token)).status).toBe(200);

        // replay of the first refresh token: theft signal, whole family gone
        expect((await refresh(tokens.refresh_token)).status).toBe(400);
        expect((await refresh(rotated.refresh_token)).status).toBe(400);
        expect((await mcpToolsList(rotated.access_token)).status).toBe(401);
    });

    it('expiry: expired access token and expired family are rejected', async () => {
        const { clientId, tokens } = await fullLogin();
        const hash = (t: string) =>
            createHash('sha256').update(t).digest('hex');
        await pool!.query(
            `UPDATE mcp_oauth_tokens SET expires_at = now() - interval '1 second' WHERE token_hash = $1`,
            [hash(tokens.access_token)]
        );
        expect((await mcpToolsList(tokens.access_token)).status).toBe(401);

        await pool!.query(
            `UPDATE mcp_oauth_tokens SET family_expires_at = now() - interval '1 second' WHERE token_hash = $1`,
            [hash(tokens.refresh_token)]
        );
        const res = await token({
            grant_type: 'refresh_token',
            client_id: clientId,
            refresh_token: tokens.refresh_token,
        });
        expect(res.status).toBe(400);
    });

    it('isolation: a broker token does not open the REST API', async () => {
        const { tokens } = await fullLogin();
        const res = await fetch(`${server.base}/api/diagrams`, {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        expect(res.status).toBe(401);
        expect(res.headers.get('www-authenticate')).toBeNull();
    });

    it('rate limits per CF-Connecting-IP, not per socket', async () => {
        // /register allows 20 per hour per key
        for (let i = 0; i < 20; i++) {
            await register({}, { 'CF-Connecting-IP': '203.0.113.7' });
        }
        expect(
            (await register({}, { 'CF-Connecting-IP': '203.0.113.7' })).status
        ).toBe(429);
        expect(
            (await register({}, { 'CF-Connecting-IP': '203.0.113.8' })).status
        ).toBe(201);
    });
});

describe.skipIf(!databaseReachable)('MCP OAuth broker config', () => {
    it('boots without PUBLIC_URL/ENTRA_CLIENT_SECRET and serves no broker routes', async () => {
        const server = await startServer({
            PUBLIC_URL: '',
            ENTRA_CLIENT_SECRET: '',
        });
        try {
            const meta = await fetch(
                `${server.base}/.well-known/oauth-authorization-server`
            );
            expect(meta.status).not.toBe(200);
            const res = await fetch(`${server.base}/api/mcp`, {
                method: 'POST',
            });
            expect(res.status).toBe(401);
            expect(res.headers.get('www-authenticate')).toBeNull();
        } finally {
            await server.stop();
        }
    });
});
