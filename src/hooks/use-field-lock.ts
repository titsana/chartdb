import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useCollaboration } from './use-collaboration';
import type { CollabPresence } from '@/context/collaboration-context/collaboration-context';

// Visual "someone's editing this" affordance for a single input — not a real
// lock, nothing is blocked. `key` is "EntityType:id:field" (see
// collaboration-provider.tsx's fieldKeysFor convention).
export function useFieldLock(key: string) {
    const { remoteFieldFocus, emitFieldFocus, presence } = useCollaboration();
    const heldRef = useRef(false);

    const onFocus = useCallback(() => {
        heldRef.current = true;
        emitFieldFocus(key);
    }, [emitFieldFocus, key]);

    const onBlur = useCallback(() => {
        heldRef.current = false;
        emitFieldFocus(null);
    }, [emitFieldFocus]);

    // Edit mode can unmount (e.g. clicking away closes the editor) without
    // firing blur — release the lock so it doesn't linger forever (the
    // gateway has no other way to clear it, see its ponytail comment).
    useEffect(() => {
        return () => {
            if (heldRef.current) emitFieldFocus(null);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const editors: CollabPresence[] = useMemo(() => {
        const socketIds = new Set<string>();
        for (const [socketId, focusedKey] of remoteFieldFocus) {
            if (focusedKey === key) socketIds.add(socketId);
        }
        if (socketIds.size === 0) return [];
        return presence.filter((p) => socketIds.has(p.socketId));
    }, [remoteFieldFocus, key, presence]);

    return { onFocus, onBlur, editors };
}
