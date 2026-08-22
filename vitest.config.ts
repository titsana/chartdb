import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    test: {
        globals: true,
        environment: 'happy-dom',
        setupFiles: './src/test/setup.ts',
        // `server/` is a standalone Node/NestJS project with its own
        // package.json, own vitest.config.ts (environment: 'node'), and own
        // `npm test` — without this exclude, this root config's default
        // test-file glob also picks up server/src/**/*.test.ts and runs it
        // under happy-dom with this project's browser-oriented setupFiles,
        // which is the wrong environment for it (see server/README.md's
        // "gotchas" section for what that mismatch actually does).
        exclude: ['**/node_modules/**', 'server/**'],
        coverage: {
            reporter: ['text', 'json', 'html'],
            exclude: ['node_modules/', 'src/test/setup.ts'],
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
