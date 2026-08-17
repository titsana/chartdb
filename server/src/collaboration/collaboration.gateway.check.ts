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
            data: { diagramId: 'd1' },
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
            attempted: { id: string; attributes: { name: string } };
        };
        assert(
            payload.args.attributes.name === 'server-name',
            'correction must carry the server-authoritative value, not the stale write'
        );
        assert(payload.version === 3, 'correction must carry current version');
        assert(
            payload.attempted?.attributes?.name === 'my-stale-name',
            'correction must echo back what the sender tried to write, so they can retry it'
        );
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

    // 3. Stale deleteTable: row still exists server-side (delete didn't
    // apply) — correction must restore it via addTable, since a same-op
    // {id, attributes} patch would be a no-op if the client already removed
    // the table from its local list.
    {
        const storage = {
            deleteTable: async () => {
                throw new ConflictException({
                    message: 'version-mismatch',
                    current: {
                        id: 't1',
                        version: 5,
                        name: 'still-here',
                        deletedAt: null,
                    },
                });
            },
            // handleOp's addTable-restore path re-hydrates via getTable
            // (to recover `fields`, split into its own entity — see the
            // gateway's comment on RESTORE_OPS); no row here means it falls
            // back to `current`, same as before that rehydration existed.
            getTable: async () => undefined,
        } as unknown as StorageService;
        const gateway = new CollaborationGateway(storage, {
            get: () => undefined,
        } as never);
        const { socket, emitted, broadcast } = fakeSocket();

        const ack = await gateway.handleOp(socket as never, {
            diagramId: 'd1',
            op: 'deleteTable',
            args: { diagramId: 'd1', id: 't1', version: 2 },
        });

        assert(ack.ok === false, 'stale delete must not ack ok');
        assert(broadcast.length === 0, 'stale delete must not broadcast to room');
        assert(emitted.length === 1, 'stale delete must emit exactly one correction');
        const payload = emitted[0].payload as {
            op: string;
            args: { table: { id: string; name: string } };
        };
        assert(
            payload.op === 'addTable',
            'delete conflict must restore via addTable, not a same-op patch'
        );
        assert(
            payload.args.table.name === 'still-here',
            'restore must carry the server-authoritative row'
        );
    }

    // 3b. Stale deleteRelationship: same restore-via-addX treatment as
    // deleteTable, extended via RESTORE_OPS to the other four entity types
    // that previously had no version check at all.
    {
        const storage = {
            deleteRelationship: async () => {
                throw new ConflictException({
                    message: 'version-mismatch',
                    current: { id: 'r1', version: 2, name: 'still-here' },
                });
            },
        } as unknown as StorageService;
        const gateway = new CollaborationGateway(storage, {
            get: () => undefined,
        } as never);
        const { socket, emitted, broadcast } = fakeSocket();

        const ack = await gateway.handleOp(socket as never, {
            diagramId: 'd1',
            op: 'deleteRelationship',
            args: { diagramId: 'd1', id: 'r1', version: 1 },
        });

        assert(ack.ok === false, 'stale deleteRelationship must not ack ok');
        assert(
            broadcast.length === 0,
            'stale deleteRelationship must not broadcast to room'
        );
        const payload = emitted[0].payload as {
            op: string;
            args: { relationship: { id: string; name: string } };
        };
        assert(
            payload.op === 'addRelationship',
            'deleteRelationship conflict must restore via addRelationship'
        );
        assert(
            payload.args.relationship.name === 'still-here',
            'restore must carry the server-authoritative row'
        );
    }

    // 3c. deleteField whose *table*-side write (indexes/checkConstraints)
    // conflicts, not the field-side one: the transaction rolled back, so
    // the field is untouched server-side — correction must restore the
    // field fresh (via getField, not the stale `current` table row) AND
    // separately patch the table, never misroute the TableEntity `current`
    // through the field-shaped RESTORE_OPS path.
    {
        const storage = {
            deleteField: async () => {
                throw new ConflictException({
                    message: 'version-mismatch',
                    entity: 'Table',
                    current: {
                        id: 'tbl1',
                        version: 9,
                        indexes: ['other-users-index'],
                    },
                });
            },
            getField: async () => ({
                id: 'f1',
                tableId: 'tbl1',
                version: 4,
                name: 'still-here-field',
            }),
        } as unknown as StorageService;
        const gateway = new CollaborationGateway(storage, {
            get: () => undefined,
        } as never);
        const { socket, emitted, broadcast } = fakeSocket();

        const ack = await gateway.handleOp(socket as never, {
            diagramId: 'd1',
            op: 'deleteField',
            args: {
                diagramId: 'd1',
                tableId: 'tbl1',
                id: 'f1',
                tableAttributes: { indexes: [] },
                version: 3,
                tableVersion: 1,
            },
        });

        assert(ack.ok === false, 'table-side conflict must not ack ok');
        assert(
            broadcast.length === 0,
            'table-side conflict must not broadcast to room'
        );
        assert(
            emitted.length === 2,
            'table-side conflict must emit both a field restore and a table patch'
        );
        const [fieldRestore, tablePatch] = emitted.map((e) => e.payload) as [
            { op: string; args: { field: { name: string } } },
            { op: string; args: { id: string; attributes: unknown } },
        ];
        assert(
            fieldRestore.op === 'addField',
            'field must be restored via addField, not treated as the conflicting entity'
        );
        assert(
            fieldRestore.args.field.name === 'still-here-field',
            'field restore must come from a fresh getField, not the table\'s `current`'
        );
        assert(
            tablePatch.op === 'updateTable',
            'table side must correct via updateTable, not the deleteField/addField restore shape'
        );
        assert(
            tablePatch.args.id === 'tbl1',
            'table patch must target the table, not the field'
        );
    }

    // 4. field:focus relay: broadcast-only to the room, tagged with the
    // sender's socketId, sender excluded (client.to() never echoes back).
    {
        const gateway = new CollaborationGateway({} as never, {
            get: () => undefined,
        } as never);
        const { socket, emitted, broadcast } = fakeSocket();

        gateway.handleFieldFocus(socket as never, {
            diagramId: 'd1',
            key: 'Table:t1:name',
        });

        assert(emitted.length === 0, 'field:focus must not ack the sender');
        assert(broadcast.length === 1, 'field:focus must broadcast once');
        const payload = broadcast[0].payload as {
            socketId: string;
            key: string | null;
        };
        assert(
            payload.key === 'Table:t1:name',
            'broadcast must carry the focused key'
        );
    }

    console.log('OK: collaboration.gateway conflict routing behaves correctly');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
