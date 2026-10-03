import { randomBytes } from 'node:crypto';
import type { Hocuspocus } from '@hocuspocus/server';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Pool } from 'pg';
import * as Y from 'yjs';
import { z } from 'zod';
import { appendUpdate } from '../db/persistence';
import {
    createDiagram,
    getDiagram,
    listDiagrams,
    touchDiagram,
} from '../db/diagrams';
import {
    readTableItem,
    readTables,
    removeItemFromCollection,
    removeItemsReferencing,
    upsertItem,
    upsertTable,
    yDocToDiagram,
} from '../collab/y-diagram';
import type {
    DBField,
    DBIndex,
    DBRelationship,
    DBTable,
} from '../collab/y-diagram.types';
import type { McpUser } from '../mcp-auth/entra-broker';

// Same shape as the client's generateId (12 lowercase alphanumerics).
function generateId(): string {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from(randomBytes(12), (b) => alphabet[b % 36]).join('');
}

// ponytail: the client's createTable default color, duplicated rather than
// shared — one string, not worth a cross-package import.
const DEFAULT_TABLE_COLOR = '#8eb7ff';

const fieldInput = z.object({
    id: z
        .string()
        .optional()
        .describe('Existing field id to keep; omit for a new field'),
    name: z.string().min(1),
    // Also accepts get_diagram's {id, name} form, so a field read back
    // from get_diagram can be passed through unchanged.
    type: z
        .union([
            z.string().min(1),
            z.object({ name: z.string().min(1) }).transform((t) => t.name),
        ])
        .describe('SQL type name, e.g. "uuid", "varchar"'),
    primaryKey: z.boolean().default(false),
    unique: z.boolean().default(false),
    nullable: z.boolean().default(true),
    characterMaximumLength: z.string().nullish(),
    default: z.string().nullish(),
    comments: z.string().nullish(),
});

const upsertTableInput = {
    diagramId: z.string(),
    tableId: z
        .string()
        .optional()
        .describe('Existing table id to replace; omit to create a new table'),
    name: z.string().min(1),
    schema: z.string().nullish(),
    fields: z
        .array(fieldInput)
        .min(1)
        .describe(
            'The full, ordered field list. Fields of an existing table not listed here are removed.'
        ),
    x: z.number().optional(),
    y: z.number().optional(),
    comments: z.string().nullish(),
    indexes: z
        .array(
            z.object({
                name: z.string().min(1),
                fieldNames: z.array(z.string().min(1)).min(1),
                unique: z.boolean().default(false),
            })
        )
        .optional()
        .describe(
            'Full list of (non primary key) indexes. Omit to keep the current ones; [] removes them all.'
        ),
};

/** Above this many tables, get_diagram without tableNames returns a summary. */
const FULL_DETAIL_MAX_TABLES = 30;

// ChartDB keeps the FK on the source field only for many:one and on the
// target field otherwise (foreignKeyFieldId in the client's
// db-relationship.ts). Only these two types are offered; one_to_one is
// stored with the ends swapped so the FK still lands on fromField.
const RELATIONSHIP_TYPES = ['many_to_one', 'one_to_one'] as const;

function qualifiedName(table: DBTable): string {
    return table.schema ? `${table.schema}.${table.name}` : table.name;
}

/** Matches "name" or "schema.name"; errors if a bare name is ambiguous. */
function findTable(
    tables: DBTable[],
    ref: string
): { table: DBTable } | { error: string } {
    const matches = tables.filter(
        (t) => t.name === ref || qualifiedName(t) === ref
    );
    if (matches.length === 1) return { table: matches[0] };
    if (matches.length === 0) return { error: `table "${ref}" not found` };
    return {
        error: `table name "${ref}" is ambiguous, use one of: ${matches.map(qualifiedName).join(', ')}`,
    };
}

/**
 * Relationship in a form an LLM can read without resolving ids. `from` is
 * always the FK side (see RELATIONSHIP_TYPES), `type` reads from it.
 */
function describeRelationship(
    rel: DBRelationship,
    tablesById: Map<string, DBTable>
) {
    const end = (tableId: unknown, fieldId: unknown) => {
        const table = tablesById.get(tableId as string);
        const field = table?.fields.find((f) => f.id === fieldId);
        return table && field
            ? `${qualifiedName(table)}.${field.name}`
            : '(missing)';
    };
    const source = end(rel.sourceTableId, rel.sourceFieldId);
    const target = end(rel.targetTableId, rel.targetFieldId);
    const fkOnSource =
        rel.sourceCardinality === 'many' && rel.targetCardinality === 'one';
    return {
        id: rel.id,
        name: rel.name,
        from: fkOnSource ? source : target,
        to: fkOnSource ? target : source,
        type: fkOnSource
            ? 'many_to_one'
            : `${rel.targetCardinality}_to_${rel.sourceCardinality}`,
    };
}

