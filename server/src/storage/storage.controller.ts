import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Patch,
    Post,
    Put,
    Query,
} from '@nestjs/common';
import { StorageService } from './storage.service';
import type { DiagramIncludeOptions } from './storage.service';

function parseIncludeOptions(
    query: Record<string, string>
): DiagramIncludeOptions {
    return {
        includeTables: query.includeTables === 'true',
        includeRelationships: query.includeRelationships === 'true',
        includeDependencies: query.includeDependencies === 'true',
        includeAreas: query.includeAreas === 'true',
        includeCustomTypes: query.includeCustomTypes === 'true',
        includeNotes: query.includeNotes === 'true',
    };
}

@Controller()
export class StorageController {
    constructor(private readonly storage: StorageService) {}

    // Config
    @Get('config')
    getConfig() {
        return this.storage.getConfig();
    }

    @Patch('config')
    updateConfig(@Body() body: Record<string, unknown>) {
        return this.storage.updateConfig(body);
    }

    // Diagram filter
    @Get('diagrams/:diagramId/filter')
    getDiagramFilter(@Param('diagramId') diagramId: string) {
        return this.storage.getDiagramFilter(diagramId);
    }

    @Put('diagrams/:diagramId/filter')
    updateDiagramFilter(
        @Param('diagramId') diagramId: string,
        @Body() body: Record<string, unknown>
    ) {
        return this.storage.updateDiagramFilter(diagramId, body);
    }

    @Delete('diagrams/:diagramId/filter')
    @HttpCode(204)
    deleteDiagramFilter(@Param('diagramId') diagramId: string) {
        return this.storage.deleteDiagramFilter(diagramId);
    }

    // Diagrams
    @Post('diagrams')
    addDiagram(@Body() body: Record<string, unknown>) {
        return this.storage.addDiagram(body as never);
    }

    @Get('diagrams')
    listDiagrams(@Query() query: Record<string, string>) {
        return this.storage.listDiagrams(parseIncludeOptions(query));
    }

    @Get('diagrams/:id')
    getDiagram(
        @Param('id') id: string,
        @Query() query: Record<string, string>
    ) {
        return this.storage.getDiagram(id, parseIncludeOptions(query));
    }

    @Patch('diagrams/:id')
    updateDiagram(
        @Param('id') id: string,
        @Body() body: Record<string, unknown>
    ) {
        return this.storage.updateDiagram(id, body);
    }

    @Delete('diagrams/:id')
    @HttpCode(204)
    deleteDiagram(@Param('id') id: string) {
        return this.storage.deleteDiagram(id);
    }

    // Tables
    @Post('diagrams/:diagramId/tables')
    addTable(
        @Param('diagramId') diagramId: string,
        @Body() body: Record<string, unknown>
    ) {
        return this.storage.addTable(diagramId, body);
    }

    @Get('diagrams/:diagramId/tables/:id')
    getTable(@Param('diagramId') diagramId: string, @Param('id') id: string) {
        return this.storage.getTable(diagramId, id);
    }

    @Patch('tables/:id')
    updateTable(
        @Param('id') id: string,
        @Body() body: Record<string, unknown>
    ) {
        return this.storage.updateTable(id, body);
    }

    @Put('diagrams/:diagramId/tables/:id')
    putTable(
        @Param('diagramId') diagramId: string,
        @Body() body: Record<string, unknown>
    ) {
        return this.storage.putTable(diagramId, body as never);
    }

    @Delete('diagrams/:diagramId/tables/:id')
    @HttpCode(204)
    deleteTable(
        @Param('diagramId') diagramId: string,
        @Param('id') id: string
    ) {
        return this.storage.deleteTable(diagramId, id);
    }

    @Get('diagrams/:diagramId/tables')
    listTables(@Param('diagramId') diagramId: string) {
        return this.storage.listTables(diagramId);
    }

    @Delete('diagrams/:diagramId/tables')
    @HttpCode(204)
    deleteDiagramTables(@Param('diagramId') diagramId: string) {
        return this.storage.deleteDiagramTables(diagramId);
    }

    // Relationships
    @Post('diagrams/:diagramId/relationships')
    addRelationship(
        @Param('diagramId') diagramId: string,
        @Body() body: Record<string, unknown>
    ) {
        return this.storage.addRelationship(diagramId, body);
    }

    @Get('diagrams/:diagramId/relationships/:id')
    getRelationship(
        @Param('diagramId') diagramId: string,
        @Param('id') id: string
    ) {
        return this.storage.getRelationship(diagramId, id);
    }

    @Patch('relationships/:id')
    updateRelationship(
        @Param('id') id: string,
        @Body() body: Record<string, unknown>
    ) {
        return this.storage.updateRelationship(id, body);
    }

    @Delete('diagrams/:diagramId/relationships/:id')
    @HttpCode(204)
    deleteRelationship(
        @Param('diagramId') diagramId: string,
        @Param('id') id: string
    ) {
        return this.storage.deleteRelationship(diagramId, id);
    }

    @Get('diagrams/:diagramId/relationships')
    listRelationships(@Param('diagramId') diagramId: string) {
        return this.storage.listRelationships(diagramId);
    }

    @Delete('diagrams/:diagramId/relationships')
    @HttpCode(204)
    deleteDiagramRelationships(@Param('diagramId') diagramId: string) {
        return this.storage.deleteDiagramRelationships(diagramId);
    }

