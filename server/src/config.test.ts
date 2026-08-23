import { describe, expect, it } from 'vitest';
import { isOriginAllowed, loadConfig } from './config';

const baseEnv = { DATABASE_URL: 'postgres://localhost/test' };

/**
 * Phase 3 (docs/design/realtime-collaboration.md §10): this is the one
 * access control this phase has (no real auth yet, §5.3). Found broken
 * once already during this phase's own integration testing — a Node
 * WebSocket client sends no `Origin` header, so a naive "no origin means
 * reject" policy locked out every non-browser client unconditionally,
 * regardless of the allowlist's contents. These pin the policy this
 * settled on: a missing Origin is allowed (see the doc comment on
 * isOriginAllowed for the trade-off), an unlisted one is not.
 */
describe('isOriginAllowed', () => {
    it('allows everything when the allowlist is empty', () => {
        expect(isOriginAllowed([], 'https://evil.example')).toBe(true);
        expect(isOriginAllowed([], undefined)).toBe(true);
    });

    it('allows a listed origin', () => {
        expect(
            isOriginAllowed(['http://localhost:5173'], 'http://localhost:5173')
        ).toBe(true);
    });

    it('rejects an unlisted origin when the allowlist is non-empty', () => {
        expect(
            isOriginAllowed(['http://localhost:5173'], 'https://evil.example')
        ).toBe(false);
    });

    it('allows a missing origin even with a non-empty allowlist — non-browser clients never send one', () => {
        expect(isOriginAllowed(['http://localhost:5173'], undefined)).toBe(
            true
        );
    });
});

/**
 * Phase 7: AUTH_MODE is explicit by design (see the design doc's Phase 7
 * entry) — unset/"public" must keep every pre-Phase-7 deploy behaving
 * exactly as before, and "azure-ad" with missing credentials must fail
 * loudly at boot rather than silently falling back to open access.
 */
describe('loadConfig — authMode', () => {
    it('defaults to public when AUTH_MODE is unset', () => {
        expect(loadConfig(baseEnv).authMode).toBe('public');
    });

    it('accepts an explicit AUTH_MODE=public', () => {
        expect(loadConfig({ ...baseEnv, AUTH_MODE: 'public' }).authMode).toBe(
            'public'
        );
    });

    it('accepts AUTH_MODE=azure-ad when tenant + audience are set', () => {
        const config = loadConfig({
            ...baseEnv,
            AUTH_MODE: 'azure-ad',
            ENTRA_TENANT_ID: 'tenant-1',
            ENTRA_API_AUDIENCE: 'api://client-1',
        });
        expect(config.authMode).toBe('azure-ad');
        expect(config.entraTenantId).toBe('tenant-1');
        expect(config.entraApiAudience).toBe('api://client-1');
    });

    it('rejects AUTH_MODE=azure-ad missing ENTRA_TENANT_ID/ENTRA_API_AUDIENCE — fail loud, not a silent fallback to public', () => {
        expect(() =>
            loadConfig({ ...baseEnv, AUTH_MODE: 'azure-ad' })
        ).toThrow(/ENTRA_TENANT_ID/);
    });

    it('rejects an unrecognized AUTH_MODE value', () => {
        expect(() =>
            loadConfig({ ...baseEnv, AUTH_MODE: 'ldap' })
        ).toThrow(/AUTH_MODE/);
    });
});
