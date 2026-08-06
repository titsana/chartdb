import React from 'react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/dropdown-menu/dropdown-menu';
import { Button } from '@/components/button/button';
import { Ellipsis, Pencil, Trash2 } from 'lucide-react';
import type { Group } from '@/lib/domain/group';
import { useTranslation } from 'react-i18next';

interface GroupActionsMenuProps {
    group: Group;
    onRename: () => void;
    onDelete: () => void;
}

export const GroupActionsMenu: React.FC<GroupActionsMenuProps> = ({
    onRename,
    onDelete,
}) => {
    const { t } = useTranslation();

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 p-0"
                    onClick={(e) => e.stopPropagation()}
                >
                    <Ellipsis className="size-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem
                    onClick={onRename}
                    className="flex justify-between gap-4"
                >
                    {t('open_diagram_dialog.group_actions.rename')}
                    <Pencil className="size-3.5" />
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    onClick={onDelete}
                    className="flex justify-between gap-4 text-red-700"
                >
                    {t('open_diagram_dialog.group_actions.delete')}
                    <Trash2 className="size-3.5 text-red-700" />
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
