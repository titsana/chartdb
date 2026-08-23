import React from 'react';
import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
    Awareness,
    applyAwarenessUpdate,
    encodeAwarenessUpdate,
} from 'y-protocols/awareness';
import { useSelectingPeers } from '../use-selecting-peers';
import { chartDBContext } from '@/context/chartdb-context/chartdb-context';

function relayAwareness(from: Awareness, to: Awareness) {
    const update = encodeAwarenessUpdate(from, [from.clientID]);
    applyAwarenessUpdate(to, update, 'test');
}

function renderWithAwareness(nodeId: string, awareness: Awareness) {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <chartDBContext.Provider
            // Only `awareness` matters for this hook — no need to fill in
            // the rest of ChartDBContext's large interface.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            value={{ awareness } as any}
        >
            {children}
        </chartDBContext.Provider>
    );
    return renderHook(() => useSelectingPeers(nodeId), { wrapper });
}

/**
 * Perf fix pin: a remote peer's presence changing (cursor/viewport, on
 * every pan/mousemove frame while they're active) must not force a new
 * array reference out of `useSelectingPeers` for a node that peer never
 * had selected — that reference is what table/area/note node components
 * subscribe to, so a churning reference re-renders every one of them on
 * every frame a remote peer merely moves their mouse.
 */
describe('useSelectingPeers', () => {
    it("returns the same array reference across renders while the remote peer's selection doesn't include this node", async () => {
        const localDoc = new Y.Doc();
        const localAwareness = new Awareness(localDoc);
        const remoteDoc = new Y.Doc();
        const remoteAwareness = new Awareness(remoteDoc);
        remoteAwareness.setLocalState({
            selectedTableIds: ['some-other-table'],
            cursor: { x: 0, y: 0 },
        });

        const { result } = renderWithAwareness('table-1', localAwareness);

        act(() => {
            relayAwareness(remoteAwareness, localAwareness);
        });
        await waitFor(() => {
            // peers array now has one entry, but not selecting table-1
            expect(result.current).toEqual([]);
        });
        const firstEmptyResult = result.current;

        // Remote peer's cursor moves — a genuine, non-deduped change to
        // usePresence's peers array (this is the case use-presence.ts's
        // own dedup does NOT catch, by design: something real changed).
        act(() => {
            remoteAwareness.setLocalStateField('cursor', { x: 5, y: 5 });
            relayAwareness(remoteAwareness, localAwareness);
        });

        // Give the change a moment to propagate through usePresence.
        await waitFor(() => {
            expect(result.current).toEqual([]);
        });

        expect(result.current).toBe(firstEmptyResult);
    });

    it("returns a new reference when the remote peer's selection actually starts/stops including this node", async () => {
        const localDoc = new Y.Doc();
        const localAwareness = new Awareness(localDoc);
        const remoteDoc = new Y.Doc();
        const remoteAwareness = new Awareness(remoteDoc);
        remoteAwareness.setLocalState({ selectedTableIds: [] });

        const { result } = renderWithAwareness('table-1', localAwareness);

        act(() => {
            relayAwareness(remoteAwareness, localAwareness);
        });
        await waitFor(() => {
            expect(result.current).toEqual([]);
        });
        const beforeSelect = result.current;

        act(() => {
            remoteAwareness.setLocalStateField('selectedTableIds', ['table-1']);
            relayAwareness(remoteAwareness, localAwareness);
        });

        await waitFor(() => {
            expect(result.current).toHaveLength(1);
        });
        expect(result.current).not.toBe(beforeSelect);
        expect(result.current[0].clientId).toBe(remoteAwareness.clientID);
    });
});
