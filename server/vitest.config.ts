import { defineConfig } from 'vitest/config';

// Without its own config, vitest run from server/ walks up and picks up
// the root vite.config.ts's vitest setup (`environment: 'happy-dom'`,
// a client-only setupFiles path) — this is a Node backend, not a browser
// app; that mismatch is what made the integration tests hang silently
// instead of failing cleanly (see collab.integration.test.ts's header
// comment / the design doc's Phase 3 section for how this was found).
export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts'],
    },
});
