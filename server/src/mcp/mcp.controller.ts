import {
    Controller,
    Delete,
    Get,
    Inject,
    Post,
    Req,
    Res,
} from '@nestjs/common';
import type { Hocuspocus } from '@hocuspocus/server';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Pool } from 'pg';
import { HOCUSPOCUS, PG_POOL } from '../collab/tokens';
import { createMcpServer } from './mcp-tools';

/**
 * MCP (Streamable HTTP, stateless) at POST /api/mcp. A fresh server and
 * transport per request, as the SDK's stateless example does — there's no
 * per-session state worth keeping. Covered by the global EntraAuthGuard
 * like every other route: in azure-ad mode that guard is the ONLY gate,
 * since Hocuspocus direct connections skip `onAuthenticate`. Never mark
 * this @Public().
 */
@Controller('mcp')
export class McpController {
    constructor(
        @Inject(PG_POOL) private readonly pool: Pool,
        @Inject(HOCUSPOCUS) private readonly hocuspocus: Hocuspocus
    ) {}

    @Post()
    async handle(
        @Req() req: IncomingMessage & { body?: unknown },
        @Res() res: ServerResponse
    ): Promise<void> {
        const server = createMcpServer(this.pool, this.hocuspocus);
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
        });
        res.on('close', () => {
            void transport.close();
            void server.close();
        });
        await server.connect(transport);
        // Nest already parsed the JSON body; hand it over instead of letting
        // the transport try to re-read a consumed stream.
        await transport.handleRequest(req, res, req.body);
    }

    // Stateless: no SSE stream to GET, no session to DELETE. The Streamable
    // HTTP spec wants 405 here (Nest's default would be 404).
    @Get()
    @Delete()
    methodNotAllowed(@Res() res: ServerResponse): void {
        res.writeHead(405, {
            Allow: 'POST',
            'Content-Type': 'application/json',
        }).end(
            JSON.stringify({
                jsonrpc: '2.0',
                error: { code: -32000, message: 'Method not allowed.' },
                id: null,
            })
        );
    }
}
