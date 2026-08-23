import { z } from 'zod';

/**
 * Phase 7 (folder-style diagram grouping, docs/design/
 * realtime-collaboration.md §10): a real entity (own id), not a bare
 * string label on `Diagram` — see server/src/db/pool.ts's migrate() for
 * why (renaming a group must not require touching every diagram row, and
 * an empty group still persists). Server-side, shared with everyone —
 * same "no auth, everyone sees everything" model as `Diagram` itself.
 */
export interface DiagramGroup {
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
}

export const diagramGroupSchema: z.ZodType<DiagramGroup> = z.object({
    id: z.string(),
    name: z.string(),
    createdAt: z.date(),
    updatedAt: z.date(),
});
