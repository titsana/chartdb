import {
    ConflictException,
    Injectable,
    NotFoundException,
    OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, IsNull, Not, type Repository } from 'typeorm';
import { DiagramEntity } from '../entities/diagram.entity';
import { GroupEntity } from '../entities/group.entity';
import { TableEntity } from '../entities/table.entity';
import { FieldEntity } from '../entities/field.entity';
import { RelationshipEntity } from '../entities/relationship.entity';
import { DependencyEntity } from '../entities/dependency.entity';
import { AreaEntity } from '../entities/area.entity';
import { CustomTypeEntity } from '../entities/custom-type.entity';
import { NoteEntity } from '../entities/note.entity';
import { ConfigEntity } from '../entities/config.entity';
import { DiagramFilterEntity } from '../entities/diagram-filter.entity';

export interface DiagramIncludeOptions {
    includeTables?: boolean;
    includeRelationships?: boolean;
    includeDependencies?: boolean;
    includeAreas?: boolean;
    includeCustomTypes?: boolean;
    includeNotes?: boolean;
}

const DIAGRAM_COLUMNS = [
    'id',
    'name',
    'databaseType',
    'databaseEdition',
    'groupId',
    'createdAt',
    'updatedAt',
] as const;

@Injectable()
export class StorageService implements OnModuleInit {
    constructor(
        @InjectRepository(DiagramEntity)
        private readonly diagrams: Repository<DiagramEntity>,
        @InjectRepository(TableEntity)
        private readonly tables: Repository<TableEntity>,
        @InjectRepository(FieldEntity)
        private readonly fields: Repository<FieldEntity>,
        @InjectRepository(RelationshipEntity)
        private readonly relationships: Repository<RelationshipEntity>,
        @InjectRepository(DependencyEntity)
        private readonly dependencies: Repository<DependencyEntity>,
        @InjectRepository(AreaEntity)
        private readonly areas: Repository<AreaEntity>,
        @InjectRepository(CustomTypeEntity)
        private readonly customTypes: Repository<CustomTypeEntity>,
        @InjectRepository(NoteEntity)
        private readonly notes: Repository<NoteEntity>,
        @InjectRepository(ConfigEntity)
        private readonly config: Repository<ConfigEntity>,
        @InjectRepository(DiagramFilterEntity)
        private readonly diagramFilters: Repository<DiagramFilterEntity>,
        @InjectRepository(GroupEntity)
        private readonly groups: Repository<GroupEntity>
    ) {}

    // ponytail: mirrors the Dexie client's dexieDB.on('ready') seed — the
    // client's useDiagramLoader treats config===undefined as "still loading",
    // so a config row must always exist after first boot or it hangs forever
    // ponytail: fields data migration lives in scripts/backfill-fields.sql,
    // run manually against the DB before deploying this code — see that
    // file for why it can't be an onModuleInit step (synchronize=true drops
    // the old tables.fields column on this code's first boot, before any
    // in-app migration would get a chance to read it).
    async onModuleInit() {
        const existing = await this.config.findOneBy({ id: 1 });
        if (!existing) {
            await this.config.insert({ id: 1, defaultDiagramId: '' });
        }
    }

