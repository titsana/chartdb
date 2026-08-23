import { type ChildProcess, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPool } from '../../db/pool';
import { loadConfig } from '../../config';

/**
 * Phase 7: real end-to-end wiring check for AUTH_MODE=azure-ad, spawning
 * the actual compiled server (same discipline as diagrams.integration.
 * test.ts — Nest's decorator metadata doesn't survive Vitest's transform).
 *
 * Deliberately does NOT test "a valid token succeeds" — that needs a real
 * Entra tenant issuing a real signed token, which this suite has no way to
 * produce. What it DOES pin, per the two gaps flagged in review before
 * this was written:
 *   - the @Public() exemption on /health actually works under Nest's
 *     Reflector (a wrong getAllAndOverride call would fail silently in the
 *     "health also requires auth" direction — nothing else here would
 *     catch that)
 *   - onAuthenticate:undefined-vs-omitted concern doesn't apply here (that
 *     was resolved by omitting the key rather than setting it), but the
 *     REST-side guard's default-deny needs the same "does it actually
 *     apply to a real route" proof
 * A garbage bearer token is enough to prove EntraAuthGuard runs, rejects,
 * and never reaches a network call to Microsoft's JWKS endpoint (jwt.verify
 * fails to even parse "not-a-jwt", so getSigningKey's callback is never
 * invoked) — no live tenant needed for this half of the guarantee.
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

describe.skipIf(!databaseReachable)('Phase 7 — AUTH_MODE=azure-ad', () => {
    it('exempts /health but rejects /diagrams with no token', async () => {
        const server = await startServerProcess({
            AUTH_MODE: 'azure-ad',
            ENTRA_TENANT_ID: 'test-tenant-id',
            ENTRA_API_AUDIENCE: 'api://test-client-id',
        });
        try {
            const health = await fetch(`http://localhost:${server.port}/health`);
            expect(health.status).toBe(200);

            const diagrams = await fetch(
                `http://localhost:${server.port}/diagrams`
            );
            expect(diagrams.status).toBe(401);
        } finally {
            await server.stop();
        }
    });

    it('rejects a malformed bearer token without needing a live Entra tenant', async () => {
        const server = await startServerProcess({
            AUTH_MODE: 'azure-ad',
            ENTRA_TENANT_ID: 'test-tenant-id',
            ENTRA_API_AUDIENCE: 'api://test-client-id',
        });
        try {
            const res = await fetch(`http://localhost:${server.port}/diagrams`, {
                headers: { Authorization: 'Bearer not-a-jwt' },
            });
            expect(res.status).toBe(401);
        } finally {
            await server.stop();
        }
    });
});
