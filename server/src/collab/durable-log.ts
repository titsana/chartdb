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
 * receives) and returns the Yjs update it carries, or null if it genuinely
 * doesn't carry one. This is a read-only re-decode of the same bytes
 * Hocuspocus's own MessageReceiver will separately decode right after — it
 * doesn't consume or mutate anything Hocuspocus owns.
 *
 * Wire shape: [documentName: varString][messageType: varUint][...] — the
 * documentName prefix is Hocuspocus's own envelope (this is exactly what
 * makes it wire-incompatible with a plain y-websocket client, see the
 * design doc's Phase 3 section). For a Sync/SyncReply outer message, the
 * payload is itself [syncMessageType: varUint][...]:
 *   - step1 (0): a state-vector query only, nothing to persist — null.
 *   - step2 (1) / update (2): the remaining bytes are a real Yjs update —
 *     that's what this returns.
 *   - anything else recognized as non-sync (awareness, queryAwareness,
 *     stateless, auth, close): no Yjs update to log — null.
 *
 * Throws — deliberately, does not swallow — when the bytes can't be
 * decoded as a well-formed Hocuspocus envelope at all (the documentName/
 * outerType/syncType reads themselves fail, or a step2/update message's
 * payload can't be read). Returning null here instead would be the actual
 * durability gap this whole hook exists to close: the caller
 * (persistence-extension.ts's beforeHandleMessage) treats null as "nothing
 * to log, safe to let this message through" — silently doing that for a
 * message this couldn't actually parse would let Hocuspocus apply and
 * broadcast an update that was never durably logged. Letting the throw
 * propagate out of beforeHandleMessage instead makes Hocuspocus close the
 * connection without applying the message (see Connection.ts's
 * processMessages: beforeHandleMessage's rejection happens before
 * receiver.apply()) — blunt, but safe: the client reconnects and resyncs
 * rather than the server silently accepting unlogged state.
 */
export function extractUpdateFromRawMessage(raw: Uint8Array): Uint8Array | null {
    const decoder = decoding.createDecoder(raw);
    decoding.readVarString(decoder); // Hocuspocus's documentName envelope
    const outerType = decoding.readVarUint(decoder);
    if (
        outerType !== HOCUSPOCUS_MESSAGE_SYNC &&
        outerType !== HOCUSPOCUS_MESSAGE_SYNC_REPLY
    ) {
        // A recognized non-sync outer type (awareness/auth/stateless/...) —
        // legitimately nothing to log, not a parse failure.
        return null;
    }
    const syncType = decoding.readVarUint(decoder);
    if (syncType === messageYjsSyncStep1) {
        return null;
    }
    if (syncType === messageYjsSyncStep2 || syncType === messageYjsUpdate) {
        return decoding.readVarUint8Array(decoder);
    }
    // An outer Sync/SyncReply envelope with a syncType this doesn't
    // recognize — could be a future protocol addition rather than garbage.
    // Not confidently "nothing to log", but also not confidently corrupt;
    // treated as null rather than thrown, unlike the read failures above,
    // which really can't be interpreted at all.
    return null;
}