    // Optimistic concurrency for the ops a live collab session sends most:
    // field-level updates on an already-existing row. When expectedVersion is
    // given (socket path) the WHERE clause makes the increment atomic — no
    // read-then-write race — and a mismatch means someone else wrote first,
    // so we reject rather than silently overwrite (last-write-wins bug).
    // The REST path (single-user / no expectedVersion) still bumps version
    // but skips the check, since there's no concurrent writer to race.
    private async versionedUpdate<T extends { id: string; version: number }>(
        repo: Repository<T>,
        id: string,
        attributes: Partial<T>,
        expectedVersion?: number,
        // Tags the ConflictException so a caller that runs more than one
        // versionedUpdate in the same op (deleteField: field row + the
        // table's indexes/checkConstraints) can tell which entity actually
        // conflicted — without it, the gateway has no way to know `current`
        // is a TableEntity row rather than the op's own primary entity, and
        // would misroute the restore (see collaboration.gateway.ts).
        entityLabel?: string
    ): Promise<number> {
        const qb = repo
            .createQueryBuilder()
            .update(repo.target)
            .set({
                ...attributes,
                version: () => '"version" + 1',
            } as never)
            .where('id = :id', { id })
            .returning('*');
        if (expectedVersion !== undefined) {
            qb.andWhere('version = :expectedVersion', { expectedVersion });
        }
        const result = await qb.execute();
        // RETURNING gives us the post-update row for free on the hot
        // (successful write) path — no separate SELECT needed there. The
        // conflict path still needs one: RETURNING comes back empty and we
        // have to fetch the current row to tell the sender what actually won.
        if (result.affected === 0) {
            const current = await repo.findOneBy({ id } as never);
            if (expectedVersion !== undefined) {
                throw new ConflictException({
                    message: 'version-mismatch',
                    entity: entityLabel,
                    current,
                });
            }
            // No expectedVersion means there was nothing to optimistically
            // race against — affected === 0 here only means the row itself
            // doesn't exist. Previously this fell through and reported
            // success (newVersion 0) for a write that touched nothing.
            throw new NotFoundException(`Row ${id} not found`);
        }
        const row = (result.raw?.[0] as T | undefined) ?? (await repo.findOneBy({ id } as never));
        return row?.version ?? 0;
    }

    // Config
    async getConfig() {
        return (await this.config.findOneBy({ id: 1 })) ?? undefined;
    }

    async updateConfig(attributes: Partial<ConfigEntity>) {
        await this.config.update(1, attributes);
    }

    // Diagram filter — personal scope (diagramId + userId), see
    // DiagramFilterEntity's comment on why userId exists.
    async getDiagramFilter(diagramId: string, userId: string) {
        return (
            (await this.diagramFilters.findOneBy({ diagramId, userId })) ??
            undefined
        );
    }

    async updateDiagramFilter(
        diagramId: string,
        userId: string,
        filter: Partial<DiagramFilterEntity>
    ) {
        await this.diagramFilters.save({
            diagramId,
            userId,
            ...filter,
        } as DiagramFilterEntity);
    }

    async deleteDiagramFilter(diagramId: string, userId: string) {
        await this.diagramFilters.delete({ diagramId, userId });
    }

    // Tables
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async addTable(diagramId: string, table: Partial<TableEntity> & { fields?: any[] }) {
        const { fields, ...tableAttrs } = table;
        // ponytail: save() upserts by id — insert() alone conflicts with a
        // soft-deleted row sharing the same id (see deletedAt on this entity)
        await this.tables.save({
            ...tableAttrs,
            diagramId,
            version: 0,
            deletedAt: null,
        } as TableEntity);

        if (fields?.length) {
            await this.fields.insert(
                fields.map((field, order) => ({
                    ...field,
                    diagramId,
                    tableId: table.id as string,
                    order,
                    version: 0,
                    deletedAt: null,
                }))
            );
        }
        // Return the newly-inserted row's version so the gateway can seed
        // the collab client's baseVersion for this entity — otherwise its
        // first edit races unguarded (see collaboration-provider.tsx's
        // versionsRef seeding).
        return 0;
    }

    async getTable(diagramId: string, id: string) {
        const table = await this.tables.findOneBy({
            id,
            diagramId,
            deletedAt: IsNull(),
        });
        if (!table) return undefined;
        return { ...table, fields: await this.listFields(id) };
    }

    async updateTable(
        id: string,
        attributes: Partial<TableEntity>,
        expectedVersion?: number
    ) {
        return this.versionedUpdate(this.tables, id, attributes, expectedVersion);
    }

    // ponytail: routed through versionedUpdate (UPDATE, not upsert) — the
    // one caller (removing a dangling FK field when another table is
    // deleted, see chartdb-provider.tsx) always targets a table that already
    // exists. If a future caller needs putTable to insert a missing row,
    // it'll need its own upsert-then-check path.
    // `fields` is a full replace of that table's field set (hard delete +
    // reinsert, not soft-delete — this is the table's own fields being
    // replaced wholesale, not fields removed elsewhere referencing it).
    async putTable(
        diagramId: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        table: TableEntity & { fields?: any[] },
        expectedVersion?: number
    ) {
        const { id, fields, ...attributes } = table;
        return this.tables.manager.transaction(async (manager) => {
            const newVersion = await this.versionedUpdate(
                manager.getRepository(TableEntity),
                id,
                { ...attributes, diagramId } as Partial<TableEntity>,
                expectedVersion
            );
            const fieldsRepo = manager.getRepository(FieldEntity);
            await fieldsRepo.delete({ tableId: id });
            if (fields?.length) {
                await fieldsRepo.insert(
                    fields.map((field, order) => ({
                        ...field,
                        diagramId,
                        tableId: id,
                        order,
                        version: 0,
                        deletedAt: null,
                    }))
                );
            }
            return newVersion;
        });
    }

