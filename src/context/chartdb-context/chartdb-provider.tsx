import React, { useCallback, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { COLLAB_WS_URL } from '@/lib/env';
import { seedWhenDecided } from '@/lib/collab/seed-gate';
import {
    upsertItem,
    patchItem,
    removeItemFromCollection,
    reconcileCollection,
    upsertTable,
    reconcileTables,
    removeItemsReferencing,
    readCollection,
    readItem,
    readTables,
    readTableItem,
} from '@/lib/collab/y-diagram';
import { useYCollectionSync } from '@/hooks/use-y-collection-sync';
import type { DBTable } from '@/lib/domain/db-table';
import { deepCopy, generateId } from '@/lib/utils';
import { defaultTableColor, randomColor, viewColor } from '@/lib/colors';
import type { ChartDBContext, ChartDBEvent } from './chartdb-context';
import { chartDBContext } from './chartdb-context';
import { DatabaseType } from '@/lib/domain/database-type';
import type { DBField } from '@/lib/domain/db-field';
import {
    getTableIndexesWithPrimaryKey,
    type DBIndex,
} from '@/lib/domain/db-index';
import type { DBCheckConstraint } from '@/lib/domain/db-check-constraint';
import type { DBRelationship } from '@/lib/domain/db-relationship';
import { useStorage } from '@/hooks/use-storage';
import { useRedoUndoStack } from '@/hooks/use-redo-undo-stack';
import type { Diagram } from '@/lib/domain/diagram';
import type { DatabaseEdition } from '@/lib/domain/database-edition';
import type { DBSchema } from '@/lib/domain/db-schema';
import {
    databasesWithSchemas,
    schemaNameToSchemaId,
} from '@/lib/domain/db-schema';
import { defaultSchemas } from '@/lib/data/default-schemas';
import { useEventEmitter } from 'ahooks';
import type { DBDependency } from '@/lib/domain/db-dependency';
import type { Area } from '@/lib/domain/area';
import type { Note } from '@/lib/domain/note';
import { storageInitialValue } from '../storage-context/storage-context';
import { useDiff } from '../diff-context/use-diff';
import type { DiffCalculatedEvent } from '../diff-context/diff-context';
import {
    DBCustomTypeKind,
    type DBCustomType,
} from '@/lib/domain/db-custom-type';
import { getDefaultPrimaryKeyType } from '@/lib/data/data-types/data-types';

export interface ChartDBProviderProps {
    diagram?: Diagram;
    readonly?: boolean;
}

export const ChartDBProvider: React.FC<
    React.PropsWithChildren<ChartDBProviderProps>
> = ({ children, diagram, readonly: readonlyProp }) => {
    const { hasDiff } = useDiff();
    const storageDB = useStorage();
    const events = useEventEmitter<ChartDBEvent>();
    const { addUndoAction, resetRedoStack, resetUndoStack } =
        useRedoUndoStack();

    const [diagramId, setDiagramId] = useState('');
    const [diagramName, setDiagramName] = useState('');
    const [diagramCreatedAt, setDiagramCreatedAt] = useState<Date>(new Date());
    const [diagramUpdatedAt, setDiagramUpdatedAt] = useState<Date>(new Date());
    const [databaseType, setDatabaseType] = useState<DatabaseType>(
        DatabaseType.GENERIC
    );
    const [databaseEdition, setDatabaseEdition] = useState<
        DatabaseEdition | undefined
    >();
    const [tables, setTables] = useState<DBTable[]>(diagram?.tables ?? []);
    const [relationships, setRelationships] = useState<DBRelationship[]>(
        diagram?.relationships ?? []
    );
    const [dependencies, setDependencies] = useState<DBDependency[]>(
        diagram?.dependencies ?? []
    );
    const [areas, setAreas] = useState<Area[]>(diagram?.areas ?? []);
    const [customTypes, setCustomTypes] = useState<DBCustomType[]>(
        diagram?.customTypes ?? []
    );
    const [notes, setNotes] = useState<Note[]>(diagram?.notes ?? []);

    // Phase 2 (docs/design/realtime-collaboration.md §10): every top-level
    // collection is migrated to a Y.Doc-backed representation — see the
    // Dexie-sink/undo/object-identity decision recorded there before
    // `notes`/`customTypes` landed, and the entangled-cluster decision
    // before {tables, relationships, dependencies, areas} did (they can't
    // migrate independently: DBTable.parentAreaId cross-references areas,
    // and cascade-delete needs tables/relationships/dependencies writes in
    // one transaction — see removeTables/updateTablesState below).
    // `collabDocRef` is ONE shared `Y.Doc` per diagram (matches §5.2 — a
    // single doc with one top-level `Y.Map` per collection, not a doc per
    // collection, so Phase 4's WebSocket sync has one doc per diagram to
    // sync), and is the source of truth for every collection; the React
    // state above is a projection of it, kept in sync by
    // `useYCollectionSync` below. `db.addNote`/`addCustomType`/`putTable`/
    // etc (still called from every mutation) are a write-through sink
    // only — never read back except at initial diagram load.
    const collabDocRef = useRef<Y.Doc | null>(null);
    // Phase 4: the live WebSocket connection for collabDocRef.current's
    // room, when one is attached (see attachCollabProvider below). Only
    // ever created by loadDiagramFromData — not here at construction —
    // because this component is also used for a readonly, static preview
    // (template-page.tsx passes a `diagram` prop directly, `readonly`),
    // which has no business opening a live collaboration room for
    // whatever id a template happens to carry.
    const providerRef = useRef<HocuspocusProvider | null>(null);
    if (!collabDocRef.current) {
        const doc = new Y.Doc();
        (diagram?.tables ?? []).forEach((table) =>
            upsertTable(doc.getMap<unknown>('tables'), table)
        );
        (diagram?.relationships ?? []).forEach((relationship) =>
            upsertItem(doc.getMap<unknown>('relationships'), relationship)
        );
        (diagram?.dependencies ?? []).forEach((dependency) =>
            upsertItem(doc.getMap<unknown>('dependencies'), dependency)
        );
        (diagram?.areas ?? []).forEach((area) =>
            upsertItem(doc.getMap<unknown>('areas'), area)
        );
        (diagram?.customTypes ?? []).forEach((customType) =>
            upsertItem(doc.getMap<unknown>('customTypes'), customType)
        );
        (diagram?.notes ?? []).forEach((note) =>
            upsertItem(doc.getMap<unknown>('notes'), note)
        );
        collabDocRef.current = doc;
    }

    const decodeNote = (r: Record<string, unknown>) => r as unknown as Note;
    const decodeCustomType = (r: Record<string, unknown>) =>
        r as unknown as DBCustomType;
    const decodeRelationship = (r: Record<string, unknown>) =>
        r as unknown as DBRelationship;
    const decodeDependency = (r: Record<string, unknown>) =>
        r as unknown as DBDependency;
    const decodeArea = (r: Record<string, unknown>) => r as unknown as Area;

    useYCollectionSync(
        collabDocRef.current,
        'notes',
        (m) => readCollection<Note>(m, decodeNote),
        (m, id) => readItem<Note>(m, id, decodeNote),
        setNotes
    );
    useYCollectionSync(
        collabDocRef.current,
        'customTypes',
        (m) => readCollection<DBCustomType>(m, decodeCustomType),
        (m, id) => readItem<DBCustomType>(m, id, decodeCustomType),
        setCustomTypes
    );
    useYCollectionSync(
        collabDocRef.current,
        'relationships',
        (m) => readCollection<DBRelationship>(m, decodeRelationship),
        (m, id) => readItem<DBRelationship>(m, id, decodeRelationship),
        setRelationships
    );
    useYCollectionSync(
        collabDocRef.current,
        'dependencies',
        (m) => readCollection<DBDependency>(m, decodeDependency),
        (m, id) => readItem<DBDependency>(m, id, decodeDependency),
        setDependencies
    );
    useYCollectionSync(
        collabDocRef.current,
        'areas',
        (m) => readCollection<Area>(m, decodeArea),
        (m, id) => readItem<Area>(m, id, decodeArea),
        setAreas
    );
    useYCollectionSync(
        collabDocRef.current,
        'tables',
        readTables,
        readTableItem,
        setTables
    );

    // appendix-b:9 — default name/order counters. Deriving these from
    // array.length at call time races: two create*() calls fired in the
    // same tick both read the same stale closure and produce the same
    // default name (e.g. two `table_1`s). These refs are monotonic
    // in-process counters instead — seeded lazily from the current count
    // the first time they're used, then only ever incremented, never
    // re-derived from the array. Reset on diagram (re)load in
    // `loadDiagramFromData` so switching diagrams doesn't carry over a
    // stale count from the previous one.
    const nextTableCounterRef = useRef<{
        table: number;
        view: number;
        order: number;
    } | null>(null);
    const nextAreaCounterRef = useRef<number | null>(null);
    const nextCustomTypeCounterRef = useRef<number | null>(null);
    const nextFieldCounterRef = useRef<Map<string, number>>(new Map());
    const nextIndexCounterRef = useRef<Map<string, number>>(new Map());

    const { events: diffEvents } = useDiff();

    const [highlightedCustomTypeId, setHighlightedCustomTypeId] =
        useState<string>();

    // appendix-b:12 fix — mirrors readonly/hasDiff every render (rather
    // than depending on `useCallback`'s dep array + ahooks'
    // `useSubscription` re-registering on identity change, which this
    // handler otherwise doesn't rely on) so the gate below always reads
    // the current value, not whatever it was on first mount.
    const readonlyRef = useRef(false);
    readonlyRef.current = readonlyProp ?? hasDiff ?? false;

    const diffCalculatedHandler = useCallback((event: DiffCalculatedEvent) => {
        // appendix-b:12 fix — never mutate live tables/relationships/areas
        // state from a readonly diff-preview session. Verified against the
        // real Y.Doc adapter now that tables/relationships/areas are
        // migrated to it (per the note in the design doc): this gate is
        // unconditional and runs before anything below ever touches the
        // doc, so a readonly session can't write through it.
        if (readonlyRef.current) return;

        const { tablesToAdd, fieldsToAdd, relationshipsToAdd, areasToAdd } =
            event.data;

        // Phase 2: write into the shared collab doc. This callback keeps
        // a stable `[]` identity (so ahooks' useSubscription below never
        // re-registers it), so it reads live state via `readTables`
        // directly off the doc at call time instead of closing over the
        // `tables` React-state variable, which the old setTables(tables
        // => ...) functional-updater form used to get for free.
        const doc = collabDocRef.current!;
        doc.transact(() => {
            const tablesMap = doc.getMap<unknown>('tables');
            const currentTables = readTables(tablesMap);
            [...currentTables, ...(tablesToAdd ?? [])].forEach((table) => {
                const fields = fieldsToAdd.get(table.id);
                const updatedTable = fields
                    ? { ...table, fields: [...table.fields, ...fields] }
                    : table;
                upsertTable(tablesMap, updatedTable);
            });

            const relationshipsMap = doc.getMap<unknown>('relationships');
            (relationshipsToAdd ?? []).forEach((relationship) =>
                upsertItem(relationshipsMap, relationship)
            );

            const areasMap = doc.getMap<unknown>('areas');
            (areasToAdd ?? []).forEach((area) => upsertItem(areasMap, area));
        });
    }, []);

    diffEvents.useSubscription(diffCalculatedHandler);

    const defaultSchemaName = useMemo(
        () => defaultSchemas[databaseType],
        [databaseType]
    );

    const readonly = useMemo(
        () => readonlyProp ?? hasDiff ?? false,
        [readonlyProp, hasDiff]
    );

    const schemas = useMemo(
        () =>
            databasesWithSchemas.includes(databaseType)
                ? [
                      ...new Set(
                          tables
                              .map((table) => table.schema)
                              .filter((schema) => !!schema) as string[]
                      ),
                  ]
                      .sort((a, b) => {
                          if (a === defaultSchemaName) return -1;
                          if (b === defaultSchemaName) return 1;
                          return a.localeCompare(b);
                      })
                      .map(
                          (schema): DBSchema => ({
                              id: schemaNameToSchemaId(schema),
                              name: schema,
                              tableCount: tables.filter(
                                  (table) => table.schema === schema
                              ).length,
                          })
                      )
                : [],
        [tables, defaultSchemaName, databaseType]
    );

    const db = useMemo(
        () => (readonly ? storageInitialValue : storageDB),
        [storageDB, readonly]
    );

    const currentDiagram: Diagram = useMemo(
        () => ({
            id: diagramId,
            name: diagramName,
            createdAt: diagramCreatedAt,
            updatedAt: diagramUpdatedAt,
            databaseType,
            databaseEdition,
            tables,
            relationships,
            dependencies,
            areas,
            customTypes,
            notes,
        }),
        [
            diagramId,
            diagramName,
            databaseType,
            databaseEdition,
            tables,
            relationships,
            dependencies,
            areas,
            customTypes,
            notes,
            diagramCreatedAt,
            diagramUpdatedAt,
        ]
    );

    // Phase 2: clears every collab-doc-backed collection in place (same
    // Y.Doc instance — this isn't a diagram switch, so there's no new doc
    // to subscribe to, unlike loadDiagramFromData below). reconcileTables/
    // reconcileCollection against an empty desired list removes every
    // entry; the observer picks up each collection's structural change
    // and projects the corresponding setXState([]) for us — this fix also
    // closes a latent bug: clearDiagramData/deleteDiagram previously
    // called setNotes([])/setCustomTypes([]) directly, which the doc-
    // backed notes/customTypes migration should have updated but didn't —
    // the next structural change to either would have silently
    // resurrected the "cleared" data straight out of the still-populated
    // doc.
    const clearCollabDoc = useCallback(() => {
        const doc = collabDocRef.current!;
        doc.transact(() => {
            reconcileTables(doc.getMap<unknown>('tables'), []);
            reconcileCollection(doc.getMap<unknown>('relationships'), []);
            reconcileCollection(doc.getMap<unknown>('dependencies'), []);
            reconcileCollection(doc.getMap<unknown>('areas'), []);
            reconcileCollection(doc.getMap<unknown>('customTypes'), []);
            reconcileCollection(doc.getMap<unknown>('notes'), []);
        });
    }, []);

    const clearDiagramData: ChartDBContext['clearDiagramData'] =
        useCallback(async () => {
            const updatedAt = new Date();
            clearCollabDoc();
            setDiagramUpdatedAt(updatedAt);

            resetRedoStack();
            resetUndoStack();

            await Promise.all([
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
                db.deleteDiagramTables(diagramId),
                db.deleteDiagramRelationships(diagramId),
                db.deleteDiagramDependencies(diagramId),
                db.deleteDiagramAreas(diagramId),
                db.deleteDiagramCustomTypes(diagramId),
                db.deleteDiagramNotes(diagramId),
            ]);
        }, [db, diagramId, resetRedoStack, resetUndoStack, clearCollabDoc]);

    const deleteDiagram: ChartDBContext['deleteDiagram'] =
        useCallback(async () => {
            setDiagramId('');
            setDiagramName('');
            setDatabaseType(DatabaseType.GENERIC);
            setDatabaseEdition(undefined);
            clearCollabDoc();
            resetRedoStack();
            resetUndoStack();

            await Promise.all([
                db.deleteDiagramTables(diagramId),
                db.deleteDiagramRelationships(diagramId),
                db.deleteDiagram(diagramId),
                db.deleteDiagramDependencies(diagramId),
                db.deleteDiagramAreas(diagramId),
                db.deleteDiagramCustomTypes(diagramId),
                db.deleteDiagramNotes(diagramId),
            ]);
        }, [db, diagramId, resetRedoStack, resetUndoStack, clearCollabDoc]);

    const updateDiagramUpdatedAt: ChartDBContext['updateDiagramUpdatedAt'] =
        useCallback(async () => {
            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);
            await db.updateDiagram({
                id: diagramId,
                attributes: { updatedAt },
            });
        }, [db, diagramId, setDiagramUpdatedAt]);

    const updateDatabaseType: ChartDBContext['updateDatabaseType'] =
        useCallback(
            async (databaseType) => {
                setDatabaseType(databaseType);
                await db.updateDiagram({
                    id: diagramId,
                    attributes: {
                        databaseType,
                    },
                });
            },
            [db, diagramId, setDatabaseType]
        );

    const updateDatabaseEdition: ChartDBContext['updateDatabaseEdition'] =
        useCallback(
            async (databaseEdition) => {
                setDatabaseEdition(databaseEdition);
                await db.updateDiagram({
                    id: diagramId,
                    attributes: {
                        databaseEdition,
                    },
                });
            },
            [db, diagramId, setDatabaseEdition]
        );

    const updateDiagramId: ChartDBContext['updateDiagramId'] = useCallback(
        async (id) => {
            const prevId = diagramId;
            setDiagramId(id);
            await db.updateDiagram({ id: prevId, attributes: { id } });
        },
        [db, diagramId, setDiagramId]
    );

    const updateDiagramName: ChartDBContext['updateDiagramName'] = useCallback(
        async (name, options = { updateHistory: true }) => {
            const prevName = diagramName;
            setDiagramName(name);
            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);
            await db.updateDiagram({
                id: diagramId,
                attributes: { name, updatedAt },
            });

            if (options.updateHistory) {
                addUndoAction({
                    action: 'updateDiagramName',
                    redoData: { name },
                    undoData: { name: prevName },
                });
                resetRedoStack();
            }
        },
        [
            db,
            diagramId,
            setDiagramName,
            addUndoAction,
            diagramName,
            resetRedoStack,
        ]
    );

    const addTables: ChartDBContext['addTables'] = useCallback(
        async (tablesToAdd: DBTable[], options = { updateHistory: true }) => {
            // Phase 2: write into the shared collab Y.Doc, not React state
            // directly — useYCollectionSync's observer projects this into
            // `tables` state.
            const tablesMap = collabDocRef.current!.getMap<unknown>('tables');
            collabDocRef.current!.transact(() => {
                tablesToAdd.forEach((table) => upsertTable(tablesMap, table));
            });

            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);
            await Promise.all([
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
                ...tablesToAdd.map((table) =>
                    db.addTable({ diagramId, table })
                ),
            ]);

            events.emit({
                action: 'add_tables',
                data: { tables: tablesToAdd },
            });

            if (options.updateHistory) {
                addUndoAction({
                    action: 'addTables',
                    redoData: { tables: tablesToAdd },
                    undoData: { tableIds: tablesToAdd.map((t) => t.id) },
                });
                resetRedoStack();
            }
        },
        [db, diagramId, addUndoAction, resetRedoStack, events]
    );

    const addTable: ChartDBContext['addTable'] = useCallback(
        async (table: DBTable, options = { updateHistory: true }) => {
            return addTables([table], options);
        },
        [addTables]
    );

    const createTable: ChartDBContext['createTable'] = useCallback(
        async (attributes) => {
            const isView = attributes?.isView ?? false;
            if (nextTableCounterRef.current === null) {
                nextTableCounterRef.current = {
                    table: tables.filter((t) => !t.isView).length,
                    view: tables.filter((t) => t.isView).length,
                    order: tables.length,
                };
            }
            const counters = nextTableCounterRef.current;
            const count = isView ? ++counters.view : ++counters.table;
            const order = counters.order++;
            const table: DBTable = {
                id: generateId(),
                name: isView ? `view_${count}` : `table_${count}`,
                x: 0,
                y: 0,
                fields: [
                    {
                        id: generateId(),
                        name: 'id',
                        type: getDefaultPrimaryKeyType(databaseType),
                        unique: true,
                        nullable: false,
                        primaryKey: true,
                        createdAt: Date.now(),
                    },
                ],
                indexes: [],
                color: attributes?.isView ? viewColor : defaultTableColor,
                createdAt: Date.now(),
                isView: false,
                order,
                ...attributes,
                schema: attributes?.schema ?? defaultSchemas[databaseType],
            };

            table.indexes = getTableIndexesWithPrimaryKey({
                table,
            });

            await addTable(table);

            return table;
        },
        [addTable, tables, databaseType]
    );

    const getTable: ChartDBContext['getTable'] = useCallback(
        (id: string) => tables.find((table) => table.id === id) ?? null,
        [tables]
    );

    // Phase 2 concurrency fix: every method below that does
    // read-current-table -> transform -> upsertTable must read the table
    // it's about to transform from the *live doc*, not from `getTable`
    // (React state). `tables` state only updates after the useYCollectionSync
    // observer fires, which is async relative to two synchronous calls in
    // the same tick (e.g. two field edits on the same table fired via
    // Promise.all without awaiting each individually) — both would read the
    // same stale `getTable` snapshot, and the second write would silently
    // clobber the first (reconcileCollection overwrites every field's full
    // value from whatever "desired" table it was handed). Reading straight
    // off the doc here means the second call sees the first call's already-
    // committed write, since Yjs transactions apply synchronously.
    const getLiveTable = useCallback(
        (id: string) =>
            readTableItem(collabDocRef.current!.getMap<unknown>('tables'), id),
        []
    );

    const removeTables: ChartDBContext['removeTables'] = useCallback(
        async (ids, options) => {
            const tables = ids.map((id) => getTable(id)).filter((t) => !!t);
            const relationshipsToRemove = relationships.filter(
                (relationship) =>
                    ids.includes(relationship.sourceTableId) ||
                    ids.includes(relationship.targetTableId)
            );

            const dependenciesToRemove = dependencies.filter(
                (dependency) =>
                    ids.includes(dependency.tableId) ||
                    ids.includes(dependency.dependentTableId)
            );

            // appendix-b:3 fix — filter against `ids` (this call's own
            // stable input) directly inside the doc transaction, instead
            // of against relationshipsToRemove/dependenciesToRemove
            // (computed once, above, from a closure snapshot of
            // `relationships`/`dependencies` at call time). A relationship
            // pointing at one of `ids` added by a concurrent write between
            // that snapshot and this transaction running would have
            // survived the old precomputed-list filter; it can't survive
            // this one, since removeItemsReferencing reads the doc's live
            // relationships/dependencies maps directly, not a snapshot.
            // (The db.delete* calls and undo/redo data below still use the
            // closure snapshot — full referential-integrity enforcement
            // for those is server/merge-time work, out of scope for a
            // client-only fix.)
            const doc = collabDocRef.current!;
            doc.transact(() => {
                ids.forEach((id) =>
                    removeItemFromCollection(doc.getMap<unknown>('tables'), id)
                );
                removeItemsReferencing(
                    doc.getMap<unknown>('relationships'),
                    ['sourceTableId', 'targetTableId'],
                    ids
                );
                removeItemsReferencing(
                    doc.getMap<unknown>('dependencies'),
                    ['tableId', 'dependentTableId'],
                    ids
                );
            });

            events.emit({ action: 'remove_tables', data: { tableIds: ids } });

            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);
            await Promise.all([
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
                ...relationshipsToRemove.map((relationship) =>
                    db.deleteRelationship({ diagramId, id: relationship.id })
                ),
                ...dependenciesToRemove.map((dependency) =>
                    db.deleteDependency({ diagramId, id: dependency.id })
                ),
                ...ids.map((id) => db.deleteTable({ diagramId, id })),
            ]);

            if (tables.length > 0 && options?.updateHistory) {
                addUndoAction({
                    action: 'removeTables',
                    redoData: {
                        tableIds: ids,
                    },
                    undoData: {
                        tables,
                        relationships: relationshipsToRemove,
                        dependencies: dependenciesToRemove,
                    },
                });
                resetRedoStack();
            }
        },
        [
            db,
            diagramId,
            addUndoAction,
            resetRedoStack,
            getTable,
            relationships,
            events,
            dependencies,
        ]
    );

    const removeTable: ChartDBContext['removeTable'] = useCallback(
        async (id: string, options = { updateHistory: true }) => {
            return removeTables([id], options);
        },
        [removeTables]
    );

    const updateTable: ChartDBContext['updateTable'] = useCallback(
        async (
            id: string,
            table: Partial<DBTable>,
            options = { updateHistory: true }
        ) => {
            const prevTable = getTable(id);

            // Phase 2: merge the patch onto the full current table and
            // reconcile through upsertTable — `table` here is typed
            // Partial<DBTable>, but the undo-replay path (history-
            // provider.tsx) actually passes a FULL previous DBTable
            // (including fields/indexes) as this "patch", so this can't
            // assume it's scalars-only the way patchItem would.
            //
            // The base merged onto is read from the live doc (getLiveTable),
            // not `prevTable` (React state) — two concurrent updateTable
            // calls in the same tick must each build on the other's
            // already-committed write, not both on the same stale snapshot.
            // `prevTable` itself is still fine to keep from React state:
            // it's only used for the undo payload / existence gate below.
            const liveTable = getLiveTable(id);
            if (liveTable) {
                const tablesMap =
                    collabDocRef.current!.getMap<unknown>('tables');
                collabDocRef.current!.transact(() => {
                    upsertTable(tablesMap, {
                        ...liveTable,
                        ...table,
                    } as DBTable);
                });
            }

            events.emit({
                action: 'update_table',
                data: { id, table },
            });

            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);
            await Promise.all([
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
                db.updateTable({ id, attributes: table }),
            ]);

            if (!!prevTable && options.updateHistory) {
                addUndoAction({
                    action: 'updateTable',
                    redoData: { tableId: id, table },
                    undoData: { tableId: id, table: prevTable },
                });
                resetRedoStack();
            }
        },
        [
            db,
            addUndoAction,
            resetRedoStack,
            getTable,
            getLiveTable,
            diagramId,
            events,
        ]
    );

    const updateTablesState: ChartDBContext['updateTablesState'] = useCallback(
        async (
            updateFn: (tables: DBTable[]) => PartialExcept<DBTable, 'id'>[],
            options = { updateHistory: true, forceOverride: false }
        ) => {
            const updateTables = (prevTables: DBTable[]) => {
                const updatedTables = updateFn(prevTables);
                if (options.forceOverride) {
                    return updatedTables as DBTable[];
                }

                return prevTables
                    .map((prevTable) => {
                        const updatedTable = updatedTables.find(
                            (t) => t.id === prevTable.id
                        );
                        return updatedTable
                            ? { ...prevTable, ...updatedTable }
                            : prevTable;
                    })
                    .filter((prevTable) =>
                        updatedTables.some((t) => t.id === prevTable.id)
                    );
            };

            // Phase 2 concurrency fix: build from the live doc, not the
            // `tables` React-state closure — two updateTablesState calls
            // (or one of these racing a field/index edit on the same
            // table) in the same tick must each see the other's already-
            // committed write, the same reasoning as getLiveTable above.
            const liveTables = readTables(
                collabDocRef.current!.getMap<unknown>('tables')
            );
            const prevTables = deepCopy(liveTables);
            const updatedTables = updateTables(liveTables);

            const tablesToDelete = prevTables.filter(
                (table) => !updatedTables.some((t) => t.id === table.id)
            );

            const relationshipsToRemove = relationships.filter((relationship) =>
                tablesToDelete.some(
                    (table) =>
                        table.id === relationship.sourceTableId ||
                        table.id === relationship.targetTableId
                )
            );

            const dependenciesToRemove = dependencies.filter((dependency) =>
                tablesToDelete.some(
                    (table) =>
                        table.id === dependency.tableId ||
                        table.id === dependency.dependentTableId
                )
            );

            // appendix-b:3 fix — enforce this as a referential-integrity
            // check (does the endpoint table still exist in the tables this
            // action produces?) instead of "is this relationship in a
            // precomputed removal list computed from a closure snapshot of
            // `relationships`/`dependencies` at call time" — a relationship
            // added by a concurrent write between that snapshot and this
            // transaction running, pointing at a table this action deletes,
            // would have survived the old precomputed-list filter.
            // removeItemsReferencing reads the doc's live relationships/
            // dependencies maps directly inside this transaction, not a
            // snapshot — same guarantee, now against the doc.
            const doc = collabDocRef.current!;
            const deletedTableIds = tablesToDelete.map((t) => t.id);
            doc.transact(() => {
                reconcileTables(doc.getMap<unknown>('tables'), updatedTables);
                removeItemsReferencing(
                    doc.getMap<unknown>('relationships'),
                    ['sourceTableId', 'targetTableId'],
                    deletedTableIds
                );
                removeItemsReferencing(
                    doc.getMap<unknown>('dependencies'),
                    ['tableId', 'dependentTableId'],
                    deletedTableIds
                );
            });

            events.emit({
                action: 'remove_tables',
                data: { tableIds: tablesToDelete.map((t) => t.id) },
            });

            const promises = [];
            for (const updatedTable of updatedTables) {
                promises.push(
                    db.putTable({
                        diagramId,
                        table: updatedTable,
                    })
                );
            }

            for (const table of tablesToDelete) {
                promises.push(db.deleteTable({ diagramId, id: table.id }));
            }

            for (const relationship of relationshipsToRemove) {
                promises.push(
                    db.deleteRelationship({ diagramId, id: relationship.id })
                );
            }

            for (const dependency of dependenciesToRemove) {
                promises.push(
                    db.deleteDependency({ diagramId, id: dependency.id })
                );
            }

            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);
            promises.push(
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } })
            );

            await Promise.all(promises);

            if (options.updateHistory) {
                addUndoAction({
                    action: 'updateTablesState',
                    redoData: {
                        tables: updatedTables,
                        deletedTableIds: tablesToDelete.map((t) => t.id),
                    },
                    undoData: {
                        tables: prevTables,
                        relationships: relationshipsToRemove,
                        dependencies: dependenciesToRemove,
                    },
                });
                resetRedoStack();
            }
        },
        [
            db,
            diagramId,
            addUndoAction,
            resetRedoStack,
            relationships,
            events,
            dependencies,
        ]
    );

    const getField: ChartDBContext['getField'] = useCallback(
        (tableId: string, fieldId: string) => {
            const table = getTable(tableId);
            return table?.fields.find((f) => f.id === fieldId) ?? null;
        },
        [getTable]
    );

    const updateField: ChartDBContext['updateField'] = useCallback(
        async (
            tableId: string,
            fieldId: string,
            field: Partial<DBField>,
            options = { updateHistory: true }
        ) => {
            const prevField = getField(tableId, fieldId);

            const updateTableFn = (table: DBTable) => {
                const updatedTable: DBTable = {
                    ...table,
                    fields: table.fields.map((f) =>
                        f.id === fieldId ? { ...f, ...field } : f
                    ),
                } satisfies DBTable;

                updatedTable.indexes = getTableIndexesWithPrimaryKey({
                    table: updatedTable,
                });

                return updatedTable;
            };

            // Phase 2: reconcile the whole updated table through
            // upsertTable, not a whole-array setTables — this is the
            // actual appendix-b:2 fix. upsertTable's nested reconcile only
            // touches the one changed field's Y.Map (plus indexes, since
            // getTableIndexesWithPrimaryKey may add/remove/adjust the PK
            // index) — every other field on this table, and every other
            // table, is untouched.
            const currentTable = getLiveTable(tableId);
            if (currentTable) {
                const tablesMap =
                    collabDocRef.current!.getMap<unknown>('tables');
                collabDocRef.current!.transact(() => {
                    upsertTable(tablesMap, updateTableFn(currentTable));
                });
            }

            const table = await db.getTable({ diagramId, id: tableId });
            if (!table) {
                return;
            }

            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);
            await Promise.all([
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
                db.updateTable({
                    id: tableId,
                    attributes: {
                        ...updateTableFn(table),
                    },
                }),
            ]);

            if (!!prevField && options.updateHistory) {
                addUndoAction({
                    action: 'updateField',
                    redoData: {
                        tableId,
                        fieldId,
                        field: { ...prevField, ...field },
                    },
                    undoData: { tableId, fieldId, field: prevField },
                });
                resetRedoStack();
            }
        },
        [db, diagramId, addUndoAction, resetRedoStack, getField, getLiveTable]
    );

    const removeField: ChartDBContext['removeField'] = useCallback(
        async (
            tableId: string,
            fieldId: string,
            options = { updateHistory: true }
        ) => {
            const updateTableFn = (table: DBTable) => {
                const updatedTable: DBTable = {
                    ...table,
                    fields: table.fields.filter((f) => f.id !== fieldId),
                } satisfies DBTable;

                updatedTable.indexes = getTableIndexesWithPrimaryKey({
                    table: updatedTable,
                });

                return updatedTable;
            };

            const fields = getTable(tableId)?.fields ?? [];
            const prevField = getField(tableId, fieldId);

            const currentTable = getLiveTable(tableId);
            if (currentTable) {
                const tablesMap =
                    collabDocRef.current!.getMap<unknown>('tables');
                collabDocRef.current!.transact(() => {
                    upsertTable(tablesMap, updateTableFn(currentTable));
                });
            }

            events.emit({
                action: 'remove_field',
                data: {
                    tableId: tableId,
                    fieldId,
                    fields: fields.filter((f) => f.id !== fieldId),
                },
            });

            const table = await db.getTable({ diagramId, id: tableId });
            if (!table) {
                return;
            }

            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);
            await Promise.all([
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
                db.updateTable({
                    id: tableId,
                    attributes: {
                        ...updateTableFn(table),
                    },
                }),
            ]);

            if (!!prevField && options.updateHistory) {
                addUndoAction({
                    action: 'removeField',
                    redoData: { tableId, fieldId },
                    undoData: { tableId, field: prevField },
                });
                resetRedoStack();
            }
        },
        [
            db,
            diagramId,
            addUndoAction,
            resetRedoStack,
            getField,
            getTable,
            getLiveTable,
            events,
        ]
    );

    const addField: ChartDBContext['addField'] = useCallback(
        async (
            tableId: string,
            field: DBField,
            options = { updateHistory: true }
        ) => {
            const fields = getTable(tableId)?.fields ?? [];

            const currentTable = getLiveTable(tableId);
            if (currentTable) {
                const updatedTable: DBTable = {
                    ...currentTable,
                    fields: [...currentTable.fields, field],
                };
                const tablesMap =
                    collabDocRef.current!.getMap<unknown>('tables');
                collabDocRef.current!.transact(() => {
                    upsertTable(tablesMap, updatedTable);
                });
                db.updateTable({ id: tableId, attributes: updatedTable });
            }

            events.emit({
                action: 'add_field',
                data: {
                    tableId: tableId,
                    field,
                    fields: [...fields, field],
                },
            });

            const table = await db.getTable({ diagramId, id: tableId });

            if (!table) {
                return;
            }

            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);
            await Promise.all([
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
            ]);

            if (options.updateHistory) {
                addUndoAction({
                    action: 'addField',
                    redoData: { tableId, field },
                    undoData: { tableId, fieldId: field.id },
                });
                resetRedoStack();
            }
        },
        [
            db,
            diagramId,
            addUndoAction,
            resetRedoStack,
            events,
            getTable,
            getLiveTable,
        ]
    );

    const createField: ChartDBContext['createField'] = useCallback(
        async (tableId: string) => {
            const table = getTable(tableId);
            const seedCount =
                nextFieldCounterRef.current.get(tableId) ??
                table?.fields?.length ??
                0;
            const count = seedCount + 1;
            nextFieldCounterRef.current.set(tableId, count);
            const field: DBField = {
                id: generateId(),
                name: `field_${count}`,
                type: getDefaultPrimaryKeyType(databaseType),
                unique: false,
                nullable: true,
                primaryKey: false,
                createdAt: Date.now(),
            };

            await addField(tableId, field);

            return field;
        },
        [addField, getTable, databaseType]
    );

    const getIndex: ChartDBContext['getIndex'] = useCallback(
        (tableId: string, indexId: string) => {
            const table = getTable(tableId);
            return table?.indexes.find((i) => i.id === indexId) ?? null;
        },
        [getTable]
    );

    const addIndex: ChartDBContext['addIndex'] = useCallback(
        async (
            tableId: string,
            index: DBIndex,
            options = { updateHistory: true }
        ) => {
            const currentTable = getLiveTable(tableId);
            if (currentTable) {
                const updatedTable: DBTable = {
                    ...currentTable,
                    indexes: [...currentTable.indexes, index],
                };
                const tablesMap =
                    collabDocRef.current!.getMap<unknown>('tables');
                collabDocRef.current!.transact(() => {
                    upsertTable(tablesMap, updatedTable);
                });
            }

            const dbTable = await db.getTable({ diagramId, id: tableId });
            if (!dbTable) {
                return;
            }

            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);
            await Promise.all([
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
                db.updateTable({
                    id: tableId,
                    attributes: {
                        ...dbTable,
                        indexes: [...dbTable.indexes, index],
                    },
                }),
            ]);

            if (options.updateHistory) {
                addUndoAction({
                    action: 'addIndex',
                    redoData: { tableId, index },
                    undoData: { tableId, indexId: index.id },
                });
                resetRedoStack();
            }
        },
        [db, diagramId, addUndoAction, resetRedoStack, getLiveTable]
    );

    const removeIndex: ChartDBContext['removeIndex'] = useCallback(
        async (
            tableId: string,
            indexId: string,
            options = { updateHistory: true }
        ) => {
            const prevIndex = getIndex(tableId, indexId);
            const currentTable = getLiveTable(tableId);
            if (currentTable) {
                const updatedTable: DBTable = {
                    ...currentTable,
                    indexes: currentTable.indexes.filter(
                        (i) => i.id !== indexId
                    ),
                };
                const tablesMap =
                    collabDocRef.current!.getMap<unknown>('tables');
                collabDocRef.current!.transact(() => {
                    upsertTable(tablesMap, updatedTable);
                });
            }

            const dbTable = await db.getTable({
                diagramId,
                id: tableId,
            });

            if (!dbTable) {
                return;
            }

            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);
            await Promise.all([
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
                db.updateTable({
                    id: tableId,
                    attributes: {
                        ...dbTable,
                        indexes: dbTable.indexes.filter(
                            (i) => i.id !== indexId
                        ),
                    },
                }),
            ]);

            if (!!prevIndex && options.updateHistory) {
                addUndoAction({
                    action: 'removeIndex',
                    redoData: { indexId, tableId },
                    undoData: { tableId, index: prevIndex },
                });
                resetRedoStack();
            }
        },
        [db, diagramId, addUndoAction, resetRedoStack, getIndex, getLiveTable]
    );

    const createIndex: ChartDBContext['createIndex'] = useCallback(
        async (tableId: string) => {
            const table = getTable(tableId);
            const seedCount =
                nextIndexCounterRef.current.get(tableId) ??
                table?.indexes?.length ??
                0;
            const count = seedCount + 1;
            nextIndexCounterRef.current.set(tableId, count);
            const index: DBIndex = {
                id: generateId(),
                name: `index_${count}`,
                fieldIds: [],
                unique: false,
                createdAt: Date.now(),
            };

            await addIndex(tableId, index);

            return index;
        },
        [addIndex, getTable]
    );

    const updateIndex: ChartDBContext['updateIndex'] = useCallback(
        async (
            tableId: string,
            indexId: string,
            index: Partial<DBIndex>,
            options = { updateHistory: true }
        ) => {
            const prevIndex = getIndex(tableId, indexId);
            const currentTable = getLiveTable(tableId);
            if (currentTable) {
                const updatedTable: DBTable = {
                    ...currentTable,
                    indexes: currentTable.indexes.map((i) =>
                        i.id === indexId ? { ...i, ...index } : i
                    ),
                };
                const tablesMap =
                    collabDocRef.current!.getMap<unknown>('tables');
                collabDocRef.current!.transact(() => {
                    upsertTable(tablesMap, updatedTable);
                });
            }

            const dbTable = await db.getTable({ diagramId, id: tableId });

            if (!dbTable) {
                return;
            }

            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);
            await Promise.all([
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
                db.updateTable({
                    id: tableId,
                    attributes: {
                        ...dbTable,
                        indexes: dbTable.indexes.map((i) =>
                            i.id === indexId ? { ...i, ...index } : i
                        ),
                    },
                }),
            ]);

            if (!!prevIndex && options.updateHistory) {
                addUndoAction({
                    action: 'updateIndex',
                    redoData: { tableId, indexId, index },
                    undoData: { tableId, indexId, index: prevIndex },
                });
                resetRedoStack();
            }
        },
        [db, diagramId, addUndoAction, resetRedoStack, getIndex, getLiveTable]
    );

    const addCheckConstraint: ChartDBContext['addCheckConstraint'] =
        useCallback(
            async (
                tableId: string,
                constraint: DBCheckConstraint,
                options = { updateHistory: true }
            ) => {
                const currentTable = getLiveTable(tableId);
                if (currentTable) {
                    const updatedTable: DBTable = {
                        ...currentTable,
                        checkConstraints: [
                            ...(currentTable.checkConstraints ?? []),
                            constraint,
                        ],
                    };
                    const tablesMap =
                        collabDocRef.current!.getMap<unknown>('tables');
                    collabDocRef.current!.transact(() => {
                        upsertTable(tablesMap, updatedTable);
                    });
                }

                const dbTable = await db.getTable({ diagramId, id: tableId });
                if (!dbTable) {
                    return;
                }

                const updatedAt = new Date();
                setDiagramUpdatedAt(updatedAt);
                await Promise.all([
                    db.updateDiagram({
                        id: diagramId,
                        attributes: { updatedAt },
                    }),
                    db.updateTable({
                        id: tableId,
                        attributes: {
                            ...dbTable,
                            checkConstraints: [
                                ...(dbTable.checkConstraints ?? []),
                                constraint,
                            ],
                        },
                    }),
                ]);

                if (options.updateHistory) {
                    addUndoAction({
                        action: 'addCheckConstraint',
                        redoData: { tableId, constraint },
                        undoData: { tableId, constraintId: constraint.id },
                    });
                    resetRedoStack();
                }
            },
            [db, diagramId, addUndoAction, resetRedoStack, getLiveTable]
        );

    const createCheckConstraint: ChartDBContext['createCheckConstraint'] =
        useCallback(
            async (tableId: string) => {
                const constraint: DBCheckConstraint = {
                    id: generateId(),
                    expression: '',
                    createdAt: Date.now(),
                };

                await addCheckConstraint(tableId, constraint);

                return constraint;
            },
            [addCheckConstraint]
        );

    const removeCheckConstraint: ChartDBContext['removeCheckConstraint'] =
        useCallback(
            async (
                tableId: string,
                constraintId: string,
                options = { updateHistory: true }
            ) => {
                const prevConstraint = getTable(
                    tableId
                )?.checkConstraints?.find((c) => c.id === constraintId);
                const table = getLiveTable(tableId);

                if (table) {
                    const updatedTable: DBTable = {
                        ...table,
                        checkConstraints: (table.checkConstraints ?? []).filter(
                            (c) => c.id !== constraintId
                        ),
                    };
                    const tablesMap =
                        collabDocRef.current!.getMap<unknown>('tables');
                    collabDocRef.current!.transact(() => {
                        upsertTable(tablesMap, updatedTable);
                    });
                }

                const dbTable = await db.getTable({ diagramId, id: tableId });
                if (!dbTable) {
                    return;
                }

                const updatedAt = new Date();
                setDiagramUpdatedAt(updatedAt);
                await Promise.all([
                    db.updateDiagram({
                        id: diagramId,
                        attributes: { updatedAt },
                    }),
                    db.updateTable({
                        id: tableId,
                        attributes: {
                            ...dbTable,
                            checkConstraints: (
                                dbTable.checkConstraints ?? []
                            ).filter((c) => c.id !== constraintId),
                        },
                    }),
                ]);

                if (!!prevConstraint && options.updateHistory) {
                    addUndoAction({
                        action: 'removeCheckConstraint',
                        redoData: { tableId, constraintId },
                        undoData: { tableId, constraint: prevConstraint },
                    });
                    resetRedoStack();
                }
            },
            [
                db,
                diagramId,
                addUndoAction,
                resetRedoStack,
                getTable,
                getLiveTable,
            ]
        );

    const updateCheckConstraint: ChartDBContext['updateCheckConstraint'] =
        useCallback(
            async (
                tableId: string,
                constraintId: string,
                constraint: Partial<DBCheckConstraint>,
                options = { updateHistory: true }
            ) => {
                const prevConstraint = getTable(
                    tableId
                )?.checkConstraints?.find((c) => c.id === constraintId);
                const table = getLiveTable(tableId);

                if (table) {
                    const updatedTable: DBTable = {
                        ...table,
                        checkConstraints: (table.checkConstraints ?? []).map(
                            (c) =>
                                c.id === constraintId
                                    ? { ...c, ...constraint }
                                    : c
                        ),
                    };
                    const tablesMap =
                        collabDocRef.current!.getMap<unknown>('tables');
                    collabDocRef.current!.transact(() => {
                        upsertTable(tablesMap, updatedTable);
                    });
                }

                const dbTable = await db.getTable({ diagramId, id: tableId });
                if (!dbTable) {
                    return;
                }

                const updatedAt = new Date();
                setDiagramUpdatedAt(updatedAt);
                await Promise.all([
                    db.updateDiagram({
                        id: diagramId,
                        attributes: { updatedAt },
                    }),
                    db.updateTable({
                        id: tableId,
                        attributes: {
                            ...dbTable,
                            checkConstraints: (
                                dbTable.checkConstraints ?? []
                            ).map((c) =>
                                c.id === constraintId
                                    ? { ...c, ...constraint }
                                    : c
                            ),
                        },
                    }),
                ]);

                if (!!prevConstraint && options.updateHistory) {
                    addUndoAction({
                        action: 'updateCheckConstraint',
                        redoData: { tableId, constraintId, constraint },
                        undoData: {
                            tableId,
                            constraintId,
                            constraint: prevConstraint,
                        },
                    });
                    resetRedoStack();
                }
            },
            [
                db,
                diagramId,
                addUndoAction,
                resetRedoStack,
                getTable,
                getLiveTable,
            ]
        );

    const addRelationships: ChartDBContext['addRelationships'] = useCallback(
        async (
            relationships: DBRelationship[],
            options = { updateHistory: true }
        ) => {
            const relationshipsMap =
                collabDocRef.current!.getMap<unknown>('relationships');
            collabDocRef.current!.transact(() => {
                relationships.forEach((relationship) =>
                    upsertItem(relationshipsMap, relationship)
                );
            });

            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);

            await Promise.all([
                ...relationships.map((relationship) =>
                    db.addRelationship({ diagramId, relationship })
                ),
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
            ]);

            if (options.updateHistory) {
                addUndoAction({
                    action: 'addRelationships',
                    redoData: { relationships },
                    undoData: {
                        relationshipIds: relationships.map((r) => r.id),
                    },
                });
                resetRedoStack();
            }
        },
        [db, diagramId, addUndoAction, resetRedoStack]
    );

    const addRelationship: ChartDBContext['addRelationship'] = useCallback(
        async (
            relationship: DBRelationship,
            options = { updateHistory: true }
        ) => {
            return addRelationships([relationship], options);
        },
        [addRelationships]
    );

    const createRelationship: ChartDBContext['createRelationship'] =
        useCallback(
            async ({
                sourceTableId,
                targetTableId,
                sourceFieldId,
                targetFieldId,
            }) => {
                const sourceTable = getTable(sourceTableId);
                const sourceField = sourceTable?.fields.find(
                    (field: { id: string }) => field.id === sourceFieldId
                );
                const targetTable = getTable(targetTableId);
                const targetField = targetTable?.fields.find(
                    (field: { id: string }) => field.id === targetFieldId
                );

                // appendix-b:4 fix — re-validate existence at commit time,
                // not just wherever the UI last checked it (which can be
                // seconds earlier — see create-relationship-node.tsx's
                // handleCreate). A remote peer deleting the source/target
                // table or field in that window previously still produced
                // a relationship pointing at nothing.
                if (
                    !sourceTable ||
                    !sourceField ||
                    !targetTable ||
                    !targetField
                ) {
                    throw new Error(
                        'createRelationship: source or target table/field no longer exists'
                    );
                }

                const sourceTableName = sourceTable.name;
                const sourceFieldName = sourceField.name;
                const targetTableSchema = targetTable.schema;

                const relationship: DBRelationship = {
                    id: generateId(),
                    name: `${sourceTableName}_${sourceFieldName}_fk`,
                    sourceSchema: sourceTable.schema,
                    sourceTableId,
                    targetSchema: targetTableSchema,
                    targetTableId,
                    sourceFieldId,
                    targetFieldId,
                    sourceCardinality: 'one',
                    targetCardinality: 'one',
                    createdAt: Date.now(),
                };

                await addRelationship(relationship);

                return relationship;
            },
            [addRelationship, getTable]
        );

    const getRelationship: ChartDBContext['getRelationship'] = useCallback(
        (id: string) =>
            relationships.find((relationship) => relationship.id === id) ??
            null,
        [relationships]
    );

    const removeRelationships: ChartDBContext['removeRelationships'] =
        useCallback(
            async (ids: string[], options = { updateHistory: true }) => {
                const prevRelationships = [
                    ...relationships.filter((relationship) =>
                        ids.includes(relationship.id)
                    ),
                ];

                const relationshipsMap =
                    collabDocRef.current!.getMap<unknown>('relationships');
                collabDocRef.current!.transact(() => {
                    ids.forEach((id) =>
                        removeItemFromCollection(relationshipsMap, id)
                    );
                });

                const updatedAt = new Date();
                setDiagramUpdatedAt(updatedAt);
                await Promise.all([
                    ...ids.map((id) =>
                        db.deleteRelationship({ diagramId, id })
                    ),
                    db.updateDiagram({
                        id: diagramId,
                        attributes: { updatedAt },
                    }),
                ]);

                if (prevRelationships.length > 0 && options.updateHistory) {
                    addUndoAction({
                        action: 'removeRelationships',
                        redoData: { relationshipsIds: ids },
                        undoData: { relationships: prevRelationships },
                    });
                    resetRedoStack();
                }
            },
            [db, diagramId, relationships, addUndoAction, resetRedoStack]
        );

    const removeRelationship: ChartDBContext['removeRelationship'] =
        useCallback(
            async (id: string, options = { updateHistory: true }) => {
                return removeRelationships([id], options);
            },
            [removeRelationships]
        );

    const updateRelationship: ChartDBContext['updateRelationship'] =
        useCallback(
            async (
                id: string,
                relationship: Partial<DBRelationship>,
                options = { updateHistory: true }
            ) => {
                const prevRelationship = getRelationship(id);
                const relationshipsMap =
                    collabDocRef.current!.getMap<unknown>('relationships');
                collabDocRef.current!.transact(() => {
                    patchItem(
                        relationshipsMap,
                        id,
                        relationship as Record<string, unknown>
                    );
                });

                const updatedAt = new Date();
                setDiagramUpdatedAt(updatedAt);
                await Promise.all([
                    db.updateDiagram({
                        id: diagramId,
                        attributes: { updatedAt },
                    }),
                    db.updateRelationship({ id, attributes: relationship }),
                ]);

                if (!!prevRelationship && options.updateHistory) {
                    addUndoAction({
                        action: 'updateRelationship',
                        redoData: { relationshipId: id, relationship },
                        undoData: {
                            relationshipId: id,
                            relationship: prevRelationship,
                        },
                    });
                    resetRedoStack();
                }
            },
            [db, addUndoAction, getRelationship, resetRedoStack, diagramId]
        );

    const addDependencies: ChartDBContext['addDependencies'] = useCallback(
        async (
            dependencies: DBDependency[],
            options = { updateHistory: true }
        ) => {
            const dependenciesMap =
                collabDocRef.current!.getMap<unknown>('dependencies');
            collabDocRef.current!.transact(() => {
                dependencies.forEach((dependency) =>
                    upsertItem(dependenciesMap, dependency)
                );
            });

            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);

            await Promise.all([
                ...dependencies.map((dependency) =>
                    db.addDependency({ diagramId, dependency })
                ),
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
            ]);

            if (options.updateHistory) {
                addUndoAction({
                    action: 'addDependencies',
                    redoData: { dependencies },
                    undoData: {
                        dependenciesIds: dependencies.map((r) => r.id),
                    },
                });
                resetRedoStack();
            }
        },
        [db, diagramId, addUndoAction, resetRedoStack]
    );

    const addDependency: ChartDBContext['addDependency'] = useCallback(
        async (dependency: DBDependency, options = { updateHistory: true }) => {
            return addDependencies([dependency], options);
        },
        [addDependencies]
    );

    const createDependency: ChartDBContext['createDependency'] = useCallback(
        async ({ tableId, dependentTableId }) => {
            const table = getTable(tableId);
            const dependentTable = getTable(dependentTableId);

            // appendix-b:4 fix — canvas.tsx's dependency-creation branch
            // (unlike the relationship branch right next to it) had no
            // guard at all before calling this. Re-validate here, at
            // commit time, so a remote peer deleting either table between
            // drag-start and drop can't produce a dependency pointing at
            // nothing.
            if (!table || !dependentTable) {
                throw new Error(
                    'createDependency: table or dependent table no longer exists'
                );
            }

            const dependency: DBDependency = {
                id: generateId(),
                tableId,
                dependentTableId,
                dependentSchema: dependentTable.schema,
                schema: table.schema,
                createdAt: Date.now(),
            };

            await addDependency(dependency);

            return dependency;
        },
        [addDependency, getTable]
    );

    const getDependency: ChartDBContext['getDependency'] = useCallback(
        (id: string) =>
            dependencies.find((dependency) => dependency.id === id) ?? null,
        [dependencies]
    );

    const removeDependencies: ChartDBContext['removeDependencies'] =
        useCallback(
            async (ids: string[], options = { updateHistory: true }) => {
                const prevDependencies = [
                    ...dependencies.filter((dependency) =>
                        ids.includes(dependency.id)
                    ),
                ];

                const dependenciesMap =
                    collabDocRef.current!.getMap<unknown>('dependencies');
                collabDocRef.current!.transact(() => {
                    ids.forEach((id) =>
                        removeItemFromCollection(dependenciesMap, id)
                    );
                });

                const updatedAt = new Date();
                setDiagramUpdatedAt(updatedAt);
                await Promise.all([
                    ...ids.map((id) => db.deleteDependency({ diagramId, id })),
                    db.updateDiagram({
                        id: diagramId,
                        attributes: { updatedAt },
                    }),
                ]);

                if (prevDependencies.length > 0 && options.updateHistory) {
                    addUndoAction({
                        action: 'removeDependencies',
                        redoData: { dependenciesIds: ids },
                        undoData: { dependencies: prevDependencies },
                    });
                    resetRedoStack();
                }
            },
            [db, diagramId, addUndoAction, resetRedoStack, dependencies]
        );

    const removeDependency: ChartDBContext['removeDependency'] = useCallback(
        async (id: string, options = { updateHistory: true }) => {
            return removeDependencies([id], options);
        },
        [removeDependencies]
    );

    const updateDependency: ChartDBContext['updateDependency'] = useCallback(
        async (
            id: string,
            dependency: Partial<DBDependency>,
            options = { updateHistory: true }
        ) => {
            const prevDependency = getDependency(id);
            const dependenciesMap =
                collabDocRef.current!.getMap<unknown>('dependencies');
            collabDocRef.current!.transact(() => {
                patchItem(
                    dependenciesMap,
                    id,
                    dependency as Record<string, unknown>
                );
            });

            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);
            await Promise.all([
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
                db.updateDependency({ id, attributes: dependency }),
            ]);

            if (!!prevDependency && options.updateHistory) {
                addUndoAction({
                    action: 'updateDependency',
                    redoData: { dependencyId: id, dependency },
                    undoData: { dependencyId: id, dependency: prevDependency },
                });
                resetRedoStack();
            }
        },
        [db, diagramId, addUndoAction, resetRedoStack, getDependency]
    );

    // Area operations
    const addAreas: ChartDBContext['addAreas'] = useCallback(
        async (areas: Area[], options = { updateHistory: true }) => {
            const areasMap = collabDocRef.current!.getMap<unknown>('areas');
            collabDocRef.current!.transact(() => {
                areas.forEach((area) => upsertItem(areasMap, area));
            });

            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);

            await Promise.all([
                ...areas.map((area) => db.addArea({ diagramId, area })),
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
            ]);

            if (options.updateHistory) {
                addUndoAction({
                    action: 'addAreas',
                    redoData: { areas },
                    undoData: { areaIds: areas.map((a) => a.id) },
                });
                resetRedoStack();
            }
        },
        [db, diagramId, addUndoAction, resetRedoStack]
    );

    const addArea: ChartDBContext['addArea'] = useCallback(
        async (area: Area, options = { updateHistory: true }) => {
            return addAreas([area], options);
        },
        [addAreas]
    );

    const createArea: ChartDBContext['createArea'] = useCallback(
        async (attributes) => {
            if (nextAreaCounterRef.current === null) {
                nextAreaCounterRef.current = areas.length;
            }
            const count = ++nextAreaCounterRef.current;
            const area: Area = {
                id: generateId(),
                name: `Area ${count}`,
                x: 0,
                y: 0,
                width: 300,
                height: 200,
                color: randomColor(),
                ...attributes,
            };

            await addArea(area);

            return area;
        },
        [areas, addArea]
    );

    const getArea: ChartDBContext['getArea'] = useCallback(
        (id: string) => areas.find((area) => area.id === id) ?? null,
        [areas]
    );

    const removeAreas: ChartDBContext['removeAreas'] = useCallback(
        async (ids: string[], options = { updateHistory: true }) => {
            const prevAreas = [
                ...areas.filter((area) => ids.includes(area.id)),
            ];

            const areasMap = collabDocRef.current!.getMap<unknown>('areas');
            collabDocRef.current!.transact(() => {
                ids.forEach((id) => removeItemFromCollection(areasMap, id));
            });

            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);

            await Promise.all([
                ...ids.map((id) => db.deleteArea({ diagramId, id })),
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
            ]);

            if (prevAreas.length > 0 && options.updateHistory) {
                addUndoAction({
                    action: 'removeAreas',
                    redoData: { areaIds: ids },
                    undoData: { areas: prevAreas },
                });
                resetRedoStack();
            }
        },
        [db, diagramId, areas, addUndoAction, resetRedoStack]
    );

    const removeArea: ChartDBContext['removeArea'] = useCallback(
        async (id: string, options = { updateHistory: true }) => {
            return removeAreas([id], options);
        },
        [removeAreas]
    );

    const updateArea: ChartDBContext['updateArea'] = useCallback(
        async (
            id: string,
            area: Partial<Area>,
            options = { updateHistory: true }
        ) => {
            const prevArea = getArea(id);

            const areasMap = collabDocRef.current!.getMap<unknown>('areas');
            collabDocRef.current!.transact(() => {
                patchItem(areasMap, id, area as Record<string, unknown>);
            });

            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);

            await Promise.all([
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
                db.updateArea({ id, attributes: area }),
            ]);

            if (!!prevArea && options.updateHistory) {
                addUndoAction({
                    action: 'updateArea',
                    redoData: { areaId: id, area },
                    undoData: { areaId: id, area: prevArea },
                });
                resetRedoStack();
            }
        },
        [db, diagramId, getArea, addUndoAction, resetRedoStack]
    );

    // Note operations
    const addNotes: ChartDBContext['addNotes'] = useCallback(
        async (notes: Note[], options = { updateHistory: true }) => {
            // Phase 2: write into the notes Y.Doc, not React state directly
            // — the observer effect above projects this into `notes`
            // state. Writing straight to `setNotes` here would get
            // silently overwritten by the next doc-driven projection.
            const notesMap = collabDocRef.current!.getMap<unknown>('notes');
            collabDocRef.current!.transact(() => {
                notes.forEach((note) => upsertItem(notesMap, note));
            });

            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);

            await Promise.all([
                ...notes.map((note) => db.addNote({ diagramId, note })),
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
            ]);

            if (options.updateHistory) {
                addUndoAction({
                    action: 'addNotes',
                    redoData: { notes },
                    undoData: { noteIds: notes.map((n) => n.id) },
                });
                resetRedoStack();
            }
        },
        [db, diagramId, addUndoAction, resetRedoStack]
    );

    const addNote: ChartDBContext['addNote'] = useCallback(
        async (note: Note, options = { updateHistory: true }) => {
            return addNotes([note], options);
        },
        [addNotes]
    );

    const createNote: ChartDBContext['createNote'] = useCallback(
        async (attributes) => {
            const note: Note = {
                id: generateId(),
                content: '',
                x: 0,
                y: 0,
                width: 200,
                height: 150,
                color: '#ffe374', // Default warm yellow
                ...attributes,
            };

            await addNote(note);

            return note;
        },
        [addNote]
    );

    const getNote: ChartDBContext['getNote'] = useCallback(
        (id: string) => notes.find((note) => note.id === id) ?? null,
        [notes]
    );

    const removeNotes: ChartDBContext['removeNotes'] = useCallback(
        async (ids: string[], options = { updateHistory: true }) => {
            const prevNotes = [
                ...notes.filter((note) => ids.includes(note.id)),
            ];

            // Phase 2: remove from the doc — see addNotes above.
            const notesMap = collabDocRef.current!.getMap<unknown>('notes');
            collabDocRef.current!.transact(() => {
                ids.forEach((id) => removeItemFromCollection(notesMap, id));
            });

            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);

            await Promise.all([
                ...ids.map((id) => db.deleteNote({ diagramId, id })),
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
            ]);

            if (prevNotes.length > 0 && options.updateHistory) {
                addUndoAction({
                    action: 'removeNotes',
                    redoData: { noteIds: ids },
                    undoData: { notes: prevNotes },
                });
                resetRedoStack();
            }
        },
        [db, diagramId, notes, addUndoAction, resetRedoStack]
    );

    const removeNote: ChartDBContext['removeNote'] = useCallback(
        async (id: string, options = { updateHistory: true }) => {
            return removeNotes([id], options);
        },
        [removeNotes]
    );

    const updateNote: ChartDBContext['updateNote'] = useCallback(
        async (
            id: string,
            note: Partial<Note>,
            options = { updateHistory: true }
        ) => {
            const prevNote = getNote(id);

            // Phase 2: patch only the given keys on the doc's entry — see
            // addNotes above. A no-op if `id` no longer exists (e.g. a
            // concurrent delete raced this edit).
            const notesMap = collabDocRef.current!.getMap<unknown>('notes');
            collabDocRef.current!.transact(() => {
                patchItem(notesMap, id, note as Record<string, unknown>);
            });

            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);

            await Promise.all([
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
                db.updateNote({ id, attributes: note }),
            ]);

            if (!!prevNote && options.updateHistory) {
                addUndoAction({
                    action: 'updateNote',
                    redoData: { noteId: id, note },
                    undoData: { noteId: id, note: prevNote },
                });
                resetRedoStack();
            }
        },
        [db, diagramId, getNote, addUndoAction, resetRedoStack]
    );

    const highlightCustomTypeId = useCallback(
        (id?: string) => setHighlightedCustomTypeId(id),
        [setHighlightedCustomTypeId]
    );

    const highlightedCustomType = useMemo(() => {
        return highlightedCustomTypeId
            ? customTypes.find((type) => type.id === highlightedCustomTypeId)
            : undefined;
    }, [highlightedCustomTypeId, customTypes]);

    const loadDiagramFromData: ChartDBContext['loadDiagramFromData'] =
        useCallback(
            (diagram) => {
                setDiagramId(diagram.id);
                setDiagramName(diagram.name);
                setDatabaseType(diagram.databaseType);
                setDatabaseEdition(diagram.databaseEdition);
                setTables(diagram.tables ?? []);
                setRelationships(diagram.relationships ?? []);
                setDependencies(diagram.dependencies ?? []);
                setAreas(diagram.areas ?? []);
                setCustomTypes(diagram.customTypes ?? []);
                setDiagramCreatedAt(diagram.createdAt);
                setDiagramUpdatedAt(diagram.updatedAt);
                setHighlightedCustomTypeId(undefined);
                setNotes(diagram.notes ?? []);

                // Phase 2: rebuild the shared collab Y.Doc from scratch for
                // the newly loaded diagram instead of carrying over the
                // previous diagram's doc. `collabDocRef.current` changing
                // to a new object is what makes `useYCollectionSync`'s
                // effect re-subscribe (see its doc comment); setNotes/
                // setCustomTypes above already set the correct initial
                // React state synchronously, so there's no visible gap —
                // *unless* a live room turns out to already have different
                // content, see below.
                collabDocRef.current?.destroy();
                providerRef.current?.destroy();
                providerRef.current = null;
                const newDoc = new Y.Doc();
                collabDocRef.current = newDoc;

                // Phase 4: seeding this diagram's local (Dexie-loaded) data
                // into the doc is only correct for a room nobody has
                // populated yet — a room a collaborator already has open,
                // or one this diagram was already synced to before, must
                // win over whatever this tab happens to have loaded
                // locally (this tab's own Dexie copy can be stale). Decided
                // once, via seedWhenDecided (see its doc comment for why
                // synced-or-disconnected instead of a timeout). If the room
                // already has content, this tab's just-set React state
                // above was seeded from the wrong source — re-derive it for
                // real from what the doc actually holds, since
                // useYCollectionSync only reacts to *future* changes, not
                // whatever was already in the doc before it started
                // observing.
                const reconcileWithRoom = () => {
                    const tablesMap = newDoc.getMap<unknown>('tables');
                    const relationshipsMap =
                        newDoc.getMap<unknown>('relationships');
                    const dependenciesMap =
                        newDoc.getMap<unknown>('dependencies');
                    const areasMap = newDoc.getMap<unknown>('areas');
                    const notesMap = newDoc.getMap<unknown>('notes');
                    const customTypesMap =
                        newDoc.getMap<unknown>('customTypes');

                    const roomIsEmpty =
                        tablesMap.size === 0 &&
                        relationshipsMap.size === 0 &&
                        dependenciesMap.size === 0 &&
                        areasMap.size === 0 &&
                        notesMap.size === 0 &&
                        customTypesMap.size === 0;

                    if (roomIsEmpty) {
                        newDoc.transact(() => {
                            (diagram.tables ?? []).forEach((table) =>
                                upsertTable(tablesMap, table)
                            );
                            (diagram.relationships ?? []).forEach(
                                (relationship) =>
                                    upsertItem(relationshipsMap, relationship)
                            );
                            (diagram.dependencies ?? []).forEach((dependency) =>
                                upsertItem(dependenciesMap, dependency)
                            );
                            (diagram.areas ?? []).forEach((area) =>
                                upsertItem(areasMap, area)
                            );
                            (diagram.notes ?? []).forEach((note) =>
                                upsertItem(notesMap, note)
                            );
                            (diagram.customTypes ?? []).forEach((customType) =>
                                upsertItem(customTypesMap, customType)
                            );
                        });
                        return;
                    }

                    // Room already had content — adopt it instead.
                    setTables(readTables(tablesMap));
                    setRelationships(
                        readCollection<DBRelationship>(
                            relationshipsMap,
                            (r) => r as unknown as DBRelationship
                        )
                    );
                    setDependencies(
                        readCollection<DBDependency>(
                            dependenciesMap,
                            (r) => r as unknown as DBDependency
                        )
                    );
                    setAreas(
                        readCollection<Area>(
                            areasMap,
                            (r) => r as unknown as Area
                        )
                    );
                    setNotes(
                        readCollection<Note>(
                            notesMap,
                            (r) => r as unknown as Note
                        )
                    );
                    setCustomTypes(
                        readCollection<DBCustomType>(
                            customTypesMap,
                            (r) => r as unknown as DBCustomType
                        )
                    );
                };

                if (!readonlyProp && COLLAB_WS_URL) {
                    const provider = new HocuspocusProvider({
                        url: COLLAB_WS_URL,
                        name: diagram.id,
                        document: newDoc,
                    });
                    providerRef.current = provider;
                    seedWhenDecided(provider, reconcileWithRoom);
                } else {
                    // Readonly (template preview) or no collab server
                    // configured — local-only, exactly like before Phase 4.
                    reconcileWithRoom();
                }

                // reset the appendix-b:9 default-name counters so they
                // reseed from this diagram's actual counts on next use,
                // instead of carrying over the previously loaded diagram's
                nextTableCounterRef.current = null;
                nextAreaCounterRef.current = null;
                nextCustomTypeCounterRef.current = null;
                nextFieldCounterRef.current.clear();
                nextIndexCounterRef.current.clear();

                events.emit({ action: 'load_diagram', data: { diagram } });

                resetRedoStack();
                resetUndoStack();
            },
            [
                setDiagramId,
                setDiagramName,
                setDatabaseType,
                setDatabaseEdition,
                setTables,
                setRelationships,
                setDependencies,
                setAreas,
                setCustomTypes,
                setDiagramCreatedAt,
                setDiagramUpdatedAt,
                setHighlightedCustomTypeId,
                events,
                setNotes,
                resetRedoStack,
                resetUndoStack,
                readonlyProp,
            ]
        );

    const updateDiagramData: ChartDBContext['updateDiagramData'] = useCallback(
        async (diagram, options) => {
            const st = options?.forceUpdateStorage ? storageDB : db;
            await st.deleteDiagram(diagram.id);
            await st.addDiagram({ diagram });
            loadDiagramFromData(diagram);
        },
        [db, storageDB, loadDiagramFromData]
    );

    const loadDiagram: ChartDBContext['loadDiagram'] = useCallback(
        async (diagramId: string) => {
            const diagram = await storageDB.getDiagram(diagramId, {
                includeRelationships: true,
                includeTables: true,
                includeDependencies: true,
                includeAreas: true,
                includeCustomTypes: true,
                includeNotes: true,
            });

            if (diagram) {
                loadDiagramFromData(diagram);
            }

            return diagram;
        },
        [storageDB, loadDiagramFromData]
    );

    // Custom type operations
    const getCustomType: ChartDBContext['getCustomType'] = useCallback(
        (id: string) => customTypes.find((type) => type.id === id) ?? null,
        [customTypes]
    );

    const addCustomTypes: ChartDBContext['addCustomTypes'] = useCallback(
        async (
            customTypes: DBCustomType[],
            options = { updateHistory: true }
        ) => {
            // Phase 2: write into the shared collab Y.Doc, not React state
            // directly — useYCollectionSync's observer projects this into
            // `customTypes` state. Writing straight to `setCustomTypes`
            // here would get silently overwritten by that projection.
            const customTypesMap =
                collabDocRef.current!.getMap<unknown>('customTypes');
            collabDocRef.current!.transact(() => {
                customTypes.forEach((customType) =>
                    upsertItem(customTypesMap, customType)
                );
            });

            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);

            await Promise.all([
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
                ...customTypes.map((customType) =>
                    db.addCustomType({ diagramId, customType })
                ),
            ]);

            if (options.updateHistory) {
                addUndoAction({
                    action: 'addCustomTypes',
                    redoData: { customTypes },
                    undoData: { customTypeIds: customTypes.map((t) => t.id) },
                });
                resetRedoStack();
            }
        },
        [db, diagramId, addUndoAction, resetRedoStack]
    );

    const addCustomType: ChartDBContext['addCustomType'] = useCallback(
        async (customType: DBCustomType, options = { updateHistory: true }) => {
            return addCustomTypes([customType], options);
        },
        [addCustomTypes]
    );

    const createCustomType: ChartDBContext['createCustomType'] = useCallback(
        async (attributes) => {
            if (nextCustomTypeCounterRef.current === null) {
                nextCustomTypeCounterRef.current = customTypes.length;
            }
            const count = ++nextCustomTypeCounterRef.current;
            const customType: DBCustomType = {
                id: generateId(),
                name: `type_${count}`,
                kind: DBCustomTypeKind.enum,
                values: [],
                fields: [],
                ...attributes,
            };

            await addCustomType(customType);
            return customType;
        },
        [addCustomType, customTypes]
    );

    const removeCustomTypes: ChartDBContext['removeCustomTypes'] = useCallback(
        async (ids, options = { updateHistory: true }) => {
            const typesToRemove = ids
                .map((id) => getCustomType(id))
                .filter(Boolean) as DBCustomType[];

            // Phase 2: remove from the shared collab Y.Doc — see
            // addCustomTypes above.
            const customTypesMap =
                collabDocRef.current!.getMap<unknown>('customTypes');
            collabDocRef.current!.transact(() => {
                ids.forEach((id) =>
                    removeItemFromCollection(customTypesMap, id)
                );
            });

            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);

            await Promise.all([
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
                ...ids.map((id) => db.deleteCustomType({ diagramId, id })),
            ]);

            if (typesToRemove.length > 0 && options.updateHistory) {
                addUndoAction({
                    action: 'removeCustomTypes',
                    redoData: {
                        customTypeIds: ids,
                    },
                    undoData: {
                        customTypes: typesToRemove,
                    },
                });
                resetRedoStack();
            }
        },
        [db, diagramId, addUndoAction, resetRedoStack, getCustomType]
    );

    const removeCustomType: ChartDBContext['removeCustomType'] = useCallback(
        async (id: string, options = { updateHistory: true }) => {
            return removeCustomTypes([id], options);
        },
        [removeCustomTypes]
    );

    const updateCustomType: ChartDBContext['updateCustomType'] = useCallback(
        async (
            id: string,
            customType: Partial<DBCustomType>,
            options = { updateHistory: true }
        ) => {
            const prevCustomType = getCustomType(id);

            // Phase 2: patch only the given keys on the doc's entry — see
            // addCustomTypes above. A no-op if `id` no longer exists.
            const customTypesMap =
                collabDocRef.current!.getMap<unknown>('customTypes');
            collabDocRef.current!.transact(() => {
                patchItem(
                    customTypesMap,
                    id,
                    customType as Record<string, unknown>
                );
            });

            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);

            await Promise.all([
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
                db.updateCustomType({ id, attributes: customType }),
            ]);

            if (!!prevCustomType && options.updateHistory) {
                addUndoAction({
                    action: 'updateCustomType',
                    redoData: { customTypeId: id, customType },
                    undoData: { customTypeId: id, customType: prevCustomType },
                });
                resetRedoStack();
            }
        },
        [db, addUndoAction, resetRedoStack, getCustomType, diagramId]
    );

    return (
        <chartDBContext.Provider
            value={{
                diagramId,
                diagramName,
                databaseType,
                tables,
                relationships,
                dependencies,
                areas,
                notes,
                currentDiagram,
                schemas,
                events,
                readonly,
                updateDiagramData,
                updateDiagramId,
                updateDiagramName,
                loadDiagram,
                loadDiagramFromData,
                updateDatabaseType,
                updateDatabaseEdition,
                clearDiagramData,
                deleteDiagram,
                updateDiagramUpdatedAt,
                createTable,
                addTable,
                addTables,
                getTable,
                removeTable,
                removeTables,
                updateTable,
                updateTablesState,
                updateField,
                removeField,
                createField,
                addField,
                addIndex,
                createIndex,
                removeIndex,
                getField,
                getIndex,
                updateIndex,
                createCheckConstraint,
                addCheckConstraint,
                removeCheckConstraint,
                updateCheckConstraint,
                addRelationship,
                addRelationships,
                createRelationship,
                getRelationship,
                removeRelationship,
                removeRelationships,
                updateRelationship,
                addDependency,
                addDependencies,
                createDependency,
                getDependency,
                removeDependency,
                removeDependencies,
                updateDependency,
                createArea,
                addArea,
                addAreas,
                getArea,
                removeArea,
                removeAreas,
                updateArea,
                customTypes,
                createCustomType,
                addCustomType,
                addCustomTypes,
                getCustomType,
                removeCustomType,
                removeCustomTypes,
                updateCustomType,
                highlightCustomTypeId,
                highlightedCustomType,
                createNote,
                addNote,
                addNotes,
                getNote,
                removeNote,
                removeNotes,
                updateNote,
            }}
        >
            {children}
        </chartDBContext.Provider>
    );
};
