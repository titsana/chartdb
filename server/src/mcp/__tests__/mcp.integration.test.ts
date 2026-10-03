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

    it('upsert_table reaches a live peer, reorders by name and survives a restart', async () => {
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
                'add_field',
                'add_relationship',
                'create_diagram',
                'get_diagram',
                'list_diagrams',
                'remove_field',
                'remove_relationship',
                'remove_table',
                'update_field',
                'upsert_table',
            ]);
            const getDiagram = tools.find((t) => t.name === 'get_diagram')!;
            // declared with descriptions, so clients know to use them
            const props = getDiagram.inputSchema.properties as Record<
                string,
                { description?: string }
            >;
            expect(props.tableNames.description).toBeTruthy();
            expect(props.summaryOnly.description).toBeTruthy();

            const result = parse(
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
            // writes answer briefly, not with the whole table
            expect(result).toEqual({
                id: expect.any(String),
                name: 'customers',
                fieldCount: 2,
                indexCount: 0,
                created: true,
            });
            await waitFor(
                () => peerDoc.getMap('tables').has(result.id),
                `peer never saw the table\n${server.log()}`
            );

            // same name = same table; new order sticks, ids are kept by name
            const again = parse(
                await client.callTool({
                    name: 'upsert_table',
                    arguments: {
                        diagramId,
                        name: 'customers',
                        fields: [
                            { name: 'email', type: 'varchar' },
                            {
                                name: 'id',
                                type: 'uuid',
                                primaryKey: true,
                                nullable: false,
                            },
                        ],
                    },
                })
            );
            expect(again).toMatchObject({ id: result.id, created: false });

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
            expect(diagram.tables).toEqual([
                {
                    id: expect.any(String),
                    name: 'customers',
                    fields: [
                        { name: 'email', type: 'varchar' },
                        {
                            name: 'id',
                            type: 'uuid',
                            primaryKey: true,
                            nullable: false,
                        },
                    ],
                },
            ]);
            await client.close();
        } finally {
            await server.stop();
        }
    }, 30_000);

    it('column tools, relationships, remove_table and the summary', async () => {
        const server = await startServer();
        try {
            const client = await mcpClient(server.port);
            const call = async (name: string, args: Record<string, unknown>) =>
                parse(await client.callTool({ name, arguments: args }));
            const fails = async (name: string, args: Record<string, unknown>) =>
                (await client.callTool({ name, arguments: args })).isError;
            const table = async (diagramId: string, name: string) =>
                (await call('get_diagram', { diagramId, tableNames: [name] }))
                    .tables[0];

            const created = await call('create_diagram', {
                name: 'test-mcp-created',
                databaseType: 'mysql',
            });
            expect(created).toMatchObject({
                name: 'test-mcp-created',
                databaseType: 'mysql',
            });
            expect(
                await fails('create_diagram', {
                    name: 'x',
                    databaseType: 'nosuchdb',
                })
            ).toBe(true);
            const diagramId = created.id;

            await call('upsert_table', {
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
            await call('upsert_table', {
                diagramId,
                name: 'orders',
                fields: [
                    {
                        name: 'id',
                        type: 'uuid',
                        primaryKey: true,
                        nullable: false,
                    },
                    {
                        name: 'note',
                        type: 'varchar',
                        characterMaximumLength: '50',
                        default: "'n/a'",
                    },
                ],
                indexes: [{ name: 'orders_note_idx', fieldNames: ['note'] }],
            });
            expect(
                await fails('upsert_table', {
                    diagramId,
                    name: 'orders',
                    fields: [{ name: 'id', type: 'uuid' }],
                    indexes: [{ name: 'x', fieldNames: ['nope'] }],
                })
            ).toBe(true);

            // add_field after a column; update_field renames and clears
            await call('add_field', {
                diagramId,
                table: 'orders',
                field: { name: 'customer_id', type: 'uuid' },
                after: 'id',
            });
            expect(
                await fails('add_field', {
                    diagramId,
                    table: 'orders',
                    field: { name: 'id', type: 'int' },
                })
            ).toBe(true);
            await call('update_field', {
                diagramId,
                table: 'orders',
                field: 'note',
                changes: { name: 'memo', default: null, type: 'text' },
            });
            let orders = await table(diagramId, 'orders');
            expect(orders.fields).toEqual([
                { name: 'id', type: 'uuid', primaryKey: true, nullable: false },
                { name: 'customer_id', type: 'uuid' },
                { name: 'memo', type: 'text', characterMaximumLength: '50' },
            ]);
            expect(orders.indexes).toEqual([
                { name: 'orders_note_idx', fieldNames: ['memo'] },
            ]);

            // a field read back round-trips into upsert_table unchanged
            await call('upsert_table', {
                diagramId,
                name: 'orders',
                fields: orders.fields,
            });
            expect((await table(diagramId, 'orders')).fields).toEqual(
                orders.fields
            );

            const rel = await call('add_relationship', {
                diagramId,
                fromTable: 'orders',
                fromField: 'customer_id',
                toTable: 'customers',
                toField: 'id',
            });
            expect(rel).toMatchObject({
                from: 'orders.customer_id',
                to: 'customers.id',
                type: 'many_to_one',
                existed: false,
            });
            expect(
                await call('add_relationship', {
                    diagramId,
                    fromTable: 'orders',
                    fromField: 'customer_id',
                    toTable: 'customers',
                    toField: 'id',
                })
            ).toMatchObject({ id: rel.id, existed: true });

            // one_to_one keeps the FK on fromField
            await call('upsert_table', {
                diagramId,
                name: 'profiles',
                fields: [{ name: 'customer_id', type: 'uuid', unique: true }],
            });
            const oneToOne = await call('add_relationship', {
                diagramId,
                fromTable: 'profiles',
                fromField: 'customer_id',
                toTable: 'customers',
                toField: 'id',
                type: 'one_to_one',
            });
            expect(oneToOne).toMatchObject({
                from: 'profiles.customer_id',
                to: 'customers.id',
                type: 'one_to_one',
            });
            await call('remove_relationship', {
                diagramId,
                relationshipId: oneToOne.id,
            });

            // summary: names, column counts, relationship lines
            const summary = await call('get_diagram', {
                diagramId,
                summaryOnly: true,
            });
            expect(summary).toEqual({
                name: 'test-mcp-created',
                summary: true,
                tables: [
                    ['customers', 1],
                    ['orders', 3],
                    ['profiles', 1],
                ],
                relationships: ['orders.customer_id->customers.id'],
            });

            // remove_field drops the relationship and indexes using it
            await call('remove_field', {
                diagramId,
                table: 'orders',
                field: 'customer_id',
            });
            expect(
                (await call('get_diagram', { diagramId, summaryOnly: true }))
                    .relationships
            ).toEqual([]);
            await call('remove_field', {
                diagramId,
                table: 'orders',
                field: 'memo',
            });
            orders = await table(diagramId, 'orders');
            expect(orders.indexes).toBeUndefined();
            expect(
                await fails('remove_field', {
                    diagramId,
                    table: 'orders',
                    field: 'id',
                })
            ).toBe(true);

            // remove_table by name cascades relationships
            await call('add_field', {
                diagramId,
                table: 'orders',
                field: { name: 'customer_id', type: 'uuid' },
            });
            await call('add_relationship', {
                diagramId,
                fromTable: 'orders',
                fromField: 'customer_id',
                toTable: 'customers',
                toField: 'id',
            });
            expect(
                await call('remove_table', { diagramId, table: 'customers' })
            ).toEqual({
                removed: 'customers',
                relationshipsRemoved: 1,
            });

            // > 30 tables: summary unless tableNames is given
            for (let i = 0; i < 30; i++) {
                await call('upsert_table', {
                    diagramId,
                    name: `t${i}`,
                    fields: [{ name: 'id', type: 'int' }],
                });
            }
            const big = await call('get_diagram', { diagramId });
            expect(big.summary).toBe(true);
            expect(big.tables).toHaveLength(32);
            expect((await table(diagramId, 't7')).fields).toEqual([
                { name: 'id', type: 'int' },
            ]);
            await client.close();
        } finally {
            await server.stop();
        }
    }, 60_000);

    it('read-after-write across separate connections; reads add no log rows', async () => {
        // Each tool call opens and closes its own direct connection, so with
        // no browser in the room the document can unload between calls.
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
                expect(d.tables, `after write ${i}`).toHaveLength(i);
            }

            // get_diagram must not append to the durable log. Change a column
            // first so the doc has deletions: a state-vector diff would carry
            // that delete set even when nothing changed.
            parse(
                await client.callTool({
                    name: 'update_field',
                    arguments: {
                        diagramId,
                        table: 's1',
                        field: 'id',
                        changes: { name: 'key' },
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