    async deleteTable(
        diagramId: string,
        id: string,
        expectedVersion?: number
    ) {
        return this.tables.manager.transaction(async (manager) => {
            const newVersion = await this.versionedUpdate(
                manager.getRepository(TableEntity),
                id,
                { deletedAt: new Date(), diagramId } as Partial<TableEntity>,
                expectedVersion
            );
            await manager
                .getRepository(FieldEntity)
                .update({ tableId: id }, { deletedAt: new Date() });
            return newVersion;
        });
    }

    async listTables(diagramId: string) {
        const tables = await this.tables.findBy({
            diagramId,
            deletedAt: IsNull(),
        });
        return await Promise.all(
            tables.map(async (table) => ({
                ...table,
                fields: await this.listFields(table.id),
            }))
        );
    }

    async deleteDiagramTables(diagramId: string) {
        await this.tables.update({ diagramId }, { deletedAt: new Date() });
        await this.fields.update({ diagramId }, { deletedAt: new Date() });
    }

    // Fields
    // tableId comes from `field` itself (like every other entity here, the
    // full row already carries the ids it needs) — keeps this callable
    // symmetrically from both the REST route (tableId in the URL, merged
    // into the body) and the gateway's op-rejection restore path (which only
    // has {diagramId, field}, the same shape addTable/addRelationship use).
    async addField(
        diagramId: string,
        field: Partial<FieldEntity> & { tableId: string }
    ) {
        const { tableId } = field;
        const { max } = (await this.fields
            .createQueryBuilder('field')
            .select('MAX(field.order)', 'max')
            .where('field.tableId = :tableId', { tableId })
            .getRawOne()) as { max: number | null };
        await this.fields.save({
            ...field,
            diagramId,
            order: (max ?? -1) + 1,
            version: 0,
            deletedAt: null,
        } as FieldEntity);
        // See addTable's comment — seeds the collab client's version map.
        return 0;
    }

    async getField(tableId: string, id: string) {
        return (
            (await this.fields.findOneBy({
                id,
                tableId,
                deletedAt: IsNull(),
            })) ?? undefined
        );
    }

    async updateField(
        id: string,
        attributes: Partial<FieldEntity>,
        expectedVersion?: number
    ) {
        return this.versionedUpdate(this.fields, id, attributes, expectedVersion);
    }

    // Removing a field is two writes — soft-delete the field row and strip
    // its references from the table's indexes/checkConstraints jsonb — done
    // in one transaction so a crash between them can't leave a dangling
    // reference. tableAttributes is the caller-precomputed post-removal
    // indexes/checkConstraints (chartdb-provider already computes this via
    // getTableIndexesWithPrimaryKey). No expectedVersion on the table side:
    // this is a cascade of the field's own version-checked delete, not a
    // separate user-supplied edit.
    async deleteField(
        diagramId: string,
        tableId: string,
        id: string,
        tableAttributes: Partial<TableEntity>,
        expectedVersion?: number,
        expectedTableVersion?: number
    ) {
        return this.fields.manager.transaction(async (manager) => {
            const newVersion = await this.versionedUpdate(
                manager.getRepository(FieldEntity),
                id,
                { deletedAt: new Date(), diagramId, tableId } as Partial<FieldEntity>,
                expectedVersion
            );
            // Now guarded like every other table write — without it, a
            // concurrent edit to this same table's indexes/checkConstraints
            // (from someone editing a *different* field on it) gets
            // silently overwritten with no conflict, no correction, no way
            // to recover it. Tagged 'Table' so the gateway's ConflictException
            // handler doesn't mistake `current` (a TableEntity row) for the
            // field this op is nominally about — see RESTORE_OPS there.
            await this.versionedUpdate(
                manager.getRepository(TableEntity),
                tableId,
                { ...tableAttributes, diagramId } as Partial<TableEntity>,
                expectedTableVersion,
                'Table'
            );
            return newVersion;
        });
    }

