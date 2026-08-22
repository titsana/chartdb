import { Pool } from 'pg';

export function createPool(databaseUrl: string): Pool {
    return new Pool({ connectionString: databaseUrl });
}

/**
 * Phase 3 (docs/design/realtime-collaboration.md §10, §5.3): append-only
 * Yjs update log + a periodically-compacted snapshot per diagram. This is
 * the only durable copy — Phase 4.5 removed the client's IndexedDB/Dexie
 * replica entirely, so this Postgres instance (not any browser) is now the
 * sole store for every diagram. Inlined as a string (rather than a sibling
 * schema.sql) because `tsc` only emits `.ts` → `.js`; a separate file would
 * need its own copy-into-`dist` build step for no real benefit at this
 * size.
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

-- Phase 4.5 (docs/design/realtime-collaboration.md §10): a diagram's
-- metadata (everything NOT inside its Y.Doc — name/databaseType/etc, plus
-- its very existence for "list all diagrams"/"open a diagram by id"). Doesn't
-- exist until Phase 4.5; \`yjs_updates\`/\`yjs_snapshots\` predate it and had
-- no registry of which diagram_ids were ever real.
CREATE TABLE IF NOT EXISTS collab_diagrams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    database_type TEXT NOT NULL,
    database_edition TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

/**
 * A diagram_id that was never registered in \`collab_diagrams\` (or whose
 * row was deleted) must not be able to hold any \`yjs_updates\`/
 * \`yjs_snapshots\` rows — this is what makes DELETE /diagrams/:id safe
 * against the "still-connected client re-persists the deleted content"
 * race (see the diagrams module's delete handler): the FK's ON DELETE
 * CASCADE wipes both tables atomically with the metadata row, and any
 * write a stale connection manages to still send afterward fails the FK
 * constraint outright (appendUpdate throws, durable-log.ts's
 * beforeHandleMessage propagates it, Hocuspocus closes that connection)
 * rather than racing Hocuspocus's own async eviction timing.
 *
 * Table named \`collab_diagrams\`, not the more obvious \`diagrams\` — same
 * reason as the \`yjs_\` prefix above: this Postgres instance already has a
 * \`diagrams\` table from the abandoned \`feature/collaboration_v2\` branch
 * (UUID id, tenant_id/group_id/created_by columns, its own FK web) — ran
 * into this collision for real while building this (see this phase's
 * design doc section), \`CREATE TABLE IF NOT EXISTS diagrams\` had silently
 * no-opped and every query was hitting the wrong, incompatible table.
 *
 * Added as a one-time migration guarded by a constraint-existence check
 * (there's no `ADD CONSTRAINT IF NOT EXISTS` in Postgres) rather than in
 * SCHEMA_SQL's CREATE TABLE, because `collab_diagrams` didn't exist when
 * yjs_updates/yjs_snapshots were first created — every pre-existing row in
 * either table predates any diagram registry and is, by definition, an
 * orphan the constraint can't be added against. Wiping them here is safe:
 * confirmed with the project owner that no real user data exists yet on
 * this branch. Runs once; a no-op on every boot after that (the
 * information_schema check short-circuits it).
 *
 * The information_schema check is check-then-act, not atomic — harmless
 * with one server process, but multiple processes calling migrate()
 * concurrently (every integration test file spawns its own; a real
 * multi-instance deploy would too) can both see "constraint doesn't exist
 * yet" and race the same ALTER TABLE, which Postgres resolves as a
 * deadlock rather than a queued wait (found for real running this repo's
 * own full test suite in parallel — see the design doc's Phase 4.5
 * section). Wrapped in a session-scoped advisory lock so concurrent
 * callers serialize on this one-time step instead: the second caller
 * blocks until the first's transaction commits, then finds the
 * information_schema check already true and skips straight past.
 */
const ADD_DIAGRAM_ID_FK_SQL = `
SELECT pg_advisory_lock(hashtext('chartdb_collab_diagrams_fk_migration'));

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'yjs_updates_diagram_id_fkey'
    ) THEN
        DELETE FROM yjs_updates;
        DELETE FROM yjs_snapshots;
        ALTER TABLE yjs_updates
            ADD CONSTRAINT yjs_updates_diagram_id_fkey
            FOREIGN KEY (diagram_id) REFERENCES collab_diagrams (id) ON DELETE CASCADE;
        ALTER TABLE yjs_snapshots
            ADD CONSTRAINT yjs_snapshots_diagram_id_fkey
            FOREIGN KEY (diagram_id) REFERENCES collab_diagrams (id) ON DELETE CASCADE;
    END IF;
END $$;

SELECT pg_advisory_unlock(hashtext('chartdb_collab_diagrams_fk_migration'));
`;

export async function migrate(pool: Pool): Promise<void> {
    await pool.query(SCHEMA_SQL);
    await pool.query(ADD_DIAGRAM_ID_FK_SQL);
}
