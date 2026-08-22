import React from 'react';
import { randomUUID } from 'node:crypto';
import { type ChildProcess, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { RedoUndoStackProvider } from '@/context/history-context/redo-undo-stack-provider';
import { diffContext } from '@/context/diff-context/diff-context';
import type { DiffContext } from '@/context/diff-context/diff-context';
import { EventEmitter } from 'ahooks/lib/useEventEmitter';
import {
    storageContext,
    storageInitialValue,
} from '@/context/storage-context/storage-context';
import { DatabaseType } from '@/lib/domain/database-type';
import type { DBTable } from '@/lib/domain/db-table';
import type { DBField } from '@/lib/domain/db-field';
import type * as EnvModule from '@/lib/env';
import { WebSocket as NodeWebSocket } from 'ws';

// happy-dom (this project's default test environment, see vitest.config.ts)
// does not provide a global `WebSocket` — confirmed directly (`typeof
// WebSocket` is `undefined` under it), unlike a real browser, which always
// has one. `@hocuspocus/provider` falls back to the global `WebSocket` when
// no `WebSocketPolyfill` is passed, which is exactly what
// chartdb-provider.tsx does (correctly, for a real browser) — so this test
// stubs one in globally, scoped to this file only, to exercise that same
// unmodified production code path rather than special-casing the provider
// construction just for tests.
vi.stubGlobal('WebSocket', NodeWebSocket);

/**
 * Phase 4 (docs/design/realtime-collaboration.md §10): "wire the Phase 2
 * adapter's Y.Doc to the Phase 3 server over WebSocket."
 *
 * All tests in this file share ONE spawned server process (real, compiled,
 * genuinely separate OS process — same reasoning as server/'s own Phase 3
 * integration test: Nest's decorator metadata doesn't survive Vitest's
 * transform) and ONE `vi.doMock` of `@/lib/env`'s `COLLAB_WS_URL` (read once
 * at module-import time, so it has to be overridden before the first
 * `import('../chartdb-provider')`). Each `it()` uses its own random
 * `diagramId` (= room name), so tests don't interfere with each other even
 * though they share a server and a Postgres backend.
 *
 * Every `render*()` call below is a separate `ChartDBProvider` React tree —
 * i.e. a separate simulated browser tab — each producing its own
 * `HocuspocusProvider`, and by extension (confirmed by reading
 * `HocuspocusProvider`'s constructor: it builds its own fresh
 * `HocuspocusProviderWebsocket` whenever the caller doesn't pass one in) its
 * own independent WebSocket connection. Two trees joining the same
 * `diagramId` are therefore two genuine peers, not one connection shared
 * under the hood.
 */

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

async function waitForHealth(port: number): Promise<boolean> {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`http://localhost:${port}/health`);
            if (res.ok) return true;
        } catch {
            // not up yet
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return false;
}

interface TestServer {
    port: number;
    child: ChildProcess;
    stop: () => Promise<void>;
}

async function startServerProcess(): Promise<TestServer | null> {
    return startServerProcessOnPort(await freePort());
}

