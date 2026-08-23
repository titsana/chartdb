import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Phase 7: reported after auth landed — a signed-in user's presence avatar
 * still showed "Guest 1234" instead of their real name. Root cause: nothing
 * connected the signed-in MSAL account to local-config-provider.tsx's
 * displayName state, which only ever read localStorage or generated a
 * random guest label. initialDisplayName() is the fix — these pin its
 * priority order (account.name > account.username > localStorage > random).
 */
describe('initialDisplayName', () => {
    let mockGetActiveAccount = vi.fn();
    let mockGetAllAccounts = vi.fn(() => [] as unknown[]);
    let mockAuthMode: 'azure-ad' | 'public' = 'public';

    beforeEach(() => {
        localStorage.clear();
        mockGetActiveAccount = vi.fn(() => null);
        mockGetAllAccounts = vi.fn(() => []);
        mockAuthMode = 'public';
        vi.resetModules();
        vi.doMock('@/lib/env', async (importOriginal) => ({
            ...(await importOriginal<object>()),
            get AUTH_MODE() {
                return mockAuthMode;
            },
        }));
        vi.doMock('@/lib/msal-config', () => ({
            msalInstance: {
                getActiveAccount: () => mockGetActiveAccount(),
                getAllAccounts: () => mockGetAllAccounts(),
            },
            loginRequest: { scopes: [] },
        }));
    });

    afterEach(() => {
        vi.doUnmock('@/lib/env');
        vi.doUnmock('@/lib/msal-config');
    });

    it('public mode: ignores MSAL entirely, falls back to localStorage-or-random', async () => {
        mockAuthMode = 'public';
        localStorage.setItem('presence_display_name', 'Saved Name');
        const { initialDisplayName } = await import('../initial-display-name');
        expect(initialDisplayName()).toBe('Saved Name');
        expect(mockGetActiveAccount).not.toHaveBeenCalled();
    });

    it("azure-ad mode: uses the active account's name", async () => {
        mockAuthMode = 'azure-ad';
        mockGetActiveAccount = vi.fn(() => ({
            name: 'Somchai Jaidee',
            username: 'somchai@example.com',
        }));
        const { initialDisplayName } = await import('../initial-display-name');
        expect(initialDisplayName()).toBe('Somchai Jaidee');
    });

    it('azure-ad mode: falls back to username when name is missing', async () => {
        mockAuthMode = 'azure-ad';
        mockGetActiveAccount = vi.fn(() => ({
            name: undefined,
            username: 'somchai@example.com',
        }));
        const { initialDisplayName } = await import('../initial-display-name');
        expect(initialDisplayName()).toBe('somchai@example.com');
    });

    it('azure-ad mode: falls back to getAllAccounts()[0] when there is no active account', async () => {
        mockAuthMode = 'azure-ad';
        mockGetActiveAccount = vi.fn(() => null);
        mockGetAllAccounts = vi.fn(() => [{ name: 'Fallback User' }]);
        const { initialDisplayName } = await import('../initial-display-name');
        expect(initialDisplayName()).toBe('Fallback User');
    });

    it('azure-ad mode with neither claim nor any account: falls back to localStorage-or-random, same as public mode', async () => {
        mockAuthMode = 'azure-ad';
        mockGetActiveAccount = vi.fn(() => null);
        mockGetAllAccounts = vi.fn(() => []);
        localStorage.setItem('presence_display_name', 'Saved Name');
        const { initialDisplayName } = await import('../initial-display-name');
        expect(initialDisplayName()).toBe('Saved Name');
    });
});