function text(value: unknown) {
    return {
        content: [
            { type: 'text' as const, text: JSON.stringify(value, null, 2) },
        ],
    };
}

function toError(message: string) {
    return {
        content: [{ type: 'text' as const, text: message }],
        isError: true,
    };
}

/**
 * Opens the diagram's live room, runs `fn` against it and disconnects.
 * Edits go through Hocuspocus, so connected browsers see them at once.
 *
 * Durability: a direct connection's edits never pass the persistence
 * extension's `beforeHandleMessage` (WebSocket only), so this appends
 * whatever `fn` changed to yjs_updates itself before returning, the same
 * durable log a WebSocket edit lands in. Then it disconnects without
 * unloading; the regular debounced snapshot compacts the log later.
 *
 * Race: Hocuspocus' createDocument can hand back a document that its
 * unload logic destroys a moment later (unload re-checks the connection
 * count only before destroying). A connection attached to that document
 * reads an empty diagram and its writes go nowhere. So after attaching,
 * check it is still the live document and retry if not.
 */
async function withDiagramDoc<T>(
    pool: Pool,
    hocuspocus: Hocuspocus,
    user: McpUser | undefined,
    diagramId: string,
    fn: (
        conn: Awaited<ReturnType<Hocuspocus['openDirectConnection']>>
    ) => Promise<T>
): Promise<T> {
    let conn = await hocuspocus.openDirectConnection(diagramId, {
        source: 'mcp',
        user: user ?? null,
    });
    for (
        let attempt = 0;
        hocuspocus.documents.get(diagramId) !== conn.document;
        attempt++
    ) {
        // Stale: release without disconnect(), which would run store hooks
        // on the destroyed document.
        conn.document?.removeDirectConnection();
        if (attempt >= 3)
            throw new Error('diagram is being unloaded, try again');
        conn = await hocuspocus.openDirectConnection(diagramId, {
            source: 'mcp',
            user: user ?? null,
        });
    }
    const doc = conn.document!;
    // Collect the actual updates instead of diffing state vectors: a diff
    // always carries the doc's whole delete set (so reads would write), and
    // pure deletes don't advance the state vector (so they'd be missed). A
    // concurrent WS peer's update may be captured too; Yjs dedupes it.
    const updates: Uint8Array[] = [];
    const onUpdate = (update: Uint8Array) => updates.push(update);
    doc.on('update', onUpdate);
    try {
        const result = await fn(conn);
        if (updates.length) {
            await appendUpdate(pool, diagramId, Y.mergeUpdates(updates));
        }
        return result;
    } finally {
        doc.off('update', onUpdate);
        await conn.disconnect({ unloadImmediately: false });
    }
}