    async listFields(tableId: string) {
        return await this.fields.find({
            where: { tableId, deletedAt: IsNull() },
            order: { order: 'ASC' },
        });
    }

    // Relationships
    async addRelationship(
        diagramId: string,
        relationship: Partial<RelationshipEntity>
    ) {
        await this.relationships.save({
            ...relationship,
            diagramId,
            version: 0,
            deletedAt: null,
        } as RelationshipEntity);
        // See addTable's comment — seeds the collab client's version map.
        return 0;
    }

    async getRelationship(diagramId: string, id: string) {
        return (
            (await this.relationships.findOneBy({
                id,
                diagramId,
                deletedAt: IsNull(),
            })) ?? undefined
        );
    }

    async updateRelationship(
        id: string,
        attributes: Partial<RelationshipEntity>,
        expectedVersion?: number
    ) {
        return this.versionedUpdate(
            this.relationships,
            id,
            attributes,
            expectedVersion
        );
    }

    async deleteRelationship(
        diagramId: string,
        id: string,
        expectedVersion?: number
    ) {
        return this.versionedUpdate(
            this.relationships,
            id,
            { deletedAt: new Date(), diagramId } as Partial<RelationshipEntity>,
            expectedVersion
        );
    }

    async listRelationships(diagramId: string) {
        return await this.relationships.find({
            where: { diagramId, deletedAt: IsNull() },
            order: { name: 'ASC' },
        });
    }

    async deleteDiagramRelationships(diagramId: string) {
        await this.relationships.update(
            { diagramId },
            { deletedAt: new Date() }
        );
    }

    // Dependencies
    async addDependency(
        diagramId: string,
        dependency: Partial<DependencyEntity>
    ) {
        await this.dependencies.save({
            ...dependency,
            diagramId,
            version: 0,
            deletedAt: null,
        } as DependencyEntity);
        // See addTable's comment — seeds the collab client's version map.
        return 0;
    }

    async getDependency(diagramId: string, id: string) {
        return (
            (await this.dependencies.findOneBy({
                id,
                diagramId,
                deletedAt: IsNull(),
            })) ?? undefined
        );
    }

    async updateDependency(
        id: string,
        attributes: Partial<DependencyEntity>,
        expectedVersion?: number
    ) {
        return this.versionedUpdate(
            this.dependencies,
            id,
            attributes,
            expectedVersion
        );
    }

    async deleteDependency(
        diagramId: string,
        id: string,
        expectedVersion?: number
    ) {
        return this.versionedUpdate(
            this.dependencies,
            id,
            { deletedAt: new Date(), diagramId } as Partial<DependencyEntity>,
            expectedVersion
        );
    }

    async listDependencies(diagramId: string) {
        return await this.dependencies.findBy({
            diagramId,
            deletedAt: IsNull(),
        });
    }

    async deleteDiagramDependencies(diagramId: string) {
        await this.dependencies.update(
            { diagramId },
            { deletedAt: new Date() }
        );
    }

    // Areas
    async addArea(diagramId: string, area: Partial<AreaEntity>) {
        await this.areas.save({
            ...area,
            diagramId,
            version: 0,
            deletedAt: null,
        } as AreaEntity);
        // See addTable's comment — seeds the collab client's version map.
        return 0;
    }

    async getArea(diagramId: string, id: string) {
        return (
            (await this.areas.findOneBy({
                id,
                diagramId,
                deletedAt: IsNull(),
            })) ?? undefined
        );
    }

    async updateArea(
        id: string,
        attributes: Partial<AreaEntity>,
        expectedVersion?: number
    ) {
        return this.versionedUpdate(this.areas, id, attributes, expectedVersion);
    }

    async deleteArea(
        diagramId: string,
        id: string,
        expectedVersion?: number
    ) {
        return this.versionedUpdate(
            this.areas,
            id,
            { deletedAt: new Date(), diagramId } as Partial<AreaEntity>,
            expectedVersion
        );
    }

    async listAreas(diagramId: string) {
        return await this.areas.findBy({ diagramId, deletedAt: IsNull() });
    }

    async deleteDiagramAreas(diagramId: string) {
        await this.areas.update({ diagramId }, { deletedAt: new Date() });
    }