    // Dependencies
    @Post('diagrams/:diagramId/dependencies')
    addDependency(
        @Param('diagramId') diagramId: string,
        @Body() body: Record<string, unknown>
    ) {
        return this.storage.addDependency(diagramId, body);
    }

    @Get('diagrams/:diagramId/dependencies/:id')
    getDependency(
        @Param('diagramId') diagramId: string,
        @Param('id') id: string
    ) {
        return this.storage.getDependency(diagramId, id);
    }

    @Patch('dependencies/:id')
    updateDependency(
        @Param('id') id: string,
        @Body() body: Record<string, unknown>
    ) {
        return this.storage.updateDependency(id, body);
    }

    @Delete('diagrams/:diagramId/dependencies/:id')
    @HttpCode(204)
    deleteDependency(
        @Param('diagramId') diagramId: string,
        @Param('id') id: string
    ) {
        return this.storage.deleteDependency(diagramId, id);
    }

    @Get('diagrams/:diagramId/dependencies')
    listDependencies(@Param('diagramId') diagramId: string) {
        return this.storage.listDependencies(diagramId);
    }

    @Delete('diagrams/:diagramId/dependencies')
    @HttpCode(204)
    deleteDiagramDependencies(@Param('diagramId') diagramId: string) {
        return this.storage.deleteDiagramDependencies(diagramId);
    }

    // Areas
    @Post('diagrams/:diagramId/areas')
    addArea(
        @Param('diagramId') diagramId: string,
        @Body() body: Record<string, unknown>
    ) {
        return this.storage.addArea(diagramId, body);
    }

    @Get('diagrams/:diagramId/areas/:id')
    getArea(@Param('diagramId') diagramId: string, @Param('id') id: string) {
        return this.storage.getArea(diagramId, id);
    }

    @Patch('areas/:id')
    updateArea(@Param('id') id: string, @Body() body: Record<string, unknown>) {
        return this.storage.updateArea(id, body);
    }

    @Delete('diagrams/:diagramId/areas/:id')
    @HttpCode(204)
    deleteArea(@Param('diagramId') diagramId: string, @Param('id') id: string) {
        return this.storage.deleteArea(diagramId, id);
    }

    @Get('diagrams/:diagramId/areas')
    listAreas(@Param('diagramId') diagramId: string) {
        return this.storage.listAreas(diagramId);
    }

    @Delete('diagrams/:diagramId/areas')
    @HttpCode(204)
    deleteDiagramAreas(@Param('diagramId') diagramId: string) {
        return this.storage.deleteDiagramAreas(diagramId);
    }

    // Custom types
    @Post('diagrams/:diagramId/custom-types')
    addCustomType(
        @Param('diagramId') diagramId: string,
        @Body() body: Record<string, unknown>
    ) {
        return this.storage.addCustomType(diagramId, body);
    }

    @Get('diagrams/:diagramId/custom-types/:id')
    getCustomType(
        @Param('diagramId') diagramId: string,
        @Param('id') id: string
    ) {
        return this.storage.getCustomType(diagramId, id);
    }

    @Patch('custom-types/:id')
    updateCustomType(
        @Param('id') id: string,
        @Body() body: Record<string, unknown>
    ) {
        return this.storage.updateCustomType(id, body);
    }

    @Delete('diagrams/:diagramId/custom-types/:id')
    @HttpCode(204)
    deleteCustomType(
        @Param('diagramId') diagramId: string,
        @Param('id') id: string
    ) {
        return this.storage.deleteCustomType(diagramId, id);
    }

    @Get('diagrams/:diagramId/custom-types')
    listCustomTypes(@Param('diagramId') diagramId: string) {
        return this.storage.listCustomTypes(diagramId);
    }

    @Delete('diagrams/:diagramId/custom-types')
    @HttpCode(204)
    deleteDiagramCustomTypes(@Param('diagramId') diagramId: string) {
        return this.storage.deleteDiagramCustomTypes(diagramId);
    }

    // Notes
    @Post('diagrams/:diagramId/notes')
    addNote(
        @Param('diagramId') diagramId: string,
        @Body() body: Record<string, unknown>
    ) {
        return this.storage.addNote(diagramId, body);
    }

    @Get('diagrams/:diagramId/notes/:id')
    getNote(@Param('diagramId') diagramId: string, @Param('id') id: string) {
        return this.storage.getNote(diagramId, id);
    }

    @Patch('notes/:id')
    updateNote(@Param('id') id: string, @Body() body: Record<string, unknown>) {
        return this.storage.updateNote(id, body);
    }

    @Delete('diagrams/:diagramId/notes/:id')
    @HttpCode(204)
    deleteNote(@Param('diagramId') diagramId: string, @Param('id') id: string) {
        return this.storage.deleteNote(diagramId, id);
    }

    @Get('diagrams/:diagramId/notes')
    listNotes(@Param('diagramId') diagramId: string) {
        return this.storage.listNotes(diagramId);
    }

    @Delete('diagrams/:diagramId/notes')
    @HttpCode(204)
    deleteDiagramNotes(@Param('diagramId') diagramId: string) {
        return this.storage.deleteDiagramNotes(diagramId);
    }
}
