import { z } from 'zod';

export interface Note {
    id: string;
    content: string;
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
    order?: number;
}

// Input type explicitly declared (not z.ZodType<Note>, unlike every other
// domain schema here): `order`'s .transform() below makes this schema's
// INPUT differ from its OUTPUT (Note — order is never null there), which
// z.ZodType<Note>'s single-type-param form asserts must be identical.
export type NoteInput = Omit<Note, 'order'> & { order?: number | null };

export const noteSchema: z.ZodType<Note, z.ZodTypeDef, NoteInput> = z.object({
    id: z.string(),
    content: z.string(),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    color: z.string(),
    // Bug found importing a real user file: some notes (likely from an
    // older export/version) had `"order": null` rather than the key being
    // absent. `.optional()` alone only accepts undefined/absent — `null`
    // still fails validation, rejecting the WHOLE diagram import over one
    // cosmetic (note stacking order) field. `.nullable()` accepts the
    // null, and the transform normalizes it to `undefined` so the rest of
    // the codebase still only ever sees `order?: number` (the Note
    // interface's actual type), not `number | null`.
    order: z
        .number()
        .nullable()
        .optional()
        .transform((v) => v ?? undefined),
});
