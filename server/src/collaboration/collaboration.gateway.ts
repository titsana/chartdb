import {
    ConnectedSocket,
    MessageBody,
    OnGatewayConnection,
    OnGatewayDisconnect,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
} from '@nestjs/websockets';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Server, Socket } from 'socket.io';
import { StorageService } from '../storage/storage.service';

interface Presence {
    name: string;
    color: string;
}

interface OpMessage {
    diagramId: string;
    op: string;
    args: Record<string, unknown>;
}

interface DragMessage {
    diagramId: string;
    tableId: string;
    x: number;
    y: number;
}

type OpHandler = (args: Record<string, unknown>) => Promise<unknown>;

// Same write surface StorageController exposes over REST, using the exact
// param names the client's StorageContext methods already take (see
// src/context/storage-context/storage-context.tsx) — the client sends its
// params object as-is instead of building a REST request from it.
function buildOpHandlers(storage: StorageService): Record<string, OpHandler> {
    return {
        addTable: ({ diagramId, table }) =>
            storage.addTable(diagramId as string, table as never),
        updateTable: ({ id, attributes }) =>
            storage.updateTable(id as string, attributes as never),
        putTable: ({ diagramId, table }) =>
            storage.putTable(diagramId as string, table as never),
        deleteTable: ({ diagramId, id }) =>
            storage.deleteTable(diagramId as string, id as string),
        addRelationship: ({ diagramId, relationship }) =>
            storage.addRelationship(diagramId as string, relationship as never),
        updateRelationship: ({ id, attributes }) =>
            storage.updateRelationship(id as string, attributes as never),
        deleteRelationship: ({ diagramId, id }) =>
            storage.deleteRelationship(diagramId as string, id as string),
        addDependency: ({ diagramId, dependency }) =>
            storage.addDependency(diagramId as string, dependency as never),
        updateDependency: ({ id, attributes }) =>
            storage.updateDependency(id as string, attributes as never),
        deleteDependency: ({ diagramId, id }) =>
            storage.deleteDependency(diagramId as string, id as string),
        addArea: ({ diagramId, area }) =>
            storage.addArea(diagramId as string, area as never),
        updateArea: ({ id, attributes }) =>
            storage.updateArea(id as string, attributes as never),
        deleteArea: ({ diagramId, id }) =>
            storage.deleteArea(diagramId as string, id as string),
        addCustomType: ({ diagramId, customType }) =>
            storage.addCustomType(diagramId as string, customType as never),
        updateCustomType: ({ id, attributes }) =>
            storage.updateCustomType(id as string, attributes as never),
        deleteCustomType: ({ diagramId, id }) =>
            storage.deleteCustomType(diagramId as string, id as string),
        addNote: ({ diagramId, note }) =>
            storage.addNote(diagramId as string, note as never),
        updateNote: ({ id, attributes }) =>
            storage.updateNote(id as string, attributes as never),
        deleteNote: ({ diagramId, id }) =>
            storage.deleteNote(diagramId as string, id as string),
        updateDiagram: ({ id, attributes }) =>
            storage.updateDiagram(id as string, attributes as never),
    };
}

function decodeJwtPayload(token: string): Record<string, unknown> | undefined {
    try {
        const payload = token.split('.')[1];
        return JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    } catch {
        return undefined;
    }
}

@Injectable()
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class CollaborationGateway
    implements OnGatewayConnection, OnGatewayDisconnect
{
    @WebSocketServer()
    server!: Server;

    // diagramId -> socketId -> presence. In-memory, single-instance only —
    // add a Redis-backed adapter if this ever needs to run behind >1 process.
    private readonly rooms = new Map<string, Map<string, Presence>>();
    private readonly ops: Record<string, OpHandler>;

    constructor(
        private readonly storage: StorageService,
        private readonly config: ConfigService
    ) {
        this.ops = buildOpHandlers(storage);
    }

    private isAzureAdEnabled(): boolean {
        return Boolean(
            this.config.get<string>('AZURE_AD_TENANT_ID') &&
                this.config.get<string>('AZURE_AD_CLIENT_ID')
        );
    }

    // ponytail: identity is best-effort — decodes the Azure AD JWT payload for
    // a display name without re-verifying the signature (real verification
    // needs a JWKS client wired into the handshake, not just HTTP passport
    // middleware). A socket must still present *some* token when Azure AD is
    // enabled (see handleConnection), matching today's REST boundary; upgrade
    // to full verification if WS presence ever needs to gate real access
    // rather than just label avatars.
    private resolvePresence(client: Socket): Presence {
        const auth = client.handshake.auth as {
            name?: string;
            color?: string;
            token?: string;
        };
        if (this.isAzureAdEnabled() && auth.token) {
            const claims = decodeJwtPayload(auth.token);
            const name = (claims?.name as string) ?? auth.name ?? 'Anonymous';
            return { name, color: auth.color ?? '#888888' };
        }
        return { name: auth.name ?? 'Anonymous', color: auth.color ?? '#888888' };
    }

    handleConnection(client: Socket) {
        const diagramId = client.handshake.query.diagramId as string;
        const auth = client.handshake.auth as { token?: string };
        if (!diagramId || (this.isAzureAdEnabled() && !auth.token)) {
            client.disconnect(true);
            return;
        }

        client.join(diagramId);
        const presence = this.resolvePresence(client);
        if (!this.rooms.has(diagramId)) this.rooms.set(diagramId, new Map());
        this.rooms.get(diagramId)!.set(client.id, presence);

        client
            .to(diagramId)
            .emit('presence:join', { socketId: client.id, ...presence });
        client.emit(
            'presence:list',
            Array.from(this.rooms.get(diagramId)!.entries()).map(
                ([socketId, p]) => ({ socketId, ...p })
            )
        );
    }

    handleDisconnect(client: Socket) {
        const diagramId = client.handshake.query.diagramId as string;
        const room = diagramId ? this.rooms.get(diagramId) : undefined;
        if (!room) return;
        room.delete(client.id);
        if (room.size === 0) this.rooms.delete(diagramId);
        client.to(diagramId).emit('presence:leave', { socketId: client.id });
    }

    @SubscribeMessage('op')
    async handleOp(
        @ConnectedSocket() client: Socket,
        @MessageBody() message: OpMessage
    ) {
        const handler = this.ops[message.op];
        if (!handler) return { ok: false, error: `Unknown op: ${message.op}` };
        try {
            await handler(message.args);
        } catch (err) {
            return { ok: false, error: (err as Error).message };
        }
        client.to(message.diagramId).emit('op', message);
        return { ok: true };
    }

    // Broadcast-only — never persisted, used purely for live drag preview.
    @SubscribeMessage('drag')
    handleDrag(
        @ConnectedSocket() client: Socket,
        @MessageBody() message: DragMessage
    ) {
        client.to(message.diagramId).emit('drag', message);
    }
}
