import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
    Awareness,
    applyAwarenessUpdate,
    encodeAwarenessUpdate,
} from 'y-protocols/awareness';
import { usePresence } from '../use-presence';

/**
 * Phase 5 (docs/design/realtime-collaboration.md §10). Uses two real
 * `Awareness` instances (one per simulated peer, each backed by its own
 * `Y.Doc` — `Awareness.clientID` is borrowed from `doc.clientID`) and the
 * actual `y-protocols/awareness` encode/apply functions to move state
 * between them, rather than a hand-rolled mock — this is the same
 * mechanism Hocuspocus's provider uses under the hood (see
 * `applyAwarenessMessage` in `@hocuspocus/provider`), just without a real
 * WebSocket in between. Matches this codebase's existing
 * use-y-collection-sync.test.tsx precedent of testing against the real
 * Yjs primitives instead of a mock.
 */
function relayAwareness(from: Awareness, to: Awareness) {
    const update = encodeAwarenessUpdate(from, [from.clientID]);
    applyAwarenessUpdate(to, update, 'test');
}

describe('usePresence', () => {
    it("projects a remote peer's awareness state, excluding this client's own", async () => {
        const localDoc = new Y.Doc();
        const localAwareness = new Awareness(localDoc);
        const { result } = renderHook(() => usePresence(localAwareness));

        expect(result.current).toEqual([]);

        // this client sets its own local state — must never show up in
        // its own usePresence() result
        act(() => {
            localAwareness.setLocalStateField('displayName', 'Me');
        });
        expect(result.current).toEqual([]);

        // a remote peer, on its own Y.Doc/Awareness, sets state and it's
        // relayed over (simulating the provider forwarding it)
        const remoteDoc = new Y.Doc();
        const remoteAwareness = new Awareness(remoteDoc);
        remoteAwareness.setLocalState({
            displayName: 'Remote User',
            color: '#ff0000',
            cursor: { x: 10, y: 20 },
            selectedTableIds: ['table-1'],
        });

        act(() => {
            relayAwareness(remoteAwareness, localAwareness);
        });

        await waitFor(() => {
            expect(result.current).toHaveLength(1);
        });
        expect(result.current[0]).toMatchObject({
            clientId: remoteAwareness.clientID,
            displayName: 'Remote User',
            color: '#ff0000',
            cursor: { x: 10, y: 20 },
            selectedTableIds: ['table-1'],
        });
    });

    it('drops a peer once its awareness state is cleared (e.g. it disconnects)', async () => {
        const localDoc = new Y.Doc();
        const localAwareness = new Awareness(localDoc);
        const remoteDoc = new Y.Doc();
        const remoteAwareness = new Awareness(remoteDoc);
        remoteAwareness.setLocalState({ displayName: 'Remote User' });

        const { result } = renderHook(() => usePresence(localAwareness));

        act(() => {
            relayAwareness(remoteAwareness, localAwareness);
        });
        await waitFor(() => {
            expect(result.current).toHaveLength(1);
        });

        act(() => {
            remoteAwareness.setLocalState(null);
            relayAwareness(remoteAwareness, localAwareness);
        });

        await waitFor(() => {
            expect(result.current).toHaveLength(0);
        });
    });

    it('returns no peers (and never throws) when awareness is null', () => {
        const { result } = renderHook(() => usePresence(null));
        expect(result.current).toEqual([]);
    });

    // Perf bug found via manual testing on a large imported diagram: this
    // hook is called once PER NODE (table/area/note, via
    // useSelectingPeers), so N nodes = N+1 subscriptions to the same
    // `awareness.on('change')`. That event fires for this client's OWN
    // state writes too (every mousemove/pan broadcasts cursor/viewport),
    // not just remote peers' — panning alone, with zero other peers
    // connected, was re-rendering every node component on every frame.
    // `readPeers()` already excludes this client's own state, so nothing
    // in its OUTPUT should actually change when only local state moves —
    // this pins that no re-render (and no new array reference) happens in
    // that case.
    it("does not re-render (same array reference) when only this client's own state changes", () => {
        const localDoc = new Y.Doc();
        const localAwareness = new Awareness(localDoc);
        let renderCount = 0;
        const { result } = renderHook(() => {
            renderCount++;
            return usePresence(localAwareness);
        });

        const peersAfterMount = result.current;
        const renderCountAfterMount = renderCount;

        act(() => {
            localAwareness.setLocalStateField('cursor', { x: 1, y: 2 });
        });
        act(() => {
            localAwareness.setLocalStateField('cursor', { x: 3, y: 4 });
        });
        act(() => {
            localAwareness.setLocalStateField('viewportCenter', {
                x: 5,
                y: 6,
                zoom: 1,
            });
        });

        expect(renderCount).toBe(renderCountAfterMount);
        expect(result.current).toBe(peersAfterMount);
    });

    // Contrast case: a REMOTE peer's state change must still come through
    // — the fix above skips a no-op update, not real ones.
    it("does re-render when a remote peer's state actually changes", async () => {
        const localDoc = new Y.Doc();
        const localAwareness = new Awareness(localDoc);
        const remoteDoc = new Y.Doc();
        const remoteAwareness = new Awareness(remoteDoc);
        remoteAwareness.setLocalState({ cursor: { x: 0, y: 0 } });

        const { result } = renderHook(() => usePresence(localAwareness));

        act(() => {
            relayAwareness(remoteAwareness, localAwareness);
        });
        await waitFor(() => {
            expect(result.current).toHaveLength(1);
        });
        const peersAfterFirstMove = result.current;

        act(() => {
            remoteAwareness.setLocalStateField('cursor', { x: 9, y: 9 });
            relayAwareness(remoteAwareness, localAwareness);
        });

        await waitFor(() => {
            expect(result.current[0].cursor).toEqual({ x: 9, y: 9 });
        });
        expect(result.current).not.toBe(peersAfterFirstMove);
    });
});
