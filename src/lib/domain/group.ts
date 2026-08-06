import { z } from 'zod';

export interface Group {
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
}

export const groupSchema: z.ZodType<Group> = z.object({
    id: z.string(),
    name: z.string(),
    createdAt: z.date(),
    updatedAt: z.date(),
});
