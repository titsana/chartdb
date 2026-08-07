import React, { useMemo } from 'react';
import { Avatar, AvatarFallback } from '@/components/avatar/avatar';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/tooltip/tooltip';
import { useCollaboration } from '@/hooks/use-collaboration';
import { cn } from '@/lib/utils';

function initials(name: string): string {
    return name
        .split(' ')
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
}

export const CollaboratorPresence: React.FC = () => {
    const {
        presence,
        connected,
        socket,
        followMap,
        followingSocketId,
        followUser,
        unfollowUser,
    } = useCollaboration();

    const followedByColors = useMemo(() => {
        const mySocketId = socket?.id;
        if (!mySocketId) return [];
        const colors: string[] = [];
        for (const [follower, target] of followMap) {
            if (target !== mySocketId) continue;
            const color = presence.find((p) => p.socketId === follower)?.color;
            if (color) colors.push(color);
        }
        return colors;
    }, [followMap, presence, socket?.id]);

    if (!connected || presence.length === 0) return null;

    return (
        <div className="flex items-center -space-x-2">
            {presence.map((p) => {
                const isMe = p.socketId === socket?.id;
                const isFollowingThem = p.socketId === followingSocketId;
                return (
                    <Tooltip key={p.socketId}>
                        <TooltipTrigger
                            onClick={() =>
                                isMe
                                    ? undefined
                                    : isFollowingThem
                                      ? unfollowUser()
                                      : followUser(p.socketId)
                            }
                        >
                            <Avatar
                                className={cn(
                                    'size-6 border-2 border-background',
                                    !isMe && 'cursor-pointer',
                                    isFollowingThem &&
                                        'ring-2 ring-offset-1 ring-offset-background'
                                )}
                                style={
                                    isFollowingThem
                                        ? { boxShadow: `0 0 0 2px ${p.color}` }
                                        : isMe && followedByColors.length > 0
                                          ? {
                                                boxShadow: followedByColors
                                                    .map(
                                                        (color, index) =>
                                                            `0 0 0 ${2 + index * 3}px ${color}`
                                                    )
                                                    .join(', '),
                                            }
                                          : undefined
                                }
                            >
                                <AvatarFallback
                                    style={{ backgroundColor: p.color }}
                                    className="text-[10px] text-white"
                                >
                                    {initials(p.name)}
                                </AvatarFallback>
                            </Avatar>
                        </TooltipTrigger>
                        <TooltipContent>
                            {isFollowingThem
                                ? `Following ${p.name} (click to stop)`
                                : p.name}
                        </TooltipContent>
                    </Tooltip>
                );
            })}
        </div>
    );
};
