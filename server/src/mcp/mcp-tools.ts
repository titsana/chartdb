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
import {
    applyFieldChanges,
    compactTable,
    describeRelationship,
    fieldChanges,
    fieldFromSpec,
    fieldSpec,
    findTable,
    generateId,
    qualifiedName,
    relationshipLine,
} from './compact';

// ponytail: the client's createTable default color, duplicated rather than
// shared — one string, not worth a cross-package import.
const DEFAULT_TABLE_COLOR = '#8eb7ff';

// Mirrors the client's defaultSchemas (src/lib/data/default-schemas.ts), so
// a table created here gets the same schema as one created in the UI.
const DEFAULT_SCHEMAS: Record<string, string> = {
    postgresql: 'public',
    sql_server: 'dbo',
    clickhouse: 'default',
    cockroachdb: 'public',
};

/** Above this many tables, get_diagram without tableNames returns a summary. */
const FULL_DETAIL_MAX_TABLES = 30;

// Only types whose FK side matches "fromField references toField"; see
// describeRelationship. one_to_one is stored with the ends swapped.
const RELATIONSHIP_TYPES = ['many_to_one', 'one_to_one'] as const;

const indexSpec = z.object({
    name: z.string().min(1),
    fieldNames: z.array(z.string().min(1)).min(1),
    unique: z.boolean().optional(),
});

/** Compact JSON: no pretty-printing, it only costs the caller tokens. */
function text(value: unknown) {
    return {
        content: [{ type: 'text' as const, text: JSON.stringify(value) }],
    };
}

function toError(message: string) {
    return {
        content: [{ type: 'text' as const, text: message }],
        isError: true,
    };
}

