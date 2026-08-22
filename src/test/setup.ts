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
vi.mock('@/lib/env', async (importOriginal) => ({
    ...(await importOriginal<typeof EnvModule>()),
    COLLAB_WS_URL: '',
}));

afterEach(() => {
    cleanup();
});
