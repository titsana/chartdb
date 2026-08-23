import { describe, expect, it } from 'vitest';
import { wsUrlForOrigin } from '../env';

/**
 * Phase 7 (single-container deploy): with no explicit COLLAB_WS_URL
 * override, a production build derives the collab WS URL from the page's
 * own origin (NestJS now serves both — see server/src/app.module.ts's
 * ServeStaticModule) instead of the old hardcoded `ws://localhost:1234`,
 * which never made sense outside the machine actually running `server/`
 * locally. This is the one part of that derivation worth a test — the
 * import.meta.env.DEV branch around it is a single well-known Vite flag,
 * not worth stubbing per-test.
 */
describe('wsUrlForOrigin', () => {
    it('maps http: to ws:', () => {
        expect(
            wsUrlForOrigin({ protocol: 'http:', host: 'example.com:8080' })
        ).toBe('ws://example.com:8080');
    });

    it('maps https: to wss:', () => {
        expect(
            wsUrlForOrigin({ protocol: 'https:', host: 'chartdb.example.com' })
        ).toBe('wss://chartdb.example.com');
    });
});