    // Custom types
    async addCustomType(
        diagramId: string,
        customType: Partial<CustomTypeEntity>
    ) {
        await this.customTypes.save({
            ...customType,
            diagramId,
            version: 0,
            deletedAt: null,
        } as CustomTypeEntity);
        // See addTable's comment — seeds the collab client's version map.
        return 0;
    }

    async getCustomType(diagramId: string, id: string) {
        return (
            (await this.customTypes.findOneBy({
                id,
                diagramId,
                deletedAt: IsNull(),
            })) ?? undefined
        );
    }

    async updateCustomType(
        id: string,
        attributes: Partial<CustomTypeEntity>,
        expectedVersion?: number
    ) {
        return this.versionedUpdate(
            this.customTypes,
            id,
            attributes,
            expectedVersion
        );
    }

    async deleteCustomType(
        diagramId: string,
        id: string,
        expectedVersion?: number
    ) {
        return this.versionedUpdate(
            this.customTypes,
            id,
            { deletedAt: new Date(), diagramId } as Partial<CustomTypeEntity>,
            expectedVersion
        );
    }

    async listCustomTypes(diagramId: string) {
        return await this.customTypes.find({
            where: { diagramId, deletedAt: IsNull() },
            order: { name: 'ASC' },
        });
    }

    async deleteDiagramCustomTypes(diagramId: string) {
        await this.customTypes.update({ diagramId }, { deletedAt: new Date() });
    }

    // Notes
    async addNote(diagramId: string, note: Partial<NoteEntity>) {
        await this.notes.save({
            ...note,
            diagramId,
            version: 0,
            deletedAt: null,
        } as NoteEntity);
        // See addTable's comment — seeds the collab client's version map.
        return 0;
    }

    async getNote(diagramId: string, id: string) {
        return (
            (await this.notes.findOneBy({
                id,
                diagramId,
                deletedAt: IsNull(),
            })) ?? undefined
        );
    }

    async updateNote(
        id: string,
        attributes: Partial<NoteEntity>,
        expectedVersion?: number
    ) {
        return this.versionedUpdate(this.notes, id, attributes, expectedVersion);
    }

    async deleteNote(
        diagramId: string,
        id: string,
        expectedVersion?: number
    ) {
        return this.versionedUpdate(
            this.notes,
            id,
            { deletedAt: new Date(), diagramId } as Partial<NoteEntity>,
            expectedVersion
        );
    }

    async listNotes(diagramId: string) {
        return await this.notes.findBy({ diagramId, deletedAt: IsNull() });
    }

    async deleteDiagramNotes(diagramId: string) {
        await this.notes.update({ diagramId }, { deletedAt: new Date() });
    }

    // Diagrams
    async addDiagram(diagram: DiagramEntity & Record<string, unknown>) {
        const diagramRow: Partial<DiagramEntity> = {};
        for (const key of DIAGRAM_COLUMNS) {
            if (diagram[key] !== undefined)
                (diagramRow as Record<string, unknown>)[key] = diagram[key];
        }
        await this.diagrams.save({
            ...diagramRow,
            version: 0,
            deletedAt: null,
        } as DiagramEntity);

        const id = diagram.id;
        await Promise.all([
            ...((diagram.tables as TableEntity[]) ?? []).map((table) =>
                this.addTable(id, table)
            ),
            ...((diagram.relationships as RelationshipEntity[]) ?? []).map(
                (relationship) => this.addRelationship(id, relationship)
            ),
            ...((diagram.dependencies as DependencyEntity[]) ?? []).map(
                (dependency) => this.addDependency(id, dependency)
            ),
            ...((diagram.areas as AreaEntity[]) ?? []).map((area) =>
                this.addArea(id, area)
            ),
            ...((diagram.customTypes as CustomTypeEntity[]) ?? []).map(
                (customType) => this.addCustomType(id, customType)
            ),
            ...((diagram.notes as NoteEntity[]) ?? []).map((note) =>
                this.addNote(id, note)
            ),
        ]);
    }

