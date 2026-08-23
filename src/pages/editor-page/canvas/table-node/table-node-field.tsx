import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    Handle,
    Position,
    useConnection,
    useUpdateNodeInternals,
} from '@xyflow/react';
import { Button } from '@/components/button/button';
import {
    KeyRound,
    MessageCircleMore,
    SquareDot,
    SquareMinus,
    SquarePlus,
    Pencil,
} from 'lucide-react';
import { generateDBFieldSuffix, type DBField } from '@/lib/domain/db-field';
import { foreignKeyFieldId } from '@/lib/domain/db-relationship';
import { useChartDB } from '@/hooks/use-chartdb';
import { cn } from '@/lib/utils';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/tooltip/tooltip';
import { useDiff } from '@/context/diff-context/use-diff';
import { useLocalConfig } from '@/hooks/use-local-config';
import {
    BOTTOM_SOURCE_HANDLE_ID_PREFIX,
    TOP_SOURCE_HANDLE_ID_PREFIX,
} from './table-node-dependency-indicator';
import { useCanvas } from '@/hooks/use-canvas';
import { useLayout } from '@/hooks/use-layout';

export const LEFT_HANDLE_ID_PREFIX = 'left_rel_';
export const RIGHT_HANDLE_ID_PREFIX = 'right_rel_';
export const TARGET_ID_PREFIX = 'target_rel_';

// Perf fix found via manual testing: zooming out on a large diagram (many
// tables mounting at once) was very janky. Every field of every table
// called `updateNodeInternals(tableNodeId)` separately on mount — a table
// with 15 fields fired 15 SEPARATE calls, each one forcing a synchronous
// DOM reflow read over every handle in that table AND walking every node
// in the ENTIRE diagram (`updateAbsolutePositions` inside React Flow's own
// `updateNodeInternals` action is diagram-wide, not scoped to one table —
// confirmed by reading @xyflow/system's source). All of a table's fields
// mount in the same tick, so this Set — shared across every
// `TableNodeField` instance via module scope, keyed by tableNodeId —
// coalesces however many of them ask for a recompute into exactly ONE
// real call per animation frame, per table.
const pendingNodeInternalsUpdates = new Set<string>();

function scheduleNodeInternalsUpdate(
    tableNodeId: string,
    updateNodeInternals: (id: string) => void
): void {
    if (pendingNodeInternalsUpdates.has(tableNodeId)) return;
    pendingNodeInternalsUpdates.add(tableNodeId);
    requestAnimationFrame(() => {
        pendingNodeInternalsUpdates.delete(tableNodeId);
        updateNodeInternals(tableNodeId);
    });
}

export interface TableNodeFieldProps {
    tableNodeId: string;
    field: DBField;
    focused: boolean;
    highlighted: boolean;
    visible: boolean;
    isConnectable: boolean;
    // Target edge count passed from canvas to ensure sync with edge creation
    targetEdgeCount?: number;
    // Perf: precomputed once in canvas.tsx over the whole `relationships`
    // array, same reasoning as `targetEdgeCount` — see `isForeignKey`
    // below's own comment for why the per-field fallback scan was a real
    // cost on large diagrams.
    isForeignKey?: boolean;
    // Perf (LOD): true below table-node.tsx's zoom threshold. Renders a
    // stripped-down row — same Handle elements, at the same positions, so
    // relationship edges keep anchoring correctly — with no name/type
    // text, icons, tooltips, or diff-highlighting, none of which is
    // legible at that zoom level anyway. See the doc comment on the
    // low-detail branch below for why the Handles specifically are NOT
    // dropped (React Flow can't find an edge's specific handle otherwise,
    // and just drops the edge entirely rather than falling back to the
    // node's center — confirmed by reading its source before choosing
    // this design over hiding fields outright).
    isLowDetail?: boolean;
}

