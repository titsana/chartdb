import { describe, expect, it } from 'vitest';
import { noteSchema } from '../note';

const baseNote = {
    id: 'n1',
    content: 'hello',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    color: '#fff',
};

/**
 * Bug found importing a real user diagram export: some notes had
 * `"order": null` (likely from an older export/version) rather than the
 * key being absent. `.optional()` alone only accepts undefined/absent —
 * `null` still failed validation, rejecting the WHOLE diagram import over
 * one cosmetic field. noteSchema now accepts null and normalizes it to
 * undefined so the rest of the codebase still only ever sees
 * `order?: number`, matching the Note interface.
 */
describe('noteSchema — order', () => {
    it('accepts a real number', () => {
        const result = noteSchema.safeParse({ ...baseNote, order: 3 });
        expect(result.success).toBe(true);
        expect(result.success && result.data.order).toBe(3);
    });

    it('accepts the key being absent', () => {
        const result = noteSchema.safeParse(baseNote);
        expect(result.success).toBe(true);
        expect(result.success && result.data.order).toBeUndefined();
    });

    it('accepts null and normalizes it to undefined', () => {
        const result = noteSchema.safeParse({ ...baseNote, order: null });
        expect(result.success).toBe(true);
        expect(result.success && result.data.order).toBeUndefined();
    });

    it('still rejects genuinely wrong types (e.g. a string)', () => {
        const result = noteSchema.safeParse({ ...baseNote, order: 'first' });
        expect(result.success).toBe(false);
    });
});
