import { Button } from '@/components/button/button';
import { DiagramIcon } from '@/components/diagram-icon/diagram-icon';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogInternalContent,
    DialogTitle,
} from '@/components/dialog/dialog';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/table/table';
import { useConfig } from '@/hooks/use-config';
import { useDialog } from '@/hooks/use-dialog';
import { useStorage } from '@/hooks/use-storage';
import type { Diagram } from '@/lib/domain/diagram';
import type { DiagramGroup } from '@/lib/domain/diagram-group';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { BaseDialogProps } from '../common/base-dialog-props';
import { useDebounce } from '@/hooks/use-debounce';
import { DiagramRowActionsMenu } from './diagram-row-actions-menu/diagram-row-actions-menu';
import { GroupRowActionsMenu } from './group-row-actions-menu/group-row-actions-menu';
import { CreateGroupPopover } from './create-group-popover/create-group-popover';
import { groupDiagramRows } from './group-diagram-rows';

export interface OpenDiagramDialogProps extends BaseDialogProps {
    canClose?: boolean;
}

export const OpenDiagramDialog: React.FC<OpenDiagramDialogProps> = ({
    dialog,
    canClose = true,
}) => {
    const { closeOpenDiagramDialog, openCreateDiagramDialog } = useDialog();
    const { t } = useTranslation();
    const { updateConfig } = useConfig();
    const navigate = useNavigate();
    const { listDiagrams, listDiagramGroups } = useStorage();
    const [diagrams, setDiagrams] = useState<Diagram[]>([]);
    const [groups, setGroups] = useState<DiagramGroup[]>([]);
    const [selectedDiagramId, setSelectedDiagramId] = useState<
        string | undefined
    >();

    const fetchDiagrams = useCallback(async () => {
        const [diagrams, groups] = await Promise.all([
            listDiagrams({ includeTables: true }),
            listDiagramGroups(),
        ]);
        setDiagrams(
            diagrams.sort(
                (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
            )
        );
        setGroups(groups);
    }, [listDiagrams, listDiagramGroups]);

    // Phase 7: see group-diagram-rows.ts for the (unit-tested) grouping/
    // flattening logic — group headers (sorted by name, already the
    // server's own sort, db/diagram-groups.ts) each followed by their
    // diagrams, then an "Ungrouped" bucket last for anything with no
    // groupId.
    const rows = useMemo(
        () => groupDiagramRows(diagrams, groups),
        [diagrams, groups]
    );

    useEffect(() => {
        if (!dialog.open) {
            return;
        }
        setSelectedDiagramId(undefined);
        fetchDiagrams();
    }, [dialog.open, fetchDiagrams]);

    const openDiagram = useCallback(
        (diagramId: string) => {
            if (diagramId) {
                updateConfig({ config: { defaultDiagramId: diagramId } });
                navigate(`/diagrams/${diagramId}`);
            }
        },
        [updateConfig, navigate]
    );

    const handleRowKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTableRowElement>) => {
            const element = e.target as HTMLElement;
            const diagramId = element.getAttribute('data-diagram-id');
            const selectionIndexAttr = element.getAttribute(
                'data-selection-index'
            );

            if (!diagramId || !selectionIndexAttr) return;

            const selectionIndex = parseInt(selectionIndexAttr, 10);

            switch (e.key) {
                case 'Enter':
                case ' ':
                    e.preventDefault();
                    openDiagram(diagramId);
                    closeOpenDiagramDialog();
                    break;
                case 'ArrowDown': {
                    e.preventDefault();

                    (
                        document.querySelector(
                            `[data-selection-index="${selectionIndex + 1}"]`
                        ) as HTMLElement
                    )?.focus();
                    break;
                }
                case 'ArrowUp': {
                    e.preventDefault();

                    (
                        document.querySelector(
                            `[data-selection-index="${selectionIndex - 1}"]`
                        ) as HTMLElement
                    )?.focus();
                    break;
                }
            }
        },
        [openDiagram, closeOpenDiagramDialog]
    );

    const onFocusHandler = useDebounce(
        (diagramId: string) => setSelectedDiagramId(diagramId),
        50
    );

    return (
        <Dialog
            {...dialog}
            onOpenChange={(open) => {
                if (!open && canClose) {
                    closeOpenDiagramDialog();
                }
            }}
        >
            <DialogContent
                className="flex h-[30rem] max-h-screen flex-col overflow-y-auto md:min-w-[80vw] xl:min-w-[55vw]"
                showClose={canClose}
            >
                <DialogHeader>
                    <DialogTitle>{t('open_diagram_dialog.title')}</DialogTitle>
                    <DialogDescription>
                        {t('open_diagram_dialog.description')}
                    </DialogDescription>
                </DialogHeader>
                <DialogInternalContent>
                    <div className="flex flex-1 items-center justify-center">
                        <Table>
                            <TableHeader className="sticky top-0 bg-background">
                                <TableRow>
                                    <TableHead />
                                    <TableHead>
                                        {t(
                                            'open_diagram_dialog.table_columns.name'
                                        )}
                                    </TableHead>
                                    <TableHead className="hidden items-center sm:inline-flex">
                                        {t(
                                            'open_diagram_dialog.table_columns.created_at'
                                        )}
                                    </TableHead>
                                    <TableHead>
                                        {t(
                                            'open_diagram_dialog.table_columns.last_modified'
                                        )}
                                    </TableHead>
                                    <TableHead className="text-center">
                                        {t(
                                            'open_diagram_dialog.table_columns.tables_count'
                                        )}
                                    </TableHead>
                                    <TableHead />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.map((row) => {
                                    if (row.type === 'group-header') {
                                        return (
                                            <TableRow
                                                key={`group-${row.group.id}`}
                                                className="bg-muted/50 hover:bg-muted/50"
                                            >
                                                <TableCell
                                                    colSpan={5}
                                                    className="font-medium"
                                                >
                                                    {row.group.name}
                                                </TableCell>
                                                <TableCell className="items-center p-0 pr-1 text-right">
                                                    <GroupRowActionsMenu
                                                        group={row.group}
                                                        refetch={fetchDiagrams}
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        );
                                    }
                                    if (row.type === 'ungrouped-header') {
                                        return (
                                            <TableRow
                                                key="group-ungrouped"
                                                className="bg-muted/50 hover:bg-muted/50"
                                            >
                                                <TableCell
                                                    colSpan={6}
                                                    className="font-medium text-muted-foreground"
                                                >
                                                    {t(
                                                        'open_diagram_dialog.ungrouped'
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    }

                                    const { diagram, selectionIndex } = row;
                                    return (
                                        <TableRow
                                            key={diagram.id}
                                            data-state={`${selectedDiagramId === diagram.id ? 'selected' : ''}`}
                                            data-diagram-id={diagram.id}
                                            data-selection-index={
                                                selectionIndex
                                            }
                                            tabIndex={0}
                                            onFocus={() =>
                                                onFocusHandler(diagram.id)
                                            }
                                            className="focus:bg-accent focus:outline-none"
                                            onClick={(e) => {
                                                switch (e.detail) {
                                                    case 1:
                                                        setSelectedDiagramId(
                                                            diagram.id
                                                        );
                                                        break;
                                                    case 2:
                                                        openDiagram(diagram.id);
                                                        closeOpenDiagramDialog();
                                                        break;
                                                    default:
                                                        setSelectedDiagramId(
                                                            diagram.id
                                                        );
                                                }
                                            }}
                                            onKeyDown={handleRowKeyDown}
                                        >
                                            <TableCell className="table-cell">
                                                <div className="flex justify-center">
                                                    <DiagramIcon
                                                        databaseType={
                                                            diagram.databaseType
                                                        }
                                                        databaseEdition={
                                                            diagram.databaseEdition
                                                        }
                                                    />
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {diagram.name}
                                            </TableCell>
                                            <TableCell className="hidden items-center sm:table-cell">
                                                {diagram.createdAt.toLocaleString()}
                                            </TableCell>
                                            <TableCell>
                                                {diagram.updatedAt.toLocaleString()}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {diagram.tables?.length}
                                            </TableCell>
                                            <TableCell className="items-center p-0 pr-1 text-right">
                                                <DiagramRowActionsMenu
                                                    diagram={diagram}
                                                    onOpen={() => {
                                                        openDiagram(diagram.id);
                                                        closeOpenDiagramDialog();
                                                    }}
                                                    numberOfDiagrams={
                                                        diagrams.length
                                                    }
                                                    refetch={fetchDiagrams}
                                                    groups={groups}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </DialogInternalContent>

                <DialogFooter className="flex !justify-between gap-2">
                    {canClose ? (
                        <DialogClose asChild>
                            <Button type="button" variant="secondary">
                                {t('open_diagram_dialog.cancel')}
                            </Button>
                        </DialogClose>
                    ) : (
                        <div />
                    )}
                    <div className="flex gap-2">
                        <CreateGroupPopover onCreated={fetchDiagrams} />
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => {
                                closeOpenDiagramDialog();
                                openCreateDiagramDialog();
                            }}
                        >
                            {t('open_diagram_dialog.new_database')}
                        </Button>
                        <DialogClose asChild>
                            <Button
                                type="submit"
                                disabled={!selectedDiagramId}
                                onClick={() =>
                                    openDiagram(selectedDiagramId ?? '')
                                }
                            >
                                {t('open_diagram_dialog.open')}
                            </Button>
                        </DialogClose>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
