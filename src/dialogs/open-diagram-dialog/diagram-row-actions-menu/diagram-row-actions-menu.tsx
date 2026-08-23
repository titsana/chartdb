import React, { useCallback } from 'react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from '@/components/dropdown-menu/dropdown-menu';
import { Button } from '@/components/button/button';
import {
    Ellipsis,
    FolderMinus,
    Layers2,
    SquareArrowOutUpRight,
    Trash2,
} from 'lucide-react';
import { useChartDB } from '@/hooks/use-chartdb';
import type { Diagram } from '@/lib/domain';
import type { DiagramGroup } from '@/lib/domain/diagram-group';
import { useStorage } from '@/hooks/use-storage';
import { seedDiagramRoom } from '@/lib/collab/seed-diagram-room';
import { cloneDiagram } from '@/lib/clone';
import { useTranslation } from 'react-i18next';

interface DiagramRowActionsMenuProps {
    diagram: Diagram;
    onOpen: () => void;
    refetch: () => void;
    numberOfDiagrams: number;
    groups: DiagramGroup[];
}

export const DiagramRowActionsMenu: React.FC<DiagramRowActionsMenuProps> = ({
    diagram,
    onOpen,
    refetch,
    numberOfDiagrams,
    groups,
}) => {
    const { diagramId } = useChartDB();
    const { deleteDiagram, addDiagram, updateDiagram } = useStorage();
    const { t } = useTranslation();

    const moveToGroup = useCallback(
        async (groupId: string | null) => {
            await updateDiagram({ id: diagram.id, attributes: { groupId } });
            refetch();
        },
        [updateDiagram, diagram.id, refetch]
    );

    const onDelete = useCallback(async () => {
        deleteDiagram(diagram.id);
        refetch();

        if (diagram.id === diagramId || numberOfDiagrams <= 1) {
            window.location.href = '/';
        }
    }, [deleteDiagram, diagram.id, diagramId, refetch, numberOfDiagrams]);

    const onDuplicate = useCallback(async () => {
        const duplicatedDiagram = cloneDiagram(diagram);

        const diagramToAdd = duplicatedDiagram.diagram;

        if (!diagramToAdd) {
            return;
        }

        diagramToAdd.name = `${diagram.name} (Copy)`;

        // Doesn't navigate to the duplicate — the user stays on whatever
        // diagram they currently have open — so this can't go through
        // ChartDBProvider's loadDiagramFromData (that would hijack the
        // current diagram out from under them). seedDiagramRoom pushes the
        // duplicate's content into its own new room directly instead; the
        // duplicate picks it up normally whenever it's actually opened.
        await addDiagram({ diagram: diagramToAdd });
        await seedDiagramRoom(diagramToAdd);
        refetch();
    }, [addDiagram, refetch, diagram]);

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
                    onClick={onOpen}
                    className="flex justify-between gap-4"
                >
                    {t('open_diagram_dialog.diagram_actions.open')}
                    <SquareArrowOutUpRight className="size-3.5" />
                </DropdownMenuItem>

                <DropdownMenuItem
                    onClick={onDuplicate}
                    className="flex justify-between gap-4"
                >
                    {t('open_diagram_dialog.diagram_actions.duplicate')}
                    <Layers2 className="size-3.5" />
                </DropdownMenuItem>

                {groups.length > 0 ? (
                    <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                            {t(
                                'open_diagram_dialog.diagram_actions.move_to_group'
                            )}
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                            {groups.map((group) => (
                                <DropdownMenuItem
                                    key={group.id}
                                    disabled={diagram.groupId === group.id}
                                    onClick={() => moveToGroup(group.id)}
                                >
                                    {group.name}
                                </DropdownMenuItem>
                            ))}
                            {diagram.groupId ? (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        onClick={() => moveToGroup(null)}
                                        className="flex justify-between gap-4"
                                    >
                                        {t(
                                            'open_diagram_dialog.diagram_actions.remove_from_group'
                                        )}
                                        <FolderMinus className="size-3.5" />
                                    </DropdownMenuItem>
                                </>
                            ) : null}
                        </DropdownMenuSubContent>
                    </DropdownMenuSub>
                ) : null}

                <DropdownMenuSeparator />
                <DropdownMenuItem
                    onClick={onDelete}
                    className="flex justify-between gap-4 text-red-700"
                >
                    {t('open_diagram_dialog.diagram_actions.delete')}
                    <Trash2 className="size-3.5 text-red-700" />
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
