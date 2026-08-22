import { useEffect } from 'react';
import type * as Y from 'yjs';
import { compareByDomainOrder } from '@/lib/collab/y-diagram';

/**
 * Phase 2 (docs/design/realtime-collaboration.md §10): projects one
 * top-level collection of a shared `Y.Doc` into React state, keeping it in
 * sync with every change to that collection (this tab's own writes now;
 * a remote peer's once Phase 4 wires a WebSocket provider in).
 *
 * A structural change (an entry added/removed — the event's target is the
 * collection map itself) re-derives the full array via `readAll`. A
 * non-structural change (an existing entry's own data changed — this
 * includes a change nested arbitrarily deep inside that entry, e.g. one
 * of a table's own fields/indexes: `event.path[0]` is always that entry's
 * top-level key regardless of how deep inside it the actual mutation
 * happened) patches only that one entry via `readOne`, so untouched
 * entries keep their object identity instead of every entry in the
 * collection getting a new reference on every edit (see the
 * object-identity decision in the design doc). If the patch touched the
 * entry's own `order` field (e.g. a drag-reorder), the array is re-sorted
 * too — see `compareByDomainOrder`.
 *
 * `readAll`/`readOne` are supplied by the caller rather than hardcoded to
 * `readCollection`/`readItem` because a nested collection (`tables`, with
 * their own fields/indexes/checkConstraints) needs a table-aware decode
 * (`readTables`/`readTableItem`) instead of the flat one that works for
 * notes/customTypes/relationships/dependencies/areas.
 *
 * `doc` is expected to be read fresh from a ref every render (e.g.
 * `collabDocRef.current`) — passing the object itself as a dependency,
 * rather than an artificial generation counter, is what makes this effect
 * re-subscribe when a diagram (re)load swaps in a brand new `Y.Doc`.
 */
export function useYCollectionSync<
    T extends { id: string; order?: number | null },
>(
    doc: Y.Doc | null,
    mapKey: string,
    readAll: (collectionMap: Y.Map<unknown>) => T[],
    readOne: (collectionMap: Y.Map<unknown>, id: string) => T | undefined,
    setState: (updater: T[] | ((current: T[]) => T[])) => void
): void {
    useEffect(() => {
        if (!doc) return;
        const collectionMap = doc.getMap<unknown>(mapKey);

        const handler = (events: Y.YEvent<Y.Map<unknown>>[]) => {
            let structural = false;
            const changedIds = new Set<string>();
            events.forEach((event) => {
                if (event.target === collectionMap) {
                    structural = true;
                    event.changes.keys.forEach((_change, key) =>
                        changedIds.add(key)
                    );
                } else {
                    changedIds.add(event.path[0] as string);
                }
            });

            if (structural) {
                setState(readAll(collectionMap));
                return;
            }

            setState((current) => {
                let next = current;
                let orderMayHaveChanged = false;
                changedIds.forEach((id) => {
                    const decoded = readOne(collectionMap, id);
                    const idx = next.findIndex((n) => n.id === id);
                    if (!decoded || idx === -1) return;
                    if (decoded.order !== next[idx].order) {
                        orderMayHaveChanged = true;
                    }
                    next = next.map((n, i) => (i === idx ? decoded : n));
                });
                return orderMayHaveChanged
                    ? [...next].sort(compareByDomainOrder)
                    : next;
            });
        };

        collectionMap.observeDeep(handler);
        return () => collectionMap.unobserveDeep(handler);
        // `readAll`/`readOne`/`setState` are expected stable (module-level
        // functions, and a useState setter); `doc` is the real
        // re-subscribe trigger.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [doc, mapKey]);
}
