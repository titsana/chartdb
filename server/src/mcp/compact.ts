import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type {
    DBField,
    DBIndex,
    DBRelationship,
    DBTable,
} from '../collab/y-diagram.types';

/**
 * The MCP tools' wire format: tables and fields are named, never id'd
 * (field ids stay internal), and output carries only non-default values
 * under the same keys the input takes, so a field read back can be sent
 * straight into upsert_table / add_field. Keeps a 20-column table at about
 * a fifth of the raw Y.Doc projection.
 */

// Same shape as the client's generateId (12 lowercase alphanumerics).
export function generateId(): string {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from(randomBytes(12), (b) => alphabet[b % 36]).join('');
}

const typeName = z
    .union([
        z.string().min(1),
        z.object({ name: z.string().min(1) }).transform((t) => t.name),
    ])
    .describe('SQL type name, e.g. "uuid", "varchar"');

/** A whole field. Omitted optional values are absent, never inherited. */
export const fieldSpec = z.object({
    name: z.string().min(1),
    type: typeName,
    primaryKey: z.boolean().optional(),
    unique: z.boolean().optional(),
    nullable: z.boolean().optional().describe('default true'),
    isArray: z.boolean().optional(),
    increment: z.boolean().optional(),
    characterMaximumLength: z.string().optional(),
    precision: z.number().optional(),
    scale: z.number().optional(),
    default: z.string().optional(),
    collation: z.string().optional(),
    check: z.string().optional(),
    comments: z.string().optional(),
});
export type FieldSpec = z.infer<typeof fieldSpec>;

/** update_field changes: given keys replace, `null` clears an optional value. */
export const fieldChanges = z.object({
    name: z.string().min(1).optional().describe('rename the column'),
    type: typeName.optional(),
    primaryKey: z.boolean().optional(),
    unique: z.boolean().optional(),
    nullable: z.boolean().optional(),
    isArray: z.boolean().nullable().optional(),
    increment: z.boolean().nullable().optional(),
    characterMaximumLength: z.string().nullable().optional(),
    precision: z.number().nullable().optional(),
    scale: z.number().nullable().optional(),
    default: z.string().nullable().optional(),
    collation: z.string().nullable().optional(),
    check: z.string().nullable().optional(),
    comments: z.string().nullable().optional(),
});
export type FieldChanges = z.infer<typeof fieldChanges>;

const OPTIONAL_KEYS = [
    'isArray',
    'increment',
    'characterMaximumLength',
    'precision',
    'scale',
    'default',
    'collation',
    'check',
    'comments',
] as const;

function toType(name: string): DBField['type'] {
    return { id: name.toLowerCase().replace(/\s+/g, '_'), name };
}

/**
 * Clearing is written as `null`, never by deleting the key: the shared
 * Y.Doc writer (upsertItem) only sets keys, so a deleted key would keep
 * its old value in the doc. The client's domain types accept null for
 * every one of these.
 */

/** Builds a stored field from a full spec. Only `id`/`createdAt` survive from `prev`. */
export function fieldFromSpec(spec: FieldSpec, prev?: DBField): DBField {
    const field: DBField = {
        id: prev?.id ?? generateId(),
        name: spec.name,
        type: toType(spec.type),
        primaryKey: spec.primaryKey ?? false,
        unique: spec.unique ?? false,
        nullable: spec.nullable ?? true,
        createdAt: prev?.createdAt ?? Date.now(),
    };
    for (const key of OPTIONAL_KEYS) {
        if (spec[key] !== undefined) field[key] = spec[key];
        else if (prev?.[key] != null) field[key] = null;
    }
    return field;
}

/** Applies update_field changes on top of an existing field. */
export function applyFieldChanges(
    field: DBField,
    changes: FieldChanges
): DBField {
    const next: DBField = { ...field };
    if (changes.name !== undefined) next.name = changes.name;
    if (changes.type !== undefined) next.type = toType(changes.type);
    if (changes.primaryKey !== undefined) next.primaryKey = changes.primaryKey;
    if (changes.unique !== undefined) next.unique = changes.unique;
    if (changes.nullable !== undefined) next.nullable = changes.nullable;
    for (const key of OPTIONAL_KEYS) {
        const value = changes[key];
        if (value !== undefined) next[key] = value;
    }
    return next;
}

