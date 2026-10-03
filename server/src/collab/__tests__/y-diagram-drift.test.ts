import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain .mjs script, no type declarations
import {
    readClient,
    readServer,
    toServerCopy,
} from '../../../scripts/sync-y-diagram.mjs';

/**
 * server/src/collab/y-diagram.ts is a generated copy of the client's
 * src/lib/collab/y-diagram.ts (see scripts/sync-y-diagram.mjs for why it
 * can't just be imported). If the two drift, the server encodes `__order`
 * / `checkConstraintsIsNull` differently from browsers editing the same
 * doc — silent corruption. Fix: `node scripts/sync-y-diagram.mjs`.
 */
describe('y-diagram server copy', () => {
    it('matches the client source', () => {
        expect(readServer()).toBe(toServerCopy(readClient()));
    });
});
