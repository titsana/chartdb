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
                'add_relationship',
                'create_diagram',
                'get_diagram',
                'list_diagrams',
                'remove_relationship',
                'remove_table',
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

    it('relationships, indexes, remove_table and the large-diagram summary', async () => {
        const server = await startServer();
        try {
            const client = await mcpClient(server.port);
            const call = async (name: string, args: Record<string, unknown>) =>
                parse(await client.callTool({ name, arguments: args }));
            const callRaw = (name: string, args: Record<string, unknown>) =>
                client.callTool({ name, arguments: args });

            const { id: diagramId } = await call('create_diagram', {
                name: 'test-mcp-created',
            });
            const customers = await call('upsert_table', {
                diagramId,
                name: 'customers',
                fields: [
                    {
                        name: 'id',
                        type: 'uuid',
                        primaryKey: true,
                        nullable: false,
                    },
                ],
            });
            const orders = await call('upsert_table', {
                diagramId,
                name: 'orders',
                fields: [
                    {
                        name: 'id',
                        type: 'uuid',
                        primaryKey: true,
                        nullable: false,
                    },
                    { name: 'customer_id', type: 'uuid' },
                ],
                indexes: [
                    {
                        name: 'orders_customer_idx',
                        fieldNames: ['customer_id'],
                    },
                ],
            });
            expect(
                orders.indexes.map((i: { name: string }) => i.name)
            ).toContain('orders_customer_idx');
            const badIndex = await callRaw('upsert_table', {
                diagramId,
                tableId: orders.id,
                name: 'orders',
                fields: orders.fields,
                indexes: [{ name: 'x', fieldNames: ['nope'] }],
            });
            expect(badIndex.isError).toBe(true);

            const added = await call('add_relationship', {
                diagramId,
                fromTable: 'orders',
                fromField: 'customer_id',
                toTable: 'customers',
                toField: 'id',
            });
            expect(added.existed).toBe(false);
            expect(added.relationship).toMatchObject({
                from: 'orders.customer_id',
                to: 'customers.id',
                type: 'many_to_one',
            });
            // one_to_one: FK still on fromField
            const profiles = await call('upsert_table', {
                diagramId,
                name: 'profiles',
                fields: [
                    {
                        name: 'id',
                        type: 'uuid',
                        primaryKey: true,
                        nullable: false,
                    },
                    { name: 'customer_id', type: 'uuid', unique: true },
                ],
            });
            const oneToOne = await call('add_relationship', {
                diagramId,
                fromTable: 'profiles',
                fromField: 'customer_id',
                toTable: 'customers',
                toField: 'id',
                type: 'one_to_one',
            });
            expect(oneToOne.relationship).toMatchObject({
                from: 'profiles.customer_id',
                to: 'customers.id',
                type: 'one_to_one',
            });
            await call('remove_relationship', {
                diagramId,
                relationshipId: oneToOne.relationship.id,
            });
            await call('remove_table', { diagramId, tableId: profiles.id });

            const again = await call('add_relationship', {
                diagramId,
                fromTable: 'orders',
                fromField: 'customer_id',
                toTable: 'customers',
                toField: 'id',
            });
            expect(again).toMatchObject({
                existed: true,
                relationship: { id: added.relationship.id },
            });
            expect(
                (
                    await callRaw('add_relationship', {
                        diagramId,
                        fromTable: 'nope',
                        fromField: 'id',
                        toTable: 'customers',
                        toField: 'id',
                    })
                ).isError
            ).toBe(true);

            const ordersOnly = await call('get_diagram', {
                diagramId,
                tableNames: ['orders', 'ghost'],
            });
            expect(
                ordersOnly.tables.map((t: { name: string }) => t.name)
            ).toEqual(['orders']);
            expect(ordersOnly.relationships).toHaveLength(1);
            expect(ordersOnly.notFound).toHaveLength(1);

            // dropping customer_id takes its relationship with it
            await call('upsert_table', {
                diagramId,
                tableId: orders.id,
                name: 'orders',
                fields: [
                    {
                        id: orders.fields[0].id,
                        name: 'id',
                        type: 'uuid',
                        primaryKey: true,
                        nullable: false,
                    },
                ],
            });
            expect(
                (await call('get_diagram', { diagramId })).relationshipCount
            ).toBe(0);

            // remove_relationship, then remove_table cascades
            await call('upsert_table', {
                diagramId,
                tableId: orders.id,
                name: 'orders',
                fields: orders.fields,
            });
            const rel = await call('add_relationship', {
                diagramId,
                fromTable: 'orders',
                fromField: 'customer_id',
                toTable: 'customers',
                toField: 'id',
            });
            await call('remove_relationship', {
                diagramId,
                relationshipId: rel.relationship.id,
            });
            expect(
                (await call('get_diagram', { diagramId })).relationshipCount
            ).toBe(0);
            await call('add_relationship', {
                diagramId,
                fromTable: 'orders',
                fromField: 'customer_id',
                toTable: 'customers',
                toField: 'id',
            });
            const removed = await call('remove_table', {
                diagramId,
                tableId: customers.id,
            });
            expect(removed).toEqual({
                removed: 'customers',
                relationshipsRemoved: 1,
            });
            const after = await call('get_diagram', { diagramId });
            expect(after.tables.map((t: { name: string }) => t.name)).toEqual([
                'orders',
            ]);
            expect(after.relationshipCount).toBe(0);

            // > 30 tables: summary unless tableNames is given
            for (let i = 0; i < 30; i++) {
                await call('upsert_table', {
                    diagramId,
                    name: `t${i}`,
                    fields: [{ name: 'id', type: 'int' }],
                });
            }
            const summary = await call('get_diagram', { diagramId });
            expect(summary.tableCount).toBe(31);
            expect(summary.note).toBeDefined();
            expect(summary.tables[0].fields).toBeUndefined();
            const detail = await call('get_diagram', {
                diagramId,
                tableNames: ['t7'],
            });
            expect(detail.tables[0].fields[0].name).toBe('id');
            await client.close();
        } finally {
            await server.stop();
        }
    }, 60_000);

    it('read-after-write across separate connections; reads add no log rows', async () => {
        // Each tool call opens and closes its own direct connection, so with
        // no browser in the room the document can unload between calls.
        // Smoke test for that path (it did not reproduce the one unexplained
        // empty read seen in a heavily loaded run).
        const server = await startServer();
        try {
            const client = await mcpClient(server.port);
            const { id: diagramId } = parse(
                await client.callTool({
                    name: 'create_diagram',
                    arguments: { name: 'test-mcp-created' },
                })
            );
            for (let i = 1; i <= 25; i++) {
                parse(
                    await client.callTool({
                        name: 'upsert_table',
                        arguments: {
                            diagramId,
                            name: `s${i}`,
                            fields: [{ name: 'id', type: 'int' }],
                        },
                    })
                );
                const d = parse(
                    await client.callTool({
                        name: 'get_diagram',
                        arguments: { diagramId, summaryOnly: true },
                    })
                );
                expect(d.tableCount, `after write ${i}`).toBe(i);
            }

            // get_diagram must not append to the durable log. Rename a table
            // first so the doc has deletions: a state-vector diff would carry
            // that delete set even when nothing changed.
            const { tables } = parse(
                await client.callTool({
                    name: 'get_diagram',
                    arguments: { diagramId, tableNames: ['s1'] },
                })
            );
            parse(
                await client.callTool({
                    name: 'upsert_table',
                    arguments: {
                        diagramId,
                        tableId: tables[0].id,
                        name: 's1_renamed',
                        fields: tables[0].fields,
                    },
                })
            );
            const pool = createPool(loadConfig().databaseUrl);
            try {
                const count = async () =>
                    Number(
                        (
                            await pool.query(
                                'SELECT count(*) FROM yjs_updates WHERE diagram_id = $1',
                                [diagramId]
                            )
                        ).rows[0].count
                    );
                const before = await count();
                await client.callTool({
                    name: 'get_diagram',
                    arguments: { diagramId },
                });
                await client.callTool({ name: 'list_diagrams', arguments: {} });
                expect(await count()).toBe(before);
            } finally {
                await pool.end();
            }
            await client.close();
        } finally {
            await server.stop();
        }
    }, 60_000);
});
