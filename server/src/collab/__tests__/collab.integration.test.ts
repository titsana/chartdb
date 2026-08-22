import { randomUUID } from 'node:crypto';
import { type ChildProcess, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { afterAll, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createPool } from '../../db/pool';
import { loadConfig } from '../../config';

/**
 * Phase 3 (docs/design/realtime-collaboration.md §10) exit criteria: "a
 * server that a raw y-websocket-compatible client can connect to, sync a
 * doc against, and see it survive a server restart via Postgres." Per the
 * Hocuspocus switch documented in that section, the client here is
 * `@hocuspocus/provider` (wire-incompatible with plain `y-websocket` — see
 * that section for why), which is this phase's actual compatibility target.
 *
 * Runs the real, compiled server (`dist/main.js`) as a genuinely separate
 * OS process — not `NestFactory.create()` in-process — for two reasons:
 * this is what "survive a server restart" actually means (a fresh process,
 * not just a fresh JS object graph reusing the test runner's module
 * cache/decorator metadata), and running Nest's decorator-based DI through
 * Vitest's esbuild transform (no `emitDecoratorMetadata`) crashes the
 * worker outright — spawning the already-`tsc`-built output sidesteps that
 * entirely. Requires `npm run build` to be current; `pretest` in
 * package.json does this before `vitest run`.
 *
 * Also needs its own vitest.config.ts (environment: 'node') — without one,
 * vitest run from here walks up and picks the root project's
 * `environment: 'happy-dom'`, under which this suite hung silently instead
 * of failing (found the hard way — see this file's git history / the
 * design doc's Phase 3 section).
 *
 * Needs a reachable Postgres (see server/.env / docker ps for
 * chartdb-collaboration-postgres-1) — skips the whole suite if one isn't
 * reachable, matching this repo's established integration-test convention.
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

async function waitForHealth(port: number, log: () => string): Promise<void> {
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
    throw new Error(`server on port ${port} never became healthy\nlog:\n${log()}`);
}

interface TestServer {
    port: number;
    child: ChildProcess;
    /** Full stdout+stderr captured so far — call this in a failing test's
     * `catch`/`finally`, not just on startup failure, since the interesting
     * log line (e.g. "rejected connection from origin ...") often only
     * appears once a client actually tries to connect, after startServerProcess
     * already returned successfully. */
    log: () => string;
    stop: () => Promise<void>;
}

async function startServerProcess(): Promise<TestServer> {
    const port = await freePort();
    const child = spawn('node', [join(process.cwd(), 'dist/main.js')], {
        env: { ...process.env, PORT: String(port) },
        stdio: 'pipe',
    });
    let output = '';
    child.stdout?.on('data', (chunk) => {
        output += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
        output += chunk.toString();
    });
    const log = () => output;
    await waitForHealth(port, log);
    return {
        port,
        child,
        log,
        stop: () =>
            new Promise((resolve) => {
                child.once('exit', () => resolve());
                child.kill();
            }),
    };
}

function waitForSynced(
    provider: HocuspocusProvider,
    label: string,
    server: TestServer
): Promise<void> {
    if (provider.synced) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(
                new Error(
                    `${label} never synced within 8s\nserver log:\n${server.log()}`
                )
            );
        }, 8_000);
        provider.on('synced', () => {
            clearTimeout(timer);
            resolve();
        });
    });
}

describe.skipIf(!databaseReachable)('Phase 3 — Hocuspocus server', () => {
    afterAll(async () => {
        // Best-effort cleanup of this suite's own rows so a real, shared
        // Postgres doesn't accumulate test diagrams indefinitely.
        const pool = createPool(loadConfig().databaseUrl);
        await pool.query('DELETE FROM yjs_updates WHERE diagram_id LIKE $1', [
            'test-diagram-%',
        ]);
        await pool.query('DELETE FROM yjs_snapshots WHERE diagram_id LIKE $1', [
            'test-diagram-%',
        ]);
        await pool.end();
    });

    it('two clients connect to the same room and sync a concurrent edit', async () => {
        const server = await startServerProcess();
        const diagramId = `test-diagram-${randomUUID()}`;
        const docA = new Y.Doc();
        const docB = new Y.Doc();
        const providerA = new HocuspocusProvider({
            url: `ws://localhost:${server.port}`,
            name: diagramId,
            document: docA,
        });
        const providerB = new HocuspocusProvider({
            url: `ws://localhost:${server.port}`,
            name: diagramId,
            document: docB,
        });

        try {
            await Promise.all([
                waitForSynced(providerA, 'providerA', server),
                waitForSynced(providerB, 'providerB', server),
            ]);

            docA.getMap('tables').set('table-1', { name: 'users' });

            await new Promise<void>((resolve) => {
                const check = () => {
                    if (docB.getMap('tables').get('table-1')) {
                        resolve();
                    }
                };
                docB.getMap('tables').observe(check);
                check();
            });

            expect(docB.getMap('tables').get('table-1')).toEqual({
                name: 'users',
            });

            // The durable-log hook (beforeHandleMessage -> appendUpdate) is
            // what actually makes the restart test below meaningful — confirm
            // directly that it fired, not just that sync worked.
            const pool = createPool(loadConfig().databaseUrl);
            const rows = await pool.query(
                'SELECT count(*) FROM yjs_updates WHERE diagram_id = $1',
                [diagramId]
            );
            await pool.end();
            expect(Number(rows.rows[0].count)).toBeGreaterThan(0);
        } catch (error) {
            throw new Error(`${error}\n\nserver log:\n${server.log()}`);
        } finally {
            providerA.destroy();
            providerB.destroy();
            await server.stop();
        }
    }, 20_000);

    it('data survives a server restart, loaded back from Postgres', async () => {
        const diagramId = `test-diagram-${randomUUID()}`;

        const server1 = await startServerProcess();
        const doc1 = new Y.Doc();
        const provider1 = new HocuspocusProvider({
            url: `ws://localhost:${server1.port}`,
            name: diagramId,
            document: doc1,
        });
        try {
            await waitForSynced(provider1, 'provider1', server1);
            doc1.getMap('tables').set('table-1', { name: 'orders' });
            // Give the durable append-log write (beforeHandleMessage) a
            // moment to land before we tear the connection down.
            await new Promise((resolve) => setTimeout(resolve, 300));
            provider1.destroy();
            // unloadImmediately (Hocuspocus default) flushes onStoreDocument
            // as soon as the last connection to this room closes — give it
            // a beat.
            await new Promise((resolve) => setTimeout(resolve, 300));
        } catch (error) {
            throw new Error(`${error}\n\nserver log:\n${server1.log()}`);
        } finally {
            await server1.stop();
        }

        // A genuinely separate OS process — nothing in memory carries over,
        // only what's in Postgres.
        const server2 = await startServerProcess();
        const doc2 = new Y.Doc();
        const provider2 = new HocuspocusProvider({
            url: `ws://localhost:${server2.port}`,
            name: diagramId,
            document: doc2,
        });
        try {
            await waitForSynced(provider2, 'provider2', server2);
            expect(doc2.getMap('tables').get('table-1')).toEqual({
                name: 'orders',
            });
        } catch (error) {
            throw new Error(`${error}\n\nserver log:\n${server2.log()}`);
        } finally {
            provider2.destroy();
            await server2.stop();
        }
    }, 20_000);
});
