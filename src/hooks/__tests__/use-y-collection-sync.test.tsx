import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { upsertItem, patchItem, readCollection } from '@/lib/collab/y-diagram';
import { useYCollectionSync } from '../use-y-collection-sync';

/**
 * Phase 2 (docs/design/realtime-collaboration.md §10) exit criteria:
 * "the Yjs-merge simulation tests for every Appendix B scenario pass."
 * The existing y-diagram.test.ts merge tests exercise diagramToYDoc/
 * yDocToDiagram directly (pure functions, no React). These tests instead
 * exercise `useYCollectionSync` itself against a genuinely REMOTE update —
 * `Y.applyUpdate` from an independent second `Y.Doc`, not a local
 * upsertItem/patchItem call in the same process — which is the code path
 * nothing else in the suite touches: every other test so far only
 * triggers changes through this same tab's own provider methods.
 */

type Item = { id: string; name: string; order?: number | null };
const decode = (r: Record<string, unknown>) => r as unknown as Item;

function renderCollectionSync(doc: Y.Doc, mapKey: string) {
    // mirrors how ChartDBProvider seeds `notes`/`customTypes` state:
    // read the doc's current content once for the initial value, then
    // let the observer (under test) keep it in sync from there. The
    // hook itself only reacts to *changes* — it doesn't do an initial
    // read — so a harness that started from `[]` would be testing its
    // own setup bug, not the hook.
    return renderHook(() => {
        const [items, setItems] = useState<Item[]>(() =>
            readCollection<Item>(doc.getMap<unknown>(mapKey), decode)
        );
        useYCollectionSync(doc, mapKey, decode, setItems);
        return items;
    });
}

describe('useYCollectionSync — remote update via Y.applyUpdate', () => {
    it('a remote peer adding a new entry (structural) is projected into state', async () => {
        const localDoc = new Y.Doc();
        const { result } = renderCollectionSync(localDoc, 'items');
        expect(result.current).toEqual([]);

        // an independent "remote" doc, synced to the same starting state
        const remoteDoc = new Y.Doc();
        Y.applyUpdate(remoteDoc, Y.encodeStateAsUpdate(localDoc));

        // the remote peer adds an item entirely within its own doc
        remoteDoc.transact(() => {
            upsertItem(remoteDoc.getMap<unknown>('items'), {
                id: 'a1',
                name: 'from remote',
            });
        });

        // simulates the update arriving over a (future, Phase 4) WebSocket
        act(() => {
            Y.applyUpdate(localDoc, Y.encodeStateAsUpdate(remoteDoc));
        });

        await waitFor(() => {
            expect(result.current.map((i) => i.id)).toEqual(['a1']);
        });
        expect(result.current[0].name).toBe('from remote');
    });

    it('a remote peer editing an existing entry (non-structural) patches state without touching an untouched sibling', async () => {
        const localDoc = new Y.Doc();
        const localMap = localDoc.getMap<unknown>('items');
        upsertItem(localMap, { id: 'a1', name: 'original' });
        upsertItem(localMap, { id: 'a2', name: 'untouched' });

        const { result } = renderCollectionSync(localDoc, 'items');
        await waitFor(() => {
            expect(result.current.map((i) => i.id)).toEqual(['a1', 'a2']);
        });
        const siblingBefore = result.current.find((i) => i.id === 'a2');

        const remoteDoc = new Y.Doc();
        Y.applyUpdate(remoteDoc, Y.encodeStateAsUpdate(localDoc));
        remoteDoc.transact(() => {
            patchItem(remoteDoc.getMap<unknown>('items'), 'a1', {
                name: 'edited-remotely',
            });
        });

        act(() => {
            Y.applyUpdate(localDoc, Y.encodeStateAsUpdate(remoteDoc));
        });

        await waitFor(() => {
            expect(result.current.find((i) => i.id === 'a1')!.name).toBe(
                'edited-remotely'
            );
        });
        // sibling untouched by the remote edit keeps its object identity
        expect(result.current.find((i) => i.id === 'a2')).toBe(siblingBefore);
    });

    it('a remote peer removing an entry (structural) is projected into state', async () => {
        const localDoc = new Y.Doc();
        const localMap = localDoc.getMap<unknown>('items');
        upsertItem(localMap, { id: 'a1', name: 'first' });
        upsertItem(localMap, { id: 'a2', name: 'second' });

        const { result } = renderCollectionSync(localDoc, 'items');
        await waitFor(() => {
            expect(result.current.map((i) => i.id)).toEqual(['a1', 'a2']);
        });

        const remoteDoc = new Y.Doc();
        Y.applyUpdate(remoteDoc, Y.encodeStateAsUpdate(localDoc));
        remoteDoc.transact(() => {
            remoteDoc.getMap<unknown>('items').delete('a1');
        });

        act(() => {
            Y.applyUpdate(localDoc, Y.encodeStateAsUpdate(remoteDoc));
        });

        await waitFor(() => {
            expect(result.current.map((i) => i.id)).toEqual(['a2']);
        });
    });
});
