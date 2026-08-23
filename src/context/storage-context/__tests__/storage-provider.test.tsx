import React from 'react';
import { useContext } from 'react';
import { renderHook } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { storageContext } from '@/context/storage-context/storage-context';
import type * as EnvModule from '@/lib/env';

// Bug found via manual disconnect testing (docs/design/
// realtime-collaboration.md's Phase 5 disconnect-UX section): a killed/
// unreachable collab server can leave `fetch` pending forever instead of
// rejecting, since there's no socket-close event to reject on. Any caller
// that does `showLoader(); await storageDB.getDiagram(...); hideLoader();`
// (see use-diagram-loader.tsx, table-dbml.tsx) then never reaches
// `hideLoader()`, leaving the full-screen loading dialog stuck open. Fixed
// with an AbortController-based timeout inside `apiFetch` (not exported —
// tested through the real `getDiagram` call, same as every other consumer).
//
// `COLLAB_API_URL` is derived from `COLLAB_WS_URL` at module-load time (see
// src/lib/env.ts), so — same reasoning as the collab integration test file
// — it has to be overridden via `vi.doMock` before the first dynamic
// `import('../storage-provider')`, not just set on the already-mocked
// `COLLAB_WS_URL` from src/test/setup.ts's global mock.
vi.doMock('@/lib/env', async (importOriginal) => ({
    ...(await importOriginal<typeof EnvModule>()),
    COLLAB_API_URL: 'http://localhost:9999',
}));

// Matches this codebase's existing precedent for a dynamically-imported
// binding (see chartdb-provider.collab.integration.test.tsx's
// `ChartDBProvider`).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let StorageProvider: any;

beforeAll(async () => {
    ({ StorageProvider } = await import('../storage-provider'));
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe('StorageProvider — apiFetch timeout', () => {
    it('rejects instead of hanging forever when the server never responds', async () => {
        vi.useFakeTimers();
        // Never resolves/rejects on its own — simulates a killed server
        // that can't even produce a connection-refused error, the worst
        // case (a hang, not a fast failure). Does respect the abort
        // signal `apiFetch` passes in, same as a real `fetch` would —
        // that's the actual mechanism under test.
        vi.stubGlobal(
            'fetch',
            vi.fn(
                (_url: string, init?: RequestInit) =>
                    new Promise((_resolve, reject) => {
                        init?.signal?.addEventListener('abort', () =>
                            reject(new DOMException('Aborted', 'AbortError'))
                        );
                    })
            )
        );

        const { result } = renderHook(() => useContext(storageContext), {
            wrapper: ({ children }: React.PropsWithChildren) => (
                <StorageProvider>{children}</StorageProvider>
            ),
        });

        const pending = result.current.getDiagram('some-diagram-id');
        // Attach the rejection assertion BEFORE advancing the fake clock —
        // `.rejects` subscribes to `pending` synchronously, right here.
        // Attaching it only after advanceTimersByTimeAsync (as this used
        // to) left a window, under fake timers, where the mock's reject()
        // fires before any handler further up the chain than apiFetch's
        // own `await` is on record — which vitest's fake-timer bookkeeping
        // read as unhandled, even though the real `pending` chain was
        // never actually dropped.
        const assertion = expect(pending).rejects.toThrow();
        await vi.advanceTimersByTimeAsync(10_000);
        await assertion;
    });

    it('does not time out a request that resolves well within the window', async () => {
        vi.useFakeTimers();
        vi.stubGlobal(
            'fetch',
            vi.fn(() =>
                Promise.resolve({
                    status: 404,
                    json: () => Promise.resolve(undefined),
                } as Response)
            )
        );

        const { result } = renderHook(() => useContext(storageContext), {
            wrapper: ({ children }: React.PropsWithChildren) => (
                <StorageProvider>{children}</StorageProvider>
            ),
        });

        await expect(
            result.current.getDiagram('some-diagram-id')
        ).resolves.toBeUndefined();
    });
});