export function createMcpServer(
    pool: Pool,
    hocuspocus: Hocuspocus,
    user?: McpUser
): McpServer {
    const server = new McpServer({ name: 'chartdb', version: '0.1.0' });

    server.registerTool(
        'list_diagrams',
        { description: 'List all diagrams (id, name, database type).' },
        async () => text(await listDiagrams(pool))
    );

    server.registerTool(
        'create_diagram',
        {
            description:
                'Create a new, empty diagram. Returns its id; add tables with upsert_table.',
            inputSchema: {
                name: z.string().min(1).max(200),
                // Mirrors the client's DatabaseType enum (src/lib/domain/database-type.ts).
                databaseType: z
                    .enum([
                        'generic',
                        'postgresql',
                        'mysql',
                        'sql_server',
                        'mariadb',
                        'sqlite',
                        'clickhouse',
                        'cockroachdb',
                        'oracle',
                    ])
                    .default('postgresql'),
            },
        },
        async ({ name, databaseType }) => {
            // The room starts empty; a browser opening it seeds the rest,
            // same as a diagram created from the UI's REST call.
            const created = await createDiagram(pool, {
                id: generateId(),
                name,
                databaseType,
            });
            if (!created) return toError('id collision, try again');
            return text(created);
        }
    );

    server.registerTool(
        'get_diagram',
        {
            description: `Read a diagram. Diagrams with more than ${FULL_DETAIL_MAX_TABLES} tables return a summary (table names and field counts) unless you pass tableNames; then only those tables (fields, indexes) and their relationships come back in full.`,
            inputSchema: {
                diagramId: z.string(),
                tableNames: z
                    .array(z.string())
                    .optional()
                    .describe('Only these tables, by "name" or "schema.name"'),
                summaryOnly: z.boolean().optional(),
            },
        },
        async ({ diagramId, tableNames, summaryOnly }) => {
            const meta = await getDiagram(pool, diagramId);
            if (!meta) return toError(`diagram ${diagramId} not found`);
            return withDiagramDoc(
                pool,
                hocuspocus,
                user,
                diagramId,
                async (conn) => {
                    const content = yDocToDiagram(conn.document!);
                    const tables = content.tables ?? [];
                    const relationships = (content.relationships ??
                        []) as DBRelationship[];
                    const tablesById = new Map(tables.map((t) => [t.id, t]));
                    const header = {
                        id: meta.id,
                        name: meta.name,
                        databaseType: meta.databaseType,
                        tableCount: tables.length,
                        relationshipCount: relationships.length,
                    };

                    if (
                        summaryOnly ||
                        (!tableNames && tables.length > FULL_DETAIL_MAX_TABLES)
                    ) {
                        return text({
                            ...header,
                            note: 'Summary only. Call get_diagram with tableNames for fields, indexes and relationships.',
                            tables: tables.map((t) => ({
                                id: t.id,
                                name: qualifiedName(t),
                                fieldCount: t.fields.length,
                            })),
                        });
                    }

                    let selected = tables;
                    const notFound: string[] = [];
                    if (tableNames) {
                        const ids = new Set<string>();
                        for (const ref of tableNames) {
                            const found = findTable(tables, ref);
                            if ('table' in found) ids.add(found.table.id);
                            else notFound.push(found.error);
                        }
                        selected = tables.filter((t) => ids.has(t.id));
                    }
                    const selectedIds = new Set(selected.map((t) => t.id));
                    return text({
                        ...header,
                        ...(notFound.length ? { notFound } : {}),
                        tables: selected,
                        relationships: relationships
                            .filter(
                                (r) =>
                                    selectedIds.has(
                                        r.sourceTableId as string
                                    ) ||
                                    selectedIds.has(r.targetTableId as string)
                            )
                            .map((r) => describeRelationship(r, tablesById)),
                    });
                }
            );
        }
    );

    server.registerTool(
        'upsert_table',
        {
            description:
                'Create a table, or replace an existing one (by tableId) with the given name, ordered field list and optionally indexes. Removing a field also removes relationships that use it.',
            inputSchema: upsertTableInput,
        },
        async (input) => {
            const meta = await getDiagram(pool, input.diagramId);
            if (!meta) return toError(`diagram ${input.diagramId} not found`);

            const result = await withDiagramDoc(
                pool,
                hocuspocus,
                user,
                input.diagramId,
                async (conn) => {
                    const tablesMap = conn.document!.getMap<unknown>('tables');
                    const existing = input.tableId
                        ? readTableItem(tablesMap, input.tableId)
                        : undefined;
                    if (input.tableId && !existing) {
                        return { error: `table ${input.tableId} not found` };
                    }

                    const now = Date.now();
                    const existingFields = new Map(
                        (existing?.fields ?? []).map((f) => [f.id, f])
                    );
                    const fields: DBField[] = input.fields.map((f) => {
                        const prev = f.id
                            ? existingFields.get(f.id)
                            : undefined;
                        return {
                            ...prev,
                            ...f,
                            id: prev?.id ?? generateId(),
                            type: {
                                id: f.type.toLowerCase().replace(/\s+/g, '_'),
                                name: f.type,
                            },
                            createdAt: prev?.createdAt ?? now,
                        };
                    });
                    // Drop indexes pointing at fields that no longer exist.
                    const fieldIds = new Set(fields.map((f) => f.id));
                    const keptIndexes = (existing?.indexes ?? []).filter((i) =>
                        i.fieldIds.every((id) => fieldIds.has(id))
                    );
                    let indexes: DBIndex[] = keptIndexes;
                    if (input.indexes) {
                        const fieldIdByName = new Map(
                            fields.map((f) => [f.name, f.id])
                        );
                        const prevByName = new Map(
                            keptIndexes.map((i) => [i.name, i])
                        );
                        const custom: DBIndex[] = [];
                        for (const idx of input.indexes) {
                            const missing = idx.fieldNames.filter(
                                (n) => !fieldIdByName.has(n)
                            );
                            if (missing.length) {
                                return {
                                    error: `index ${idx.name}: unknown field(s) ${missing.join(', ')}`,
                                };
                            }
                            const prev = prevByName.get(idx.name);
                            custom.push({
                                ...prev,
                                id: prev?.id ?? generateId(),
                                name: idx.name,
                                unique: idx.unique,
                                fieldIds: idx.fieldNames.map(
                                    (n) => fieldIdByName.get(n)!
                                ),
                                createdAt: prev?.createdAt ?? now,
                            });
                        }
                        // The primary key index is managed with the fields, not here.
                        indexes = [
                            ...keptIndexes.filter((i) => i.isPrimaryKey),
                            ...custom,
                        ];
                    }
                    const removedFieldIds = (existing?.fields ?? [])
                        .map((f) => f.id)
                        .filter((id) => !fieldIds.has(id));

                    const tables = readTables(tablesMap);
                    const table: DBTable = {
                        ...existing,
                        id: existing?.id ?? generateId(),
                        name: input.name,
                        schema: input.schema ?? existing?.schema ?? null,
                        x: input.x ?? existing?.x ?? 0,
                        y: input.y ?? existing?.y ?? 0,
                        fields,
                        indexes,
                        color: existing?.color ?? DEFAULT_TABLE_COLOR,
                        isView: existing?.isView ?? false,
                        createdAt: existing?.createdAt ?? now,
                        order:
                            existing?.order ??
                            Math.max(-1, ...tables.map((t) => t.order ?? 0)) +
                                1,
                        comments: input.comments ?? existing?.comments ?? null,
                    };
                    await conn.transact((doc) => {
                        upsertTable(doc.getMap<unknown>('tables'), table);
                        // A removed field takes its relationships with it,
                        // or they'd point at nothing.
                        if (removedFieldIds.length) {
                            removeItemsReferencing(
                                doc.getMap<unknown>('relationships'),
                                ['sourceFieldId', 'targetFieldId'],
                                removedFieldIds
                            );
                        }
                    });
                    return { table };
                }
            );
            if ('error' in result) return toError(result.error!);
            await touchDiagram(pool, input.diagramId);
            return text(result.table);
        }
    );

    server.registerTool(
        'remove_table',
        {
            description:
                'Delete a table, together with every relationship and dependency that references it.',
            inputSchema: { diagramId: z.string(), tableId: z.string() },
        },
        async ({ diagramId, tableId }) => {
            const meta = await getDiagram(pool, diagramId);
            if (!meta) return toError(`diagram ${diagramId} not found`);
            const result = await withDiagramDoc(
                pool,
                hocuspocus,
                user,
                diagramId,
                async (conn) => {
                    const doc = conn.document!;
                    const table = readTableItem(
                        doc.getMap<unknown>('tables'),
                        tableId
                    );
                    if (!table) return { error: `table ${tableId} not found` };
                    const relationshipsBefore =
                        doc.getMap<unknown>('relationships').size;
                    await conn.transact((d) => {
                        removeItemFromCollection(
                            d.getMap<unknown>('tables'),
                            tableId
                        );
                        removeItemsReferencing(
                            d.getMap<unknown>('relationships'),
                            ['sourceTableId', 'targetTableId'],
                            [tableId]
                        );
                        removeItemsReferencing(
                            d.getMap<unknown>('dependencies'),
                            ['tableId', 'dependentTableId'],
                            [tableId]
                        );
                    });
                    return {
                        removed: qualifiedName(table),
                        relationshipsRemoved:
                            relationshipsBefore -
                            doc.getMap<unknown>('relationships').size,
                    };
                }
            );
            if ('error' in result) return toError(result.error!);
            await touchDiagram(pool, diagramId);
            return text(result);
        }
    );

    server.registerTool(
        'add_relationship',
        {
            description:
                'Add a foreign-key relationship: fromTable.fromField references toTable.toField. Tables by "name" or "schema.name". Type many_to_one (default: many rows of fromTable point at one row of toTable) or one_to_one.',
            inputSchema: {
                diagramId: z.string(),
                fromTable: z.string(),
                fromField: z.string(),
                toTable: z.string(),
                toField: z.string(),
                type: z.enum(RELATIONSHIP_TYPES).default('many_to_one'),
                name: z.string().min(1).optional(),
            },
        },
        async (input) => {
            const meta = await getDiagram(pool, input.diagramId);
            if (!meta) return toError(`diagram ${input.diagramId} not found`);
            const result = await withDiagramDoc(
                pool,
                hocuspocus,
                user,
                input.diagramId,
                async (conn) => {
                    const doc = conn.document!;
                    const tables = readTables(doc.getMap<unknown>('tables'));
                    const from = findTable(tables, input.fromTable);
                    if ('error' in from) return { error: from.error };
                    const to = findTable(tables, input.toTable);
                    if ('error' in to) return { error: to.error };
                    const fromField = from.table.fields.find(
                        (f) => f.name === input.fromField
                    );
                    if (!fromField)
                        return {
                            error: `field ${input.fromTable}.${input.fromField} not found`,
                        };
                    const toField = to.table.fields.find(
                        (f) => f.name === input.toField
                    );
                    if (!toField)
                        return {
                            error: `field ${input.toTable}.${input.toField} not found`,
                        };

                    const tablesById = new Map(tables.map((t) => [t.id, t]));
                    const relationshipsMap =
                        doc.getMap<unknown>('relationships');
                    // Same pair of fields in either orientation counts as a duplicate.
                    const pair = new Set([fromField.id, toField.id]);
                    let duplicate: DBRelationship | undefined;
                    relationshipsMap.forEach((raw, id) => {
                        const m = raw as { get(key: string): unknown };
                        const ends = [
                            m.get('sourceFieldId'),
                            m.get('targetFieldId'),
                        ];
                        if (
                            pair.size === 2 &&
                            ends.every((e) => pair.has(e as string))
                        ) {
                            duplicate = {
                                id,
                                name: m.get('name') as string,
                                sourceTableId: m.get('sourceTableId'),
                                sourceFieldId: m.get('sourceFieldId'),
                                targetTableId: m.get('targetTableId'),
                                targetFieldId: m.get('targetFieldId'),
                                sourceCardinality: m.get('sourceCardinality'),
                                targetCardinality: m.get('targetCardinality'),
                            };
                        }
                    });
                    if (duplicate) {
                        return {
                            relationship: describeRelationship(
                                duplicate,
                                tablesById
                            ),
                            existed: true,
                        };
                    }

                    const relationship: DBRelationship = {
                        id: generateId(),
                        name:
                            input.name ??
                            `${from.table.name}_${fromField.name}_fk`,
                        ...(input.type === 'many_to_one'
                            ? {
                                  sourceSchema: from.table.schema ?? null,
                                  sourceTableId: from.table.id,
                                  sourceFieldId: fromField.id,
                                  targetSchema: to.table.schema ?? null,
                                  targetTableId: to.table.id,
                                  targetFieldId: toField.id,
                                  sourceCardinality: 'many' as const,
                                  targetCardinality: 'one' as const,
                              }
                            : {
                                  // one:one keeps the FK on target: swap ends
                                  sourceSchema: to.table.schema ?? null,
                                  sourceTableId: to.table.id,
                                  sourceFieldId: toField.id,
                                  targetSchema: from.table.schema ?? null,
                                  targetTableId: from.table.id,
                                  targetFieldId: fromField.id,
                                  sourceCardinality: 'one' as const,
                                  targetCardinality: 'one' as const,
                              }),
                        createdAt: Date.now(),
                    };
                    await conn.transact((d) =>
                        upsertItem(
                            d.getMap<unknown>('relationships'),
                            relationship
                        )
                    );
                    return {
                        relationship: describeRelationship(
                            relationship,
                            tablesById
                        ),
                        existed: false,
                    };
                }
            );
            if ('error' in result) return toError(result.error!);
            await touchDiagram(pool, input.diagramId);
            return text(result);
        }
    );

    server.registerTool(
        'remove_relationship',
        {
            description:
                'Delete one relationship by id (ids come from get_diagram).',
            inputSchema: { diagramId: z.string(), relationshipId: z.string() },
        },
        async ({ diagramId, relationshipId }) => {
            const meta = await getDiagram(pool, diagramId);
            if (!meta) return toError(`diagram ${diagramId} not found`);
            const result = await withDiagramDoc(
                pool,
                hocuspocus,
                user,
                diagramId,
                async (conn) => {
                    const relationshipsMap =
                        conn.document!.getMap<unknown>('relationships');
                    if (!relationshipsMap.has(relationshipId)) {
                        return {
                            error: `relationship ${relationshipId} not found`,
                        };
                    }
                    await conn.transact((d) =>
                        removeItemFromCollection(
                            d.getMap<unknown>('relationships'),
                            relationshipId
                        )
                    );
                    return { removed: relationshipId };
                }
            );
            if ('error' in result) return toError(result.error!);
            await touchDiagram(pool, diagramId);
            return text(result);
        }
    );

    return server;
}
