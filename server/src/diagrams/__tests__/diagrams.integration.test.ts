import { randomUUID } from 'node:crypto';
import { type ChildProcess, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { WebSocket as NodeWebSocket } from 'ws';
import { afterAll, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { createPool } from '../../db/pool';
import { loadConfig } from '../../config';

// This file's own Vitest environment is 'node' (server/vitest.config.ts),
// which — unlike a real browser — has no global WebSocket. Same gotcha,
// same fix, as the client-side collab integration test.
vi.stubGlobal('WebSocket', NodeWebSocket);

/**
 * Phase 4.5 (docs/design/realtime-collaboration.md §10): the /diagrams
 * REST surface that never existed before Dexie was removed — "list all
 * diagrams" and "open a diagram by id" both need this now that there's no
 * client-side registry to answer them from. Same spawn-the-real-compiled-
 * server discipline as collab.integration.test.ts (see that file's header
 * for why: Nest's decorator metadata doesn't survive Vitest's transform).
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

async function startServerProcess(): Promise<TestServer> {
    const port = await freePort();
    const child = spawn('node', [join(process.cwd(), 'dist/main.js')], {
        // See collab.integration.test.ts's identical comment — dotenv only
        // fills in vars missing from process.env, so a contributor's own
        // server/.env (AUTH_MODE=azure-ad, for manually testing Phase 7's
        // sign-in flow) would otherwise leak into every spawned server.
        env: { ...process.env, PORT: String(port), AUTH_MODE: 'public' },
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

// Prefixed `test-rest-diagram-`, not the `test-diagram-` collab.integration.
// test.ts already uses — found the hard way running the full server suite:
// vitest runs test FILES concurrently, and both files' afterAll hooks
// delete by a broad `LIKE 'test-diagram-%'`, which matches every OTHER
// file's in-flight rows too, not just its own. A distinct prefix per file
// scopes each file's cleanup to only the rows it created.
function testDiagramId(): string {
    return `test-rest-diagram-${randomUUID()}`;
}

describe.skipIf(!databaseReachable)('Phase 4.5 — /diagrams REST API', () => {
    afterAll(async () => {
        const pool = createPool(loadConfig().databaseUrl);
        await pool.query('DELETE FROM collab_diagrams WHERE id LIKE $1', [
            'test-rest-diagram-%',
        ]);
        await pool.end();
    });

    it('create, get, list, and patch a diagram', async () => {
        const server = await startServerProcess();
        const id = testDiagramId();
        try {
            const createRes = await fetch(
                `http://localhost:${server.port}/api/diagrams`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id,
                        name: 'my diagram',
                        databaseType: 'postgresql',
                    }),
                }
            );
            expect(createRes.status).toBe(201);
            const created = await createRes.json();
            expect(created).toMatchObject({ id, name: 'my diagram' });

            const getRes = await fetch(
                `http://localhost:${server.port}/api/diagrams/${id}`
            );
            expect(getRes.status).toBe(200);
            expect(await getRes.json()).toMatchObject({ id, name: 'my diagram' });

            const listRes = await fetch(
                `http://localhost:${server.port}/api/diagrams`
            );
            const list = await listRes.json();
            expect(list.find((d: { id: string }) => d.id === id)).toBeTruthy();

            const patchRes = await fetch(
                `http://localhost:${server.port}/api/diagrams/${id}`,
                {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: 'renamed' }),
                }
            );
            expect(patchRes.status).toBe(200);
            expect(await patchRes.json()).toMatchObject({ name: 'renamed' });
        } finally {
            await server.stop();
        }
    }, 20_000);

    it('creating a diagram id that already exists returns 409, not a silent overwrite', async () => {
        const server = await startServerProcess();
        const id = testDiagramId();
        try {
            const body = JSON.stringify({
                id,
                name: 'first',
                databaseType: 'postgresql',
            });
            const first = await fetch(
                `http://localhost:${server.port}/api/diagrams`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body,
                }
            );
            expect(first.status).toBe(201);

            const second = await fetch(
                `http://localhost:${server.port}/api/diagrams`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id,
                        name: 'second',
                        databaseType: 'postgresql',
                    }),
                }
            );
            expect(second.status).toBe(409);

            const getRes = await fetch(
                `http://localhost:${server.port}/api/diagrams/${id}`
            );
            expect(await getRes.json()).toMatchObject({ name: 'first' });
        } finally {
            await server.stop();
        }
    }, 20_000);

    it('getting/patching/deleting a diagram id that was never created 404s', async () => {
        const server = await startServerProcess();
        const id = testDiagramId();
        try {
            expect(
                (
                    await fetch(`http://localhost:${server.port}/api/diagrams/${id}`)
                ).status
            ).toBe(404);
            expect(
                (
                    await fetch(
                        `http://localhost:${server.port}/api/diagrams/${id}`,
                        {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: 'x' }),
                        }
                    )
                ).status
            ).toBe(404);
            expect(
                (
                    await fetch(
                        `http://localhost:${server.port}/api/diagrams/${id}`,
                        { method: 'DELETE' }
                    )
                ).status
            ).toBe(404);
        } finally {
            await server.stop();
        }
    }, 20_000);

    it('DELETE /diagrams/:id cascades — the diagram\'s yjs_updates/yjs_snapshots rows are gone too, not just the metadata row', async () => {
        const server = await startServerProcess();
        const id = testDiagramId();
        const pool = createPool(loadConfig().databaseUrl);
        try {
            await fetch(`http://localhost:${server.port}/api/diagrams`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id,
                    name: 'to delete',
                    databaseType: 'postgresql',
                }),
            });

            const doc = new Y.Doc();
            const provider = new HocuspocusProvider({
                url: `ws://localhost:${server.port}`,
                name: id,
                document: doc,
            });
            await new Promise<void>((resolve, reject) => {
                const timer = setTimeout(
                    () => reject(new Error('never synced')),
                    8_000
                );
                provider.on('synced', () => {
                    clearTimeout(timer);
                    resolve();
                });
            });
            doc.getMap('tables').set('table-1', { name: 'users' });
            // Poll rather than a flat sleep — beforeHandleMessage's durable-
            // log append lands async, and a fixed short wait is flaky under
            // the load of the full suite running many spawned servers at
            // once (found this the hard way — a 300ms sleep passed in
            // isolation but flaked in the full run).
            const deadline = Date.now() + 8_000;
            let updateCount = 0;
            while (Date.now() < deadline) {
                const res = await pool.query(
                    'SELECT count(*) FROM yjs_updates WHERE diagram_id = $1',
                    [id]
                );
                updateCount = Number(res.rows[0].count);
                if (updateCount > 0) break;
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
            expect(updateCount).toBeGreaterThan(0);

            provider.destroy();
            await new Promise((resolve) => setTimeout(resolve, 200));

            const deleteRes = await fetch(
                `http://localhost:${server.port}/api/diagrams/${id}`,
                { method: 'DELETE' }
            );
            expect(deleteRes.status).toBe(200);

            const afterDelete = await pool.query(
                'SELECT count(*) FROM yjs_updates WHERE diagram_id = $1',
                [id]
            );
            expect(Number(afterDelete.rows[0].count)).toBe(0);
        } finally {
            await pool.end();
            await server.stop();
        }
    }, 20_000);

    it('a client still connected at delete time cannot resurrect the diagram with its next write', async () => {
        const server = await startServerProcess();
        const id = testDiagramId();
        const pool = createPool(loadConfig().databaseUrl);
        try {
            await fetch(`http://localhost:${server.port}/api/diagrams`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id,
                    name: 'still connected',
                    databaseType: 'postgresql',
                }),
            });

            const doc = new Y.Doc();
            const provider = new HocuspocusProvider({
                url: `ws://localhost:${server.port}`,
                name: id,
                document: doc,
            });
            await new Promise<void>((resolve, reject) => {
                const timer = setTimeout(
                    () => reject(new Error('never synced')),
                    8_000
                );
                provider.on('synced', () => {
                    clearTimeout(timer);
                    resolve();
                });
            });

            // Delete the diagram WITHOUT destroying the provider first —
            // this is exactly the race the FK (pool.ts's migrate()) exists
            // to close: a client that's still connected when the metadata
            // row (and its cascaded yjs_updates/yjs_snapshots rows) goes
            // away must not be able to write its way back into existence.
            const deleteRes = await fetch(
                `http://localhost:${server.port}/api/diagrams/${id}`,
                { method: 'DELETE' }
            );
            expect(deleteRes.status).toBe(200);

            // Fire a write from the still-connected client right after.
            doc.getMap('tables').set('table-1', { name: 'ghost' });
            await new Promise((resolve) => setTimeout(resolve, 500));

            const rows = await pool.query(
                'SELECT count(*) FROM yjs_updates WHERE diagram_id = $1',
                [id]
            );
            expect(Number(rows.rows[0].count)).toBe(0);
            const metadataRows = await pool.query(
                'SELECT count(*) FROM collab_diagrams WHERE id = $1',
                [id]
            );
            expect(Number(metadataRows.rows[0].count)).toBe(0);

            provider.destroy();
        } finally {
            await pool.end();
            await server.stop();
        }
    }, 20_000);
});
