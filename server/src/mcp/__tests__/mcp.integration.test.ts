import { randomUUID } from 'node:crypto';
import { type ChildProcess, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterAll, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createPool } from '../../db/pool';
import { loadConfig } from '../../config';

/**
 * MCP spike: tools write through a Hocuspocus direct connection, so the
 * claims to prove are (1) a browser already in the room sees the edit
 * live, and (2) it's durable — a FRESH server process (nothing cached in
 * memory) reads it back from Postgres. Spawns the compiled dist/main.js
 * like collab.integration.test.ts does (Nest DI doesn't survive vitest's
 * transform). Skips without a reachable Postgres — check the output says
 * "passed", not "skipped".
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

interface TestServer {
    port: number;
    log: () => string;
    stop: () => Promise<void>;
}

async function startServer(): Promise<TestServer> {
    const port = await freePort();
    const child: ChildProcess = spawn(
        'node',
        [join(process.cwd(), 'dist/main.js')],
        {
            env: {
                ...process.env,
                PORT: String(port),
                AUTH_MODE: 'public',
                WEBSOCKET_ORIGIN_ALLOWLIST: '',
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
            if ((await fetch(`http://localhost:${port}/health`)).ok) break;
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
        port,
        log: () => output,
        stop: () =>
            new Promise((resolve) => {
                child.once('exit', () => resolve());
                child.kill();
            }),
    };
}

async function mcpClient(port: number): Promise<Client> {
    const client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(
        new StreamableHTTPClientTransport(
            new URL(`http://localhost:${port}/api/mcp`)
        )
    );
    return client;
}

function parse(result: Awaited<ReturnType<Client['callTool']>>) {
    const content = result.content as Array<{ type: string; text: string }>;
    if (result.isError) throw new Error(content[0].text);
    return JSON.parse(content[0].text);
}

function waitFor(check: () => boolean, label: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(label)), 8_000);
        const tick = () => {
            if (check()) {
                clearTimeout(timer);
                resolve();
            } else setTimeout(tick, 50);
        };
        tick();
    });
}

describe.skipIf(!databaseReachable)('MCP endpoint', () => {
    afterAll(async () => {
        const pool = createPool(loadConfig().databaseUrl);
        await pool.query(
            "DELETE FROM collab_diagrams WHERE name = 'test-mcp-created'"
        );
        await pool.query('DELETE FROM collab_diagrams WHERE id LIKE $1', [
            'test-mcp-%',
        ]);
        await pool.end();
    });

    it('upsert_table reaches a live peer and survives a server restart', async () => {
        const diagramId = `test-mcp-${randomUUID()}`;
        let server = await startServer();
        try {
            const created = await fetch(
                `http://localhost:${server.port}/api/diagrams`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: diagramId,
                        name: 'mcp test',
                        databaseType: 'postgresql',
                    }),
                }
            );
            expect(created.status).toBe(201);

            // a browser already sitting in the room
            const peerDoc = new Y.Doc();
            const peer = new HocuspocusProvider({
                url: `ws://localhost:${server.port}`,
                name: diagramId,
                document: peerDoc,
            });
            await waitFor(() => peer.synced, 'peer never synced');

            const client = await mcpClient(server.port);
            const { tools } = await client.listTools();
            expect(tools.map((t) => t.name).sort()).toEqual([
                'create_diagram',
                'get_diagram',
                'list_diagrams',
                'upsert_table',
            ]);

            const table = parse(
                await client.callTool({
                    name: 'upsert_table',
                    arguments: {
                        diagramId,
                        name: 'customers',
                        fields: [
                            {
                                name: 'id',
                                type: 'uuid',
                                primaryKey: true,
                                nullable: false,
                            },
                            { name: 'email', type: 'varchar' },
                        ],
                    },
                })
            );

            await waitFor(
                () => peerDoc.getMap('tables').has(table.id),
                `peer never saw the table\n${server.log()}`
            );

            // reorder through the same tool — field order must stick
            parse(
                await client.callTool({
                    name: 'upsert_table',
                    arguments: {
                        diagramId,
                        tableId: table.id,
                        name: 'customers',
                        fields: [
                            {
                                id: table.fields[1].id,
                                name: 'email',
                                type: 'varchar',
                            },
                            {
                                id: table.fields[0].id,
                                name: 'id',
                                type: 'uuid',
                                primaryKey: true,
                                nullable: false,
                            },
                        ],
                    },
                })
            );

            await client.close();
            peer.destroy();
        } finally {
            await server.stop();
        }

        server = await startServer();
        try {
            const client = await mcpClient(server.port);
            const diagram = parse(
                await client.callTool({
                    name: 'get_diagram',
                    arguments: { diagramId },
                })
            );
            expect(diagram.tables).toHaveLength(1);
            expect(diagram.tables[0].name).toBe('customers');
            expect(
                diagram.tables[0].fields.map((f: { name: string }) => f.name)
            ).toEqual(['email', 'id']);
            await client.close();
        } finally {
            await server.stop();
        }
    }, 30_000);

    it('create_diagram makes an empty diagram that upsert_table can fill', async () => {
        const server = await startServer();
        try {
            const client = await mcpClient(server.port);
            const created = parse(
                await client.callTool({
                    name: 'create_diagram',
                    arguments: {
                        name: 'test-mcp-created',
                        databaseType: 'mysql',
                    },
                })
            );
            expect(created.name).toBe('test-mcp-created');
            expect(created.databaseType).toBe('mysql');

            const bad = await client.callTool({
                name: 'create_diagram',
                arguments: {
                    name: 'test-mcp-created',
                    databaseType: 'nosuchdb',
                },
            });
            expect(bad.isError).toBe(true);

            parse(
                await client.callTool({
                    name: 'upsert_table',
                    arguments: {
                        diagramId: created.id,
                        name: 'orders',
                        fields: [
                            {
                                name: 'id',
                                type: 'int',
                                primaryKey: true,
                                nullable: false,
                            },
                        ],
                    },
                })
            );
            const diagram = parse(
                await client.callTool({
                    name: 'get_diagram',
                    arguments: { diagramId: created.id },
                })
            );
            expect(diagram.tables.map((t: { name: string }) => t.name)).toEqual(
                ['orders']
            );
            const list = parse(
                await client.callTool({ name: 'list_diagrams', arguments: {} })
            );
            expect(list.map((d: { id: string }) => d.id)).toContain(created.id);
            await client.close();
        } finally {
            await server.stop();
        }
    }, 30_000);
});
