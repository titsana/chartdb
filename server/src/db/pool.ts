import { Pool } from 'pg';

export function createPool(databaseUrl: string): Pool {
    return new Pool({ connectionString: databaseUrl });
}

/**
 * Phase 3 (docs/design/realtime-collaboration.md §10, §5.3): append-only
 * Yjs update log + a periodically-compacted snapshot per diagram. This is
 * the only durable copy — the client's IndexedDB/Dexie copy is a synced
 * replica (§5.2). Inlined as a string (rather than a sibling schema.sql)
 * because `tsc` only emits `.ts` → `.js`; a separate file would need its
 * own copy-into-`dist` build step for no real benefit at this size.
 *
 * Table names are prefixed `yjs_` rather than the more obvious
 * `diagram_updates`/`diagram_snapshots`: this Postgres instance already has
 * tables under those exact names (and a differently-shaped `diagram_id
 * uuid` `diagram_snapshots`) left over from the abandoned
 * `feature/collaboration_v2` branch's own schema — `CREATE TABLE IF NOT
 * EXISTS` against those names would have silently no-opped and every query
 * here would have been reading/writing the wrong, incompatible table. Ran
 * into this for real once (see the design doc's Phase 3 section) — this
 * prefix isn't cosmetic, it's the fix.
 *
 * Idempotent — safe to run on every boot, which `migrate` below does.
 */
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS yjs_updates (
    id BIGSERIAL PRIMARY KEY,
    diagram_id TEXT NOT NULL,
    update BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every read of this table is "give me diagram X's updates after id Y, in
-- order" (loadMergedState) or "what's the newest id for diagram X"
-- (compaction) — both served by one composite index.
CREATE INDEX IF NOT EXISTS yjs_updates_diagram_id_id_idx
    ON yjs_updates (diagram_id, id);

CREATE TABLE IF NOT EXISTS yjs_snapshots (
    diagram_id TEXT PRIMARY KEY,
    snapshot BYTEA NOT NULL,
    -- The highest yjs_updates.id folded into \`snapshot\`. Rows in
    -- yjs_updates with id <= through_update_id are redundant with the
    -- snapshot and get pruned by compaction; see persistence.ts's
    -- getMaxUpdateId/storeSnapshotAndPrune for why the max(id) read has to
    -- happen strictly before the snapshot is encoded, not after.
    through_update_id BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

export async function migrate(pool: Pool): Promise<void> {
    await pool.query(SCHEMA_SQL);
}
