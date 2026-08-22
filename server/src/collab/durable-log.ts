import * as decoding from 'lib0/decoding';
import {
    messageYjsSyncStep1,
    messageYjsSyncStep2,
    messageYjsUpdate,
} from 'y-protocols/sync';

// Mirrors @hocuspocus/server's own MessageType enum (not re-exported in a
// way worth adding a dependency edge for two numbers) — Sync and SyncReply
// are dispatched identically by Hocuspocus's MessageReceiver.apply, see
// node_modules/@hocuspocus/server/dist/*.cjs's `apply` switch.
const HOCUSPOCUS_MESSAGE_SYNC = 0;
const HOCUSPOCUS_MESSAGE_SYNC_REPLY = 4;

/**
 * Peeks a raw Hocuspocus wire message (the exact bytes `beforeHandleMessage`
 * receives) and returns the Yjs update it carries, or null if it doesn't
 * carry one. This is a read-only re-decode of the same bytes Hocuspocus's
 * own MessageReceiver will separately decode right after — it doesn't
 * consume or mutate anything Hocuspocus owns.
 *
 * Wire shape: [documentName: varString][messageType: varUint][...] — the
 * documentName prefix is Hocuspocus's own envelope (this is exactly what
 * makes it wire-incompatible with a plain y-websocket client, see the
 * design doc's Phase 3 section). For a Sync/SyncReply outer message, the
 * payload is itself [syncMessageType: varUint][...]:
 *   - step1 (0): a state-vector query only, nothing to persist.
 *   - step2 (1) / update (2): the remaining bytes are a real Yjs update —
 *     that's what this returns.
 * Anything else (awareness, queryAwareness, stateless, auth, close) has no
 * Yjs update to log and returns null.
 *
 * Never throws — a message this can't parse just isn't logged here; it's
 * still handled normally by Hocuspocus's own (separate) decode right after.
 */
export function extractUpdateFromRawMessage(raw: Uint8Array): Uint8Array | null {
    try {
        const decoder = decoding.createDecoder(raw);
        decoding.readVarString(decoder); // Hocuspocus's documentName envelope
        const outerType = decoding.readVarUint(decoder);
        if (
            outerType !== HOCUSPOCUS_MESSAGE_SYNC &&
            outerType !== HOCUSPOCUS_MESSAGE_SYNC_REPLY
        ) {
            return null;
        }
        const syncType = decoding.readVarUint(decoder);
        if (syncType === messageYjsSyncStep1) {
            return null;
        }
        if (syncType === messageYjsSyncStep2 || syncType === messageYjsUpdate) {
            return decoding.readVarUint8Array(decoder);
        }
        return null;
    } catch {
        return null;
    }
}
