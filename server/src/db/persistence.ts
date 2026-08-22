import type { Pool, PoolClient } from 'pg';
import * as Y from 'yjs';

/** Appends one raw Yjs update to the durable log. Called synchronously
 * before any ack/broadcast goes out — see collab/durable-log.ts for why. */
export async function appendUpdate(
    pool: Pool,
    diagramId: string,
    update: Uint8Array
): Promise<void> {
    await pool.query(
        'INSERT INTO yjs_updates (diagram_id, update) VALUES ($1, $2)',
        [diagramId, Buffer.from(update)]
    );
}

/**
 * Merges this diagram's latest snapshot (if any) with every update logged
 * after it into one Yjs update, for `onLoadDocument` to apply to a fresh
 * room's doc. Returns null for a diagram with no persisted state yet (a
 * brand-new room) — the caller applies nothing in that case.
 */
export async function loadMergedState(
    pool: Pool,
    diagramId: string
): Promise<Uint8Array | null> {
    const snapshotResult = await pool.query<{
        snapshot: Buffer;
        through_update_id: string;
    }>(
        'SELECT snapshot, through_update_id FROM yjs_snapshots WHERE diagram_id = $1',
        [diagramId]
    );
    const throughUpdateId = snapshotResult.rows[0]?.through_update_id ?? '0';

    const updatesResult = await pool.query<{ update: Buffer }>(
        'SELECT update FROM yjs_updates WHERE diagram_id = $1 AND id > $2 ORDER BY id',
        [diagramId, throughUpdateId]
    );

    if (snapshotResult.rows.length === 0 && updatesResult.rows.length === 0) {
        return null;
    }

    // Merge into a scratch doc rather than handing the caller a list of
    // parts to apply one-by-one — one Y.encodeStateAsUpdate is the doc's
    // canonical single-update form, and it's what onLoadDocument's
    // Y.applyUpdate(document, update) (the Database extension's own fetch
    // contract) expects.
    const scratch = new Y.Doc();
    try {
        if (snapshotResult.rows[0]) {
            Y.applyUpdate(scratch, snapshotResult.rows[0].snapshot);
        }
        for (const row of updatesResult.rows) {
            Y.applyUpdate(scratch, row.update);
        }
        return Y.encodeStateAsUpdate(scratch);
    } finally {
        scratch.destroy();
    }
}

/**
 * The highest yjs_updates.id logged for this diagram so far, or 0 if
 * none. Must be read BEFORE the caller encodes the doc's full state for
 * compaction (see storeSnapshotAndPrune) — encoding first and reading this
 * after would let a concurrently-appended update slip into the encoded
 * snapshot's content while this id lags behind it, which is harmless. The
 * dangerous direction is the reverse: if this id were captured AFTER a
 * concurrent update was both appended AND applied to the in-memory doc, the
 * snapshot encoded from that doc would already reflect it, storeSnapshotAndPrune
 * would delete rows through that id (including the concurrent one), and
 * that update would still be gone from the log even though the snapshot
 * that's supposed to cover it was encoded before it landed — a lost update.
 * Read old, encode new: the snapshot is always allowed to know MORE than
 * `throughUpdateId` claims, never less.
 */
export async function getMaxUpdateId(
    pool: Pool,
    diagramId: string
): Promise<string> {
    const result = await pool.query<{ max: string | null }>(
        'SELECT max(id) FROM yjs_updates WHERE diagram_id = $1',
        [diagramId]
    );
    return result.rows[0]?.max ?? '0';
}

/**
 * Upserts the compacted snapshot and prunes every log row it now covers, in
 * one transaction. `throughUpdateId` must have been read via getMaxUpdateId
 * BEFORE `fullState` was encoded — see that function's doc comment. The
 * `WHERE through_update_id <= $3` guard on the upsert is defensive: it stops
 * an out-of-order compaction call (there shouldn't be one — Hocuspocus
 * serializes onStoreDocument per document — but this is cheap insurance)
 * from moving a diagram's snapshot backward.
 */
export async function storeSnapshotAndPrune(
    pool: Pool,
    diagramId: string,
    fullState: Uint8Array,
    throughUpdateId: string
): Promise<void> {
    const client: PoolClient = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(
            `INSERT INTO yjs_snapshots (diagram_id, snapshot, through_update_id, updated_at)
             VALUES ($1, $2, $3, now())
             ON CONFLICT (diagram_id) DO UPDATE
             SET snapshot = $2, through_update_id = $3, updated_at = now()
             WHERE yjs_snapshots.through_update_id <= $3`,
            [diagramId, Buffer.from(fullState), throughUpdateId]
        );
        await client.query(
            'DELETE FROM yjs_updates WHERE diagram_id = $1 AND id <= $2',
            [diagramId, throughUpdateId]
        );
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}
