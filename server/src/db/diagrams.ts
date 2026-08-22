import type { Pool } from 'pg';

/**
 * Phase 4.5 (docs/design/realtime-collaboration.md §10): the `collab_diagrams`
 * table is the ONLY registry of which diagram ids are real — everything
 * about a diagram's actual content lives in its Y.Doc (yjs_updates/
 * yjs_snapshots), reached only through the collab WebSocket, not here.
 * This module is deliberately thin: plain SQL, no ORM, matching
 * persistence.ts's style.
 */
export interface DiagramRecord {
    id: string;
    name: string;
    databaseType: string;
    databaseEdition: string | null;
    createdAt: Date;
    updatedAt: Date;
}

interface DiagramRow {
    id: string;
    name: string;
    database_type: string;
    database_edition: string | null;
    created_at: Date;
    updated_at: Date;
}

function fromRow(row: DiagramRow): DiagramRecord {
    return {
        id: row.id,
        name: row.name,
        databaseType: row.database_type,
        databaseEdition: row.database_edition,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export async function listDiagrams(pool: Pool): Promise<DiagramRecord[]> {
    const result = await pool.query<DiagramRow>(
        'SELECT * FROM collab_diagrams ORDER BY updated_at DESC'
    );
    return result.rows.map(fromRow);
}

export async function getDiagram(
    pool: Pool,
    id: string
): Promise<DiagramRecord | null> {
    const result = await pool.query<DiagramRow>(
        'SELECT * FROM collab_diagrams WHERE id = $1',
        [id]
    );
    return result.rows[0] ? fromRow(result.rows[0]) : null;
}

export interface CreateDiagramInput {
    id: string;
    name: string;
    databaseType: string;
    databaseEdition?: string | null;
}

/**
 * Creating a diagram id that already exists is a genuine conflict (not an
 * upsert) — the caller (POST /diagrams) is expected to generate a fresh,
 * collision-resistant id per diagram (see the design doc's note on
 * generateDiagramId's workspaceId-prefix scheme), so a collision here means
 * something is wrong upstream, not a legitimate "create or update."
 * Returns null on conflict rather than throwing the raw Postgres error, so
 * the controller can turn it into a clean 409.
 */
export async function createDiagram(
    pool: Pool,
    input: CreateDiagramInput
): Promise<DiagramRecord | null> {
    const result = await pool.query<DiagramRow>(
        `INSERT INTO collab_diagrams (id, name, database_type, database_edition)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO NOTHING
         RETURNING *`,
        [input.id, input.name, input.databaseType, input.databaseEdition ?? null]
    );
    return result.rows[0] ? fromRow(result.rows[0]) : null;
}

export interface UpdateDiagramInput {
    name?: string;
    databaseType?: string;
    databaseEdition?: string | null;
}

export async function updateDiagram(
    pool: Pool,
    id: string,
    input: UpdateDiagramInput
): Promise<DiagramRecord | null> {
    const result = await pool.query<DiagramRow>(
        `UPDATE collab_diagrams
         SET name = COALESCE($2, name),
             database_type = COALESCE($3, database_type),
             database_edition = CASE WHEN $4 THEN $5 ELSE database_edition END,
             updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [
            id,
            input.name ?? null,
            input.databaseType ?? null,
            'databaseEdition' in input,
            input.databaseEdition ?? null,
        ]
    );
    return result.rows[0] ? fromRow(result.rows[0]) : null;
}

/** Touches `updated_at` — called whenever a diagram's Y.Doc actually
 * changes (see persistence-extension.ts), so listDiagrams' sort order
 * reflects real edit activity, not just metadata edits. A no-op (not an
 * error) for a diagram_id with no metadata row — the write-side collab
 * flow shouldn't produce updates for an unregistered diagram at all (the
 * yjs_updates FK would already have refused them), but this function is
 * defensive against calling it out of order regardless. */
export async function touchDiagram(pool: Pool, id: string): Promise<void> {
    await pool.query('UPDATE collab_diagrams SET updated_at = now() WHERE id = $1', [
        id,
    ]);
}

/** Deletes the metadata row — cascades to yjs_updates/yjs_snapshots via the
 * FK added in pool.ts's migrate(). Returns whether a row actually existed
 * (so the controller can 404 correctly instead of reporting success for a
 * diagram that was never there). Evicting the live Hocuspocus room (if any
 * client is still connected) is the CALLER's job, not this function's —
 * see the diagrams module's delete handler. */
export async function deleteDiagram(
    pool: Pool,
    id: string
): Promise<boolean> {
    const result = await pool.query('DELETE FROM collab_diagrams WHERE id = $1', [
        id,
    ]);
    return (result.rowCount ?? 0) > 0;
}
