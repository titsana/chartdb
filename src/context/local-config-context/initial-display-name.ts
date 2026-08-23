import { AUTH_MODE } from '@/lib/env';
import { msalInstance } from '@/lib/msal-config';

export const displayNameKey = 'presence_display_name';

// Phase 5: a stable-enough per-browser default so a first-time presence
// label isn't literally blank — "Guest 1234", not tied to any account
// (there is none — no auth is a deliberate product decision, see the
// design doc's Phase 4.5 section). Computed once per fresh localStorage
// (i.e. per browser, roughly), not regenerated every load.
const randomDisplayName = () =>
    `Guest ${Math.floor(1000 + Math.random() * 9000)}`;

// Phase 7: once real sign-in exists, showing "Guest 1234" for a signed-in
// user is wrong, not just cosmetic — reported after the auth work landed.
// Every LocalConfigProvider mount site (editor-page.tsx and friends) sits
// under AuthGate (app.tsx), which — when AUTH_MODE === 'azure-ad' — only
// renders its children once MSAL is initialized and the user is actually
// authenticated, so getActiveAccount()/getAllAccounts()[0] is reliable
// here, not a race. `name` is preferred over `username` (usually an email/
// UPN) as the more human label; falls through to the existing localStorage-
// or-random logic in public mode, or if a tenant's token happens to carry
// neither claim.
//
// Extracted into its own file (not local-config-provider.tsx) purely so
// this function isn't the odd one out in a component file — react-refresh's
// only-export-components rule flags a non-component export alongside one.
export function initialDisplayName(): string {
    if (AUTH_MODE === 'azure-ad') {
        const account =
            msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0];
        if (account?.name || account?.username) {
            return account.name ?? account.username;
        }
    }
    return localStorage.getItem(displayNameKey) || randomDisplayName();
}
