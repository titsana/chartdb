export interface CollabIdentity {
    name: string;
    color: string;
}

const ADJECTIVES = [
    'Swift',
    'Quiet',
    'Bold',
    'Calm',
    'Sunny',
    'Clever',
    'Bright',
    'Gentle',
    'Brave',
    'Wandering',
];
const ANIMALS = [
    'Fox',
    'Otter',
    'Falcon',
    'Panda',
    'Wolf',
    'Heron',
    'Lynx',
    'Sparrow',
    'Badger',
    'Dolphin',
];
const COLORS = [
    '#F97316',
    '#22C55E',
    '#3B82F6',
    '#EC4899',
    '#A855F7',
    '#EAB308',
    '#14B8A6',
    '#EF4444',
];

const STORAGE_KEY = 'chartdb-collab-identity';

// ponytail: per-tab-session identity, not accounts — persisted in
// sessionStorage only so a refresh keeps the same name/color but a new tab
// gets a fresh one. Azure AD users get their real name from the token instead
// (see collaboration-provider.tsx), this is only the anonymous fallback.
export function getOrCreateIdentity(): CollabIdentity {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
        try {
            return JSON.parse(stored) as CollabIdentity;
        } catch {
            // fall through and regenerate
        }
    }

    const seed = Math.floor(Math.random() * 1_000_000);
    const identity: CollabIdentity = {
        name: `${ADJECTIVES[seed % ADJECTIVES.length]} ${ANIMALS[(seed >> 4) % ANIMALS.length]}`,
        color: COLORS[(seed >> 8) % COLORS.length],
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
    return identity;
}
