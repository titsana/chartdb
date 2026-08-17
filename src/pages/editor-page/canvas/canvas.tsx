import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import type {
    addEdge,
    NodePositionChange,
    NodeRemoveChange,
    NodeDimensionChange,
    OnEdgesChange,
    OnNodesChange,
    NodeTypes,
    EdgeTypes,
    NodeChange,
    Viewport,
} from '@xyflow/react';
import {
    ReactFlow,
    useEdgesState,
    useNodesState,
    Background,
    BackgroundVariant,
    MiniMap,
    Controls,
    useReactFlow,
    useKeyPress,
    SelectionMode,
    useUpdateNodeInternals,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import equal from 'fast-deep-equal';
import type { TableNodeType } from './table-node/table-node';
import {
    TABLE_RELATIONSHIP_SOURCE_HANDLE_ID_PREFIX,
    TABLE_RELATIONSHIP_TARGET_HANDLE_ID_PREFIX,
    TableNode,
} from './table-node/table-node';
import type { RelationshipEdgeType } from './relationship-edge/relationship-edge';
import { RelationshipEdge } from './relationship-edge/relationship-edge';
import { useChartDB } from '@/hooks/use-chartdb';
import { useCollaboration } from '@/hooks/use-collaboration';
import {
    LEFT_HANDLE_ID_PREFIX,
    TARGET_ID_PREFIX,
} from './table-node/table-node-field';
import { Toolbar } from './toolbar/toolbar';
import { useToast } from '@/components/toast/use-toast';
import {
    Pencil,
    Magnet,
    AlertTriangle,
    Highlighter,
    EyeOff,
} from 'lucide-react';
import { Button } from '@/components/button/button';
import { useLayout } from '@/hooks/use-layout';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { Badge } from '@/components/badge/badge';
import { useTheme } from '@/hooks/use-theme';
import { useTranslation } from 'react-i18next';
import type { DBTable } from '@/lib/domain/db-table';
import { MIN_TABLE_SIZE } from '@/lib/domain/db-table';
import { useLocalConfig } from '@/hooks/use-local-config';
import {
    Tooltip,
    TooltipTrigger,
    TooltipContent,
} from '@/components/tooltip/tooltip';
import { MarkerDefinitions } from './marker-definitions';
import { CanvasContextMenu } from './canvas-context-menu';
import { areFieldTypesCompatible } from '@/lib/data/data-types/data-types';
import {
    calcTableHeight,
    findOverlappingTables,
    findTableOverlapping,
} from './canvas-utils';
import type { Graph } from '@/lib/graph';
import { removeVertex } from '@/lib/graph';
import type { ChartDBEvent } from '@/context/chartdb-context/chartdb-context';
import { cn, debounce, getOperatingSystem } from '@/lib/utils';
import type { DependencyEdgeType } from './dependency-edge/dependency-edge';
import { DependencyEdge } from './dependency-edge/dependency-edge';
import {
    BOTTOM_SOURCE_HANDLE_ID_PREFIX,
    TARGET_DEP_PREFIX,
    TOP_SOURCE_HANDLE_ID_PREFIX,
} from './table-node/table-node-dependency-indicator';
import type { DatabaseType } from '@/lib/domain/database-type';
import { useCanvas } from '@/hooks/use-canvas';
import type { AreaNodeType } from './area-node/area-node';
import { AreaNode } from './area-node/area-node';
import type { Area } from '@/lib/domain/area';
import type { NoteNodeType } from './note-node/note-node';
import { NoteNode } from './note-node/note-node';
import type { Note } from '@/lib/domain/note';
import type { TempCursorNodeType } from './temp-cursor-node/temp-cursor-node';
import {
    TEMP_CURSOR_HANDLE_ID,
    TEMP_CURSOR_NODE_ID,
    TempCursorNode,
} from './temp-cursor-node/temp-cursor-node';
import type { TempFloatingEdgeType } from './temp-floating-edge/temp-floating-edge';
import {
    TEMP_FLOATING_EDGE_ID,
    TempFloatingEdge,
} from './temp-floating-edge/temp-floating-edge';
import type { CreateRelationshipNodeType } from './create-relationship-node/create-relationship-node';
import { CreateRelationshipNode } from './create-relationship-node/create-relationship-node';
import { RemoteCursorsOverlay } from './remote-cursor-node/remote-cursors-overlay';
import { ConnectionLine } from './connection-line/connection-line';
import {
    updateTablesParentAreas,
    getTablesInArea,
    updateNotesParentAreas,
    getNotesInArea,
} from '@/lib/utils/area-utils';
import { CanvasFilter } from './canvas-filter/canvas-filter';
import { useHotkeys } from 'react-hotkeys-hook';
import { ShowAllButton } from './show-all-button';
import { useIsLostInCanvas } from './hooks/use-is-lost-in-canvas';
import type { DiagramFilter } from '@/lib/domain/diagram-filter/diagram-filter';
import { useDiagramFilter } from '@/context/diagram-filter-context/use-diagram-filter';
import { filterTable } from '@/lib/domain/diagram-filter/filter';
import { defaultSchemas } from '@/lib/data/default-schemas';
import { useDiff } from '@/context/diff-context/use-diff';
import { useClickAway } from 'react-use';

const HIGHLIGHTED_EDGE_Z_INDEX = 1;
const DEFAULT_EDGE_Z_INDEX = 0;

export type EdgeType =
    | RelationshipEdgeType
    | DependencyEdgeType
    | TempFloatingEdgeType;

export type NodeType =
    | TableNodeType
    | AreaNodeType
    | NoteNodeType
    | TempCursorNodeType
    | CreateRelationshipNodeType;

type AddEdgeParams = Parameters<typeof addEdge<EdgeType>>[0];

const edgeTypes: EdgeTypes = {
    'relationship-edge': RelationshipEdge,
    'dependency-edge': DependencyEdge,
    'temp-floating-edge': TempFloatingEdge,
};

const nodeTypes: NodeTypes = {
    table: TableNode,
    area: AreaNode,
    note: NoteNode,
    'temp-cursor': TempCursorNode,
    'create-relationship': CreateRelationshipNode,
};

const initialEdges: EdgeType[] = [];

const tableToTableNode = (
    table: DBTable,
    {
        filter,
        databaseType,
        filterLoading,
        showDBViews,
        forceShow,
        isRelationshipCreatingTarget = false,
        targetEdgeCounts,
    }: {
        filter?: DiagramFilter;
        databaseType: DatabaseType;
        filterLoading: boolean;
        showDBViews?: boolean;
        forceShow?: boolean;
        isRelationshipCreatingTarget?: boolean;
        targetEdgeCounts?: Record<string, number>;
    }
): TableNodeType => {
    // Always use absolute position for now
    const position = { x: table.x, y: table.y };

    let hidden = false;

    if (forceShow) {
        hidden = false;
    } else {
        hidden =
            !filterTable({
                table: { id: table.id, schema: table.schema },
                filter,
                options: { defaultSchema: defaultSchemas[databaseType] },
            }) ||
            filterLoading ||
            (!showDBViews && table.isView);
    }

    return {
        id: table.id,
        type: 'table',
        position,
        data: {
            table,
            isOverlapping: false,
            isRelationshipCreatingTarget,
            targetEdgeCounts,
        },
        width: table.width ?? MIN_TABLE_SIZE,
        hidden,
    };
};

const areaToAreaNode = (
    area: Area,
    {
        tables,
        filter,
        databaseType,
        filterLoading,
    }: {
        tables: DBTable[];
        filter?: DiagramFilter;
        databaseType: DatabaseType;
        filterLoading: boolean;
    }
): AreaNodeType => {
    // Get all tables in this area
    const tablesInArea = tables.filter((t) => t.parentAreaId === area.id);

    // Check if at least one table in the area is visible
    const hasVisibleTable =
        tablesInArea.length === 0 ||
        tablesInArea.some((table) =>
            filterTable({
                table: { id: table.id, schema: table.schema },
                filter,
                options: {
                    defaultSchema: defaultSchemas[databaseType],
                },
            })
        );

    return {
        id: area.id,
        type: 'area',
        position: { x: area.x, y: area.y },
        data: { area },
        width: area.width,
        height: area.height,
        zIndex: -10,
        style: {
            zIndex: -10,
        },
        hidden: !hasVisibleTable || filterLoading,
    };
};

const noteToNoteNode = (note: Note): NoteNodeType => {
    return {
        id: note.id,
        type: 'note',
        position: { x: note.x, y: note.y },
        data: { note },
        width: note.width,
        height: note.height,
        zIndex: 50,
        style: {
            zIndex: 50,
        },
    };
};

export interface CanvasProps {
    initialTables: DBTable[];
}

export const Canvas: React.FC<CanvasProps> = ({ initialTables }) => {
    const { getEdge, getInternalNode, getNode, setViewport } = useReactFlow();
    const updateNodeInternals = useUpdateNodeInternals();
    const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
    const [selectedRelationshipIds, setSelectedRelationshipIds] = useState<
        string[]
    >([]);
    const [selectedAreaIds, setSelectedAreaIds] = useState<string[]>([]);
    const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
    const { toast } = useToast();
    const { t } = useTranslation();
    const { isLostInCanvas } = useIsLostInCanvas();
    const {
        tables,
        areas,
        notes,
        relationships,
        createRelationship,
        createDependency,
        syncTablesParentArea,
        applyCanvasTableChanges,
        removeRelationships,
        removeDependencies,
        getField,
        databaseType,
        events,
        dependencies,
        readonly,
        removeArea,
        updateArea,
        removeNote,
        updateNote,
        highlightedCustomType,
        highlightCustomTypeId,
    } = useChartDB();
    const {
        emitDrag,
        emitCursor,
        emitSelection,
        emitViewport,
        remoteSelections,
        remoteViewports,
        followingSocketId,
        unfollowUser,
        presence,
        socket,
    } = useCollaboration();
    const { showSidePanel } = useLayout();
    const { effectiveTheme } = useTheme();
    const { scrollAction, showDBViews, showMiniMapOnCanvas } = useLocalConfig();
    const { isMd: isDesktop } = useBreakpoint('md');
    const [highlightOverlappingTables, setHighlightOverlappingTables] =
        useState(false);
    const {
        fitView,
        setOverlapGraph,
        overlapGraph,
        showFilter,
        setShowFilter,
        setEditTableModeTable,
        tempFloatingEdge,
        endFloatingEdgeCreation,
        hoveringTableId,
        hideCreateRelationshipNode,
        closeRelationshipPopover,
        events: canvasEvents,
    } = useCanvas();
    const {
        filter,
        loading: filterLoading,
        hasActiveFilter,
        resetFilter,
    } = useDiagramFilter();
    const { checkIfNewTable } = useDiff();

    const shouldForceShowTable = useCallback(
        (tableId: string) => {
            return checkIfNewTable({ tableId });
        },
        [checkIfNewTable]
    );

    const [isInitialLoadingNodes, setIsInitialLoadingNodes] = useState(true);

    const [nodes, setNodes, onNodesChange] = useNodesState<NodeType>(
        initialTables.map((table) =>
            tableToTableNode(table, {
                filter,
                databaseType,
                filterLoading,
                showDBViews,
                forceShow: shouldForceShowTable(table.id),
                isRelationshipCreatingTarget: false,
            })
        )
    );
    const [edges, setEdges, onEdgesChange] =
        useEdgesState<EdgeType>(initialEdges);

    const [snapToGridEnabled, setSnapToGridEnabled] = useState(false);

    const [cursorPosition, setCursorPosition] = useState<{
        x: number;
        y: number;
    } | null>(null);

    useEffect(() => {
        setIsInitialLoadingNodes(true);
    }, [initialTables]);

    // Live drag preview from other collaborators — visual only, never
    // persisted here (the dragging client's own drag-stop already persists
    // the real position through the normal table-update path).
    useEffect(() => {
        if (!socket) return;

        const handleDrag = ({
            tableId,
            x,
            y,
        }: {
            tableId: string;
            x: number;
            y: number;
        }) => {
            setNodes((prevNodes) =>
                prevNodes.map((node) =>
                    node.id === tableId ? { ...node, position: { x, y } } : node
                )
            );
        };

        socket.on('drag', handleDrag);
        return () => {
            socket.off('drag', handleDrag);
        };
    }, [socket, setNodes]);

    useEffect(() => {
        const initialNodes = initialTables.map((table) =>
            tableToTableNode(table, {
                filter,
                databaseType,
                filterLoading,
                showDBViews,
                forceShow: shouldForceShowTable(table.id),
                isRelationshipCreatingTarget: false,
            })
        );
        if (equal(initialNodes, nodes)) {
            setIsInitialLoadingNodes(false);
        }
    }, [
        initialTables,
        nodes,
        filter,
        databaseType,
        filterLoading,
        showDBViews,
        shouldForceShowTable,
    ]);

    useEffect(() => {
        if (!isInitialLoadingNodes) {
            debounce(() => {
                fitView({
                    duration: 200,
                    padding: 0.1,
                    maxZoom: 0.8,
                });
            }, 500)();
        }
    }, [isInitialLoadingNodes, fitView]);

    useEffect(() => {
        // Force React Flow to re-register handles for all table nodes
        // This ensures handles exist before edges reference them
        const tableNodeIds = tables.map((t) => t.id);
        if (tableNodeIds.length > 0) {
            updateNodeInternals(tableNodeIds);
        }

        // Delay edge creation to ensure handles are registered
        const timeoutId = setTimeout(() => {
            const targetIndexes: Record<string, number> = relationships.reduce(
                (acc, relationship) => {
                    acc[
                        `${relationship.targetTableId}${relationship.targetFieldId}`
                    ] = 0;
                    return acc;
                },
                {} as Record<string, number>
            );

            const targetDepIndexes: Record<string, number> =
                dependencies.reduce(
                    (acc, dep) => {
                        acc[dep.tableId] = 0;
                        return acc;
                    },
                    {} as Record<string, number>
                );

            setEdges((prevEdges) => {
                // Create a map of previous edge states to preserve selection
                const prevEdgeStates = new Map(
                    prevEdges.map((edge) => [
                        edge.id,
                        { selected: edge.selected, animated: edge.animated },
                    ])
                );

                return [
                    ...relationships.map(
                        (relationship): RelationshipEdgeType => {
                            const prevState = prevEdgeStates.get(
                                relationship.id
                            );
                            return {
                                id: relationship.id,
                                source: relationship.sourceTableId,
                                target: relationship.targetTableId,
                                sourceHandle: `${LEFT_HANDLE_ID_PREFIX}${relationship.sourceFieldId}`,
                                targetHandle: `${TARGET_ID_PREFIX}${targetIndexes[`${relationship.targetTableId}${relationship.targetFieldId}`]++}_${relationship.targetFieldId}`,
                                type: 'relationship-edge',
                                data: { relationship },
                                selected: prevState?.selected ?? false,
                                animated: prevState?.animated ?? false,
                            };
                        }
                    ),
                    ...dependencies.map((dep): DependencyEdgeType => {
                        const prevState = prevEdgeStates.get(dep.id);
                        return {
                            id: dep.id,
                            source: dep.dependentTableId,
                            target: dep.tableId,
                            sourceHandle: `${TOP_SOURCE_HANDLE_ID_PREFIX}${dep.dependentTableId}`,
                            targetHandle: `${TARGET_DEP_PREFIX}${targetDepIndexes[dep.tableId]++}_${dep.tableId}`,
                            type: 'dependency-edge',
                            data: { dependency: dep },
                            hidden: !showDBViews,
                            selected: prevState?.selected ?? false,
                            animated: prevState?.animated ?? false,
                        };
                    }),
                ];
            });
        }, 100); // Delay to let handles register after updateNodeInternals

        return () => clearTimeout(timeoutId);
    }, [
        relationships,
        dependencies,
        setEdges,
        showDBViews,
        tables,
        updateNodeInternals,
    ]);

    useEffect(() => {
        const selectedNodesIds = nodes
            .filter((node) => node.selected)
            .map((node) => node.id);

        if (equal(selectedNodesIds, selectedTableIds)) {
            return;
        }

        setSelectedTableIds(selectedNodesIds);
    }, [nodes, setSelectedTableIds, selectedTableIds]);

    useEffect(() => {
        const selectedEdgesIds = edges
            .filter((edge) => edge.selected)
            .map((edge) => edge.id);

        if (equal(selectedEdgesIds, selectedRelationshipIds)) {
            return;
        }

        setSelectedRelationshipIds(selectedEdgesIds);
    }, [edges, setSelectedRelationshipIds, selectedRelationshipIds]);

    useEffect(() => {
        const selectedAreaNodeIds = nodes
            .filter((node) => node.type === 'area' && node.selected)
            .map((node) => node.id);

        if (equal(selectedAreaNodeIds, selectedAreaIds)) {
            return;
        }

        setSelectedAreaIds(selectedAreaNodeIds);
    }, [nodes, setSelectedAreaIds, selectedAreaIds]);

    useEffect(() => {
        const selectedNoteNodeIds = nodes
            .filter((node) => node.type === 'note' && node.selected)
            .map((node) => node.id);

        if (equal(selectedNoteNodeIds, selectedNoteIds)) {
            return;
        }

        setSelectedNoteIds(selectedNoteNodeIds);
    }, [nodes, setSelectedNoteIds, selectedNoteIds]);

    useEffect(() => {
        emitSelection({
            tableIds: selectedTableIds,
            relationshipIds: selectedRelationshipIds,
            areaIds: selectedAreaIds,
            noteIds: selectedNoteIds,
        });
    }, [
        selectedTableIds,
        selectedRelationshipIds,
        selectedAreaIds,
        selectedNoteIds,
        emitSelection,
    ]);

    // Map every remotely-selected table/area/note/relationship id to the
    // presence colors of whichever collaborators have it selected right now
    // (multiple colors when more than one collaborator selects the same
    // entity — stacked, not clobbered).
    const remoteColorsByEntityId = useMemo(() => {
        const colorsById = new Map<string, string[]>();
        for (const [socketId, selection] of remoteSelections) {
            const color = presence.find((p) => p.socketId === socketId)?.color;
            if (!color) continue;
            for (const id of [
                ...selection.tableIds,
                ...selection.areaIds,
                ...selection.noteIds,
                ...selection.relationshipIds,
            ]) {
                const existing = colorsById.get(id);
                if (existing) existing.push(color);
                else colorsById.set(id, [color]);
            }
        }
        return colorsById;
    }, [remoteSelections, presence]);

    useEffect(() => {
        setNodes((prevNodes) => {
            let changed = false;
            const nextNodes = prevNodes.map((node): NodeType => {
                const colors = remoteColorsByEntityId.get(node.id) ?? [];

                switch (node.type) {
                    case 'table': {
                        if (equal(colors, node.data.remoteSelectorColors ?? []))
                            return node;
                        changed = true;
                        return {
                            ...node,
                            data: {
                                ...node.data,
                                remoteSelectorColors: colors,
                            },
                        };
                    }
                    case 'area': {
                        if (equal(colors, node.data.remoteSelectorColors ?? []))
                            return node;
                        changed = true;
                        return {
                            ...node,
                            data: {
                                ...node.data,
                                remoteSelectorColors: colors,
                            },
                        };
                    }
                    case 'note': {
                        if (equal(colors, node.data.remoteSelectorColors ?? []))
                            return node;
                        changed = true;
                        return {
                            ...node,
                            data: {
                                ...node.data,
                                remoteSelectorColors: colors,
                            },
                        };
                    }
                    default:
                        return node;
                }
            });
            return changed ? nextNodes : prevNodes;
        });
    }, [remoteColorsByEntityId, setNodes]);

    useEffect(() => {
        setEdges((prevEdges) => {
            let changed = false;
            const nextEdges = prevEdges.map((edge) => {
                if (edge.type !== 'relationship-edge') return edge;
                const relationshipEdge = edge as RelationshipEdgeType;
                const colors = remoteColorsByEntityId.get(edge.id) ?? [];
                const currentColors =
                    relationshipEdge.data?.remoteSelectorColors ?? [];
                if (equal(colors, currentColors)) return edge;
                changed = true;
                return {
                    ...relationshipEdge,
                    data: {
                        ...relationshipEdge.data!,
                        remoteSelectorColors: colors,
                    },
                };
            });
            return changed ? nextEdges : prevEdges;
        });
    }, [remoteColorsByEntityId, setEdges]);

    useEffect(() => {
        const selectedTableIdsSet = new Set(selectedTableIds);
        const selectedRelationshipIdsSet = new Set(selectedRelationshipIds);

        setEdges((prevEdges) => {
            // Check if any edge needs updating
            let hasChanges = false;

            const newEdges = prevEdges
                .filter((e) => e.type !== 'temp-floating-edge')
                .map((edge): EdgeType => {
                    const shouldBeHighlighted =
                        selectedRelationshipIdsSet.has(edge.id) ||
                        selectedTableIdsSet.has(edge.source) ||
                        selectedTableIdsSet.has(edge.target);

                    const currentHighlighted =
                        (edge as Exclude<EdgeType, TempFloatingEdgeType>).data
                            ?.highlighted ?? false;
                    const currentAnimated = edge.animated ?? false;
                    const currentZIndex = edge.zIndex ?? 0;

                    // Skip if no changes needed
                    if (
                        currentHighlighted === shouldBeHighlighted &&
                        currentAnimated === shouldBeHighlighted &&
                        currentZIndex ===
                            (shouldBeHighlighted
                                ? HIGHLIGHTED_EDGE_Z_INDEX
                                : DEFAULT_EDGE_Z_INDEX)
                    ) {
                        return edge;
                    }

                    hasChanges = true;

                    if (edge.type === 'dependency-edge') {
                        const dependencyEdge = edge as DependencyEdgeType;
                        return {
                            ...dependencyEdge,
                            data: {
                                ...dependencyEdge.data!,
                                highlighted: shouldBeHighlighted,
                            },
                            animated: shouldBeHighlighted,
                            zIndex: shouldBeHighlighted
                                ? HIGHLIGHTED_EDGE_Z_INDEX
                                : DEFAULT_EDGE_Z_INDEX,
                        };
                    } else {
                        const relationshipEdge = edge as RelationshipEdgeType;
                        return {
                            ...relationshipEdge,
                            data: {
                                ...relationshipEdge.data!,
                                highlighted: shouldBeHighlighted,
                            },
                            animated: shouldBeHighlighted,
                            zIndex: shouldBeHighlighted
                                ? HIGHLIGHTED_EDGE_Z_INDEX
                                : DEFAULT_EDGE_Z_INDEX,
                        };
                    }
                });

            return hasChanges ? newEdges : prevEdges;
        });
    }, [selectedRelationshipIds, selectedTableIds, setEdges]);

    useEffect(() => {
        // Compute target edge counts per field (same logic as edge creation)
        // This ensures handle creation is synchronized with edge indices
        const targetEdgeCountsByField: Record<string, number> = {};
        relationships.forEach((rel) => {
            const fieldId = rel.targetFieldId;
            targetEdgeCountsByField[fieldId] =
                (targetEdgeCountsByField[fieldId] || 0) + 1;
        });

        setNodes((prevNodes) => {
            const newNodes = [
                ...tables.map((table) => {
                    const isOverlapping =
                        (overlapGraph.graph.get(table.id) ?? []).length > 0;

                    // Get target edge counts for this table's fields
                    const tableTargetEdgeCounts: Record<string, number> = {};
                    table.fields?.forEach((field) => {
                        if (targetEdgeCountsByField[field.id]) {
                            tableTargetEdgeCounts[field.id] =
                                targetEdgeCountsByField[field.id];
                        }
                    });

                    const node = tableToTableNode(table, {
                        filter,
                        databaseType,
                        filterLoading,
                        showDBViews,
                        forceShow: shouldForceShowTable(table.id),
                        isRelationshipCreatingTarget: false,
                        targetEdgeCounts: tableTargetEdgeCounts,
                    });

                    // Check if table uses the highlighted custom type
                    let hasHighlightedCustomType = false;
                    if (highlightedCustomType) {
                        hasHighlightedCustomType = table.fields.some(
                            (field) =>
                                field.type.name === highlightedCustomType.name
                        );
                    }

                    return {
                        ...node,
                        data: {
                            ...node.data,
                            isOverlapping,
                            highlightOverlappingTables,
                            hasHighlightedCustomType,
                        },
                    };
                }),
                ...areas.map((area) =>
                    areaToAreaNode(area, {
                        tables,
                        filter,
                        databaseType,
                        filterLoading,
                    })
                ),
                ...notes.map((note) => noteToNoteNode(note)),
                ...prevNodes.filter(
                    (n) =>
                        n.type === 'temp-cursor' ||
                        n.type === 'create-relationship'
                ),
            ];

            // Check if nodes actually changed
            if (equal(prevNodes, newNodes)) {
                return prevNodes;
            }

            return newNodes;
        });
    }, [
        tables,
        areas,
        notes,
        setNodes,
        filter,
        databaseType,
        overlapGraph.lastUpdated,
        overlapGraph.graph,
        highlightOverlappingTables,
        highlightedCustomType,
        filterLoading,
        showDBViews,
        shouldForceShowTable,
        relationships,
    ]);

    // Surgical update for relationship creation target highlighting
    // This avoids expensive full node recalculation when only the visual state changes
    useEffect(() => {
        setNodes((nds) => {
            let hasChanges = false;
            const updatedNodes = nds.map((node) => {
                if (node.type !== 'table') return node;

                const shouldBeTarget =
                    !!tempFloatingEdge?.sourceNodeId &&
                    node.id !== tempFloatingEdge.sourceNodeId;
                const isCurrentlyTarget =
                    node.data.isRelationshipCreatingTarget ?? false;

                if (shouldBeTarget !== isCurrentlyTarget) {
                    hasChanges = true;
                    return {
                        ...node,
                        data: {
                            ...node.data,
                            isRelationshipCreatingTarget: shouldBeTarget,
                        },
                    };
                }
                return node;
            });

            return hasChanges ? updatedNodes : nds;
        });
    }, [tempFloatingEdge?.sourceNodeId, setNodes]);

    const prevFilter = useRef<DiagramFilter | undefined>(undefined);
    const prevShowDBViews = useRef<boolean>(showDBViews);
    useEffect(() => {
        if (
            !equal(filter, prevFilter.current) ||
            showDBViews !== prevShowDBViews.current
        ) {
            debounce(() => {
                const overlappingTablesInDiagram = findOverlappingTables({
                    tables: tables.filter(
                        (table) =>
                            filterTable({
                                table: {
                                    id: table.id,
                                    schema: table.schema,
                                },
                                filter,
                                options: {
                                    defaultSchema: defaultSchemas[databaseType],
                                },
                            }) && (showDBViews ? true : !table.isView)
                    ),
                });
                setOverlapGraph(overlappingTablesInDiagram);
                fitView({
                    duration: 500,
                    padding: 0.1,
                    maxZoom: 0.8,
                });
            }, 500)();
            prevFilter.current = filter;
            prevShowDBViews.current = showDBViews;
        }
    }, [filter, fitView, tables, setOverlapGraph, databaseType, showDBViews]);

    useEffect(() => {
        const checkParentAreas = debounce(() => {
            const visibleTables = nodes
                .filter((node) => node.type === 'table' && !node.hidden)
                .map((node) => (node as TableNodeType).data.table);
            const visibleNotes = nodes
                .filter((node) => node.type === 'note' && !node.hidden)
                .map((node) => (node as NoteNodeType).data.note);
            const visibleAreas = nodes
                .filter((node) => node.type === 'area' && !node.hidden)
                .map((node) => (node as AreaNodeType).data.area);

            const updatedTables = updateTablesParentAreas(
                visibleTables,
                visibleAreas
            );
            const needsUpdate: Array<{
                id: string;
                parentAreaId: string | null;
            }> = [];

            updatedTables.forEach((newTable, index) => {
                const oldTable = visibleTables[index];
                if (
                    oldTable &&
                    (!!newTable.parentAreaId || !!oldTable.parentAreaId) &&
                    newTable.parentAreaId !== oldTable.parentAreaId
                ) {
                    needsUpdate.push({
                        id: newTable.id,
                        parentAreaId: newTable.parentAreaId || null,
                    });
                }
            });

            if (needsUpdate.length > 0) {
                syncTablesParentArea(needsUpdate);
            }

            const updatedNotes = updateNotesParentAreas(
                visibleNotes,
                visibleAreas
            );

            updatedNotes.forEach((newNote, index) => {
                const oldNote = visibleNotes[index];
                if (
                    oldNote &&
                    (!!newNote.parentAreaId || !!oldNote.parentAreaId) &&
                    newNote.parentAreaId !== oldNote.parentAreaId
                ) {
                    updateNote(
                        newNote.id,
                        { parentAreaId: newNote.parentAreaId || null },
                        { updateHistory: false }
                    );
                }
            });
        }, 300);

        checkParentAreas();
    }, [nodes, syncTablesParentArea, updateNote]);

    const onConnectHandler = useCallback(
        async (params: AddEdgeParams) => {
            if (
                params.sourceHandle?.startsWith?.(
                    TOP_SOURCE_HANDLE_ID_PREFIX
                ) ||
                params.sourceHandle?.startsWith?.(
                    BOTTOM_SOURCE_HANDLE_ID_PREFIX
                )
            ) {
                const tableId = params.target;
                const dependentTableId = params.source;

                createDependency({
                    tableId,
                    dependentTableId,
                });

                return;
            }

            const sourceTableId = params.source;
            const targetTableId = params.target;
            const sourceFieldId = params.sourceHandle?.split('_')?.pop() ?? '';
            const targetFieldId = params.targetHandle?.split('_')?.pop() ?? '';
            const sourceField = getField(sourceTableId, sourceFieldId);
            const targetField = getField(targetTableId, targetFieldId);

            if (!sourceField || !targetField) {
                return;
            }

            if (
                !areFieldTypesCompatible(
                    sourceField.type,
                    targetField.type,
                    databaseType
                )
            ) {
                toast({
                    title: 'Field types are not compatible',
                    variant: 'destructive',
                    description:
                        'Relationships can only be created between compatible field types',
                });
                return;
            }

            createRelationship({
                sourceTableId,
                targetTableId,
                sourceFieldId,
                targetFieldId,
            });
        },
        [createRelationship, createDependency, getField, toast, databaseType]
    );

    const onEdgesChangeHandler: OnEdgesChange<EdgeType> = useCallback(
        (changes) => {
            let changesToApply = changes;

            if (readonly) {
                changesToApply = changesToApply.filter(
                    (change) => change.type !== 'remove'
                );
            }

            const removeChanges: NodeRemoveChange[] = changesToApply.filter(
                (change) => change.type === 'remove'
            ) as NodeRemoveChange[];

            const edgesToRemove = removeChanges
                .map((change) => getEdge(change.id) as EdgeType | undefined)
                .filter((edge) => !!edge);

            const relationshipsToRemove: string[] = (
                edgesToRemove.filter(
                    (edge) => edge?.type === 'relationship-edge'
                ) as RelationshipEdgeType[]
            ).map((edge) => edge?.data?.relationship?.id as string);

            const dependenciesToRemove: string[] = (
                edgesToRemove.filter(
                    (edge) => edge?.type === 'dependency-edge'
                ) as DependencyEdgeType[]
            ).map((edge) => edge?.data?.dependency?.id as string);

            if (relationshipsToRemove.length > 0) {
                removeRelationships(relationshipsToRemove);
            }

            if (dependenciesToRemove.length > 0) {
                removeDependencies(dependenciesToRemove);
            }

            return onEdgesChange(changesToApply);
        },
        [
            getEdge,
            onEdgesChange,
            removeRelationships,
            removeDependencies,
            readonly,
        ]
    );

    const updateOverlappingGraphOnChanges = useCallback(
        ({
            positionChanges,
            sizeChanges,
        }: {
            positionChanges: NodePositionChange[];
            sizeChanges: NodeDimensionChange[];
        }) => {
            if (positionChanges.length > 0 || sizeChanges.length > 0) {
                let newOverlappingGraph: Graph<string> = overlapGraph;

                for (const change of positionChanges) {
                    const node = getNode(change.id) as NodeType;
                    if (!node) {
                        continue;
                    }

                    if (node.type !== 'table') {
                        continue;
                    }

                    newOverlappingGraph = findTableOverlapping(
                        { node: node as TableNodeType },
                        {
                            nodes: nodes.filter(
                                (node) => !node.hidden && node.type === 'table'
                            ) as TableNodeType[],
                        },
                        newOverlappingGraph
                    );
                }

                for (const change of sizeChanges) {
                    const node = getNode(change.id) as NodeType;
                    if (!node) {
                        continue;
                    }

                    if (node.type !== 'table') {
                        continue;
                    }

                    newOverlappingGraph = findTableOverlapping(
                        { node: node as TableNodeType },
                        {
                            nodes: nodes.filter(
                                (node) => !node.hidden && node.type === 'table'
                            ) as TableNodeType[],
                        },
                        newOverlappingGraph
                    );
                }

                setOverlapGraph(newOverlappingGraph);
            }
        },
        [nodes, overlapGraph, setOverlapGraph, getNode]
    );

    const updateOverlappingGraphOnChangesDebounced = debounce(
        updateOverlappingGraphOnChanges,
        200
    );

    const findRelevantNodesChanges = useCallback(
        (changes: NodeChange<NodeType>[], type: NodeType['type']) => {
            const relevantChanges = changes.filter((change) => {
                if (
                    (change.type === 'position' &&
                        !change.dragging &&
                        change.position?.x !== undefined &&
                        change.position?.y !== undefined &&
                        !isNaN(change.position.x) &&
                        !isNaN(change.position.y)) ||
                    // Commit once the resize gesture ends. `resizing` is
                    // `true` on every intermediate frame while the handle is
                    // being dragged (persisting every frame self-conflicted,
                    // see git history) and `false` on the NodeResizer's own
                    // final onEnd event — the one we want. It's `undefined`
                    // (neither true nor false) on dimension changes xyflow
                    // fires for unrelated reasons — ResizeObserver
                    // auto-remeasure (e.g. a table's rendered height changing
                    // because a field was added/removed) and parent-area
                    // auto-expand — so `!change.resizing` is wrong here: it
                    // also matches those, turning every such incidental
                    // resize into a version-guarded write that can conflict.
                    // Must be a strict `=== false`, not just falsy.
                    (change.type === 'dimensions' &&
                        change.resizing === false) ||
                    change.type === 'remove'
                ) {
                    const node = getNode(change.id);
                    if (!node) {
                        return false;
                    }

                    if (node.type !== type) {
                        return false;
                    }

                    return true;
                }

                return false;
            });

            const positionChanges: NodePositionChange[] =
                relevantChanges.filter(
                    (change) =>
                        change.type === 'position' &&
                        !change.dragging &&
                        change.position?.x !== undefined &&
                        change.position?.y !== undefined &&
                        !isNaN(change.position.x) &&
                        !isNaN(change.position.y)
                ) as NodePositionChange[];

            const removeChanges: NodeRemoveChange[] = relevantChanges.filter(
                (change) => change.type === 'remove'
            ) as NodeRemoveChange[];

            const sizeChanges: NodeDimensionChange[] = relevantChanges.filter(
                (change) =>
                    change.type === 'dimensions' && change.resizing === false
            ) as NodeDimensionChange[];

            return {
                positionChanges,
                removeChanges,
                sizeChanges,
            };
        },
        [getNode]
    );

    const onNodesChangeHandler: OnNodesChange<NodeType> = useCallback(
        (changes) => {
            let changesToApply = changes;

            // Broadcast-only live preview for other collaborators — the
            // persisted position update still happens below, once dragging
            // stops (see findRelevantNodesChanges/applyCanvasTableChanges).
            changes.forEach((change) => {
                if (
                    change.type === 'position' &&
                    change.dragging &&
                    change.position &&
                    getNode(change.id)?.type === 'table'
                ) {
                    emitDrag(change.id, change.position.x, change.position.y);
                }
            });

            if (readonly) {
                changesToApply = changesToApply.filter(
                    (change) => change.type !== 'remove'
                );
            }

            // Handle area drag changes - add child table movements for visual feedback only
            const areaDragChanges = changesToApply.filter((change) => {
                if (change.type === 'position') {
                    const node = getNode(change.id);
                    return node?.type === 'area' && change.dragging;
                }
                return false;
            }) as NodePositionChange[];

            // Add visual position changes for child tables during area dragging
            if (areaDragChanges.length > 0) {
                const additionalChanges: NodePositionChange[] = [];

                areaDragChanges.forEach((areaChange) => {
                    const currentArea = areas.find(
                        (a) => a.id === areaChange.id
                    );
                    if (currentArea && areaChange.position) {
                        const deltaX = areaChange.position.x - currentArea.x;
                        const deltaY = areaChange.position.y - currentArea.y;

                        // Find child tables and create visual position changes
                        const childTables = tables.filter(
                            (table) => table.parentAreaId === areaChange.id
                        );

                        childTables.forEach((table) => {
                            additionalChanges.push({
                                id: table.id,
                                type: 'position',
                                position: {
                                    x: table.x + deltaX,
                                    y: table.y + deltaY,
                                },
                                dragging: true,
                            });
                        });

                        // Find child notes and create visual position changes
                        const childNotes = notes.filter(
                            (note) => note.parentAreaId === areaChange.id
                        );

                        childNotes.forEach((note) => {
                            additionalChanges.push({
                                id: note.id,
                                type: 'position',
                                position: {
                                    x: note.x + deltaX,
                                    y: note.y + deltaY,
                                },
                                dragging: true,
                            });
                        });
                    }
                });

                // Add visual changes to React Flow
                changesToApply = [...changesToApply, ...additionalChanges];
            }

            // First, detect area changes
            const {
                positionChanges: areaPositionChanges,
                removeChanges: areaRemoveChanges,
                sizeChanges: areaSizeChanges,
            } = findRelevantNodesChanges(changesToApply, 'area');

            // Then, detect note changes
            const {
                positionChanges: notePositionChanges,
                removeChanges: noteRemoveChanges,
                sizeChanges: noteSizeChanges,
            } = findRelevantNodesChanges(changesToApply, 'note');

            // Then, detect table changes
            const { positionChanges, removeChanges, sizeChanges } =
                findRelevantNodesChanges(changesToApply, 'table');

            // Calculate child table/note movements from area position changes
            const childTableMovements: Map<
                string,
                { deltaX: number; deltaY: number }
            > = new Map();
            const childNoteMovements: Map<
                string,
                { deltaX: number; deltaY: number }
            > = new Map();
            if (
                areaPositionChanges.length > 0 &&
                areaSizeChanges.length === 0
            ) {
                areaPositionChanges.forEach((change) => {
                    if (change.type === 'position' && change.position) {
                        const currentArea = areas.find(
                            (a) => a.id === change.id
                        );
                        if (currentArea) {
                            const deltaX = change.position.x - currentArea.x;
                            const deltaY = change.position.y - currentArea.y;

                            const childTables = getTablesInArea(
                                change.id,
                                tables
                            );
                            childTables.forEach((table) => {
                                childTableMovements.set(table.id, {
                                    deltaX,
                                    deltaY,
                                });
                            });

                            const childNotes = getNotesInArea(change.id, notes);
                            childNotes.forEach((note) => {
                                childNoteMovements.set(note.id, {
                                    deltaX,
                                    deltaY,
                                });
                            });
                        }
                    }
                });
            }

            // Apply all table updates in a single call
            if (
                positionChanges.length > 0 ||
                removeChanges.length > 0 ||
                sizeChanges.length > 0 ||
                childTableMovements.size > 0 ||
                areaRemoveChanges.length > 0
            ) {
                applyCanvasTableChanges({
                    positionChanges,
                    sizeChanges,
                    removeChanges,
                    childTableMovements,
                    areaRemoveChanges,
                });
            }

            updateOverlappingGraphOnChangesDebounced({
                positionChanges,
                sizeChanges,
            });

            if (
                areaPositionChanges.length > 0 ||
                areaRemoveChanges.length > 0 ||
                areaSizeChanges.length > 0
            ) {
                const areasUpdates: Record<string, Partial<Area>> = {};
                // Handle area position changes (child tables already moved above)
                areaPositionChanges.forEach((change) => {
                    if (change.type === 'position' && change.position) {
                        areasUpdates[change.id] = {
                            ...areasUpdates[change.id],
                            x: change.position.x,
                            y: change.position.y,
                        };
                    }
                });

                // Handle area size changes
                areaSizeChanges.forEach((change) => {
                    if (change.type === 'dimensions' && change.dimensions) {
                        areasUpdates[change.id] = {
                            ...areasUpdates[change.id],
                            width: change.dimensions.width,
                            height: change.dimensions.height,
                        };
                    }
                });

                // Handle area removal (child tables parentAreaId already cleared above)
                areaRemoveChanges.forEach((change) => {
                    removeArea(change.id);
                    delete areasUpdates[change.id];
                });

                // Apply area updates to storage
                if (Object.keys(areasUpdates).length > 0) {
                    for (const [id, updates] of Object.entries(areasUpdates)) {
                        updateArea(id, updates);
                    }
                }
            }

            // Handle note changes
            if (
                notePositionChanges.length > 0 ||
                noteRemoveChanges.length > 0 ||
                noteSizeChanges.length > 0 ||
                childNoteMovements.size > 0 ||
                areaRemoveChanges.length > 0
            ) {
                const notesUpdates: Record<string, Partial<Note>> = {};

                // Handle area removal - clear parentAreaId on child notes
                areaRemoveChanges.forEach((change) => {
                    getNotesInArea(change.id, notes).forEach((note) => {
                        notesUpdates[note.id] = {
                            ...notesUpdates[note.id],
                            parentAreaId: null,
                        };
                    });
                });

                // Handle child note movement from area drag
                childNoteMovements.forEach((movement, noteId) => {
                    const note = notes.find((n) => n.id === noteId);
                    if (note) {
                        notesUpdates[noteId] = {
                            ...notesUpdates[noteId],
                            x: note.x + movement.deltaX,
                            y: note.y + movement.deltaY,
                        };
                    }
                });

                // Handle note position changes
                notePositionChanges.forEach((change) => {
                    if (change.type === 'position' && change.position) {
                        notesUpdates[change.id] = {
                            ...notesUpdates[change.id],
                            x: change.position.x,
                            y: change.position.y,
                        };
                    }
                });

                // Handle note size changes
                noteSizeChanges.forEach((change) => {
                    if (change.type === 'dimensions' && change.dimensions) {
                        notesUpdates[change.id] = {
                            ...notesUpdates[change.id],
                            width: change.dimensions.width,
                            height: change.dimensions.height,
                        };
                    }
                });

                // Handle note removal
                noteRemoveChanges.forEach((change) => {
                    removeNote(change.id);
                    delete notesUpdates[change.id];
                });

                // Apply note updates to storage
                if (Object.keys(notesUpdates).length > 0) {
                    for (const [id, updates] of Object.entries(notesUpdates)) {
                        updateNote(id, updates);
                    }
                }
            }

            return onNodesChange(changesToApply);
        },
        [
            onNodesChange,
            applyCanvasTableChanges,
            updateOverlappingGraphOnChangesDebounced,
            findRelevantNodesChanges,
            updateArea,
            removeArea,
            updateNote,
            removeNote,
            readonly,
            tables,
            notes,
            areas,
            getNode,
            emitDrag,
        ]
    );

    const eventConsumer = useCallback(
        (event: ChartDBEvent) => {
            let newOverlappingGraph: Graph<string> = overlapGraph;
            if (event.action === 'add_tables') {
                for (const table of event.data.tables) {
                    newOverlappingGraph = findTableOverlapping(
                        { node: getNode(table.id) as TableNodeType },
                        {
                            nodes: nodes.filter(
                                (node) => !node.hidden && node.type === 'table'
                            ) as TableNodeType[],
                        },
                        overlapGraph
                    );
                }

                setOverlapGraph(newOverlappingGraph);
            } else if (event.action === 'remove_tables') {
                for (const tableId of event.data.tableIds) {
                    newOverlappingGraph = removeVertex(
                        newOverlappingGraph,
                        tableId
                    );
                }

                setOverlapGraph(newOverlappingGraph);
            } else if (
                event.action === 'update_table' &&
                event.data.table.width
            ) {
                const node = getNode(event.data.id) as TableNodeType;

                const measured = {
                    ...node.measured,
                    width: event.data.table.width,
                };

                newOverlappingGraph = findTableOverlapping(
                    {
                        node: {
                            ...node,
                            measured,
                        },
                    },
                    {
                        nodes: nodes.filter(
                            (node) => !node.hidden && node.type === 'table'
                        ) as TableNodeType[],
                    },
                    overlapGraph
                );
                setOverlapGraph(newOverlappingGraph);

                setTimeout(() => {
                    setNodes((prevNodes) =>
                        prevNodes.map((n) => {
                            if (n.id === event.data.id) {
                                return {
                                    ...n,
                                    measured,
                                };
                            }

                            return n;
                        })
                    );
                }, 0);
            } else if (
                event.action === 'add_field' ||
                event.action === 'remove_field'
            ) {
                const node = getNode(event.data.tableId) as TableNodeType;

                const measured = {
                    ...(node.measured ?? {}),
                    height: calcTableHeight({
                        ...node.data.table,
                        fields: event.data.fields,
                    }),
                };

                newOverlappingGraph = findTableOverlapping(
                    {
                        node: {
                            ...node,
                            measured,
                        },
                    },
                    {
                        nodes: nodes.filter(
                            (node) => !node.hidden && node.type === 'table'
                        ) as TableNodeType[],
                    },
                    overlapGraph
                );
                setOverlapGraph(newOverlappingGraph);
            } else if (event.action === 'load_diagram') {
                const diagramTables = event.data.diagram.tables ?? [];
                const overlappingTablesInDiagram = findOverlappingTables({
                    tables: diagramTables.filter(
                        (table) =>
                            filterTable({
                                table: {
                                    id: table.id,
                                    schema: table.schema,
                                },
                                filter,
                                options: {
                                    defaultSchema: defaultSchemas[databaseType],
                                },
                            }) && (showDBViews ? true : !table.isView)
                    ),
                });
                setOverlapGraph(overlappingTablesInDiagram);
            }
        },
        [
            overlapGraph,
            setOverlapGraph,
            getNode,
            nodes,
            filter,
            setNodes,
            databaseType,
            showDBViews,
        ]
    );

    events.useSubscription(eventConsumer);

    const isLoadingDOM =
        tables.length > 0 ? !getInternalNode(tables[0].id) : false;

    const hasOverlappingTables = useMemo(
        () =>
            Array.from(overlapGraph.graph).some(
                ([, value]) => value.length > 0
            ),
        [overlapGraph]
    );

    // Check if all tables are hidden due to filtering
    // Derived from filter state directly (not nodes) for better performance
    const allTablesHiddenByFilter = useMemo(() => {
        if (!hasActiveFilter || tables.length === 0 || filterLoading) {
            return false;
        }
        // Check if any table passes the filter
        const visibleTableCount = tables.filter((table) =>
            filterTable({
                table: { id: table.id, schema: table.schema },
                filter,
                options: { defaultSchema: defaultSchemas[databaseType] },
            })
        ).length;
        return visibleTableCount === 0;
    }, [hasActiveFilter, tables, filter, databaseType, filterLoading]);

    const pulseOverlappingTables = useCallback(() => {
        setHighlightOverlappingTables(true);
        setTimeout(() => setHighlightOverlappingTables(false), 600);
    }, []);

    const containerRef = useRef<HTMLDivElement>(null);
    const exitEditTableMode = useCallback(
        () => setEditTableModeTable(null),
        [setEditTableModeTable]
    );
    useClickAway(containerRef, exitEditTableMode);
    useClickAway(containerRef, hideCreateRelationshipNode);

    const shiftPressed = useKeyPress('Shift');
    const operatingSystem = getOperatingSystem();

    useHotkeys(
        operatingSystem === 'mac' ? 'meta+f' : 'ctrl+f',
        () => {
            setShowFilter((prev) => !prev);
        },
        {
            preventDefault: true,
            enableOnFormTags: true,
        },
        []
    );

    // Handle mouse move to update cursor position for floating edge, and to
    // broadcast this user's live cursor position to collaborators.
    const { screenToFlowPosition } = useReactFlow();
    const rafIdRef = useRef<number>();
    const handleMouseMove = useCallback(
        (event: React.MouseEvent) => {
            // Throttle using requestAnimationFrame
            if (rafIdRef.current) {
                return;
            }

            const { clientX, clientY } = event;
            rafIdRef.current = requestAnimationFrame(() => {
                const position = screenToFlowPosition({
                    x: clientX,
                    y: clientY,
                });
                if (tempFloatingEdge) {
                    setCursorPosition(position);
                }
                emitCursor(position.x, position.y);
                rafIdRef.current = undefined;
            });
        },
        [tempFloatingEdge, screenToFlowPosition, emitCursor]
    );

    // Cleanup RAF on unmount
    useEffect(() => {
        return () => {
            if (rafIdRef.current) {
                cancelAnimationFrame(rafIdRef.current);
            }
        };
    }, []);

    // Figma-style "follow": broadcast our own viewport on every pan/zoom, and
    // when following someone, smoothly re-center on their broadcast viewport.
    // `event` is null when a move is programmatic (e.g. our own setViewport
    // call below) and non-null for real user input — that's how we detect a
    // manual pan/zoom and break the follow.
    const handleMoveStart = useCallback(
        (event: MouseEvent | TouchEvent | null) => {
            if (event && followingSocketId) unfollowUser();
        },
        [followingSocketId, unfollowUser]
    );
    const handleMove = useCallback(
        (_event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
            emitViewport(viewport.x, viewport.y, viewport.zoom);
        },
        [emitViewport]
    );

    useEffect(() => {
        if (!followingSocketId) return;
        const target = remoteViewports.get(followingSocketId);
        if (!target) return;
        setViewport(target, { duration: 300 });
    }, [followingSocketId, remoteViewports, setViewport]);

    // Handle escape key to cancel floating edge creation, close relationship node, and close relationship popover
    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                if (tempFloatingEdge) {
                    endFloatingEdgeCreation();
                    setCursorPosition(null);
                }
                // Also close CreateRelationshipNode if present
                hideCreateRelationshipNode();
                // Exit edit table mode
                exitEditTableMode();
                // Close relationship edit popover
                closeRelationshipPopover();
            }
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [
        tempFloatingEdge,
        endFloatingEdgeCreation,
        hideCreateRelationshipNode,
        closeRelationshipPopover,
        exitEditTableMode,
    ]);

    // Add temporary invisible node at cursor position and edge
    const nodesWithCursor = useMemo(() => {
        if (!tempFloatingEdge || !cursorPosition) {
            return nodes;
        }

        const tempNode: TempCursorNodeType = {
            id: TEMP_CURSOR_NODE_ID,
            type: 'temp-cursor',
            position: cursorPosition,
            data: {},
            draggable: false,
            selectable: false,
        };

        return [...nodes, tempNode];
    }, [nodes, tempFloatingEdge, cursorPosition]);

    const edgesWithFloating = useMemo(() => {
        if (!tempFloatingEdge || !cursorPosition) return edges;

        let target = TEMP_CURSOR_NODE_ID;
        let targetHandle: string | undefined = TEMP_CURSOR_HANDLE_ID;

        if (tempFloatingEdge.targetNodeId) {
            target = tempFloatingEdge.targetNodeId;
            targetHandle = `${TABLE_RELATIONSHIP_TARGET_HANDLE_ID_PREFIX}${tempFloatingEdge.targetNodeId}`;
        } else if (
            hoveringTableId &&
            hoveringTableId !== tempFloatingEdge.sourceNodeId
        ) {
            target = hoveringTableId;
            targetHandle = `${TABLE_RELATIONSHIP_TARGET_HANDLE_ID_PREFIX}${hoveringTableId}`;
        }

        const tempEdge: TempFloatingEdgeType = {
            id: TEMP_FLOATING_EDGE_ID,
            source: tempFloatingEdge.sourceNodeId,
            sourceHandle: `${TABLE_RELATIONSHIP_SOURCE_HANDLE_ID_PREFIX}${tempFloatingEdge.sourceNodeId}`,
            target,
            targetHandle,
            type: 'temp-floating-edge',
        };

        return [...edges, tempEdge];
    }, [edges, tempFloatingEdge, cursorPosition, hoveringTableId]);

    const onPaneClickHandler = useCallback(
        (event: React.MouseEvent<Element, MouseEvent>) => {
            if (tempFloatingEdge) {
                endFloatingEdgeCreation();
                setCursorPosition(null);
            }

            // Close CreateRelationshipNode if it exists
            hideCreateRelationshipNode();

            // Exit edit table mode
            exitEditTableMode();

            // Close relationship edit popover
            closeRelationshipPopover();

            canvasEvents.emit({
                action: 'pan_click',
                data: {
                    x: event.clientX,
                    y: event.clientY,
                },
            });
        },
        [
            canvasEvents,
            tempFloatingEdge,
            exitEditTableMode,
            endFloatingEdgeCreation,
            hideCreateRelationshipNode,
            closeRelationshipPopover,
        ]
    );

    return (
        <CanvasContextMenu>
            <div
                className="relative flex h-full"
                id="canvas"
                ref={containerRef}
                onMouseMove={handleMouseMove}
            >
                <ReactFlow
                    onlyRenderVisibleElements
                    colorMode={effectiveTheme}
                    className={cn('nodes-animated', {
                        'canvas-cursor-multi-select': shiftPressed,
                        'canvas-cursor-default': !shiftPressed,
                    })}
                    nodes={nodesWithCursor}
                    edges={edgesWithFloating}
                    onNodesChange={onNodesChangeHandler}
                    onEdgesChange={onEdgesChangeHandler}
                    maxZoom={5}
                    minZoom={0.1}
                    onConnect={onConnectHandler}
                    onMoveStart={handleMoveStart}
                    onMove={handleMove}
                    proOptions={{
                        hideAttribution: true,
                    }}
                    fitView={false}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    defaultEdgeOptions={{
                        animated: false,
                        type: 'relationship-edge',
                    }}
                    panOnScroll={scrollAction === 'pan'}
                    snapToGrid={shiftPressed || snapToGridEnabled}
                    snapGrid={[20, 20]}
                    selectionMode={SelectionMode.Full}
                    onPaneClick={onPaneClickHandler}
                    connectionLineComponent={ConnectionLine}
                    deleteKeyCode={['Backspace', 'Delete']}
                    multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
                >
                    <RemoteCursorsOverlay />
                    <Controls
                        position="top-left"
                        showZoom={false}
                        showFitView={false}
                        showInteractive={false}
                        className="!shadow-none"
                    >
                        <div className="flex flex-col items-center gap-2 md:flex-row">
                            {!readonly ? (
                                <>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <span>
                                                <Button
                                                    variant="secondary"
                                                    className={cn(
                                                        'size-8 p-1 shadow-none',
                                                        snapToGridEnabled ||
                                                            shiftPressed
                                                            ? 'bg-pink-600 text-white hover:bg-pink-500 dark:hover:bg-pink-700 hover:text-white'
                                                            : ''
                                                    )}
                                                    onClick={() =>
                                                        setSnapToGridEnabled(
                                                            (prev) => !prev
                                                        )
                                                    }
                                                >
                                                    <Magnet className="size-4" />
                                                </Button>
                                            </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            {t('snap_to_grid_tooltip', {
                                                key:
                                                    operatingSystem === 'mac'
                                                        ? '⇧'
                                                        : 'Shift',
                                            })}
                                        </TooltipContent>
                                    </Tooltip>
                                    {highlightedCustomType ? (
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <span>
                                                    <Button
                                                        variant="secondary"
                                                        className="size-8 border border-yellow-400 bg-yellow-200 p-1 shadow-none hover:bg-yellow-300 dark:border-yellow-700 dark:bg-yellow-800 dark:hover:bg-yellow-700"
                                                        onClick={() =>
                                                            highlightCustomTypeId(
                                                                undefined
                                                            )
                                                        }
                                                    >
                                                        <Highlighter className="size-4" />
                                                    </Button>
                                                </span>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                {t(
                                                    'toolbar.custom_type_highlight_tooltip',
                                                    {
                                                        typeName:
                                                            highlightedCustomType.name,
                                                    }
                                                )}
                                            </TooltipContent>
                                        </Tooltip>
                                    ) : null}
                                </>
                            ) : null}

                            <div
                                className={`transition-opacity duration-300 ease-in-out ${
                                    hasOverlappingTables
                                        ? 'opacity-100'
                                        : 'opacity-0'
                                }`}
                            >
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <span>
                                            <Button
                                                variant="default"
                                                className="size-8 p-1 shadow-none"
                                                onClick={pulseOverlappingTables}
                                            >
                                                <AlertTriangle className="size-4 text-white" />
                                            </Button>
                                        </span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        {t(
                                            'toolbar.highlight_overlapping_tables'
                                        )}
                                    </TooltipContent>
                                </Tooltip>
                            </div>
                        </div>
                    </Controls>
                    {isLoadingDOM ? (
                        <Controls
                            position="top-center"
                            orientation="horizontal"
                            showZoom={false}
                            showFitView={false}
                            showInteractive={false}
                            className="!shadow-none"
                        >
                            <Badge
                                variant="default"
                                className="bg-pink-600 text-white"
                            >
                                {t('loading_diagram')}
                            </Badge>
                        </Controls>
                    ) : null}

                    {!isDesktop && !readonly ? (
                        <Controls
                            position="bottom-left"
                            orientation="horizontal"
                            showZoom={false}
                            showFitView={false}
                            showInteractive={false}
                            className="!shadow-none"
                        >
                            <Button
                                className="size-11 bg-pink-600 p-2 hover:bg-pink-500"
                                onClick={showSidePanel}
                            >
                                <Pencil />
                            </Button>
                        </Controls>
                    ) : null}
                    {isLostInCanvas ? (
                        <Controls
                            position={
                                isDesktop ? 'bottom-center' : 'top-center'
                            }
                            orientation="horizontal"
                            showZoom={false}
                            showFitView={false}
                            showInteractive={false}
                            className="!shadow-none"
                            style={{
                                [isDesktop ? 'bottom' : 'top']: isDesktop
                                    ? '70px'
                                    : '70px',
                            }}
                        >
                            <ShowAllButton />
                        </Controls>
                    ) : null}
                    <Controls
                        position={isDesktop ? 'bottom-center' : 'top-center'}
                        orientation="horizontal"
                        showZoom={false}
                        showFitView={false}
                        showInteractive={false}
                        className="!shadow-none"
                    >
                        <Toolbar readonly={readonly} />
                    </Controls>
                    {showMiniMapOnCanvas && (
                        <MiniMap
                            style={{
                                width: isDesktop ? 100 : 60,
                                height: isDesktop ? 100 : 60,
                            }}
                        />
                    )}
                    <Background
                        variant={BackgroundVariant.Dots}
                        gap={16}
                        size={1}
                    />
                    {/* Empty state when all tables are hidden by filter */}
                    {allTablesHiddenByFilter && (
                        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                            <div className="pointer-events-auto flex items-center gap-3 rounded-lg border bg-background/90 px-4 py-3 shadow-sm backdrop-blur-sm">
                                <EyeOff className="size-5 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">
                                    {t('canvas.all_tables_hidden')}
                                </span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => resetFilter()}
                                >
                                    {t('canvas.show_all_tables')}
                                </Button>
                            </div>
                        </div>
                    )}
                    {showFilter ? (
                        <CanvasFilter onClose={() => setShowFilter(false)} />
                    ) : null}
                </ReactFlow>
                <MarkerDefinitions />
            </div>
        </CanvasContextMenu>
    );
};
