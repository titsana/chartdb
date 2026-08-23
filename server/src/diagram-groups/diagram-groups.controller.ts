import {
    Body,
    ConflictException,
    Controller,
    Delete,
    Get,
    Inject,
    NotFoundException,
    Param,
    Patch,
    Post,
} from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../collab/tokens';
import {
    createDiagramGroup,
    deleteDiagramGroup,
    listDiagramGroups,
    updateDiagramGroup,
    type CreateDiagramGroupInput,
} from '../db/diagram-groups';

/**
 * Folder-style diagram grouping (docs/design/realtime-collaboration.md
 * §10, Phase 7 follow-on) — a real entity, separate from a diagram's own
 * metadata (see diagrams.controller.ts), which references a group only by
 * id (`group_id`, nullable). This controller never touches
 * `collab_diagrams` itself; assigning a diagram to a group is
 * `PATCH /diagrams/:id { groupId }`.
 */
@Controller('diagram-groups')
export class DiagramGroupsController {
    constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

    @Get()
    async list() {
        return listDiagramGroups(this.pool);
    }

    @Post()
    async create(@Body() body: CreateDiagramGroupInput) {
        const created = await createDiagramGroup(this.pool, body);
        if (!created) {
            throw new ConflictException(`group ${body.id} already exists`);
        }
        return created;
    }

    @Patch(':id')
    async update(@Param('id') id: string, @Body() body: { name: string }) {
        const updated = await updateDiagramGroup(this.pool, id, body.name);
        if (!updated) {
            throw new NotFoundException(`group ${id} not found`);
        }
        return updated;
    }

    @Delete(':id')
    async remove(@Param('id') id: string) {
        const existed = await deleteDiagramGroup(this.pool, id);
        if (!existed) {
            throw new NotFoundException(`group ${id} not found`);
        }
        return { status: 'ok' };
    }
}
