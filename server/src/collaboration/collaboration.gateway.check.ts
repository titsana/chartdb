// ponytail: no test framework in this package — a runnable assert script is
// the smallest thing that fails if the conflict-routing logic breaks.
// Run with: npx ts-node src/collaboration/collaboration.gateway.check.ts
import 'reflect-metadata';
import { ConflictException } from '@nestjs/common';
import { CollaborationGateway } from './collaboration.gateway';
import type { StorageService } from '../storage/storage.service';

function assert(cond: unknown, msg: string): asserts cond {
    if (!cond) throw new Error(`FAIL: ${msg}`);
}

function fakeSocket() {
    const emitted: Array<{ event: string; payload: unknown }> = [];
    const broadcast: Array<{ event: string; payload: unknown }> = [];
    return {
        emitted,
        broadcast,
        socket: {
            emit: (event: string, payload: unknown) =>
                emitted.push({ event, payload }),
            to: () => ({
                emit: (event: string, payload: unknown) =>
                    broadcast.push({ event, payload }),
            }),
        },
    };
}

async function main() {
    // 1. Stale write: storage throws ConflictException with the current row.
    {
        const storage = {
            updateTable: async () => {
                throw new ConflictException({
                    message: 'version-mismatch',
                    current: { id: 't1', version: 3, name: 'server-name' },
                });
            },
        } as unknown as StorageService;
        const gateway = new CollaborationGateway(storage, {
            get: () => undefined,
        } as never);
        const { socket, emitted, broadcast } = fakeSocket();

        const ack = await gateway.handleOp(socket as never, {
            diagramId: 'd1',
            op: 'updateTable',
            args: { id: 't1', attributes: { name: 'my-stale-name' }, version: 1 },
        });

        assert(ack.ok === false, 'stale write must not ack ok');
        assert(broadcast.length === 0, 'stale write must not broadcast to room');
        assert(emitted.length === 1, 'stale write must emit exactly one correction');
        assert(
            emitted[0].event === 'op:rejected',
            'correction must be op:rejected'
        );
        const payload = emitted[0].payload as {
            args: { id: string; attributes: { name: string } };
            version: number;
        };
        assert(
            payload.args.attributes.name === 'server-name',
            'correction must carry the server-authoritative value, not the stale write'
        );
        assert(payload.version === 3, 'correction must carry current version');
    }

    // 2. Successful write: broadcasts to the room with the new version, acks ok.
    {
        const storage = {
            updateTable: async () => 4, // versionedUpdate's return value
        } as unknown as StorageService;
        const gateway = new CollaborationGateway(storage, {
            get: () => undefined,
        } as never);
        const { socket, emitted, broadcast } = fakeSocket();

        const ack = await gateway.handleOp(socket as never, {
            diagramId: 'd1',
            op: 'updateTable',
            args: { id: 't1', attributes: { name: 'new-name' }, version: 3 },
        });

        assert(ack.ok === true, 'successful write must ack ok');
        assert(emitted.length === 0, 'successful write must not correct the sender');
        assert(broadcast.length === 1, 'successful write must broadcast once');
        const payload = broadcast[0].payload as { newVersion: number };
        assert(payload.newVersion === 4, 'broadcast must carry the new version');
    }

    console.log('OK: collaboration.gateway conflict routing behaves correctly');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
