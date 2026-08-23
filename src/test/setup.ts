import '@testing-library/jest-dom';
import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import type * as EnvModule from '@/lib/env';

expect.extend(matchers);

// Phase 4: `COLLAB_WS_URL` defaults to a non-empty value (see
// src/lib/env.ts) so it's "on for every diagram" out of the box in a real
// deploy. Left as-is, every test that calls loadDiagramFromData would have
// `ChartDBProvider` open a real WebSocket connection to that default URL —
// unintended network I/O in a unit test, and (once the Phase 4 ready-gate
// landed) a real, unpredictable wait for that connection to fail before
// gated writes unblock. Defaulting it to '' here routes ordinary tests
// through the local-only, synchronously-ready branch instead, matching
// pre-Phase-4 behavior. Tests that specifically exercise the live collab
// path override this back with their own `vi.doMock('@/lib/env', ...)`,
// which — since it's called after this file already ran — takes priority
// for that one test file.
//
// Phase 4.5: `COLLAB_API_URL` is *derived* from `COLLAB_WS_URL` inside
// env.ts itself (module-load time), so mocking `COLLAB_WS_URL` alone here
// doesn't touch it — the original module's derivation already ran against
// the real default before this mock factory's override applies. Left
// unmocked, storage-provider.tsx's REST calls (addDiagram/listDiagrams/
// getDiagram/updateDiagram/deleteDiagram) would hit a real
// `http://localhost:1234` in every unit test, same class of unintended
// network I/O `COLLAB_WS_URL: ''` exists to prevent. Mocked to '' too so
// storage-provider's fetch calls fail fast against a relative empty-string
// URL instead of reaching out for real.
// Phase 7: same class of bug as COLLAB_WS_URL above, found the hard way —
// AUTH_MODE isn't derived from anything else in env.ts, but it's still
// read straight from `import.meta.env.VITE_AUTH_MODE` at module-load time,
// meaning a developer's own local .env (set to `azure-ad` to manually test
// this phase's sign-in flow) leaked into every test in this suite that
// goes through apiFetch — getEntraAccessToken() then threw "no active
// Entra account" in place of whatever the test's mocked fetch was
// supposed to exercise. Pinned to 'public' here for the same reason
// COLLAB_WS_URL is pinned to '': tests must be deterministic regardless
// of what's sitting in a contributor's own .env.
vi.mock('@/lib/env', async (importOriginal) => ({
    ...(await importOriginal<typeof EnvModule>()),
    COLLAB_WS_URL: '',
    COLLAB_API_URL: '',
    AUTH_MODE: 'public',
}));

afterEach(() => {
    cleanup();
});