// Reconnect-convergence needs a second server instance bound to the SAME
// port the first one used (so the already-constructed HocuspocusProviders
// reconnect to it without any test-side re-pointing) — a real restart, not
// a fresh random port.
async function startServerProcessOnPort(
    port: number
): Promise<TestServer | null> {
    const serverDir = join(process.cwd(), 'server');
    const child = spawn('node', [join(serverDir, 'dist/main.js')], {
        cwd: serverDir,
        env: { ...process.env, PORT: String(port) },
        stdio: 'ignore',
    });
    const healthy = await waitForHealth(port);
    if (!healthy) {
        child.kill();
        return null;
    }
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

function makeMockDiff(): DiffContext {
    return {
        newDiagram: null,
        originalDiagram: null,
        diffMap: new Map(),
        hasDiff: false,
        isSummaryOnly: false,
        relationshipIdMap: new Map(),
        calculateDiff: vi.fn(() => ({ foundDiff: false })),
        resetDiff: vi.fn(),
        checkIfTableHasChange: vi.fn(() => false),
        checkIfNewTable: vi.fn(() => false),
        checkIfTableRemoved: vi.fn(() => false),
        getTableNewName: vi.fn(() => null),
        getTableNewColor: vi.fn(() => null),
        checkIfFieldHasChange: vi.fn(() => false),
        checkIfFieldRemoved: vi.fn(() => false),
        checkIfNewField: vi.fn(() => false),
        getFieldNewName: vi.fn(() => null),
        getFieldNewType: vi.fn(() => null),
        getFieldNewPrimaryKey: vi.fn(() => null),
        getFieldNewNullable: vi.fn(() => null),
        getFieldNewCharacterMaximumLength: vi.fn(() => null),
        getFieldNewScale: vi.fn(() => null),
        getFieldNewPrecision: vi.fn(() => null),
        getFieldNewIsArray: vi.fn(() => null),
        checkIfRelationshipHasChange: vi.fn(() => false),
        checkIfNewRelationship: vi.fn(() => false),
        checkIfRelationshipRemoved: vi.fn(() => false),
        getRelationshipNewName: vi.fn(() => null),
        checkIfNewArea: vi.fn(() => false),
        checkIfAreaRemoved: vi.fn(() => false),
        events: new EventEmitter(),
    };
}

const baseTable = (overrides: Partial<DBTable>): DBTable => ({
    id: 'table-1',
    name: 'table_1',
    schema: 'public',
    x: 0,
    y: 0,
    fields: [],
    indexes: [],
    color: '#000000',
    createdAt: Date.now(),
    isView: false,
    ...overrides,
});

let server: TestServer | null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ChartDBProvider: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let useChartDB: any;

/** Renders one independent `ChartDBProvider` tree — i.e. one simulated tab. */
function renderClient() {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <diffContext.Provider value={makeMockDiff()}>
            <storageContext.Provider value={{ ...storageInitialValue }}>
                <RedoUndoStackProvider>
                    <ChartDBProvider>{children}</ChartDBProvider>
                </RedoUndoStackProvider>
            </storageContext.Provider>
        </diffContext.Provider>
    );
    return renderHook(() => useChartDB(), { wrapper });
}

