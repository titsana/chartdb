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
import type { Hocuspocus } from '@hocuspocus/server';
import type { Pool } from 'pg';
import { HOCUSPOCUS, PG_POOL } from '../collab/tokens';
import {
    createDiagram,
    deleteDiagram,
    getDiagram,
    listDiagrams,
    updateDiagram,
    type CreateDiagramInput,
    type UpdateDiagramInput,
} from '../db/diagrams';

/**
 * Phase 4.5 (docs/design/realtime-collaboration.md §10): the diagram-
 * discovery/metadata surface that never existed before — "list all
 * diagrams" and "open a diagram by id" both need this now that there's no
 * client-side Dexie to answer them from. Diagram *content* is never read
 * or written here — that's the Y.Doc, reached only through the collab
 * WebSocket (ws-upgrade.service.ts). This controller only ever touches the
 * `diagrams` metadata table.
 */
@Controller('diagrams')
export class DiagramsController {
    constructor(
        @Inject(PG_POOL) private readonly pool: Pool,
        @Inject(HOCUSPOCUS) private readonly hocuspocus: Hocuspocus
    ) {}

    @Get()
    async list() {
        return listDiagrams(this.pool);
    }

    @Get(':id')
    async get(@Param('id') id: string) {
        const diagram = await getDiagram(this.pool, id);
        if (!diagram) {
            throw new NotFoundException(`diagram ${id} not found`);
        }
        return diagram;
    }

    @Post()
    async create(@Body() body: CreateDiagramInput) {
        const created = await createDiagram(this.pool, body);
        if (!created) {
            throw new ConflictException(`diagram ${body.id} already exists`);
        }
        return created;
    }

    @Patch(':id')
    async update(@Param('id') id: string, @Body() body: UpdateDiagramInput) {
        const updated = await updateDiagram(this.pool, id, body);
        if (!updated) {
            throw new NotFoundException(`diagram ${id} not found`);
        }
        return updated;
    }

    @Delete(':id')
    async remove(@Param('id') id: string) {
        // Evict any live connections FIRST — best-effort, not what makes
        // this safe. The FK (pool.ts's migrate()) is what actually
        // prevents a still-connected client's next write from resurrecting
        // this diagram: deleteDiagram's cascade removes yjs_updates/
        // yjs_snapshots atomically with the metadata row below, and any
        // write that lands afterward fails the FK outright regardless of
        // whether this eviction call already ran or is still in flight.
        this.hocuspocus.closeConnections(id);

        const existed = await deleteDiagram(this.pool, id);
        if (!existed) {
            throw new NotFoundException(`diagram ${id} not found`);
        }
        return { status: 'ok' };
    }
}
