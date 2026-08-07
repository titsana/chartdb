import React from 'react';
import { ViewportPortal } from '@xyflow/react';
import { useCollaboration } from '@/hooks/use-collaboration';
import { RemoteCursorDot } from './remote-cursor-node';

// Rendered via ViewportPortal (not the React Flow `nodes` array) so that
// live cursor ticks — up to 20/sec per remote collaborator — never touch
// React Flow's node reconciliation or force the (heavy) Canvas component to
// re-render; only this small leaf subscribes to remoteCursors.
export const RemoteCursorsOverlay: React.FC = React.memo(() => {
    const { remoteCursors, presence } = useCollaboration();

    return (
        <ViewportPortal>
            {Array.from(remoteCursors.entries()).map(([socketId, cursor]) => {
                const collaborator = presence.find(
                    (p) => p.socketId === socketId
                );
                return (
                    <div
                        key={socketId}
                        style={{
                            position: 'absolute',
                            zIndex: 1000,
                            transform: `translate(${cursor.x}px, ${cursor.y}px)`,
                            transition: 'transform 80ms linear',
                            pointerEvents: 'none',
                        }}
                    >
                        <RemoteCursorDot
                            name={collaborator?.name ?? 'Anonymous'}
                            color={collaborator?.color ?? '#888888'}
                        />
                    </div>
                );
            })}
        </ViewportPortal>
    );
});

RemoteCursorsOverlay.displayName = 'RemoteCursorsOverlay';
