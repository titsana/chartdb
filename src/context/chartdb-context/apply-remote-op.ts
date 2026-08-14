import type { DBTable } from '@/lib/domain/db-table';
import type { DBField } from '@/lib/domain/db-field';
import type { DBRelationship } from '@/lib/domain/db-relationship';
import type { DBDependency } from '@/lib/domain/db-dependency';
import type { Area } from '@/lib/domain/area';
import type { DBCustomType } from '@/lib/domain/db-custom-type';
import type { Note } from '@/lib/domain/note';
import type { Diagram } from '@/lib/domain/diagram';
import type { DatabaseType } from '@/lib/domain/database-type';
import type { DatabaseEdition } from '@/lib/domain/database-edition';

type Setter<T> = (updater: (prev: T[]) => T[]) => void;

export interface RemoteApplySetters {
    setTables: Setter<DBTable>;
    setRelationships: Setter<DBRelationship>;
    setDependencies: Setter<DBDependency>;
    setAreas: Setter<Area>;
    setCustomTypes: Setter<DBCustomType>;
    setNotes: Setter<Note>;
    setDiagramName: (name: string) => void;
    setDiagramUpdatedAt: (date: Date) => void;
    setDatabaseType: (type: DatabaseType) => void;
    setDatabaseEdition: (edition: DatabaseEdition | undefined) => void;
}

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
    const idx = list.findIndex((x) => x.id === item.id);
    if (idx === -1) return [...list, item];
    const copy = [...list];
    copy[idx] = item;
    return copy;
}

function patch<T extends { id: string }>(
    list: T[],
    id: string,
    attributes: Partial<T>
): T[] {
    return list.map((x) => (x.id === id ? { ...x, ...attributes } : x));
}

function remove<T extends { id: string }>(list: T[], id: string): T[] {
    return list.filter((x) => x.id !== id);
}

// Fields stay nested inside their table (client state wasn't normalized for
// this change, see chartdb-provider.tsx) — these patch into `table.fields`
// by tableId instead of operating on a top-level list.
function upsertField(
    tables: DBTable[],
    tableId: string,
    field: DBField
): DBTable[] {
    return tables.map((t) =>
        t.id === tableId ? { ...t, fields: upsert(t.fields, field) } : t
    );
}

function patchField(
    tables: DBTable[],
    tableId: string,
    id: string,
    attributes: Partial<DBField>
): DBTable[] {
    return tables.map((t) =>
        t.id === tableId ? { ...t, fields: patch(t.fields, id, attributes) } : t
    );
}

function deleteFieldFrom(
    tables: DBTable[],
    tableId: string,
    id: string,
    tableAttributes?: Partial<DBTable>
): DBTable[] {
    return tables.map((t) =>
        t.id === tableId
            ? { ...t, ...tableAttributes, fields: remove(t.fields, id) }
            : t
    );
}

// Minimal state patchers for ops broadcast from other clients — no
// persistence (the sender's server round-trip already persisted this) and no
// undo-stack entry (undo/redo is local-only, see collaboration design docs).
// Deliberately NOT reusing the full ChartDBContext mutators here: those
// always call `db.*()` to persist, which would re-emit this same op back
// over the socket and loop.
export function applyRemoteOp(
    op: string,
    args: Record<string, unknown>,
    s: RemoteApplySetters
): void {
    switch (op) {
        case 'addTable':
            s.setTables((prev) => upsert(prev, args.table as DBTable));
            return;
        case 'updateTable':
            s.setTables((prev) =>
                patch(
                    prev,
                    args.id as string,
                    args.attributes as Partial<DBTable>
                )
            );
            return;
        case 'putTable':
            s.setTables((prev) => upsert(prev, args.table as DBTable));
            return;
        case 'deleteTable':
            s.setTables((prev) => remove(prev, args.id as string));
            return;

        case 'addField': {
            const field = args.field as DBField & { tableId: string };
            s.setTables((prev) => upsertField(prev, field.tableId, field));
            return;
        }
        case 'updateField':
            s.setTables((prev) =>
                patchField(
                    prev,
                    args.tableId as string,
                    args.id as string,
                    args.attributes as Partial<DBField>
                )
            );
            return;
        case 'deleteField':
            s.setTables((prev) =>
                deleteFieldFrom(
                    prev,
                    args.tableId as string,
                    args.id as string,
                    args.tableAttributes as Partial<DBTable>
                )
            );
            return;

        case 'addRelationship':
            s.setRelationships((prev) =>
                upsert(prev, args.relationship as DBRelationship)
            );
            return;
        case 'updateRelationship':
            s.setRelationships((prev) =>
                patch(
                    prev,
                    args.id as string,
                    args.attributes as Partial<DBRelationship>
                )
            );
            return;
        case 'deleteRelationship':
            s.setRelationships((prev) => remove(prev, args.id as string));
            return;

        case 'addDependency':
            s.setDependencies((prev) =>
                upsert(prev, args.dependency as DBDependency)
            );
            return;
        case 'updateDependency':
            s.setDependencies((prev) =>
                patch(
                    prev,
                    args.id as string,
                    args.attributes as Partial<DBDependency>
                )
            );
            return;
        case 'deleteDependency':
            s.setDependencies((prev) => remove(prev, args.id as string));
            return;

        case 'addArea':
            s.setAreas((prev) => upsert(prev, args.area as Area));
            return;
        case 'updateArea':
            s.setAreas((prev) =>
                patch(prev, args.id as string, args.attributes as Partial<Area>)
            );
            return;
        case 'deleteArea':
            s.setAreas((prev) => remove(prev, args.id as string));
            return;

        case 'addCustomType':
            s.setCustomTypes((prev) =>
                upsert(prev, args.customType as DBCustomType)
            );
            return;
        case 'updateCustomType':
            s.setCustomTypes((prev) =>
                patch(
                    prev,
                    args.id as string,
                    args.attributes as Partial<DBCustomType>
                )
            );
            return;
        case 'deleteCustomType':
            s.setCustomTypes((prev) => remove(prev, args.id as string));
            return;

        case 'addNote':
            s.setNotes((prev) => upsert(prev, args.note as Note));
            return;
        case 'updateNote':
            s.setNotes((prev) =>
                patch(prev, args.id as string, args.attributes as Partial<Note>)
            );
            return;
        case 'deleteNote':
            s.setNotes((prev) => remove(prev, args.id as string));
            return;

        case 'updateDiagram': {
            const attributes = args.attributes as Partial<Diagram>;
            if (attributes.name !== undefined)
                s.setDiagramName(attributes.name);
            if (attributes.updatedAt !== undefined)
                s.setDiagramUpdatedAt(new Date(attributes.updatedAt));
            if (attributes.databaseType !== undefined)
                s.setDatabaseType(attributes.databaseType);
            if (attributes.databaseEdition !== undefined)
                s.setDatabaseEdition(attributes.databaseEdition);
            return;
        }
    }
}