type Conn = Awaited<ReturnType<Hocuspocus['openDirectConnection']>>;
type Outcome<T> = T | { error: string };

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
    const server = new McpServer({ name: 'chartdb', version: '0.2.0' });

    /** Runs `fn` on the diagram's live doc; errors become tool errors. */
    async function onDiagram<T extends object>(
        diagramId: string,
        fn: (
            conn: Conn,
            tables: DBTable[],
            diagram: { name: string; defaultSchema?: string }
        ) => Promise<Outcome<T>>,
        { write }: { write: boolean }
    ) {
        const meta = await getDiagram(pool, diagramId);
        if (!meta) return toError(`diagram ${diagramId} not found`);
        const result = await withDiagramDoc(
            pool,
            hocuspocus,
            user,
            diagramId,
            (conn) =>
                fn(conn, readTables(conn.document!.getMap<unknown>('tables')), {
                    name: meta.name,
                    defaultSchema: DEFAULT_SCHEMAS[meta.databaseType],
                })
        );
        if ('error' in result) return toError(String(result.error));
        if (write) await touchDiagram(pool, diagramId);
        return text(result);
    }

    /**
     * Writes a table back. Fields removed since `before` take their indexes
     * and relationships with them, or those would point at nothing.
     */
    async function saveTable(conn: Conn, table: DBTable, before?: DBTable) {
        const kept = new Set(table.fields.map((f) => f.id));
        const removed = (before?.fields ?? [])
            .map((f) => f.id)
            .filter((id) => !kept.has(id));
        table.indexes = table.indexes.filter((i) =>
            i.fieldIds.every((id) => kept.has(id))
        );
        await conn.transact((doc) => {
            upsertTable(doc.getMap<unknown>('tables'), table);
            if (removed.length) {
                removeItemsReferencing(
                    doc.getMap<unknown>('relationships'),
                    ['sourceFieldId', 'targetFieldId'],
                    removed
                );
            }
        });
    }

    function tableResult(table: DBTable, defaultSchema?: string) {
        return {
            id: table.id,
            name: qualifiedName(table, defaultSchema),
            fieldCount: table.fields.length,
            indexCount: table.indexes.length,
        };
    }

    server.registerTool(
        'list_diagrams',
        { description: 'List all diagrams (id, name, database type).' },
        async () =>
            text(
                (await listDiagrams(pool)).map((d) => ({
                    id: d.id,
                    name: d.name,
                    databaseType: d.databaseType,
                }))
            )
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
            description: `Read a diagram. Tables and columns are referred to by name everywhere. Over ${FULL_DETAIL_MAX_TABLES} tables (or summaryOnly) returns table names, column counts and relationships as "table.column->table.column"; pass tableNames for full columns and indexes of just those tables.`,
            inputSchema: {
                diagramId: z.string(),
                tableNames: z
                    .array(z.string())
                    .optional()
                    .describe(
                        'Return only these tables (by "name" or "schema.name") in full, plus their relationships. Use this on big diagrams.'
                    ),
                summaryOnly: z
                    .boolean()
                    .optional()
                    .describe(
                        `Table names, column counts and relationships only. Automatic above ${FULL_DETAIL_MAX_TABLES} tables unless tableNames is given.`
                    ),
            },
        },
        async ({ diagramId, tableNames, summaryOnly }) =>
            onDiagram(
                diagramId,
                async (conn, tables, diagram) => {
                    const content = yDocToDiagram(conn.document!);
                    const relationships = (content.relationships ??
                        []) as DBRelationship[];
                    const tablesById = new Map(tables.map((t) => [t.id, t]));

                    if (
                        summaryOnly ||
                        (!tableNames && tables.length > FULL_DETAIL_MAX_TABLES)
                    ) {
                        return {
                            name: diagram.name,
                            summary: true,
                            tables: tables.map((t) => [
                                qualifiedName(t, diagram.defaultSchema),
                                t.fields.length,
                            ]),
                            relationships: relationships.map((r) =>
                                relationshipLine(
                                    r,
                                    tablesById,
                                    diagram.defaultSchema
                                )
                            ),
                        };
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
                    return {
                        name: diagram.name,
                        ...(notFound.length ? { notFound } : {}),
                        tables: selected.map((t) =>
                            compactTable(t, diagram.defaultSchema)
                        ),
                        relationships: relationships
                            .filter(
                                (r) =>
                                    selectedIds.has(
                                        r.sourceTableId as string
                                    ) ||
                                    selectedIds.has(r.targetTableId as string)
                            )
                            .map((r) =>
                                describeRelationship(
                                    r,
                                    tablesById,
                                    diagram.defaultSchema
                                )
                            ),
                    };
                },
                { write: false }
            )
    );

    server.registerTool(
        'upsert_table',
        {
            description:
                'Create a table, or fully replace one found by name (pass tableId only to rename). The field list is the complete, ordered set of columns: omitted columns are removed with their relationships, and omitted optional values are cleared. To change a few columns, prefer add_field / update_field / remove_field.',
            inputSchema: {
                diagramId: z.string(),
                name: z.string().min(1),
                tableId: z
                    .string()
                    .optional()
                    .describe('Only to rename an existing table'),
                schema: z.string().optional(),
                comments: z.string().optional(),
                fields: z.array(fieldSpec).min(1),
                indexes: z
                    .array(indexSpec)
                    .optional()
                    .describe(
                        'Full list of non primary key indexes. Omit to keep current ones; [] removes them.'
                    ),
            },
        },
        async (input) =>
            onDiagram(
                input.diagramId,
                async (conn, tables, diagram) => {
                    let existing: DBTable | undefined;
                    if (input.tableId) {
                        existing = tables.find((t) => t.id === input.tableId);
                        if (!existing)
                            return {
                                error: `table ${input.tableId} not found`,
                            };
                    } else {
                        const ref = input.schema
                            ? `${input.schema}.${input.name}`
                            : input.name;
                        const found = findTable(tables, ref);
                        if ('table' in found) existing = found.table;
                        else if (!found.error.endsWith('not found'))
                            return { error: found.error };
                    }

                    const names = input.fields.map((f) => f.name);
                    const dup = names.find((n, i) => names.indexOf(n) !== i);
                    if (dup) return { error: `duplicate column "${dup}"` };

                    const prevByName = new Map(
                        (existing?.fields ?? []).map((f) => [f.name, f])
                    );
                    const fields: DBField[] = input.fields.map((spec) =>
                        fieldFromSpec(spec, prevByName.get(spec.name))
                    );

                    let indexes = existing?.indexes ?? [];
                    if (input.indexes) {
                        const built = buildIndexes(
                            input.indexes,
                            fields,
                            indexes
                        );
                        if ('error' in built) return built;
                        indexes = built.indexes;
                    }

                    const now = Date.now();
                    const table: DBTable = {
                        ...existing,
                        id: existing?.id ?? generateId(),
                        name: input.name,
                        schema:
                            input.schema ??
                            existing?.schema ??
                            diagram.defaultSchema ??
                            null,
                        x: existing?.x ?? 0,
                        y: existing?.y ?? 0,
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
                    await saveTable(conn, table, existing);
                    return {
                        ...tableResult(table, diagram.defaultSchema),
                        created: !existing,
                    };
                },
                { write: true }
            )
    );

    /** Shared by the single-column tools: load a table by name, edit, save. */
    function editTable(
        diagramId: string,
        tableRef: string,
        edit: (
            table: DBTable,
            defaultSchema?: string
        ) => Outcome<{ table: DBTable; result: object }>
    ) {
        return onDiagram(
            diagramId,
            async (conn, tables, diagram) => {
                const found = findTable(tables, tableRef);
                if ('error' in found) return found;
                const edited = edit(
                    structuredClone(found.table),
                    diagram.defaultSchema
                );
                if ('error' in edited) return edited;
                await saveTable(conn, edited.table, found.table);
                return edited.result;
            },
            { write: true }
        );
    }

    server.registerTool(
        'add_field',
        {
            description:
                'Add one column to a table (by "name" or "schema.name"), at the end or right after an existing column.',
            inputSchema: {
                diagramId: z.string(),
                table: z.string(),
                field: fieldSpec,
                after: z
                    .string()
                    .optional()
                    .describe('insert after this column'),
            },
        },
        async ({ diagramId, table: tableRef, field, after }) =>
            editTable(diagramId, tableRef, (table, defaultSchema) => {
                if (table.fields.some((f) => f.name === field.name))
                    return { error: `column "${field.name}" already exists` };
                let at = table.fields.length;
                if (after !== undefined) {
                    const i = table.fields.findIndex((f) => f.name === after);
                    if (i === -1)
                        return { error: `column "${after}" not found` };
                    at = i + 1;
                }
                table.fields.splice(at, 0, fieldFromSpec(field));
                return { table, result: tableResult(table, defaultSchema) };
            })
    );

    server.registerTool(
        'update_field',
        {
            description:
                'Change one column. Only the given keys change; set an optional value to null to clear it (e.g. "default": null). Use "name" to rename.',
            inputSchema: {
                diagramId: z.string(),
                table: z.string(),
                field: z.string().describe('current column name'),
                changes: fieldChanges,
            },
        },
        async ({ diagramId, table: tableRef, field, changes }) =>
            editTable(diagramId, tableRef, (table, defaultSchema) => {
                const i = table.fields.findIndex((f) => f.name === field);
                if (i === -1) return { error: `column "${field}" not found` };
                if (
                    changes.name &&
                    changes.name !== field &&
                    table.fields.some((f) => f.name === changes.name)
                )
                    return { error: `column "${changes.name}" already exists` };
                table.fields[i] = applyFieldChanges(table.fields[i], changes);
                return { table, result: tableResult(table, defaultSchema) };
            })
    );

    server.registerTool(
        'remove_field',
        {
            description:
                'Remove one column, together with indexes and relationships that use it.',
            inputSchema: {
                diagramId: z.string(),
                table: z.string(),
                field: z.string(),
            },
        },
        async ({ diagramId, table: tableRef, field }) =>
            editTable(diagramId, tableRef, (table, defaultSchema) => {
                const before = table.fields.length;
                table.fields = table.fields.filter((f) => f.name !== field);
                if (table.fields.length === before)
                    return { error: `column "${field}" not found` };
                if (table.fields.length === 0)
                    return {
                        error: 'a table needs at least one column; use remove_table',
                    };
                return { table, result: tableResult(table, defaultSchema) };
            })
    );

    server.registerTool(
        'remove_table',
        {
            description:
                'Delete a table (by "name" or "schema.name"), together with every relationship and dependency that references it.',
            inputSchema: { diagramId: z.string(), table: z.string() },
        },
        async ({ diagramId, table: tableRef }) =>
            onDiagram(
                diagramId,
                async (conn, tables, diagram) => {
                    const found = findTable(tables, tableRef);
                    if ('error' in found) return found;
                    const { id } = found.table;
                    const relationships =
                        conn.document!.getMap<unknown>('relationships');
                    const before = relationships.size;
                    await conn.transact((d) => {
                        removeItemFromCollection(
                            d.getMap<unknown>('tables'),
                            id
                        );
                        removeItemsReferencing(
                            d.getMap<unknown>('relationships'),
                            ['sourceTableId', 'targetTableId'],
                            [id]
                        );
                        removeItemsReferencing(
                            d.getMap<unknown>('dependencies'),
                            ['tableId', 'dependentTableId'],
                            [id]
                        );
                    });
                    return {
                        removed: qualifiedName(
                            found.table,
                            diagram.defaultSchema
                        ),
                        relationshipsRemoved: before - relationships.size,
                    };
                },
                { write: true }
            )
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
        async (input) =>
            onDiagram(
                input.diagramId,
                async (conn, tables, diagram) => {
                    const from = findTable(tables, input.fromTable);
                    if ('error' in from) return from;
                    const to = findTable(tables, input.toTable);
                    if ('error' in to) return to;
                    const fromField = from.table.fields.find(
                        (f) => f.name === input.fromField
                    );
                    if (!fromField)
                        return {
                            error: `column ${input.fromTable}.${input.fromField} not found`,
                        };
                    const toField = to.table.fields.find(
                        (f) => f.name === input.toField
                    );
                    if (!toField)
                        return {
                            error: `column ${input.toTable}.${input.toField} not found`,
                        };

                    const tablesById = new Map(tables.map((t) => [t.id, t]));
                    // Same pair of columns in either orientation is a duplicate.
                    const pair = new Set([fromField.id, toField.id]);
                    let duplicate: DBRelationship | undefined;
                    conn.document!.getMap<unknown>('relationships').forEach(
                        (raw, id) => {
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
                                    sourceTableId: m.get('sourceTableId'),
                                    sourceFieldId: m.get('sourceFieldId'),
                                    targetTableId: m.get('targetTableId'),
                                    targetFieldId: m.get('targetFieldId'),
                                    sourceCardinality:
                                        m.get('sourceCardinality'),
                                    targetCardinality:
                                        m.get('targetCardinality'),
                                };
                            }
                        }
                    );
                    if (duplicate) {
                        return {
                            ...describeRelationship(
                                duplicate,
                                tablesById,
                                diagram.defaultSchema
                            ),
                            existed: true,
                        };
                    }

                    const fromEnd = {
                        schema: from.table.schema ?? null,
                        tableId: from.table.id,
                        fieldId: fromField.id,
                    };
                    const toEnd = {
                        schema: to.table.schema ?? null,
                        tableId: to.table.id,
                        fieldId: toField.id,
                    };
                    // many:one keeps the FK on source, one:one on target.
                    const [source, target] =
                        input.type === 'many_to_one'
                            ? [fromEnd, toEnd]
                            : [toEnd, fromEnd];
                    const relationship: DBRelationship = {
                        id: generateId(),
                        name:
                            input.name ??
                            `${from.table.name}_${fromField.name}_fk`,
                        sourceSchema: source.schema,
                        sourceTableId: source.tableId,
                        sourceFieldId: source.fieldId,
                        targetSchema: target.schema,
                        targetTableId: target.tableId,
                        targetFieldId: target.fieldId,
                        sourceCardinality:
                            input.type === 'many_to_one' ? 'many' : 'one',
                        targetCardinality: 'one',
                        createdAt: Date.now(),
                    };
                    await conn.transact((d) =>
                        upsertItem(
                            d.getMap<unknown>('relationships'),
                            relationship
                        )
                    );
                    return {
                        ...describeRelationship(
                            relationship,
                            tablesById,
                            diagram.defaultSchema
                        ),
                        existed: false,
                    };
                },
                { write: true }
            )
    );

    server.registerTool(
        'remove_relationship',
        {
            description:
                'Delete one relationship by id (ids come from get_diagram with tableNames).',
            inputSchema: { diagramId: z.string(), relationshipId: z.string() },
        },
        async ({ diagramId, relationshipId }) =>
            onDiagram(
                diagramId,
                async (conn) => {
                    if (
                        !conn
                            .document!.getMap<unknown>('relationships')
                            .has(relationshipId)
                    ) {
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
                },
                { write: true }
            )
    );

    return server;
}

function buildIndexes(
    specs: z.infer<typeof indexSpec>[],
    fields: DBField[],
    current: DBIndex[]
): { indexes: DBIndex[] } | { error: string } {
    const idByName = new Map(fields.map((f) => [f.name, f.id]));
    const prevByName = new Map(current.map((i) => [i.name, i]));
    const custom: DBIndex[] = [];
    for (const spec of specs) {
        const missing = spec.fieldNames.filter((n) => !idByName.has(n));
        if (missing.length)
            return {
                error: `index ${spec.name}: unknown column(s) ${missing.join(', ')}`,
            };
        const prev = prevByName.get(spec.name);
        custom.push({
            ...prev,
            id: prev?.id ?? generateId(),
            name: spec.name,
            unique: spec.unique ?? false,
            fieldIds: spec.fieldNames.map((n) => idByName.get(n)!),
            createdAt: prev?.createdAt ?? Date.now(),
        });
    }
    // The primary key index is managed with the fields, not here.
    return { indexes: [...current.filter((i) => i.isPrimaryKey), ...custom] };
}
