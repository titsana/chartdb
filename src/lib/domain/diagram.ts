import { z } from 'zod';
import { DatabaseEdition } from './database-edition';
import { DatabaseType } from './database-type';
import type { DBDependency } from './db-dependency';
import { dbDependencySchema } from './db-dependency';
import type { DBRelationship } from './db-relationship';
import { dbRelationshipSchema } from './db-relationship';
import type { DBTable } from './db-table';
import { dbTableSchema } from './db-table';
import { areaSchema, type Area } from './area';
import type { DBCustomType } from './db-custom-type';
import { dbCustomTypeSchema } from './db-custom-type';
import type { Note } from './note';
import { noteSchema } from './note';

export interface Diagram {
    id: string;
    name: string;
    databaseType: DatabaseType;
    databaseEdition?: DatabaseEdition;
    // Phase 7 (folder-style grouping, docs/design/realtime-collaboration.md
    // §10): which DiagramGroup (diagram-group.ts) this diagram belongs to,
    // or null/undefined for ungrouped. Server-side, shared with everyone
    // who sees the diagram list — same "no auth, everyone sees everything"
    // model as the diagram's other metadata.
    groupId?: string | null;
    tables?: DBTable[];
    relationships?: DBRelationship[];
    dependencies?: DBDependency[];
    areas?: Area[];
    customTypes?: DBCustomType[];
    notes?: Note[];
    createdAt: Date;
    updatedAt: Date;
}

export const diagramSchema: z.ZodType<Diagram> = z.object({
    id: z.string(),
    name: z.string(),
    databaseType: z.nativeEnum(DatabaseType),
    databaseEdition: z.nativeEnum(DatabaseEdition).optional(),
    groupId: z.string().or(z.null()).optional(),
    tables: z.array(dbTableSchema).optional(),
    relationships: z.array(dbRelationshipSchema).optional(),
    dependencies: z.array(dbDependencySchema).optional(),
    areas: z.array(areaSchema).optional(),
    customTypes: z.array(dbCustomTypeSchema).optional(),
    notes: z.array(noteSchema).optional(),
    createdAt: z.date(),
    updatedAt: z.date(),
});
