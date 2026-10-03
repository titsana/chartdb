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
    upsertTable,
    yDocToDiagram,
} from '../collab/y-diagram';
import type { DBField, DBTable } from '../collab/y-diagram.types';
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
    type: z.string().min(1).describe('SQL type name, e.g. "uuid", "varchar"'),
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
};

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
            description:
                "Get a diagram's full content: tables (with ordered fields and indexes), relationships, areas, notes.",
            inputSchema: { diagramId: z.string() },
        },
        async ({ diagramId }) => {
            const meta = await getDiagram(pool, diagramId);
            if (!meta) return toError(`diagram ${diagramId} not found`);
            return withDiagramDoc(
                pool,
                hocuspocus,
                user,
                diagramId,
                async (conn) => {
                    const content = yDocToDiagram(conn.document!);
                    return text({ ...content, ...meta });
                }
            );
        }
    );

    server.registerTool(
        'upsert_table',
        {
            description:
                'Create a table, or replace an existing one (by tableId) with the given name and ordered field list.',
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
                    const indexes = (existing?.indexes ?? []).filter((i) =>
                        i.fieldIds.every((id) => fieldIds.has(id))
                    );

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
                    await conn.transact((doc) =>
                        upsertTable(doc.getMap<unknown>('tables'), table)
                    );
                    return { table };
                }
            );
            if ('error' in result) return toError(result.error!);
            await touchDiagram(pool, input.diagramId);
            return text(result.table);
        }
    );

    return server;
}
