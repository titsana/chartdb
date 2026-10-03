import { describe, expect, it } from 'vitest';
import {
    applyFieldChanges,
    compactField,
    compactTable,
    describeRelationship,
    fieldFromSpec,
    relationshipLine,
} from '../compact';
import type { DBTable } from '../../collab/y-diagram.types';

describe('compact MCP wire format', () => {
    it('a full spec replaces a field: omitted optional values are cleared, id kept', () => {
        const prev = fieldFromSpec({
            name: 'email',
            type: 'varchar',
            characterMaximumLength: '255',
            default: "'x'",
            comments: 'old',
        });
        const next = fieldFromSpec({ name: 'email', type: 'text' }, prev);
        expect(next.id).toBe(prev.id);
        expect(next.createdAt).toBe(prev.createdAt);
        // null, not absent: the Y.Doc writer never deletes keys
        expect(next.default).toBeNull();
        expect(next.comments).toBeNull();
        expect(next.characterMaximumLength).toBeNull();
        expect(compactField(next)).toEqual({ name: 'email', type: 'text' });
        expect(next.type).toEqual({ id: 'text', name: 'text' });
    });

    it('update_field changes: given keys replace, null clears, rest kept', () => {
        const field = fieldFromSpec({
            name: 'email',
            type: 'varchar',
            default: "'x'",
            comments: 'keep me',
        });
        const next = applyFieldChanges(field, {
            name: 'mail',
            default: null,
            nullable: false,
        });
        expect(next).toMatchObject({
            id: field.id,
            name: 'mail',
            nullable: false,
            comments: 'keep me',
        });
        expect(next.default).toBeNull();
        expect(compactField(next)).toEqual({
            name: 'mail',
            type: 'varchar',
            nullable: false,
            comments: 'keep me',
        });
    });

    it('compact output only has non-defaults and round-trips as input', () => {
        const spec = {
            name: 'id',
            type: 'uuid',
            primaryKey: true,
            nullable: false,
        };
        const out = compactField(fieldFromSpec(spec));
        expect(out).toEqual(spec);
        expect(
            compactField(fieldFromSpec({ name: 'note', type: 'text' }))
        ).toEqual({
            name: 'note',
            type: 'text',
        });
        // get_diagram's {id, name} type form is accepted too (fieldSpec), and
        // output never carries field ids or createdAt
        expect(JSON.stringify(out)).not.toMatch(/createdAt|"id":/);
    });

    it('a table shows indexes by column name and no positions/colors', () => {
        const id = fieldFromSpec({ name: 'id', type: 'uuid' });
        const table: DBTable = {
            id: 't1',
            name: 'orders',
            schema: 'public',
            x: 10,
            y: 20,
            color: '#fff',
            isView: false,
            createdAt: 1,
            order: 0,
            fields: [id],
            indexes: [
                {
                    id: 'i1',
                    name: 'pk',
                    unique: true,
                    fieldIds: [id.id],
                    createdAt: 1,
                    isPrimaryKey: true,
                },
            ],
        };
        expect(compactTable(table)).toEqual({
            id: 't1',
            name: 'orders',
            schema: 'public',
            fields: [{ name: 'id', type: 'uuid' }],
            indexes: [
                {
                    name: 'pk',
                    fieldNames: ['id'],
                    unique: true,
                    isPrimaryKey: true,
                },
            ],
        });
    });

    it('relationships read from the FK side for both stored orientations', () => {
        const fk = fieldFromSpec({ name: 'customer_id', type: 'uuid' });
        const pk = fieldFromSpec({ name: 'id', type: 'uuid' });
        const base = {
            x: 0,
            y: 0,
            color: '',
            isView: false,
            createdAt: 1,
            indexes: [],
        };
        const orders: DBTable = {
            ...base,
            id: 'o',
            name: 'orders',
            fields: [fk],
        };
        const customers: DBTable = {
            ...base,
            id: 'c',
            name: 'customers',
            fields: [pk],
        };
        const byId = new Map([
            ['o', orders],
            ['c', customers],
        ]);
        const manyToOne = {
            id: 'r1',
            sourceTableId: 'o',
            sourceFieldId: fk.id,
            targetTableId: 'c',
            targetFieldId: pk.id,
            sourceCardinality: 'many',
            targetCardinality: 'one',
        };
        const oneToOne = {
            id: 'r2',
            sourceTableId: 'c',
            sourceFieldId: pk.id,
            targetTableId: 'o',
            targetFieldId: fk.id,
            sourceCardinality: 'one',
            targetCardinality: 'one',
        };
        expect(describeRelationship(manyToOne, byId)).toEqual({
            id: 'r1',
            from: 'orders.customer_id',
            to: 'customers.id',
            type: 'many_to_one',
        });
        expect(describeRelationship(oneToOne, byId)).toMatchObject({
            from: 'orders.customer_id',
            to: 'customers.id',
            type: 'one_to_one',
        });
        expect(relationshipLine(manyToOne, byId)).toBe(
            'orders.customer_id->customers.id'
        );
        expect(relationshipLine(oneToOne, byId)).toBe(
            'orders.customer_id->customers.id (one_to_one)'
        );
    });
});
