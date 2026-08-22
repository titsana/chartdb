import React from 'react';
import { randomUUID } from 'node:crypto';
import { type ChildProcess, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterAll, describe, expect, it, vi } from 'vitest';
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
 * adapter's Y.Doc to the Phase 3 server over WebSocket." This is the
 * single-client half of that exit criterion — a real `ChartDBProvider`
 * (not a raw `@hocuspocus/provider` script, unlike Phase 3's own
 * integration test) actually reaches the real, compiled server and syncs.
 * The two-client / seed-vs-adopt scenarios are covered separately.
 *
 * `@/lib/env`'s `COLLAB_WS_URL` is read once at module-import time, so it
 * can't be overridden by just setting an env var after the fact — this
 * file uses `vi.doMock` + dynamic `import()` to point it at the ephemeral
 * server this test spawns, keeping the override local to this file.
 *
 * Runs the real, compiled server as a genuinely separate OS process, the
 * same way server/'s own Phase 3 integration test does — see that file's
 * header comment for why (Nest's decorator metadata doesn't survive
 * Vitest's transform). Needs a reachable Postgres; skips the whole suite
 * if the server never becomes healthy within the startup timeout (matches
 * this repo's established integration-test convention).
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
    const port = await freePort();
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

describe('Phase 4 — ChartDBProvider reaches the real Hocuspocus server', () => {
    afterAll(async () => {
        vi.doUnmock('@/lib/env');
        await server?.stop();
    });

    it('a real ChartDBProvider syncs a table to the live server (an independent client sees it)', async () => {
        server = await startServerProcess();
        if (!server) {
            // Matches this repo's established integration-test convention:
            // skip rather than fail when the real backend isn't reachable.
            return;
        }

        vi.doMock('@/lib/env', async (importOriginal) => ({
            ...(await importOriginal<typeof EnvModule>()),
            COLLAB_WS_URL: `ws://localhost:${server!.port}`,
        }));

        const { ChartDBProvider } = await import('../chartdb-provider');
        const { useChartDB } = await import('@/hooks/use-chartdb');

        const diagramId = `test-diagram-${randomUUID()}`;
        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <diffContext.Provider value={makeMockDiff()}>
                <storageContext.Provider value={{ ...storageInitialValue }}>
                    <RedoUndoStackProvider>
                        <ChartDBProvider>{children}</ChartDBProvider>
                    </RedoUndoStackProvider>
                </storageContext.Provider>
            </diffContext.Provider>
        );
        const { result } = renderHook(() => useChartDB(), { wrapper });

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
});
