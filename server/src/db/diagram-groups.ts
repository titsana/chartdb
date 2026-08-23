import type { Pool } from 'pg';

/**
 * Folder-style diagram grouping (docs/design/realtime-collaboration.md
 * §10, Phase 7 follow-on): a real entity, not a bare string column on
 * `collab_diagrams` — see pool.ts's migrate() for why. Plain SQL, no ORM,
 * matching diagrams.ts's style.
 */
export interface DiagramGroupRecord {
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
}

interface DiagramGroupRow {
    id: string;
    name: string;
    created_at: Date;
    updated_at: Date;
}

function fromRow(row: DiagramGroupRow): DiagramGroupRecord {
    return {
        id: row.id,
        name: row.name,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export async function listDiagramGroups(
    pool: Pool
): Promise<DiagramGroupRecord[]> {
    const result = await pool.query<DiagramGroupRow>(
        'SELECT * FROM collab_diagram_groups ORDER BY name ASC'
    );
    return result.rows.map(fromRow);
}

export interface CreateDiagramGroupInput {
    id: string;
    name: string;
}

/** Same conflict-not-upsert reasoning as createDiagram — the caller
 * generates a fresh id, so a collision means something's wrong upstream. */
export async function createDiagramGroup(
    pool: Pool,
    input: CreateDiagramGroupInput
): Promise<DiagramGroupRecord | null> {
    const result = await pool.query<DiagramGroupRow>(
        `INSERT INTO collab_diagram_groups (id, name)
         VALUES ($1, $2)
         ON CONFLICT (id) DO NOTHING
         RETURNING *`,
        [input.id, input.name]
    );
    return result.rows[0] ? fromRow(result.rows[0]) : null;
}

export async function updateDiagramGroup(
    pool: Pool,
    id: string,
    name: string
): Promise<DiagramGroupRecord | null> {
    const result = await pool.query<DiagramGroupRow>(
        `UPDATE collab_diagram_groups
         SET name = $2, updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [id, name]
    );
    return result.rows[0] ? fromRow(result.rows[0]) : null;
}

/** Deleting a group un-groups its diagrams (group_id -> NULL) via the FK's
 * ON DELETE SET NULL in pool.ts's migrate() — never deletes the diagrams
 * themselves. Returns whether a row actually existed, same convention as
 * deleteDiagram. */
export async function deleteDiagramGroup(
    pool: Pool,
    id: string
): Promise<boolean> {
    const result = await pool.query(
        'DELETE FROM collab_diagram_groups WHERE id = $1',
        [id]
    );
    return (result.rowCount ?? 0) > 0;
}
