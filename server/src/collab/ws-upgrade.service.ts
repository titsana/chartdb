import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Hocuspocus } from '@hocuspocus/server';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer } from 'ws';
import { migrate } from '../db/pool';
import { isOriginAllowed, type CollabConfig } from '../config';
import { COLLAB_CONFIG, HOCUSPOCUS, PG_POOL } from './tokens';
import type { Pool } from 'pg';

function toWebRequest(req: IncomingMessage): Request {
    const host = req.headers.host ?? 'localhost';
    const url = `http://${host}${req.url ?? '/'}`;
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
            value.forEach((v) => headers.append(key, v));
        } else {
            headers.set(key, value);
        }
    }
    return new Request(url, { headers });
}

/**
 * Phase 3 (docs/design/realtime-collaboration.md §10): attaches the
 * WebSocket upgrade handling to Nest's own HTTP server (rather than
 * running Hocuspocus's standalone `Server` class, which would need its
 * own port) — one process, one port, matching "single instance only" from
 * §5.3. Runs the (idempotent) schema migration before accepting any
 * connection.
 */
@Injectable()
export class WsUpgradeService implements OnModuleInit {
    private readonly logger = new Logger(WsUpgradeService.name);

    constructor(
        // Explicit @Inject rather than relying on implicit type-based
        // autowiring (design:paramtypes reflection) — found via `npm run
        // dev` (tsx/esbuild) failing this exact param with "undefined
        // dependency" while the compiled `dist/` build (real tsc) worked
        // fine: esbuild's `emitDecoratorMetadata` support is incomplete
        // and doesn't reliably emit this metadata for every param. Every
        // other param here already used an explicit token for other
        // reasons and never had this problem — matching that removes the
        // dependency on that metadata for this one too.
        @Inject(HttpAdapterHost) private readonly httpAdapterHost: HttpAdapterHost,
        @Inject(HOCUSPOCUS) private readonly hocuspocus: Hocuspocus,
        @Inject(COLLAB_CONFIG) private readonly config: CollabConfig,
        @Inject(PG_POOL) private readonly pool: Pool
    ) {}

    async onModuleInit(): Promise<void> {
        await migrate(this.pool);

        const httpServer = this.httpAdapterHost.httpAdapter.getHttpServer();
        const wss = new WebSocketServer({ noServer: true });

        httpServer.on(
            'upgrade',
            (req: IncomingMessage, socket: Duplex, head: Buffer) => {
                const origin = req.headers.origin;
                if (!isOriginAllowed(this.config.originAllowlist, origin)) {
                    this.logger.warn(`rejected connection from origin ${origin}`);
                    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
                    socket.destroy();
                    return;
                }

                wss.handleUpgrade(req, socket, head, (ws) => {
                    // `handleConnection` only registers the connection and
                    // returns a `ClientConnection` — it does NOT attach any
                    // listeners to `ws` itself (confirmed by reading
                    // ClientConnection.ts: no `.on(...)` calls anywhere in
                    // it). Hocuspocus's own `Server` class wires this glue
                    // itself (via crossws's message/close hooks calling
                    // `clientConnection.handleMessage`/`handleClose`); doing
                    // the same here is what actually makes messages reach
                    // Hocuspocus instead of silently going nowhere (the
                    // connection looks "connected" client-side, since the
                    // upgrade itself succeeds, but sync never completes).
                    const clientConnection = this.hocuspocus.handleConnection(
                        ws,
                        toWebRequest(req)
                    );
                    ws.on('message', (data: Buffer) => {
                        clientConnection.handleMessage(new Uint8Array(data));
                    });
                    ws.on('close', (code: number, reason: Buffer) => {
                        clientConnection.handleClose({
                            code,
                            reason: reason.toString(),
                        });
                    });
                });
            }
        );

        this.logger.log(
            `collaboration WebSocket ready (origin allowlist: ${
                this.config.originAllowlist.length === 0
                    ? '*'
                    : this.config.originAllowlist.join(', ')
            })`
        );
    }
}
