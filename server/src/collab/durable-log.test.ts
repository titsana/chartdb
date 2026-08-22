import * as encoding from 'lib0/encoding';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
    messageYjsSyncStep1,
    messageYjsSyncStep2,
    messageYjsUpdate,
    writeSyncStep2,
    writeUpdate,
} from 'y-protocols/sync';
import { extractUpdateFromRawMessage } from './durable-log';

const HOCUSPOCUS_MESSAGE_SYNC = 0;
const HOCUSPOCUS_MESSAGE_AWARENESS = 1;

/** Builds the exact wire shape Hocuspocus sends/receives: [documentName:
 * varString][outerMessageType: varUint][...]. */
function buildMessage(
    documentName: string,
    outerType: number,
    writeInner: (encoder: encoding.Encoder) => void
): Uint8Array {
    const encoder = encoding.createEncoder();
    encoding.writeVarString(encoder, documentName);
    encoding.writeVarUint(encoder, outerType);
    writeInner(encoder);
    return encoding.toUint8Array(encoder);
}

describe('extractUpdateFromRawMessage', () => {
    it('returns null for a sync step1 message (state-vector query, no update)', () => {
        const doc = new Y.Doc();
        const message = buildMessage('room-1', HOCUSPOCUS_MESSAGE_SYNC, (enc) => {
            encoding.writeVarUint(enc, messageYjsSyncStep1);
            encoding.writeVarUint8Array(enc, Y.encodeStateVector(doc));
        });
        expect(extractUpdateFromRawMessage(message)).toBeNull();
    });

    it('extracts the update from a sync step2 message', () => {
        const doc = new Y.Doc();
        doc.getMap('m').set('a', 1);
        const encoder = encoding.createEncoder();
        encoding.writeVarString(encoder, 'room-1');
        encoding.writeVarUint(encoder, HOCUSPOCUS_MESSAGE_SYNC);
        writeSyncStep2(encoder, doc);
        const message = encoding.toUint8Array(encoder);

        const extracted = extractUpdateFromRawMessage(message);
        expect(extracted).not.toBeNull();

        // Prove it's a genuine, applicable Yjs update carrying doc's content
        // — not just "some bytes".
        const replay = new Y.Doc();
        Y.applyUpdate(replay, extracted!);
        expect(replay.getMap('m').get('a')).toBe(1);
    });

    it('extracts the update from a plain update message', () => {
        const doc = new Y.Doc();
        doc.getMap('m').set('b', 2);
        const update = Y.encodeStateAsUpdate(doc);
        const encoder = encoding.createEncoder();
        encoding.writeVarString(encoder, 'room-1');
        encoding.writeVarUint(encoder, HOCUSPOCUS_MESSAGE_SYNC);
        writeUpdate(encoder, update);
        const message = encoding.toUint8Array(encoder);

        const extracted = extractUpdateFromRawMessage(message);
        expect(extracted).toEqual(update);
    });

    it('returns null for an awareness message', () => {
        const message = buildMessage(
            'room-1',
            HOCUSPOCUS_MESSAGE_AWARENESS,
            (enc) => {
                encoding.writeVarUint8Array(enc, new Uint8Array([1, 2, 3]));
            }
        );
        expect(extractUpdateFromRawMessage(message)).toBeNull();
    });

    it('throws (does not silently return null) on genuinely unparseable input', () => {
        // Deliberate: returning null here would mean "nothing to log, safe
        // to let it through" for a message that was never actually
        // understood — see the function's own doc comment for why that's
        // the exact durability gap this hook exists to close. The caller
        // (persistence-extension.ts) relies on this throwing so Hocuspocus
        // closes the connection instead of applying an unlogged update.
        expect(() =>
            extractUpdateFromRawMessage(new Uint8Array([255, 255, 255]))
        ).toThrow();
        expect(() => extractUpdateFromRawMessage(new Uint8Array([]))).toThrow();
    });

    it('returns null, without throwing, for a recognized non-sync message type', () => {
        // Contrast with the throwing case above: this outer type (auth, 2)
        // decodes cleanly and is legitimately "nothing to log" — not a
        // parse failure.
        const message = buildMessage('room-1', 2, (enc) => {
            encoding.writeVarUint(enc, 0);
            encoding.writeVarString(enc, 'sometoken');
        });
        expect(extractUpdateFromRawMessage(message)).toBeNull();
    });

    it('sanity check on the constant used for messageYjsUpdate', () => {
        // extractUpdateFromRawMessage hardcodes the outer
        // MessageType.Sync/SyncReply values (0/4) rather than importing
        // them (see its own comment on why) — this pins that
        // messageYjsUpdate itself really is 2, so a future y-protocols bump
        // that silently renumbers it would be caught here rather than only
        // by a much harder-to-diagnose integration-test failure.
        expect(messageYjsUpdate).toBe(2);
        expect(messageYjsSyncStep2).toBe(1);
        expect(messageYjsSyncStep1).toBe(0);
    });
});