/** A field in wire form: non-default values only, input-compatible keys. */
export function compactField(field: DBField): Record<string, unknown> {
    const out: Record<string, unknown> = {
        name: field.name,
        type: field.type.name,
    };
    if (field.primaryKey) out.primaryKey = true;
    if (field.unique) out.unique = true;
    if (field.nullable === false) out.nullable = false;
    for (const key of OPTIONAL_KEYS) {
        const value = field[key];
        if (
            value !== undefined &&
            value !== null &&
            value !== false &&
            value !== ''
        ) {
            out[key] = value;
        }
    }
    return out;
}

export function compactTable(
    table: DBTable,
    defaultSchema?: string
): Record<string, unknown> {
    const nameById = new Map(table.fields.map((f) => [f.id, f.name]));
    const out: Record<string, unknown> = {
        id: table.id,
        name: table.name,
    };
    if (table.schema && table.schema !== defaultSchema)
        out.schema = table.schema;
    if (table.isView) out.isView = true;
    if (table.comments) out.comments = table.comments;
    out.fields = table.fields.map(compactField);
    if (table.indexes.length) {
        out.indexes = table.indexes.map((i: DBIndex) => {
            const index: Record<string, unknown> = {
                name: i.name,
                fieldNames: i.fieldIds.map(
                    (id) => nameById.get(id) ?? '(missing)'
                ),
            };
            if (i.unique) index.unique = true;
            if (i.isPrimaryKey) index.isPrimaryKey = true;
            return index;
        });
    }
    return out;
}

/** "schema.name", or just "name" when the schema is the diagram's default. */
export function qualifiedName(table: DBTable, defaultSchema?: string): string {
    return table.schema && table.schema !== defaultSchema
        ? `${table.schema}.${table.name}`
        : table.name;
}

/** Matches "name" or "schema.name"; errors if a bare name is ambiguous. */
export function findTable(
    tables: DBTable[],
    ref: string
): { table: DBTable } | { error: string } {
    const matches = tables.filter(
        (t) => t.name === ref || `${t.schema}.${t.name}` === ref
    );
    if (matches.length === 1) return { table: matches[0] };
    if (matches.length === 0) return { error: `table "${ref}" not found` };
    return {
        error: `table name "${ref}" is ambiguous, use one of: ${matches.map((t) => qualifiedName(t)).join(', ')}`,
    };
}

/**
 * Relationship in a form an LLM can read without resolving ids. `from` is
 * always the FK side: ChartDB keeps the FK on the source field only for
 * many:one, on the target otherwise (client foreignKeyFieldId).
 */
export function describeRelationship(
    rel: DBRelationship,
    tablesById: Map<string, DBTable>,
    defaultSchema?: string
): { id: string; from: string; to: string; type: string } {
    const end = (tableId: unknown, fieldId: unknown) => {
        const table = tablesById.get(tableId as string);
        const field = table?.fields.find((f) => f.id === fieldId);
        return table && field
            ? `${qualifiedName(table, defaultSchema)}.${field.name}`
            : '(missing)';
    };
    const source = end(rel.sourceTableId, rel.sourceFieldId);
    const target = end(rel.targetTableId, rel.targetFieldId);
    const fkOnSource =
        rel.sourceCardinality === 'many' && rel.targetCardinality === 'one';
    return {
        id: rel.id,
        from: fkOnSource ? source : target,
        to: fkOnSource ? target : source,
        type: fkOnSource
            ? 'many_to_one'
            : `${rel.targetCardinality}_to_${rel.sourceCardinality}`,
    };
}

/** One line per relationship, for summaries: "orders.customer_id->customers.id". */
export function relationshipLine(
    rel: DBRelationship,
    tablesById: Map<string, DBTable>,
    defaultSchema?: string
): string {
    const { from, to, type } = describeRelationship(
        rel,
        tablesById,
        defaultSchema
    );
    return type === 'many_to_one'
        ? `${from}->${to}`
        : `${from}->${to} (${type})`;
}
