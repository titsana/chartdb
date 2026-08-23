import React, { useCallback, useState } from 'react';
import { TableCell, TableRow } from '@/components/table/table';
import { Input } from '@/components/input/input';
import { Button } from '@/components/button/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/dropdown-menu/dropdown-menu';
import { Ellipsis, Pencil, Trash2 } from 'lucide-react';
import { useStorage } from '@/hooks/use-storage';
import type { DiagramGroup } from '@/lib/domain/diagram-group';
import { useTranslation } from 'react-i18next';

interface GroupHeaderRowProps {
    group: DiagramGroup;
    refetch: () => void;
}

/**
 * Renders a group header row: name cell + actions dropdown ("Rename"/
 * "Delete group"). Rename swaps the name cell for an inline <Input> in
 * this SAME row instead of a Popover anchored inside the dropdown —
 * nesting a Popover's dismiss-on-outside-click layer inside a
 * DropdownMenu's own auto-close-on-select layer is a known Radix
 * footgun (the two overlays race and the popover can get dismissed
 * before its input ever gets focus). Plain conditional rendering in the
 * row has no such race.
 */
export const GroupHeaderRow: React.FC<GroupHeaderRowProps> = ({
    group,
    refetch,
}) => {
    const { updateDiagramGroup, deleteDiagramGroup } = useStorage();
    const { t } = useTranslation();
    const [renaming, setRenaming] = useState(false);
    const [name, setName] = useState(group.name);

    const commitRename = useCallback(async () => {
        setRenaming(false);
        const trimmed = name.trim();
        if (!trimmed || trimmed === group.name) {
            setName(group.name);
            return;
        }
        await updateDiagramGroup({ id: group.id, name: trimmed });
        refetch();
    }, [updateDiagramGroup, group.id, group.name, name, refetch]);

    const cancelRename = useCallback(() => {
        setName(group.name);
        setRenaming(false);
    }, [group.name]);

    const onDelete = useCallback(async () => {
        await deleteDiagramGroup(group.id);
        refetch();
    }, [deleteDiagramGroup, group.id, refetch]);

    return (
        <TableRow className="bg-muted/50 hover:bg-muted/50">
            <TableCell colSpan={5} className="font-medium">
                {renaming ? (
                    <Input
                        autoFocus
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename();
                            if (e.key === 'Escape') cancelRename();
                        }}
                        className="h-7 max-w-64"
                    />
                ) : (
                    group.name
                )}
            </TableCell>
            <TableCell className="items-center p-0 pr-1 text-right">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 p-0"
                        >
                            <Ellipsis className="size-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem
                            onClick={() => setRenaming(true)}
                            className="flex justify-between gap-4"
                        >
                            {t('open_diagram_dialog.group_actions.rename')}
                            <Pencil className="size-3.5" />
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={onDelete}
                            className="flex justify-between gap-4 text-red-700"
                        >
                            {t('open_diagram_dialog.group_actions.delete')}
                            <Trash2 className="size-3.5 text-red-700" />
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </TableCell>
        </TableRow>
    );
};
