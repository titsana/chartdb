import { describe, expect, it } from 'vitest';
import { isOriginAllowed } from './config';

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
