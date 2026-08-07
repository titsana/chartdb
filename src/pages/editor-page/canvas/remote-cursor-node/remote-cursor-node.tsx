import React from 'react';

export const RemoteCursorDot: React.FC<{ name: string; color: string }> =
    React.memo(({ name, color }) => {
        return (
            <div className="group relative">
                <div
                    className="size-3 rounded-full border-2 border-white shadow"
                    style={{ backgroundColor: color, pointerEvents: 'auto' }}
                />
                <div
                    className="pointer-events-none absolute left-4 top-0 whitespace-nowrap rounded px-1.5 py-0.5 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"
                    style={{ backgroundColor: color }}
                >
                    {name}
                </div>
            </div>
        );
    });

RemoteCursorDot.displayName = 'RemoteCursorDot';
