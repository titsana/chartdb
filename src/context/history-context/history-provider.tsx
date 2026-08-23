import React, { useCallback, useEffect, useState } from 'react';
import type * as Y from 'yjs';
import { historyContext } from './history-context';
import { useChartDB } from '@/hooks/use-chartdb';
import { useToast } from '@/components/toast/use-toast';

// Phase 5 (docs/design/realtime-collaboration.md §10): every collection
// chartdb-provider.tsx's Y.UndoManager is scoped to — see its own
// `undoManagerRef` doc comment. Kept as a plain list here (not imported
// from chartdb-provider.tsx, which doesn't export one) since this is the
// only place that needs to enumerate them for a snapshot, not to mutate
// them.
const COLLECTION_NAMES = [
    'tables',
    'relationships',
    'dependencies',
    'areas',
    'customTypes',
    'notes',
] as const;

// Cheap content signature for "did undo()/redo() actually change
// anything" — deliberately NOT a diff of React `tables`/`relationships`
// state (see the doc comment on `runWithStaleCheck` below for why that
// would be unreliable here), and deliberately NOT `Y.encodeStateAsUpdate`
// (that changes on every transaction regardless of content, via Yjs's own
// clock/state-vector bookkeeping — useless for a content comparison).
// `Y.Map.toJSON()` recursively serializes nested shared types, so this
// captures the actual domain content of all six collections.
function snapshotDoc(doc: Y.Doc): string {
    return JSON.stringify(
        COLLECTION_NAMES.map((name) => doc.getMap(name).toJSON())
    );
}

export const HistoryProvider: React.FC<React.PropsWithChildren> = ({
    children,
}) => {
    const { undoManager } = useChartDB();
    const { toast } = useToast();
    const [hasUndo, setHasUndo] = useState(false);
    const [hasRedo, setHasRedo] = useState(false);

    // Mirrors undoManager.canUndo()/canRedo() into React state — the
    // manager itself is a plain Yjs EventEmitter, not something React
    // re-renders on.
    useEffect(() => {
        if (!undoManager) {
            setHasUndo(false);
            setHasRedo(false);
            return;
        }

        const update = () => {
            setHasUndo(undoManager.canUndo());
            setHasRedo(undoManager.canRedo());
        };
        update();
        undoManager.on('stack-item-added', update);
        undoManager.on('stack-item-popped', update);
        undoManager.on('stack-cleared', update);
        return () => {
            undoManager.off('stack-item-added', update);
            undoManager.off('stack-item-popped', update);
            undoManager.off('stack-cleared', update);
        };
    }, [undoManager]);

    // §9's "undo stack stale references" question — resolved: toast, not
    // a silent no-op. Y.UndoManager's undo()/redo() return a truthy
    // StackItem whenever one was popped, even if applying it against the
    // CURRENT doc produced no visible change (e.g. the table it targeted
    // was deleted by another peer since this entry was pushed — Yjs turns
    // that into a safe no-op rather than erroring, but "I hit Ctrl+Z and
    // nothing happened" still needs an explanation for the user).
    //
    // Detected with a before/after snapshot read straight off the live
    // Y.Doc (`undoManager.doc`) — NOT by re-reading `tables`/
    // `relationships` from useChartDB(): React 18 batches the setState
    // calls useYCollectionSync's observers make inside undoManager.undo()
    // 's own synchronous call, so a closure-captured React state variable
    // is still the pre-undo value at this point in the same event
    // handler. The Y.Doc itself has no such lag.
    const runWithStaleCheck = useCallback(
        (pop: () => unknown, title: string) => {
            if (!undoManager) return;
            const doc = undoManager.doc;
            const before = snapshotDoc(doc);
            const popped = pop();
            if (popped && snapshotDoc(doc) === before) {
                toast({
                    title,
                    description:
                        "That change no longer applies — it's likely been removed since.",
                    variant: 'destructive',
                });
            }
        },
        [undoManager, toast]
    );

    const undo = useCallback(() => {
        runWithStaleCheck(() => undoManager?.undo(), "Can't undo");
    }, [runWithStaleCheck, undoManager]);

    const redo = useCallback(() => {
        runWithStaleCheck(() => undoManager?.redo(), "Can't redo");
    }, [runWithStaleCheck, undoManager]);

    return (
        <historyContext.Provider value={{ undo, redo, hasUndo, hasRedo }}>
            {children}
        </historyContext.Provider>
    );
};