const arePropsEqual = (
    prevProps: TableNodeFieldProps,
    nextProps: TableNodeFieldProps
) => {
    return (
        prevProps.field.id === nextProps.field.id &&
        prevProps.field.name === nextProps.field.name &&
        prevProps.field.primaryKey === nextProps.field.primaryKey &&
        prevProps.field.nullable === nextProps.field.nullable &&
        prevProps.field.comments === nextProps.field.comments &&
        prevProps.field.unique === nextProps.field.unique &&
        prevProps.field.type.id === nextProps.field.type.id &&
        prevProps.field.type.name === nextProps.field.type.name &&
        prevProps.field.characterMaximumLength ===
            nextProps.field.characterMaximumLength &&
        prevProps.field.precision === nextProps.field.precision &&
        prevProps.field.scale === nextProps.field.scale &&
        prevProps.field.isArray === nextProps.field.isArray &&
        prevProps.focused === nextProps.focused &&
        prevProps.highlighted === nextProps.highlighted &&
        prevProps.visible === nextProps.visible &&
        prevProps.isConnectable === nextProps.isConnectable &&
        prevProps.tableNodeId === nextProps.tableNodeId &&
        prevProps.targetEdgeCount === nextProps.targetEdgeCount &&
        prevProps.isForeignKey === nextProps.isForeignKey &&
        prevProps.isLowDetail === nextProps.isLowDetail
    );
};

