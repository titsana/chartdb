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
import { Input } from '@/components/input/input';
import { useConfig } from '@/hooks/use-config';
import { useDialog } from '@/hooks/use-dialog';
import { useStorage } from '@/hooks/use-storage';
import type { Diagram } from '@/lib/domain/diagram';
import type { Group } from '@/lib/domain/group';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, FolderPlus, Search } from 'lucide-react';
import type { BaseDialogProps } from '../common/base-dialog-props';
import { useDebounce } from '@/hooks/use-debounce';
import { generateId } from '@/lib/utils';
import { DiagramRowActionsMenu } from './diagram-row-actions-menu/diagram-row-actions-menu';
import { GroupActionsMenu } from './group-actions-menu/group-actions-menu';
import { GroupNameDialog } from './group-name-dialog/group-name-dialog';

export interface OpenDiagramDialogProps extends BaseDialogProps {
    canClose?: boolean;
}

interface GroupSection {
    group?: Group;
    diagrams: Diagram[];
}

export const OpenDiagramDialog: React.FC<OpenDiagramDialogProps> = ({
    dialog,
    canClose = true,
}) => {
    const { closeOpenDiagramDialog, openCreateDiagramDialog } = useDialog();
    const { t } = useTranslation();
    const { updateConfig } = useConfig();
    const navigate = useNavigate();
    const {
        listDiagrams,
        listGroups,
        addGroup,
        updateGroup,
        deleteGroup,
        updateDiagram,
    } = useStorage();
    const [diagrams, setDiagrams] = useState<Diagram[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);
    const [selectedDiagramId, setSelectedDiagramId] = useState<
        string | undefined
    >();
    const [searchQuery, setSearchQuery] = useState('');
    const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(
        new Set()
    );
    const [groupDialogState, setGroupDialogState] = useState<{
        open: boolean;
        group?: Group;
        assignToDiagramId?: string;
    }>({ open: false });

    const fetchDiagrams = useCallback(async () => {
        const diagrams = await listDiagrams({ includeTables: true });
        setDiagrams(
            diagrams.sort(
                (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
            )
        );
    }, [listDiagrams]);

    const fetchGroups = useCallback(async () => {
        setGroups(await listGroups());
    }, [listGroups]);

    useEffect(() => {
        if (!dialog.open) {
            return;
        }
        setSelectedDiagramId(undefined);
        setSearchQuery('');
        setCollapsedGroupIds(new Set());
        fetchDiagrams();
        fetchGroups();
    }, [dialog.open, fetchDiagrams, fetchGroups]);

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

    const isSearching = searchQuery.trim().length > 0;

    const sections = useMemo<GroupSection[]>(() => {
        const query = searchQuery.trim().toLowerCase();
        const matches = (diagram: Diagram) =>
            !query || diagram.name.toLowerCase().includes(query);

        const byGroupId = new Map<string, Diagram[]>();
        const ungrouped: Diagram[] = [];

        for (const diagram of diagrams) {
            if (!matches(diagram)) continue;

            const group = diagram.groupId
                ? groups.find((g) => g.id === diagram.groupId)
                : undefined;

            if (group) {
                byGroupId.set(group.id, [
                    ...(byGroupId.get(group.id) ?? []),
                    diagram,
                ]);
            } else {
                ungrouped.push(diagram);
            }
        }

        if (groups.length === 0) {
            return [{ group: undefined, diagrams: ungrouped }];
        }

        const groupSections = [...groups]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((group) => ({
                group,
                diagrams: byGroupId.get(group.id) ?? [],
            }));

        return [
            ...groupSections,
            { group: undefined, diagrams: ungrouped },
        ].filter((section) => !isSearching || section.diagrams.length > 0);
    }, [diagrams, groups, searchQuery, isSearching]);

    const isGrouped = groups.length > 0;

    let runningIndex = 0;

    const toggleCollapsed = (groupId: string) => {
        setCollapsedGroupIds((prev) => {
            const next = new Set(prev);
            if (next.has(groupId)) next.delete(groupId);
            else next.add(groupId);
            return next;
        });
    };

    const openCreateGroupDialog = (assignToDiagramId?: string) => {
        setGroupDialogState({ open: true, assignToDiagramId });
    };

    const openRenameGroupDialog = (group: Group) => {
        setGroupDialogState({ open: true, group });
    };

    const handleGroupNameSubmit = async (name: string) => {
        if (groupDialogState.group) {
            await updateGroup({
                id: groupDialogState.group.id,
                attributes: { name },
            });
        } else {
            const group: Group = {
                id: generateId(),
                name,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            await addGroup({ group });
            if (groupDialogState.assignToDiagramId) {
                await updateDiagram({
                    id: groupDialogState.assignToDiagramId,
                    attributes: { groupId: group.id },
                });
                await fetchDiagrams();
            }
        }
        await fetchGroups();
    };

    const handleDeleteGroup = async (groupId: string) => {
        await deleteGroup(groupId);
        await Promise.all([fetchGroups(), fetchDiagrams()]);
    };

    const handleAssignToGroup = async (diagramId: string, groupId?: string) => {
        await updateDiagram({ id: diagramId, attributes: { groupId } });
        await fetchDiagrams();
    };

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
                <div className="flex items-center justify-between gap-2">
                    <div className="relative h-9 flex-1">
                        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder={t(
                                'open_diagram_dialog.search_placeholder'
                            )}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-full pl-9"
                        />
                    </div>
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={() => openCreateGroupDialog()}
                    >
                        <FolderPlus className="mr-1.5 size-4" />
                        {t('open_diagram_dialog.new_group')}
                    </Button>
                </div>
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
                                {sections.map((section) => {
                                    const groupId =
                                        section.group?.id ?? '__ungrouped__';
                                    const collapsed =
                                        !isSearching &&
                                        collapsedGroupIds.has(groupId);

                                    return (
                                        <React.Fragment key={groupId}>
                                            {isGrouped ? (
                                                <TableRow
                                                    className="cursor-pointer bg-muted/50 hover:bg-muted"
                                                    onClick={() =>
                                                        toggleCollapsed(groupId)
                                                    }
                                                >
                                                    <TableCell colSpan={5}>
                                                        <div className="flex items-center gap-2 font-medium">
                                                            {collapsed ? (
                                                                <ChevronRight className="size-4" />
                                                            ) : (
                                                                <ChevronDown className="size-4" />
                                                            )}
                                                            {section.group
                                                                ? section.group
                                                                      .name
                                                                : t(
                                                                      'open_diagram_dialog.ungrouped'
                                                                  )}
                                                            <span className="text-xs font-normal text-muted-foreground">
                                                                (
                                                                {
                                                                    section
                                                                        .diagrams
                                                                        .length
                                                                }
                                                                )
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {section.group ? (
                                                            <GroupActionsMenu
                                                                group={
                                                                    section.group
                                                                }
                                                                onRename={() =>
                                                                    openRenameGroupDialog(
                                                                        section.group!
                                                                    )
                                                                }
                                                                onDelete={() =>
                                                                    handleDeleteGroup(
                                                                        section
                                                                            .group!
                                                                            .id
                                                                    )
                                                                }
                                                            />
                                                        ) : null}
                                                    </TableCell>
                                                </TableRow>
                                            ) : null}
                                            {!collapsed
                                                ? section.diagrams.map(
                                                      (diagram) => {
                                                          const index =
                                                              runningIndex++;
                                                          return (
                                                              <TableRow
                                                                  key={
                                                                      diagram.id
                                                                  }
                                                                  data-state={`${selectedDiagramId === diagram.id ? 'selected' : ''}`}
                                                                  data-diagram-id={
                                                                      diagram.id
                                                                  }
                                                                  data-selection-index={
                                                                      index
                                                                  }
                                                                  tabIndex={0}
                                                                  onFocus={() =>
                                                                      onFocusHandler(
                                                                          diagram.id
                                                                      )
                                                                  }
                                                                  className="focus:bg-accent focus:outline-none"
                                                                  onClick={(
                                                                      e
                                                                  ) => {
                                                                      switch (
                                                                          e.detail
                                                                      ) {
                                                                          case 1:
                                                                              setSelectedDiagramId(
                                                                                  diagram.id
                                                                              );
                                                                              break;
                                                                          case 2:
                                                                              openDiagram(
                                                                                  diagram.id
                                                                              );
                                                                              closeOpenDiagramDialog();
                                                                              break;
                                                                          default:
                                                                              setSelectedDiagramId(
                                                                                  diagram.id
                                                                              );
                                                                      }
                                                                  }}
                                                                  onKeyDown={
                                                                      handleRowKeyDown
                                                                  }
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
                                                                      {
                                                                          diagram.name
                                                                      }
                                                                  </TableCell>
                                                                  <TableCell className="hidden items-center sm:table-cell">
                                                                      {diagram.createdAt.toLocaleString()}
                                                                  </TableCell>
                                                                  <TableCell>
                                                                      {diagram.updatedAt.toLocaleString()}
                                                                  </TableCell>
                                                                  <TableCell className="text-center">
                                                                      {
                                                                          diagram
                                                                              .tables
                                                                              ?.length
                                                                      }
                                                                  </TableCell>
                                                                  <TableCell className="items-center p-0 pr-1 text-right">
                                                                      <DiagramRowActionsMenu
                                                                          diagram={
                                                                              diagram
                                                                          }
                                                                          onOpen={() => {
                                                                              openDiagram(
                                                                                  diagram.id
                                                                              );
                                                                              closeOpenDiagramDialog();
                                                                          }}
                                                                          numberOfDiagrams={
                                                                              diagrams.length
                                                                          }
                                                                          refetch={
                                                                              fetchDiagrams
                                                                          }
                                                                          groups={
                                                                              groups
                                                                          }
                                                                          onAssignToGroup={(
                                                                              groupId
                                                                          ) =>
                                                                              handleAssignToGroup(
                                                                                  diagram.id,
                                                                                  groupId
                                                                              )
                                                                          }
                                                                          onCreateGroupForDiagram={() =>
                                                                              openCreateGroupDialog(
                                                                                  diagram.id
                                                                              )
                                                                          }
                                                                      />
                                                                  </TableCell>
                                                              </TableRow>
                                                          );
                                                      }
                                                  )
                                                : null}
                                        </React.Fragment>
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

            <GroupNameDialog
                open={groupDialogState.open}
                onOpenChange={(open) =>
                    setGroupDialogState((prev) => ({ ...prev, open }))
                }
                title={
                    groupDialogState.group
                        ? t(
                              'open_diagram_dialog.group_name_dialog.rename_title'
                          )
                        : t(
                              'open_diagram_dialog.group_name_dialog.create_title'
                          )
                }
                initialName={groupDialogState.group?.name}
                onSubmit={handleGroupNameSubmit}
            />
        </Dialog>
    );
};
