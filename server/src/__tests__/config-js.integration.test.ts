import { type ChildProcess, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPool } from '../db/pool';
import { loadConfig } from '../config';

/**
 * Single-container deploy (docs/design/realtime-collaboration.md §7):
 * /config.js replaces nginx's envsubst-based runtime config injection for
 * the combined image. Pins two things a wrong wiring could silently break:
 * env-var substitution actually happening, and @Public() actually
 * exempting it from EntraAuthGuard (the client needs this endpoint before
 * it can know whether sign-in is required at all).
 */

let databaseReachable = true;
try {
    const probe = createPool(loadConfig().databaseUrl);
    await probe.query('SELECT 1');
    await probe.end();
} catch {
    databaseReachable = false;
}

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

async function waitForHealth(port: number): Promise<void> {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`http://localhost:${port}/health`);
            if (res.ok) return;
        } catch {
            // not up yet
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(`server on port ${port} never became healthy`);
}

interface TestServer {
    port: number;
    child: ChildProcess;
    stop: () => Promise<void>;
}

async function startServerProcess(
    extraEnv: Record<string, string>
): Promise<TestServer> {
    const port = await freePort();
    const child = spawn('node', [join(process.cwd(), 'dist/main.js')], {
        env: { ...process.env, PORT: String(port), ...extraEnv },
        stdio: 'ignore',
    });
    await waitForHealth(port);
    return {
        port,
        child,
        stop: () =>
            new Promise((resolve) => {
                child.once('exit', () => resolve());
                child.kill();
            }),
    };
}

describe.skipIf(!databaseReachable)('GET /config.js', () => {
    it('substitutes env vars into window.env, with the right content-type', async () => {
        const server = await startServerProcess({
            AUTH_MODE: 'public',
            HIDE_CHARTDB_CLOUD: 'true',
            COLLAB_WS_URL: 'wss://example.test',
        });
        try {
            const res = await fetch(`http://localhost:${server.port}/config.js`);
            expect(res.status).toBe(200);
            expect(res.headers.get('content-type')).toContain(
                'application/javascript'
            );
            // Hit in a real Cloudflare-fronted deploy: the .js extension
            // is a strong "cache this" signal to CDNs/browsers by
            // default, and this endpoint's whole reason to exist is
            // "reconfigurable without a rebuild" — caching it defeats
            // that on arrival.
            expect(res.headers.get('cache-control')).toBe('no-store');
            const body = await res.text();
            expect(body).toContain('window.env = ');
            expect(body).toContain('"HIDE_CHARTDB_CLOUD":"true"');
            expect(body).toContain('"COLLAB_WS_URL":"wss://example.test"');
            // Never configured in this test — must come through as "",
            // not "undefined" or a missing key.
            expect(body).toContain('"OPENAI_API_KEY":""');
        } finally {
            await server.stop();
        }
    });

    it('is exempt from AUTH_MODE=azure-ad — the client needs it before it can know auth is required', async () => {
        const server = await startServerProcess({
            AUTH_MODE: 'azure-ad',
            ENTRA_TENANT_ID: 'test-tenant-id',
            ENTRA_API_AUDIENCE: 'api://test-client-id',
        });
        try {
            const res = await fetch(`http://localhost:${server.port}/config.js`);
            expect(res.status).toBe(200);
        } finally {
            await server.stop();
        }
    });
});
