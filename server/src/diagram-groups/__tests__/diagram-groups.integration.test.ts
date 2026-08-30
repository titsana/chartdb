import { randomUUID } from 'node:crypto';
import { type ChildProcess, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createPool } from '../../db/pool';
import { loadConfig } from '../../config';

/**
 * Folder-style diagram grouping (docs/design/realtime-collaboration.md
 * §10, Phase 7 follow-on). Same spawn-the-real-compiled-server discipline
 * as diagrams.integration.test.ts — see that file's header comment for
 * why (Nest's decorator metadata doesn't survive Vitest's transform).
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

// Distinct prefixes per file/table, same reasoning as diagrams.
// integration.test.ts's testDiagramId — vitest runs test files
// concurrently and a broad LIKE cleanup would catch other files' rows.
function testGroupId(): string {
    return `test-group-${randomUUID()}`;
}
function testDiagramId(): string {
    return `test-group-diagram-${randomUUID()}`;
}

describe.skipIf(!databaseReachable)('Phase 7 — /diagram-groups REST API', () => {
    afterAll(async () => {
        const pool = createPool(loadConfig().databaseUrl);
        await pool.query('DELETE FROM collab_diagrams WHERE id LIKE $1', [
            'test-group-diagram-%',
        ]);
        await pool.query('DELETE FROM collab_diagram_groups WHERE id LIKE $1', [
            'test-group-%',
        ]);
        await pool.end();
    });

    it('create, list, patch (rename), and delete a group', async () => {
        const server = await startServerProcess();
        const id = testGroupId();
        try {
            const createRes = await fetch(
                `http://localhost:${server.port}/api/diagram-groups`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id, name: 'my group' }),
                }
            );
            expect(createRes.status).toBe(201);
            expect(await createRes.json()).toMatchObject({
                id,
                name: 'my group',
            });

            const listRes = await fetch(
                `http://localhost:${server.port}/api/diagram-groups`
            );
            const list = await listRes.json();
            expect(
                list.find((g: { id: string }) => g.id === id)
            ).toMatchObject({ name: 'my group' });

            const patchRes = await fetch(
                `http://localhost:${server.port}/api/diagram-groups/${id}`,
                {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: 'renamed group' }),
                }
            );
            expect(patchRes.status).toBe(200);
            expect(await patchRes.json()).toMatchObject({
                name: 'renamed group',
            });

            const deleteRes = await fetch(
                `http://localhost:${server.port}/api/diagram-groups/${id}`,
                { method: 'DELETE' }
            );
            expect(deleteRes.status).toBe(200);

            const afterDelete = await fetch(
                `http://localhost:${server.port}/api/diagram-groups`
            );
            expect(
                (await afterDelete.json()).find(
                    (g: { id: string }) => g.id === id
                )
            ).toBeUndefined();
        } finally {
            await server.stop();
        }
    }, 20_000);

    it('creating a group id that already exists returns 409', async () => {
        const server = await startServerProcess();
        const id = testGroupId();
        try {
            const body = JSON.stringify({ id, name: 'first' });
            const first = await fetch(
                `http://localhost:${server.port}/api/diagram-groups`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body,
                }
            );
            expect(first.status).toBe(201);

            const second = await fetch(
                `http://localhost:${server.port}/api/diagram-groups`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id, name: 'second' }),
                }
            );
            expect(second.status).toBe(409);
        } finally {
            await server.stop();
        }
    }, 20_000);

    it('patching/deleting a group id that was never created 404s', async () => {
        const server = await startServerProcess();
        const id = testGroupId();
        try {
            expect(
                (
                    await fetch(
                        `http://localhost:${server.port}/api/diagram-groups/${id}`,
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
                        `http://localhost:${server.port}/api/diagram-groups/${id}`,
                        { method: 'DELETE' }
                    )
                ).status
            ).toBe(404);
        } finally {
            await server.stop();
        }
    }, 20_000);

    it('assigns a diagram to a group via PATCH /diagrams/:id, and the assignment round-trips through GET', async () => {
        const server = await startServerProcess();
        const groupId = testGroupId();
        const diagramId = testDiagramId();
        try {
            await fetch(`http://localhost:${server.port}/api/diagram-groups`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: groupId, name: 'a group' }),
            });
            await fetch(`http://localhost:${server.port}/api/diagrams`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: diagramId,
                    name: 'grouped diagram',
                    databaseType: 'postgresql',
                }),
            });

            const patchRes = await fetch(
                `http://localhost:${server.port}/api/diagrams/${diagramId}`,
                {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ groupId }),
                }
            );
            expect(patchRes.status).toBe(200);
            expect(await patchRes.json()).toMatchObject({ groupId });

            const getRes = await fetch(
                `http://localhost:${server.port}/api/diagrams/${diagramId}`
            );
            expect(await getRes.json()).toMatchObject({ groupId });
        } finally {
            await server.stop();
        }
    }, 20_000);

    it('assigning a diagram to a group that does not exist returns 400, not a silent write', async () => {
        const server = await startServerProcess();
        const diagramId = testDiagramId();
        try {
            await fetch(`http://localhost:${server.port}/api/diagrams`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: diagramId,
                    name: 'ungrouped',
                    databaseType: 'postgresql',
                }),
            });

            const patchRes = await fetch(
                `http://localhost:${server.port}/api/diagrams/${diagramId}`,
                {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ groupId: 'does-not-exist' }),
                }
            );
            expect(patchRes.status).toBe(400);

            // Confirm this was really refused, not partially applied.
            const getRes = await fetch(
                `http://localhost:${server.port}/api/diagrams/${diagramId}`
            );
            expect((await getRes.json()).groupId).toBeNull();
        } finally {
            await server.stop();
        }
    }, 20_000);

    it('deleting a group un-groups its diagrams instead of deleting them', async () => {
        const server = await startServerProcess();
        const groupId = testGroupId();
        const diagramId = testDiagramId();
        try {
            await fetch(`http://localhost:${server.port}/api/diagram-groups`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: groupId, name: 'to delete' }),
            });
            await fetch(`http://localhost:${server.port}/api/diagrams`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: diagramId,
                    name: 'member of the group',
                    databaseType: 'postgresql',
                }),
            });
            await fetch(`http://localhost:${server.port}/api/diagrams/${diagramId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ groupId }),
            });

            const deleteRes = await fetch(
                `http://localhost:${server.port}/api/diagram-groups/${groupId}`,
                { method: 'DELETE' }
            );
            expect(deleteRes.status).toBe(200);

            const getRes = await fetch(
                `http://localhost:${server.port}/api/diagrams/${diagramId}`
            );
            const diagram = await getRes.json();
            // The diagram itself survives — only its group membership is
            // cleared. This is the whole point of ON DELETE SET NULL over
            // CASCADE: losing an organizational label must never delete
            // real diagram data.
            expect(diagram).toMatchObject({
                id: diagramId,
                name: 'member of the group',
            });
            expect(diagram.groupId).toBeNull();
        } finally {
            await server.stop();
        }
    }, 20_000);
});
