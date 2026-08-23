import React from 'react';
import { randomUUID } from 'node:crypto';
import { type ChildProcess, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
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

/**
 * Phase 4.5 (docs/design/realtime-collaboration.md §10): yjs_updates/
 * yjs_snapshots now FK-reference collab_diagrams(id) (see server/src/db/
 * pool.ts's migrate()) — a diagramId this test invents and hands straight
 * to loadDiagramFromData can't hold any Y.Doc content until it's registered
 * server-side first. Goes through the real REST endpoint (not a raw SQL
 * insert) since that's what production code (seedDiagramRoom / the
 * creation dialogs) actually does — exercising the same path this test is
 * otherwise relying on.
 */
async function registerTestDiagram(port: number, diagramId: string) {
    const res = await fetch(`http://localhost:${port}/diagrams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            id: diagramId,
            name: 'test',
            databaseType: DatabaseType.GENERIC,
        }),
    });
    if (!res.ok) {
        throw new Error(
            `failed to register test diagram ${diagramId}: ${res.status}`
        );
    }
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let seedDiagramRoom: any;

/** Renders one independent `ChartDBProvider` tree — i.e. one simulated tab. */
function renderClient() {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <diffContext.Provider value={makeMockDiff()}>
            <storageContext.Provider value={{ ...storageInitialValue }}>
                <ChartDBProvider>{children}</ChartDBProvider>
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
            // COLLAB_API_URL is derived from COLLAB_WS_URL inside env.ts
            // itself (module-load time) — importOriginal()'s copy was
            // already derived from the real default before this override
            // applies, so it has to be overridden explicitly too, or any
            // test that exercises storage-provider's REST calls would
            // silently hit the wrong port. Nothing in this file does that
            // today (renderClient injects storageInitialValue, not the
            // real StorageProvider) but the next test that does shouldn't
            // have to rediscover this.
            COLLAB_API_URL: `http://localhost:${server!.port}`,
        }));

        ({ ChartDBProvider } = await import('../chartdb-provider'));
        ({ useChartDB } = await import('@/hooks/use-chartdb'));
        ({ seedDiagramRoom } = await import('@/lib/collab/seed-diagram-room'));
    }, 20_000);

    afterAll(async () => {
        vi.doUnmock('@/lib/env');
        await server?.stop();
    });

    it('a real ChartDBProvider syncs a table to the live server (an independent client sees it)', async () => {
        if (!server) return; // matches this repo's skip-if-unreachable convention

        const diagramId = `test-diagram-${randomUUID()}`;
        await registerTestDiagram(server.port, diagramId);
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
        await registerTestDiagram(server.port, diagramId);

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
        await registerTestDiagram(server.port, diagramId);
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

    it("Phase 5 — undo scoping: client A's undo of its own field-rename does not clobber client B's later edit to that same field, over the real network", async () => {
        if (!server) return;

        // This is the one claim §9's "undo per client" decision actually
        // rests on, and it was only ever backed by a doc comment
        // (`ignoreRemoteMapChanges`'s default) — not exercised against the
        // real HocuspocusProvider/Y.UndoManager pairing until this test.
        // Two SEPARATE Y.UndoManager instances are involved here (one per
        // renderClient() tree, each with its own localOrigin symbol) — this
        // is a materially different scenario from the single-doc
        // `updateHistory: false` tests in chartdb-provider.test.tsx, which
        // never touch trackedOrigins-based cross-client scoping at all.
        const diagramId = `test-diagram-${randomUUID()}`;
        await registerTestDiagram(server.port, diagramId);
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

        // A renames the field — this is the transaction A's undo stack will
        // target. Wait for it to actually land on B before B edits the same
        // key, so B's edit is genuinely "after A's", not a race.
        await act(async () => {
            await clientA.result.current.updateField('table-1', 'field-1', {
                name: 'a-edit',
            });
        });
        await waitFor(
            () =>
                expect(
                    clientB.result.current.tables.find(
                        (t: DBTable) => t.id === 'table-1'
                    )?.fields?.[0]?.name
                ).toBe('a-edit'),
            { timeout: 8_000 }
        );

        // B overwrites the same field's name. Wait for it to reach A before
        // A undoes — otherwise A's undo could race ahead of B's edit and
        // this would test nothing.
        await act(async () => {
            await clientB.result.current.updateField('table-1', 'field-1', {
                name: 'b-edit',
            });
        });
        await waitFor(
            () =>
                expect(
                    clientA.result.current.tables.find(
                        (t: DBTable) => t.id === 'table-1'
                    )?.fields?.[0]?.name
                ).toBe('b-edit'),
            { timeout: 8_000 }
        );

        // Guard against this test passing for the wrong reason: if A's
        // rename above somehow went untracked (e.g. a future change drops
        // updateField's `updateHistory: true` default), A's undo stack
        // would be empty, undo() would pop nothing, and "B's edit
        // survives" would trivially hold without scoping ever being
        // exercised at all.
        expect(clientA.result.current.undoManager?.undoStack.length).toBe(1);

        // A undoes its OWN rename — the one that set 'a-edit'. If undo
        // scoping/conflict-avoidance works as documented, this must not
        // revert the field past B's 'b-edit', which is the current value A
        // never touched.
        act(() => {
            clientA.result.current.undoManager?.undo();
        });

        // Give the (local, synchronous) undo a moment, then assert on BOTH
        // clients: B's edit must survive, on A's own doc and once it
        // crosses the network to B.
        await waitFor(() => {
            expect(
                clientA.result.current.tables.find(
                    (t: DBTable) => t.id === 'table-1'
                )?.fields?.[0]?.name
            ).toBe('b-edit');
        });
        await waitFor(
            () => {
                expect(
                    clientB.result.current.tables.find(
                        (t: DBTable) => t.id === 'table-1'
                    )?.fields?.[0]?.name
                ).toBe('b-edit');
            },
            { timeout: 8_000 }
        );
    }, 20_000);

    it('appendix-b:3 cascade delete, across the real network: removing a table on one client removes the relationships referencing it on the other client too', async () => {
        if (!server) return;

        const diagramId = `test-diagram-${randomUUID()}`;
        await registerTestDiagram(server.port, diagramId);
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
        await registerTestDiagram(server.port, diagramId);
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

        // Prove the outage is real, not assume it. `startServerProcessOnPort`
        // below reuses the same port and only checks /health — which can't
        // tell "a new process bound successfully" apart from "the old one
        // never actually died and is still answering" (child.kill() not
        // taking, e.g.). Without this, the whole test could pass green with
        // no outage at all. Same discipline as Phase 3's compaction check:
        // assert the intermediate state directly instead of inferring it
        // from the round-trip looking right.
        await expect(
            fetch(`http://localhost:${port}/health`)
        ).rejects.toThrow();

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

    it("seedDiagramRoom: pushes a diagram's content into its room independent of any ChartDBProvider", async () => {
        if (!server) return;

        const diagramId = `test-diagram-${randomUUID()}`;
        await registerTestDiagram(server.port, diagramId);

        await seedDiagramRoom({
            id: diagramId,
            name: 'Test',
            databaseType: DatabaseType.GENERIC,
            tables: [baseTable({})],
            createdAt: new Date(0),
            updatedAt: new Date(0),
        });

        // Proof this reached the server for real, and survived
        // seedDiagramRoom tearing its own connection down afterwards
        // (rather than just observing "no error was thrown") — an
        // independent client joins the same room fresh and reads the
        // table back.
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
                    expect(
                        readTableItem(checkerDoc.getMap('tables'), 'table-1')
                    ).toBeTruthy();
                },
                { timeout: 8_000 }
            );
        } finally {
            checkerProvider.destroy();
        }
    }, 20_000);

    it('seedDiagramRoom: leaves a room that already has content alone, rather than merging into it', async () => {
        if (!server) return;

        const diagramId = `test-diagram-${randomUUID()}`;
        await registerTestDiagram(server.port, diagramId);

        // Something else (a concurrent duplicate, or a previous clone of
        // the same fixed-id template) already put content in this room.
        const seederDoc = new Y.Doc();
        const seederProvider = new HocuspocusProvider({
            url: `ws://localhost:${server.port}`,
            name: diagramId,
            document: seederDoc,
        });
        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(
                () => reject(new Error('seeder never synced')),
                8_000
            );
            seederProvider.on('synced', () => {
                clearTimeout(timer);
                resolve();
            });
        });
        seederDoc.getMap('tables').set('existing-table', { name: 'existing' });
        seederProvider.flushPendingUpdates();
        const deadline = Date.now() + 8_000;
        while (seederProvider.hasUnsyncedChanges && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
        seederProvider.destroy();

        // seedDiagramRoom must not merge its own content into this —
        // isRoomEmpty sees the existing table and refuses to write.
        await seedDiagramRoom({
            id: diagramId,
            name: 'Test',
            databaseType: DatabaseType.GENERIC,
            tables: [baseTable({ id: 'new-table', name: 'new_table' })],
            createdAt: new Date(0),
            updatedAt: new Date(0),
        });

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
                    expect(
                        checkerDoc.getMap('tables').get('existing-table')
                    ).toBeTruthy();
                },
                { timeout: 8_000 }
            );
            // Give seedDiagramRoom's write a chance to have landed too, if
            // it wrongly went through — then assert it didn't.
            await new Promise((resolve) => setTimeout(resolve, 500));
            expect(
                readTableItem(checkerDoc.getMap('tables'), 'new-table')
            ).toBeUndefined();
        } finally {
            checkerProvider.destroy();
        }
    }, 20_000);

    it("Phase 5: awareness — one client's presence state reaches an independent client in the same room", async () => {
        if (!server) return;

        const diagramId = `test-diagram-${randomUUID()}`;
        await registerTestDiagram(server.port, diagramId);

        const clientA = renderClient();
        const clientB = renderClient();

        await act(async () => {
            clientA.result.current.loadDiagramFromData({
                id: diagramId,
                name: 'Test',
                databaseType: DatabaseType.GENERIC,
                tables: [],
                createdAt: new Date(0),
                updatedAt: new Date(0),
            });
            clientB.result.current.loadDiagramFromData({
                id: diagramId,
                name: 'Test',
                databaseType: DatabaseType.GENERIC,
                tables: [],
                createdAt: new Date(0),
                updatedAt: new Date(0),
            });
        });

        await waitFor(() => {
            expect(clientA.result.current.awareness).toBeTruthy();
            expect(clientB.result.current.awareness).toBeTruthy();
        });

        act(() => {
            clientA.result.current.awareness!.setLocalStateField(
                'displayName',
                'Alice'
            );
            clientA.result.current.awareness!.setLocalStateField('cursor', {
                x: 42,
                y: 7,
            });
            // Phase 5 (follow feature): flow-space center point + zoom,
            // broadcast the same way as cursor/displayName. Deliberately
            // NOT the raw camera transform — see PresenceState.
            // viewportCenter's doc comment for why that's window-size-
            // dependent and broke across different screen resolutions.
            clientA.result.current.awareness!.setLocalStateField(
                'viewportCenter',
                {
                    x: 100,
                    y: -50,
                    zoom: 1.5,
                }
            );
            // Phase 5 (follow-loop guard): who A is following, broadcast
            // so wouldCreateFollowCycle can see it from another client.
            clientA.result.current.awareness!.setLocalStateField(
                'following',
                999
            );
        });

        // Real proof this crossed the network, not an in-process
        // shortcut: client B's Awareness instance is its own room
        // connection's, entirely independent of client A's — it only
        // ever learns about A's state via the server relaying it.
        await waitFor(
            () => {
                const clientAId = clientA.result.current.awareness!.clientID;
                const states = clientB.result.current.awareness!.getStates();
                expect(states.get(clientAId)).toMatchObject({
                    displayName: 'Alice',
                    cursor: { x: 42, y: 7 },
                    viewportCenter: { x: 100, y: -50, zoom: 1.5 },
                    following: 999,
                });
            },
            { timeout: 8_000 }
        );

        // And B never sees itself in its own presence list — usePresence
        // filters this, but assert it at the awareness-state level too:
        // A's clientID must differ from B's.
        expect(clientA.result.current.awareness!.clientID).not.toBe(
            clientB.result.current.awareness!.clientID
        );
    }, 20_000);
});
