import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, type Repository } from 'typeorm';
import { DiagramEntity } from '../entities/diagram.entity';
import { TableEntity } from '../entities/table.entity';
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
        private readonly diagramFilters: Repository<DiagramFilterEntity>
    ) {}

    // ponytail: mirrors the Dexie client's dexieDB.on('ready') seed — the
    // client's useDiagramLoader treats config===undefined as "still loading",
    // so a config row must always exist after first boot or it hangs forever
    async onModuleInit() {
        const existing = await this.config.findOneBy({ id: 1 });
        if (!existing) {
            await this.config.insert({ id: 1, defaultDiagramId: '' });
        }
    }

    // Config
    async getConfig() {
        return (await this.config.findOneBy({ id: 1 })) ?? undefined;
    }

    async updateConfig(attributes: Partial<ConfigEntity>) {
        await this.config.update(1, attributes);
    }

    // Diagram filter
    async getDiagramFilter(diagramId: string) {
        return (
            (await this.diagramFilters.findOneBy({ diagramId })) ?? undefined
        );
    }

    async updateDiagramFilter(
        diagramId: string,
        filter: Partial<DiagramFilterEntity>
    ) {
        await this.diagramFilters.save({ diagramId, ...filter });
    }

    async deleteDiagramFilter(diagramId: string) {
        await this.diagramFilters.delete({ diagramId });
    }

    // Tables
    async addTable(diagramId: string, table: Partial<TableEntity>) {
        await this.tables.insert({ ...table, diagramId } as TableEntity);
    }

    async getTable(diagramId: string, id: string) {
        return (
            (await this.tables.findOneBy({
                id,
                diagramId,
                deletedAt: IsNull(),
            })) ?? undefined
        );
    }

    async updateTable(id: string, attributes: Partial<TableEntity>) {
        await this.tables.update(id, attributes);
    }

    async putTable(diagramId: string, table: TableEntity) {
        await this.tables.save({ ...table, diagramId });
    }

    async deleteTable(diagramId: string, id: string) {
        await this.tables.update({ id, diagramId }, { deletedAt: new Date() });
    }

    async listTables(diagramId: string) {
        return await this.tables.findBy({ diagramId, deletedAt: IsNull() });
    }

    async deleteDiagramTables(diagramId: string) {
        await this.tables.update({ diagramId }, { deletedAt: new Date() });
    }

    // Relationships
    async addRelationship(
        diagramId: string,
        relationship: Partial<RelationshipEntity>
    ) {
        await this.relationships.insert({
            ...relationship,
            diagramId,
        } as RelationshipEntity);
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
        attributes: Partial<RelationshipEntity>
    ) {
        await this.relationships.update(id, attributes);
    }

    async deleteRelationship(diagramId: string, id: string) {
        await this.relationships.update(
            { id, diagramId },
            { deletedAt: new Date() }
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
        await this.dependencies.insert({
            ...dependency,
            diagramId,
        } as DependencyEntity);
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

    async updateDependency(id: string, attributes: Partial<DependencyEntity>) {
        await this.dependencies.update(id, attributes);
    }

    async deleteDependency(diagramId: string, id: string) {
        await this.dependencies.update(
            { id, diagramId },
            { deletedAt: new Date() }
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
        await this.areas.insert({ ...area, diagramId } as AreaEntity);
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

    async updateArea(id: string, attributes: Partial<AreaEntity>) {
        await this.areas.update(id, attributes);
    }

    async deleteArea(diagramId: string, id: string) {
        await this.areas.update({ id, diagramId }, { deletedAt: new Date() });
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
        await this.customTypes.insert({
            ...customType,
            diagramId,
        } as CustomTypeEntity);
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

    async updateCustomType(id: string, attributes: Partial<CustomTypeEntity>) {
        await this.customTypes.update(id, attributes);
    }

    async deleteCustomType(diagramId: string, id: string) {
        await this.customTypes.update(
            { id, diagramId },
            { deletedAt: new Date() }
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
        await this.notes.insert({ ...note, diagramId } as NoteEntity);
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

    async updateNote(id: string, attributes: Partial<NoteEntity>) {
        await this.notes.update(id, attributes);
    }

    async deleteNote(diagramId: string, id: string) {
        await this.notes.update({ id, diagramId }, { deletedAt: new Date() });
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
        await this.diagrams.insert(diagramRow as DiagramEntity);

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

    async updateDiagram(id: string, attributes: Partial<DiagramEntity>) {
        const diagramRow: Partial<DiagramEntity> = {};
        for (const key of DIAGRAM_COLUMNS) {
            if ((attributes as Record<string, unknown>)[key] !== undefined) {
                (diagramRow as Record<string, unknown>)[key] = (
                    attributes as Record<string, unknown>
                )[key];
            }
        }
        await this.diagrams.update(id, diagramRow);

        if (attributes.id && attributes.id !== id) {
            const newId = attributes.id;
            await Promise.all([
                this.tables.update({ diagramId: id }, { diagramId: newId }),
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
    }

    async deleteDiagram(id: string) {
        const deletedAt = new Date();
        await Promise.all([
            this.diagrams.update(id, { deletedAt }),
            this.tables.update({ diagramId: id }, { deletedAt }),
            this.relationships.update({ diagramId: id }, { deletedAt }),
            this.dependencies.update({ diagramId: id }, { deletedAt }),
            this.areas.update({ diagramId: id }, { deletedAt }),
            this.customTypes.update({ diagramId: id }, { deletedAt }),
            this.notes.update({ diagramId: id }, { deletedAt }),
        ]);
    }
}