export const TableNodeField: React.FC<TableNodeFieldProps> = React.memo(
    ({
        field,
        focused,
        tableNodeId,
        highlighted,
        visible,
        isConnectable,
        targetEdgeCount,
        isForeignKey: precomputedIsForeignKey,
        isLowDetail,
    }) => {
        const { relationships, readonly, highlightedCustomType, databaseType } =
            useChartDB();

        const updateNodeInternals = useUpdateNodeInternals();
        const connection = useConnection();
        const isTarget = useMemo(
            () =>
                connection.inProgress &&
                connection.fromNode.id !== tableNodeId &&
                (connection.fromHandle.id?.startsWith(RIGHT_HANDLE_ID_PREFIX) ||
                    connection.fromHandle.id?.startsWith(
                        LEFT_HANDLE_ID_PREFIX
                    )),
            [
                connection.inProgress,
                connection.fromNode?.id,
                connection.fromHandle?.id,
                tableNodeId,
            ]
        );
        const isTargetFromView = useMemo(
            () =>
                connection.inProgress &&
                connection.fromNode.id !== tableNodeId &&
                (connection.fromHandle.id?.startsWith(
                    TOP_SOURCE_HANDLE_ID_PREFIX
                ) ||
                    connection.fromHandle.id?.startsWith(
                        BOTTOM_SOURCE_HANDLE_ID_PREFIX
                    )),
            [
                connection.inProgress,
                connection.fromNode?.id,
                connection.fromHandle?.id,
                tableNodeId,
            ]
        );

        const numberOfEdgesToField = useMemo(() => {
            // Use targetEdgeCount from canvas when available (ensures sync with edge creation)
            if (targetEdgeCount !== undefined) {
                return targetEdgeCount;
            }
            // Fallback: count from relationships
            let count = 0;
            for (const rel of relationships) {
                if (
                    rel.targetTableId === tableNodeId &&
                    rel.targetFieldId === field.id
                ) {
                    count++;
                }
            }
            return count;
        }, [targetEdgeCount, relationships, tableNodeId, field.id]);

        // Perf fix found via manual testing on a large imported diagram:
        // this used to unconditionally scan the WHOLE `relationships`
        // array on every field, every mount — O(fields × relationships)
        // diagram-wide, with no index. canvas.tsx now precomputes this
        // once (same reasoning/pattern as `targetEdgeCount`) and passes
        // it down; the scan below only runs as a fallback for any call
        // site that doesn't provide it.
        const isForeignKey = useMemo(() => {
            if (precomputedIsForeignKey !== undefined) {
                return precomputedIsForeignKey;
            }
            // Fallback only — matches computeForeignKeyFieldIds exactly
            // (single source of truth in db-relationship.ts), just without
            // the diagram-wide index canvas.tsx builds once and passes
            // down as `precomputedIsForeignKey` on the normal render path.
            return relationships.some(
                (rel) => foreignKeyFieldId(rel) === field.id
            );
        }, [precomputedIsForeignKey, relationships, field.id]);

        const previousNumberOfEdgesToFieldRef = useRef<number | null>(null);

        useEffect(() => {
            // Always update on first render, then only when count changes.
            // The ref updates synchronously here (not deferred inside the
            // rAF, unlike the old version) — this field's own request is
            // "accounted for" the moment it's made, regardless of whether
            // the actual `updateNodeInternals` call ends up being the one
            // a sibling field's request already scheduled for this frame
            // (see scheduleNodeInternalsUpdate above).
            if (
                previousNumberOfEdgesToFieldRef.current === null ||
                previousNumberOfEdgesToFieldRef.current !== numberOfEdgesToField
            ) {
                previousNumberOfEdgesToFieldRef.current = numberOfEdgesToField;
                scheduleNodeInternalsUpdate(tableNodeId, updateNodeInternals);
            }
        }, [tableNodeId, updateNodeInternals, numberOfEdgesToField]);

        const {
            checkIfFieldRemoved,
            checkIfNewField,
            getFieldNewName,
            getFieldNewType,
            getFieldNewNullable,
            getFieldNewPrimaryKey,
            getFieldNewCharacterMaximumLength,
            getFieldNewPrecision,
            getFieldNewScale,
            getFieldNewIsArray,
            checkIfFieldHasChange,
            isSummaryOnly,
        } = useDiff();

        const [diffState, setDiffState] = useState<{
            isDiffFieldRemoved: boolean;
            isDiffNewField: boolean;
            fieldDiffChangedName: ReturnType<typeof getFieldNewName>;
            fieldDiffChangedType: ReturnType<typeof getFieldNewType>;
            fieldDiffChangedNullable: ReturnType<typeof getFieldNewNullable>;
            fieldDiffChangedCharacterMaximumLength: ReturnType<
                typeof getFieldNewCharacterMaximumLength
            >;
            fieldDiffChangedScale: ReturnType<typeof getFieldNewScale>;
            fieldDiffChangedPrecision: ReturnType<typeof getFieldNewPrecision>;
            fieldDiffChangedPrimaryKey: ReturnType<
                typeof getFieldNewPrimaryKey
            >;
            fieldDiffChangedIsArray: ReturnType<typeof getFieldNewIsArray>;
            isDiffFieldChanged: boolean;
        }>({
            isDiffFieldRemoved: false,
            isDiffNewField: false,
            fieldDiffChangedName: null,
            fieldDiffChangedType: null,
            fieldDiffChangedNullable: null,
            fieldDiffChangedCharacterMaximumLength: null,
            fieldDiffChangedScale: null,
            fieldDiffChangedPrecision: null,
            fieldDiffChangedPrimaryKey: null,
            fieldDiffChangedIsArray: null,
            isDiffFieldChanged: false,
        });

        useEffect(() => {
            // Calculate diff state asynchronously
            const timer = requestAnimationFrame(() => {
                setDiffState({
                    isDiffFieldRemoved: checkIfFieldRemoved({
                        fieldId: field.id,
                    }),
                    isDiffNewField: checkIfNewField({ fieldId: field.id }),
                    fieldDiffChangedName: getFieldNewName({
                        fieldId: field.id,
                    }),
                    fieldDiffChangedType: getFieldNewType({
                        fieldId: field.id,
                    }),
                    fieldDiffChangedNullable: getFieldNewNullable({
                        fieldId: field.id,
                    }),
                    fieldDiffChangedPrimaryKey: getFieldNewPrimaryKey({
                        fieldId: field.id,
                    }),
                    fieldDiffChangedCharacterMaximumLength:
                        getFieldNewCharacterMaximumLength({
                            fieldId: field.id,
                        }),
                    fieldDiffChangedScale: getFieldNewScale({
                        fieldId: field.id,
                    }),
                    fieldDiffChangedPrecision: getFieldNewPrecision({
                        fieldId: field.id,
                    }),
                    fieldDiffChangedIsArray: getFieldNewIsArray({
                        fieldId: field.id,
                    }),
                    isDiffFieldChanged: checkIfFieldHasChange({
                        fieldId: field.id,
                        tableId: tableNodeId,
                    }),
                });
            });
            return () => cancelAnimationFrame(timer);
        }, [
            checkIfFieldRemoved,
            checkIfNewField,
            getFieldNewName,
            getFieldNewType,
            getFieldNewPrimaryKey,
            getFieldNewNullable,
            checkIfFieldHasChange,
            getFieldNewCharacterMaximumLength,
            getFieldNewPrecision,
            getFieldNewScale,
            getFieldNewIsArray,
            field.id,
            tableNodeId,
        ]);

        const {
            isDiffFieldRemoved,
            isDiffNewField,
            fieldDiffChangedName,
            fieldDiffChangedType,
            isDiffFieldChanged,
            fieldDiffChangedNullable,
            fieldDiffChangedPrimaryKey,
            fieldDiffChangedCharacterMaximumLength,
            fieldDiffChangedScale,
            fieldDiffChangedPrecision,
            fieldDiffChangedIsArray,
        } = diffState;

        const isFieldAttributeChanged = useMemo(() => {
            return (
                fieldDiffChangedCharacterMaximumLength ||
                fieldDiffChangedScale ||
                fieldDiffChangedPrecision ||
                fieldDiffChangedIsArray
            );
        }, [
            fieldDiffChangedCharacterMaximumLength,
            fieldDiffChangedScale,
            fieldDiffChangedPrecision,
            fieldDiffChangedIsArray,
        ]);

        const isCustomTypeHighlighted = useMemo(() => {
            if (!highlightedCustomType) return false;
            return field.type.name === highlightedCustomType.name;
        }, [highlightedCustomType, field.type.name]);
        const { showFieldAttributes } = useLocalConfig();

        const { closeAllTablesInSidebar } = useLayout();
        const { setEditTableModeTable } = useCanvas();
        const openEditTableOnField = useCallback(() => {
            if (readonly) {
                return;
            }

            closeAllTablesInSidebar();
            setEditTableModeTable({
                tableId: tableNodeId,
                fieldId: field.id,
            });
        }, [
            setEditTableModeTable,
            closeAllTablesInSidebar,
            tableNodeId,
            field.id,
            readonly,
        ]);

        // Perf (LOD): every Handle below is copied VERBATIM from the full
        // render further down — same ids, same positions, same count
        // logic — deliberately, so a relationship edge anchored to this
        // exact field keeps resolving to the exact same point regardless
        // of which branch rendered. Everything else (name, type, icons,
        // tooltips, diff-highlighting) is dropped — none of it is legible
        // at this zoom level anyway, and it was a real jank contributor
        // when many tables/fields mount at once (e.g. zooming out after a
        // large import).
        if (isLowDetail) {
            return (
                <div
                    className={cn('relative flex h-8 items-center border-t', {
                        'max-h-8 opacity-100': visible,
                        'z-0 max-h-0 overflow-hidden opacity-0': !visible,
                    })}
                >
                    {isConnectable ? (
                        <>
                            <Handle
                                id={`${RIGHT_HANDLE_ID_PREFIX}${field.id}`}
                                className={`!h-4 !w-4 !border-2 !bg-pink-600 ${!focused || readonly || isTargetFromView ? '!invisible' : ''}`}
                                position={Position.Right}
                                type="source"
                            />
                            <Handle
                                id={`${LEFT_HANDLE_ID_PREFIX}${field.id}`}
                                className={`!h-4 !w-4 !border-2 !bg-pink-600 ${!focused || readonly || isTargetFromView ? '!invisible' : ''}`}
                                position={Position.Left}
                                type="source"
                            />
                        </>
                    ) : null}
                    {(!connection.inProgress || isTarget) && isConnectable && (
                        <>
                            {Array.from(
                                { length: numberOfEdgesToField },
                                (_, index) => index
                            ).map((index) => (
                                <Handle
                                    id={`${TARGET_ID_PREFIX}${index}_${field.id}`}
                                    key={`${TARGET_ID_PREFIX}${index}_${field.id}`}
                                    className={`!invisible`}
                                    position={Position.Left}
                                    type="target"
                                />
                            ))}
                            <Handle
                                id={`${TARGET_ID_PREFIX}${numberOfEdgesToField}_${field.id}`}
                                className={
                                    isTarget
                                        ? '!absolute !left-0 !top-0 !h-full !w-full !transform-none !rounded-none !border-none !opacity-0'
                                        : `!invisible`
                                }
                                position={Position.Left}
                                type="target"
                            />
                        </>
                    )}
                </div>
            );
        }

        return (
            <div
                className={cn(
                    'group relative flex h-8 items-center justify-between gap-1 border-t px-3 text-sm last:rounded-b-[6px] hover:bg-slate-100 dark:hover:bg-slate-800',
                    'transition-all duration-200 ease-in-out',
                    {
                        'bg-pink-100 dark:bg-pink-900':
                            highlighted && !isCustomTypeHighlighted,
                        'bg-yellow-100 dark:bg-yellow-900':
                            isCustomTypeHighlighted,
                        'max-h-8 opacity-100': visible,
                        'z-0 max-h-0 overflow-hidden opacity-0': !visible,
                        'bg-sky-200 dark:bg-sky-800 hover:bg-sky-100 dark:hover:bg-sky-900 border-sky-300 dark:border-sky-700':
                            isDiffFieldChanged &&
                            !isSummaryOnly &&
                            !isDiffFieldRemoved &&
                            !isDiffNewField,
                        'bg-red-200 dark:bg-red-800 hover:bg-red-100 dark:hover:bg-red-900 border-red-300 dark:border-red-700':
                            isDiffFieldRemoved,
                        'bg-green-200 dark:bg-green-800 hover:bg-green-100 dark:hover:bg-green-900 border-green-300 dark:border-green-700':
                            isDiffNewField,
                    }
                )}
            >
                {isConnectable ? (
                    <>
                        <Handle
                            id={`${RIGHT_HANDLE_ID_PREFIX}${field.id}`}
                            className={`!h-4 !w-4 !border-2 !bg-pink-600 ${!focused || readonly || isTargetFromView ? '!invisible' : ''}`}
                            position={Position.Right}
                            type="source"
                        />
                        <Handle
                            id={`${LEFT_HANDLE_ID_PREFIX}${field.id}`}
                            className={`!h-4 !w-4 !border-2 !bg-pink-600 ${!focused || readonly || isTargetFromView ? '!invisible' : ''}`}
                            position={Position.Left}
                            type="source"
                        />
                    </>
                ) : null}
                {(!connection.inProgress || isTarget) && isConnectable && (
                    <>
                        {Array.from(
                            { length: numberOfEdgesToField },
                            (_, index) => index
                        ).map((index) => (
                            <Handle
                                id={`${TARGET_ID_PREFIX}${index}_${field.id}`}
                                key={`${TARGET_ID_PREFIX}${index}_${field.id}`}
                                className={`!invisible`}
                                position={Position.Left}
                                type="target"
                            />
                        ))}
                        <Handle
                            id={`${TARGET_ID_PREFIX}${numberOfEdgesToField}_${field.id}`}
                            className={
                                isTarget
                                    ? '!absolute !left-0 !top-0 !h-full !w-full !transform-none !rounded-none !border-none !opacity-0'
                                    : `!invisible`
                            }
                            position={Position.Left}
                            type="target"
                        />
                    </>
                )}
                <div
                    className={cn('flex items-center gap-1 min-w-0 text-left', {
                        'font-semibold': field.primaryKey || field.unique,
                    })}
                >
                    {isDiffFieldRemoved ? (
                        <SquareMinus className="size-3.5 shrink-0 text-red-800 dark:text-red-200" />
                    ) : isDiffNewField ? (
                        <SquarePlus className="size-3.5 shrink-0 text-green-800 dark:text-green-200" />
                    ) : isDiffFieldChanged && !isSummaryOnly ? (
                        <SquareDot className="size-3.5 shrink-0 text-sky-800 dark:text-sky-200" />
                    ) : null}

                    <span
                        className={cn('truncate min-w-0', {
                            'text-red-800 font-normal dark:text-red-200':
                                isDiffFieldRemoved,
                            'text-green-800 font-normal dark:text-green-200':
                                isDiffNewField,
                            'text-sky-800 font-normal dark:text-sky-200':
                                isDiffFieldChanged &&
                                !isSummaryOnly &&
                                !isDiffFieldRemoved &&
                                !isDiffNewField,
                            'text-blue-600 dark:text-blue-400':
                                isForeignKey &&
                                !isDiffFieldRemoved &&
                                !isDiffNewField &&
                                !isDiffFieldChanged,
                        })}
                    >
                        {fieldDiffChangedName ? (
                            <>
                                {fieldDiffChangedName.old}{' '}
                                <span className="font-medium">→</span>{' '}
                                {fieldDiffChangedName.new}
                            </>
                        ) : (
                            field.name
                        )}
                    </span>
                    {field.comments ? (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className="shrink-0 cursor-pointer text-muted-foreground">
                                    <MessageCircleMore size={14} />
                                </div>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs whitespace-pre-wrap break-words">
                                {field.comments}
                            </TooltipContent>
                        </Tooltip>
                    ) : null}
                </div>

                <div
                    className={cn(
                        'ml-auto flex shrink-0 items-center gap-1 min-w-0',
                        !readonly ? 'group-hover:hidden' : ''
                    )}
                >
                    {(field.primaryKey && !fieldDiffChangedPrimaryKey?.old) ||
                    fieldDiffChangedPrimaryKey?.new ? (
                        <div
                            className={cn(
                                'text-muted-foreground shrink-0',
                                isDiffFieldRemoved
                                    ? 'text-red-800 dark:text-red-200'
                                    : '',
                                isDiffNewField
                                    ? 'text-green-800 dark:text-green-200'
                                    : '',
                                isDiffFieldChanged &&
                                    !isSummaryOnly &&
                                    !isDiffFieldRemoved &&
                                    !isDiffNewField
                                    ? 'text-sky-800 dark:text-sky-200'
                                    : ''
                            )}
                        >
                            <KeyRound size={14} />
                        </div>
                    ) : null}
                    <div
                        className={cn(
                            'text-right text-xs text-muted-foreground overflow-hidden min-w-0',
                            isDiffFieldRemoved
                                ? 'text-red-800 dark:text-red-200'
                                : '',
                            isDiffNewField
                                ? 'text-green-800 dark:text-green-200'
                                : '',
                            isDiffFieldChanged &&
                                !isDiffFieldRemoved &&
                                !isSummaryOnly &&
                                !isDiffNewField
                                ? 'text-sky-800 dark:text-sky-200'
                                : '',
                            isForeignKey &&
                                !isDiffFieldRemoved &&
                                !isDiffNewField &&
                                !isDiffFieldChanged
                                ? 'text-blue-600 dark:text-blue-400'
                                : ''
                        )}
                    >
                        <span className="block truncate">
                            {isFieldAttributeChanged || fieldDiffChangedType ? (
                                <>
                                    <span className="line-through">
                                        {
                                            (
                                                fieldDiffChangedType?.old
                                                    ?.name ?? field.type.name
                                            ).split(' ')[0]
                                        }
                                        {showFieldAttributes
                                            ? generateDBFieldSuffix(
                                                  {
                                                      ...field,
                                                      ...{
                                                          precision:
                                                              fieldDiffChangedPrecision?.old ??
                                                              field.precision,
                                                          scale:
                                                              fieldDiffChangedScale?.old ??
                                                              field.scale,
                                                          characterMaximumLength:
                                                              fieldDiffChangedCharacterMaximumLength?.old ??
                                                              field.characterMaximumLength,
                                                          isArray:
                                                              fieldDiffChangedIsArray?.old ??
                                                              field.isArray,
                                                      },
                                                  },
                                                  {
                                                      databaseType,
                                                  }
                                              )
                                            : field.isArray
                                              ? '[]'
                                              : ''}
                                    </span>{' '}
                                    {
                                        (
                                            fieldDiffChangedType?.new?.name ??
                                            field.type.name
                                        ).split(' ')[0]
                                    }
                                    {showFieldAttributes
                                        ? generateDBFieldSuffix(
                                              {
                                                  ...field,
                                                  ...{
                                                      precision:
                                                          fieldDiffChangedPrecision?.new ??
                                                          field.precision,
                                                      scale:
                                                          fieldDiffChangedScale?.new ??
                                                          field.scale,
                                                      characterMaximumLength:
                                                          fieldDiffChangedCharacterMaximumLength?.new ??
                                                          field.characterMaximumLength,
                                                      isArray:
                                                          fieldDiffChangedIsArray?.new ??
                                                          field.isArray,
                                                  },
                                              },
                                              {
                                                  databaseType,
                                              }
                                          )
                                        : (fieldDiffChangedIsArray?.new ??
                                            field.isArray)
                                          ? '[]'
                                          : ''}
                                </>
                            ) : (
                                `${field.type.name.split(' ')[0]}${
                                    showFieldAttributes
                                        ? generateDBFieldSuffix(field, {
                                              databaseType,
                                          })
                                        : field.isArray
                                          ? '[]'
                                          : ''
                                }`
                            )}
                            {fieldDiffChangedNullable ? (
                                fieldDiffChangedNullable.new ? (
                                    <span className="font-semibold">?</span>
                                ) : (
                                    <span className="line-through">?</span>
                                )
                            ) : field.nullable ? (
                                '?'
                            ) : (
                                ''
                            )}
                        </span>
                    </div>
                </div>
                {readonly ? null : (
                    <div className="ml-2 hidden shrink-0 flex-row group-hover:flex">
                        <Button
                            variant="ghost"
                            className="size-6 p-0 hover:bg-primary-foreground"
                            onClick={(e) => {
                                e.stopPropagation();
                                openEditTableOnField();
                            }}
                        >
                            <Pencil className="!size-3.5 text-pink-600" />
                        </Button>
                    </div>
                )}
            </div>
        );
    },
    arePropsEqual
);

TableNodeField.displayName = 'TableNodeField';
