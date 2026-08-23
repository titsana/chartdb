import React, { useCallback, useState } from 'react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/dropdown-menu/dropdown-menu';
import { Button } from '@/components/button/button';
import { Input } from '@/components/input/input';
import {
    Popover,
    PopoverContent,
    PopoverAnchor,
} from '@/components/popover/popover';
import { Ellipsis, Pencil, Trash2 } from 'lucide-react';
import { useStorage } from '@/hooks/use-storage';
import type { DiagramGroup } from '@/lib/domain/diagram-group';
import { useTranslation } from 'react-i18next';

/**
 * Phase 7 (folder-style diagram grouping) — rename/delete for one group
 * header row in open-diagram-dialog.tsx. Mirrors diagram-row-actions-
 * menu.tsx's shape; the rename flow is a small inline popover (same
 * reasoning as create-group-popover.tsx — a one-field action doesn't
 * need a full dialog) anchored to the trigger button rather than a
 * second dropdown item, so it can stay open while the user types.
 */
export const GroupRowActionsMenu: React.FC<{
    group: DiagramGroup;
    refetch: () => void;
}> = ({ group, refetch }) => {
    const { updateDiagramGroup, deleteDiagramGroup } = useStorage();
    const { t } = useTranslation();
    const [renaming, setRenaming] = useState(false);
    const [name, setName] = useState(group.name);

    const handleRename = useCallback(async () => {
        const trimmed = name.trim();
        if (!trimmed || trimmed === group.name) {
            setRenaming(false);
            return;
        }
        await updateDiagramGroup({ id: group.id, name: trimmed });
        setRenaming(false);
        refetch();
    }, [name, group.id, group.name, updateDiagramGroup, refetch]);

    const handleDelete = useCallback(async () => {
        await deleteDiagramGroup(group.id);
        refetch();
    }, [deleteDiagramGroup, group.id, refetch]);

    return (
        <Popover open={renaming} onOpenChange={setRenaming}>
            <PopoverAnchor asChild>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 p-0"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <Ellipsis className="size-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem
                            onClick={() => {
                                setName(group.name);
                                setRenaming(true);
                            }}
                            className="flex justify-between gap-4"
                        >
                            {t('open_diagram_dialog.group_actions.rename')}
                            <Pencil className="size-3.5" />
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={handleDelete}
                            className="flex justify-between gap-4 text-red-700"
                        >
                            {t('open_diagram_dialog.group_actions.delete')}
                            <Trash2 className="size-3.5 text-red-700" />
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </PopoverAnchor>
            <PopoverContent className="w-64" align="end">
                <div className="flex flex-col gap-2">
                    <Input
                        autoFocus
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                handleRename();
                            }
                        }}
                    />
                    <Button type="button" size="sm" onClick={handleRename}>
                        {t('open_diagram_dialog.group_actions.rename')}
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
};
