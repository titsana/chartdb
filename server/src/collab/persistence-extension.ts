import type {
    Extension,
    beforeHandleMessagePayload,
    onLoadDocumentPayload,
    onStoreDocumentPayload,
} from '@hocuspocus/server';
import type { Pool } from 'pg';
import * as Y from 'yjs';
import {
    appendUpdate,
    getMaxUpdateId,
    loadMergedState,
    storeSnapshotAndPrune,
} from '../db/persistence';
import { extractUpdateFromRawMessage } from './durable-log';

/**
 * Phase 3 (docs/design/realtime-collaboration.md §10): the Postgres
 * persistence layer, wired in as a plain Hocuspocus `Extension` object
 * (not `@hocuspocus/extension-database` — see the design doc's Phase 3
 * section for why: that package's own `onStoreDocument` encodes the doc's
 * full state before invoking its `store` callback, which makes it
 * impossible to read `getMaxUpdateId` before the encode the way compaction
 * requires).
 */
export function createPersistenceExtension(pool: Pool): Extension {
    return {
        extensionName: 'chartdb-postgres-persistence',

        async onLoadDocument({
            document,
            documentName,
        }: onLoadDocumentPayload): Promise<void> {
            const merged = await loadMergedState(pool, documentName);
            if (merged) {
                Y.applyUpdate(document, merged);
            }
        },

        // Runs BEFORE Hocuspocus applies the update and acks/broadcasts it
        // (see Connection.ts's processMessages: beforeHandleMessage is
        // awaited, then receiver.apply() runs) — durably logging here,
        // not in `onChange` (which fires after apply, unawaited, with the
        // ack/broadcast already gone out), is what actually prevents an
        // update from being lost if the server crashes right after.
        //
        // Deliberately unguarded: extractUpdateFromRawMessage throws (not
        // returns null) on a message it can't actually parse — see its own
        // doc comment for why treating that as "nothing to log" would be
        // exactly the durability gap this hook exists to close. Letting
        // that throw propagate here makes Hocuspocus close the connection
        // instead of applying the unparseable message.
        async beforeHandleMessage({
            documentName,
            update,
        }: beforeHandleMessagePayload): Promise<void> {
            const yUpdate = extractUpdateFromRawMessage(update);
            if (yUpdate) {
                await appendUpdate(pool, documentName, yUpdate);
            }
        },

        // Hocuspocus calls this on its own debounce schedule and
        // immediately on last-disconnect (`unloadImmediately`, on by
        // default) — no manual flush-on-disconnect wiring needed here.
        async onStoreDocument({
            document,
            documentName,
        }: onStoreDocumentPayload): Promise<void> {
            // Order matters — see getMaxUpdateId's doc comment in
            // db/persistence.ts.
            const throughUpdateId = await getMaxUpdateId(pool, documentName);
            const fullState = Y.encodeStateAsUpdate(document);
            await storeSnapshotAndPrune(
                pool,
                documentName,
                fullState,
                throughUpdateId
            );
        },
    };
}