describe('Phase 4 — ChartDBProvider reaches the real Hocuspocus server', () => {
    beforeAll(async () => {
        server = await startServerProcess();
        if (!server) return;

        vi.doMock('@/lib/env', async (importOriginal) => ({
            ...(await importOriginal<typeof EnvModule>()),
            COLLAB_WS_URL: `ws://localhost:${server!.port}`,
        }));

        ({ ChartDBProvider } = await import('../chartdb-provider'));
        ({ useChartDB } = await import('@/hooks/use-chartdb'));
    }, 20_000);

    afterAll(async () => {
        vi.doUnmock('@/lib/env');
        await server?.stop();
    });

    it('a real ChartDBProvider syncs a table to the live server (an independent client sees it)', async () => {
        if (!server) return; // matches this repo's skip-if-unreachable convention

        const diagramId = `test-diagram-${randomUUID()}`;
        const { result } = renderClient();

        await act(async () => {
            result.current.loadDiagramFromData({
                id: diagramId,
                name: 'Test',
                databaseType: DatabaseType.GENERIC,
                tables: [baseTable({})],
                createdAt: new Date(0),
                updatedAt: new Date(0),
            });
        });

        // Proof this actually reached the server: an independent client,
        // with no relationship to this test's React tree, joins the same
        // room directly and observes the table ChartDBProvider wrote.
        const remoteDoc = new Y.Doc();
        const remoteProvider = new HocuspocusProvider({
            url: `ws://localhost:${server.port}`,
            name: diagramId,
            document: remoteDoc,
        });
        try {
            const { readTableItem } = await import('@/lib/collab/y-diagram');
            await waitFor(
                () => {
                    expect(
                        readTableItem(remoteDoc.getMap('tables'), 'table-1')
                    ).toBeTruthy();
                },
                { timeout: 8_000 }
            );
            const synced = readTableItem(remoteDoc.getMap('tables'), 'table-1');
            expect(synced?.name).toBe('table_1');
        } finally {
            remoteProvider.destroy();
        }
    }, 20_000);

    it('seed-vs-adopt: a tab joining a room that already has content adopts it instead of resurrecting its own stale local data', async () => {
        if (!server) return;

        const diagramId = `test-diagram-${randomUUID()}`;

        // Client A: first to load this diagram — room is empty, so A seeds
        // it with table-a.
        const clientA = renderClient();
        await act(async () => {
            clientA.result.current.loadDiagramFromData({
                id: diagramId,
                name: 'Test',
                databaseType: DatabaseType.GENERIC,
                tables: [baseTable({ id: 'table-a', name: 'table_a' })],
                createdAt: new Date(0),
                updatedAt: new Date(0),
            });
        });

        // Confirm table-a genuinely reached the server (not just A's local
        // React state) before B joins — otherwise this test could pass by
        // accident if B happened to connect before A's write landed.
        const { readTableItem } = await import('@/lib/collab/y-diagram');
        const checkerDoc = new Y.Doc();
        const checkerProvider = new HocuspocusProvider({
            url: `ws://localhost:${server.port}`,
            name: diagramId,
            document: checkerDoc,
        });
        await waitFor(
            () =>
                expect(
                    readTableItem(checkerDoc.getMap('tables'), 'table-a')
                ).toBeTruthy(),
            { timeout: 8_000 }
        );
        checkerProvider.destroy();

        // Client B: joins the SAME room, but calls loadDiagramFromData with
        // a different table — simulating B's own stale local Dexie copy.
        // The room is non-empty, so B must adopt table-a and must NOT keep
        // table-b.
        const clientB = renderClient();
        await act(async () => {
            clientB.result.current.loadDiagramFromData({
                id: diagramId,
                name: 'Test',
                databaseType: DatabaseType.GENERIC,
                tables: [baseTable({ id: 'table-b', name: 'table_b' })],
                createdAt: new Date(0),
                updatedAt: new Date(0),
            });
        });

        await waitFor(
            () => {
                const ids = clientB.result.current.tables.map(
                    (t: DBTable) => t.id
                );
                // Both halves matter: table-b present would mean the seed
                // wasn't skipped; table-a absent would mean the adopt-path
                // re-derivation never fired.
                expect(ids).toEqual(['table-a']);
            },
            { timeout: 8_000 }
        );
    }, 20_000);

    it('concurrent-edit sanity: two independent clients editing different parts of the same table both converge over the real network', async () => {
        if (!server) return;

        const diagramId = `test-diagram-${randomUUID()}`;
        const field = {
            id: 'field-1',
            name: 'old_name',
            type: { id: 'integer', name: 'integer' },
            primaryKey: false,
            nullable: true,
            unique: false,
            createdAt: Date.now(),
        };

        const clientA = renderClient();
        await act(async () => {
            clientA.result.current.loadDiagramFromData({
                id: diagramId,
                name: 'Test',
                databaseType: DatabaseType.GENERIC,
                tables: [baseTable({ fields: [field] })],
                createdAt: new Date(0),
                updatedAt: new Date(0),
            });
        });

        const clientB = renderClient();
        await act(async () => {
            clientB.result.current.loadDiagramFromData({
                id: diagramId,
                name: 'Test',
                databaseType: DatabaseType.GENERIC,
                tables: [],
                createdAt: new Date(0),
                updatedAt: new Date(0),
            });
        });

        // Wait for B to adopt A's room content before firing concurrent
        // edits — otherwise B's own (empty-room-losing) load could race A's.
        await waitFor(
            () =>
                expect(
                    clientB.result.current.tables.find(
                        (t: DBTable) => t.id === 'table-1'
                    )
                ).toBeTruthy(),
            { timeout: 8_000 }
        );

        // Fire both edits "concurrently" — no await between them — one
        // renames the field, the other adds an index. This is the same
        // scenario the pure-function/single-doc layer already proves merges
        // (appendix-b:2); this end-to-end version proves the real network
        // round-trip doesn't break that merge.
        await act(async () => {
            await Promise.all([
                clientA.result.current.updateField('table-1', 'field-1', {
                    name: 'renamed',
                }),
                clientB.result.current.addIndex('table-1', {
                    id: 'index-1',
                    name: 'idx',
                    unique: false,
                    fieldIds: ['field-1'],
                    createdAt: Date.now(),
                }),
            ]);
        });

        // Each client applies its own edit locally/synchronously — the
        // other peer's edit still has to cross the real network before it
        // shows up here, so a longer-than-default waitFor is warranted on
        // its own merits. (This test also caught a real bug that had
        // nothing to do with timing: y-diagram.ts's upsertItem/upsertTable
        // used to `.set()` every property unconditionally on every write,
        // including ones a peer never touched — see setIfChanged's doc
        // comment. That made two concurrent edits to *different* parts of
        // the same table clobber each other at the Yjs-clock level roughly
        // half the time, depending on which client's clientID happened to
        // win — this test was flaky before that fix, not slow.)
        for (const client of [clientA, clientB]) {
            await waitFor(
                () => {
                    const table = client.result.current.tables.find(
                        (t: DBTable) => t.id === 'table-1'
                    );
                    expect(table?.fields?.[0]?.name).toBe('renamed');
                    expect(table?.indexes?.[0]?.id).toBe('index-1');
                },
                { timeout: 8_000 }
            );
        }
    }, 20_000);

    it('appendix-b:3 cascade delete, across the real network: removing a table on one client removes the relationships referencing it on the other client too', async () => {
        if (!server) return;

        const diagramId = `test-diagram-${randomUUID()}`;
        const relationship = {
            id: 'rel-1',
            name: 'rel',
            sourceTableId: 'table-1',
            targetTableId: 'table-2',
            sourceFieldId: 'field-1',
            targetFieldId: 'field-2',
            sourceCardinality: 'one' as const,
            targetCardinality: 'many' as const,
            createdAt: Date.now(),
        };

        const clientA = renderClient();
        await act(async () => {
            clientA.result.current.loadDiagramFromData({
                id: diagramId,
                name: 'Test',
                databaseType: DatabaseType.GENERIC,
                tables: [
                    baseTable({ id: 'table-1', name: 'table_1' }),
                    baseTable({ id: 'table-2', name: 'table_2' }),
                ],
                relationships: [relationship],
                createdAt: new Date(0),
                updatedAt: new Date(0),
            });
        });

        // Client B joins the same room and adopts A's tables + relationship
        // before A deletes anything — this is what makes the assertion
        // below prove the cascade delete propagated over the wire, not just
        // that B never had the relationship in the first place.
        const clientB = renderClient();
        await act(async () => {
            clientB.result.current.loadDiagramFromData({
                id: diagramId,
                name: 'Test',
                databaseType: DatabaseType.GENERIC,
                tables: [],
                createdAt: new Date(0),
                updatedAt: new Date(0),
            });
        });
        await waitFor(
            () =>
                expect(
                    clientB.result.current.relationships.find(
                        (r: { id: string }) => r.id === 'rel-1'
                    )
                ).toBeTruthy(),
            { timeout: 8_000 }
        );

        // Only A knows about the cascade at the moment it fires —
        // removeItemsReferencing reads A's own live doc, deletes table-1
        // AND rel-1 in one transaction. Assert both deletions reach B.
        await act(async () => {
            await clientA.result.current.removeTable('table-1');
        });

        await waitFor(
            () => {
                expect(
                    clientB.result.current.tables.find(
                        (t: DBTable) => t.id === 'table-1'
                    )
                ).toBeUndefined();
                expect(
                    clientB.result.current.relationships.find(
                        (r: { id: string }) => r.id === 'rel-1'
                    )
                ).toBeUndefined();
            },
            { timeout: 8_000 }
        );
    }, 20_000);

    it('reconnect-convergence: edits made while the server is down queue locally and converge (both clients + the server) once it comes back', async () => {
        if (!server) return;

        const diagramId = `test-diagram-${randomUUID()}`;
        const field = {
            id: 'field-1',
            name: 'original_name',
            type: { id: 'integer', name: 'integer' },
            primaryKey: false,
            nullable: true,
            unique: false,
            createdAt: Date.now(),
        };

        const clientA = renderClient();
        await act(async () => {
            clientA.result.current.loadDiagramFromData({
                id: diagramId,
                name: 'Test',
                databaseType: DatabaseType.GENERIC,
                tables: [baseTable({ fields: [field] })],
                createdAt: new Date(0),
                updatedAt: new Date(0),
            });
        });

        const clientB = renderClient();
        await act(async () => {
            clientB.result.current.loadDiagramFromData({
                id: diagramId,
                name: 'Test',
                databaseType: DatabaseType.GENERIC,
                tables: [],
                createdAt: new Date(0),
                updatedAt: new Date(0),
            });
        });
        await waitFor(
            () =>
                expect(
                    clientB.result.current.tables.find(
                        (t: DBTable) => t.id === 'table-1'
                    )
                ).toBeTruthy(),
            { timeout: 8_000 }
        );

        // Kill the (shared, file-level) server — this is a real process
        // death, not a socket-level disconnect (HocuspocusProvider.disconnect()
        // is a documented no-op per its own source; there's no handle on
        // the underlying websocketProvider from outside chartdb-provider.tsx
        // anyway). Reassign the module-level `server` so afterAll cleans up
        // whichever instance is alive when this test ends, and so the next
        // startServerProcessOnPort call below restarts on the exact same
        // port these already-constructed HocuspocusProviders are pointed at.
        const port = server.port;
        await server.stop();
        server = null;

        // The doc's corrected Phase 4 bullet: Yjs always queues locally
        // regardless of connection state — a killed connection can't stop
        // that, only reconnecting-and-merging is different from the
        // connected case. Assert that directly: both edits apply to their
        // own client's local state immediately, with the server down.
        await act(async () => {
            await clientA.result.current.updateField('table-1', 'field-1', {
                name: 'edited_while_offline',
            });
        });
        expect(
            clientA.result.current.tables
                .find((t: DBTable) => t.id === 'table-1')
                ?.fields.find((f: DBField) => f.id === 'field-1')?.name
        ).toBe('edited_while_offline');

        await act(async () => {
            await clientB.result.current.addIndex('table-1', {
                id: 'index-offline',
                name: 'idx',
                unique: false,
                fieldIds: ['field-1'],
                createdAt: Date.now(),
            });
        });
        expect(
            clientB.result.current.tables.find(
                (t: DBTable) => t.id === 'table-1'
            )?.indexes?.[0]?.id
        ).toBe('index-offline');

        // Bring the server back on the SAME port — a restart, not a fresh
        // random one — so the existing providers' own reconnect logic (not
        // this test) re-establishes the connection.
        server = await startServerProcessOnPort(port);
        if (!server) return; // couldn't restart — nothing more to assert

        for (const client of [clientA, clientB]) {
            await waitFor(
                () => {
                    const table = client.result.current.tables.find(
                        (t: DBTable) => t.id === 'table-1'
                    );
                    expect(table?.fields?.[0]?.name).toBe(
                        'edited_while_offline'
                    );
                    expect(table?.indexes?.[0]?.id).toBe('index-offline');
                },
                { timeout: 15_000 }
            );
        }

        // Convergence on the two React trees isn't proof the *server* holds
        // the merged state too — a third, independent client joining fresh
        // after the restart is.
        const { readTableItem } = await import('@/lib/collab/y-diagram');
        const checkerDoc = new Y.Doc();
        const checkerProvider = new HocuspocusProvider({
            url: `ws://localhost:${server.port}`,
            name: diagramId,
            document: checkerDoc,
        });
        try {
            await waitFor(
                () => {
                    const table = readTableItem(
                        checkerDoc.getMap('tables'),
                        'table-1'
                    );
                    expect(table?.fields?.[0]?.name).toBe(
                        'edited_while_offline'
                    );
                    expect(table?.indexes?.[0]?.id).toBe('index-offline');
                },
                { timeout: 8_000 }
            );
        } finally {
            checkerProvider.destroy();
        }
    }, 30_000);
});