    private async hydrate(
        diagram: DiagramEntity,
        options?: DiagramIncludeOptions
    ) {
        const result: DiagramEntity & Record<string, unknown> = { ...diagram };

        if (options?.includeTables)
            result.tables = await this.listTables(diagram.id);
        if (options?.includeRelationships)
            result.relationships = await this.listRelationships(diagram.id);
        if (options?.includeDependencies)
            result.dependencies = await this.listDependencies(diagram.id);
        if (options?.includeAreas)
            result.areas = await this.listAreas(diagram.id);
        if (options?.includeCustomTypes)
            result.customTypes = await this.listCustomTypes(diagram.id);
        if (options?.includeNotes)
            result.notes = await this.listNotes(diagram.id);

        return result;
    }

    async listDiagrams(options?: DiagramIncludeOptions) {
        const diagrams = await this.diagrams.findBy({ deletedAt: IsNull() });
        return await Promise.all(
            diagrams.map((diagram) => this.hydrate(diagram, options))
        );
    }

    async getDiagram(id: string, options?: DiagramIncludeOptions) {
        const diagram = await this.diagrams.findOneBy({
            id,
            deletedAt: IsNull(),
        });
        if (!diagram) return undefined;
        return await this.hydrate(diagram, options);
    }

    async updateDiagram(
        id: string,
        attributes: Partial<DiagramEntity>,
        expectedVersion?: number
    ) {
        const diagramRow: Partial<DiagramEntity> = {};
        for (const key of DIAGRAM_COLUMNS) {
            if ((attributes as Record<string, unknown>)[key] !== undefined) {
                (diagramRow as Record<string, unknown>)[key] = (
                    attributes as Record<string, unknown>
                )[key];
            }
        }
        // Was a plain unconditional update — two users changing diagram-level
        // settings (rename, databaseType, databaseEdition) at the same time
        // silently last-write-won with no conflict, no correction, since
        // DiagramEntity had no version column to check. Now guarded like
        // every other entity's write.
        const newVersion = await this.versionedUpdate(
            this.diagrams,
            id,
            diagramRow,
            expectedVersion
        );

        if (attributes.id && attributes.id !== id) {
            const newId = attributes.id;
            await Promise.all([
                this.tables.update({ diagramId: id }, { diagramId: newId }),
                this.fields.update({ diagramId: id }, { diagramId: newId }),
                this.relationships.update(
                    { diagramId: id },
                    { diagramId: newId }
                ),
                this.dependencies.update(
                    { diagramId: id },
                    { diagramId: newId }
                ),
                this.areas.update({ diagramId: id }, { diagramId: newId }),
                this.customTypes.update(
                    { diagramId: id },
                    { diagramId: newId }
                ),
                this.notes.update({ diagramId: id }, { diagramId: newId }),
            ]);
        }
        return newVersion;
    }

    async deleteDiagram(id: string) {
        const deletedAt = new Date();
        await Promise.all([
            this.diagrams.update(id, { deletedAt }),
            this.tables.update({ diagramId: id }, { deletedAt }),
            this.fields.update({ diagramId: id }, { deletedAt }),
            this.relationships.update({ diagramId: id }, { deletedAt }),
            this.dependencies.update({ diagramId: id }, { deletedAt }),
            this.areas.update({ diagramId: id }, { deletedAt }),
            this.customTypes.update({ diagramId: id }, { deletedAt }),
            this.notes.update({ diagramId: id }, { deletedAt }),
        ]);
    }

    // Groups
    private async assertNameAvailable(name: string, excludeId?: string) {
        const existing = await this.groups.findOneBy({
            name: ILike(name),
            deletedAt: IsNull(),
            ...(excludeId ? { id: Not(excludeId) } : {}),
        });
        if (existing) {
            throw new ConflictException(`Group "${name}" already exists`);
        }
    }

    async addGroup(group: Partial<GroupEntity>) {
        await this.assertNameAvailable(group.name!);
        await this.groups.save({
            ...group,
            deletedAt: null,
        } as GroupEntity);
    }

    async listGroups() {
        return await this.groups.findBy({ deletedAt: IsNull() });
    }

    async updateGroup(id: string, attributes: Partial<GroupEntity>) {
        if (attributes.name) {
            await this.assertNameAvailable(attributes.name, id);
        }
        await this.groups.update(id, attributes);
    }

    async deleteGroup(id: string) {
        await this.groups.update(id, { deletedAt: new Date() });
        await this.diagrams.update({ groupId: id }, { groupId: null });
    }
}
