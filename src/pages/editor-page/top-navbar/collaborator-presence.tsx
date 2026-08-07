import React from 'react';
import { Avatar, AvatarFallback } from '@/components/avatar/avatar';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/tooltip/tooltip';
import { useCollaboration } from '@/hooks/use-collaboration';

function initials(name: string): string {
    return name
        .split(' ')
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
}

export const CollaboratorPresence: React.FC = () => {
    const { presence, connected } = useCollaboration();

    if (!connected || presence.length === 0) return null;

    return (
        <div className="flex items-center -space-x-2">
            {presence.map((p) => (
                <Tooltip key={p.socketId}>
                    <TooltipTrigger>
                        <Avatar className="size-6 border-2 border-background">
                            <AvatarFallback
                                style={{ backgroundColor: p.color }}
                                className="text-[10px] text-white"
                            >
                                {initials(p.name)}
                            </AvatarFallback>
                        </Avatar>
                    </TooltipTrigger>
                    <TooltipContent>{p.name}</TooltipContent>
                </Tooltip>
            ))}
        </div>
    );
};
