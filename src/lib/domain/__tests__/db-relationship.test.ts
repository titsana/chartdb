import { describe, expect, it } from 'vitest';
import {
    computeForeignKeyFieldIds,
    foreignKeyFieldId,
} from '../db-relationship';
import type { DBRelationship } from '../db-relationship';

const rel = (overrides: Partial<DBRelationship>): DBRelationship => ({
    id: 'rel-1',
    name: 'rel',
    sourceTableId: 'table-a',
    targetTableId: 'table-b',
    sourceFieldId: 'field-a',
    targetFieldId: 'field-b',
    sourceCardinality: 'many',
    targetCardinality: 'one',
    createdAt: 0,
    ...overrides,
});

describe('foreignKeyFieldId', () => {
    it('puts the FK on the source field for many:one', () => {
        expect(
            foreignKeyFieldId(
                rel({ sourceCardinality: 'many', targetCardinality: 'one' })
            )
        ).toBe('field-a');
    });

    it('puts the FK on the target field for one:many', () => {
        expect(
            foreignKeyFieldId(
                rel({ sourceCardinality: 'one', targetCardinality: 'many' })
            )
        ).toBe('field-b');
    });

    it('puts the FK on the target field for one:one', () => {
        expect(
            foreignKeyFieldId(
                rel({ sourceCardinality: 'one', targetCardinality: 'one' })
            )
        ).toBe('field-b');
    });

    it('puts the FK on the target field for many:many', () => {
        expect(
            foreignKeyFieldId(
                rel({ sourceCardinality: 'many', targetCardinality: 'many' })
            )
        ).toBe('field-b');
    });
});

describe('computeForeignKeyFieldIds', () => {
    // This is the single source of truth canvas.tsx's precomputed index
    // and table-node-field.tsx's fallback scan both now call — the perf
    // fix (avoiding an O(fields × relationships) scan per field, per
    // mount, on large diagrams) depends on these two staying in sync,
    // which this pins by construction rather than by hoping two separate
    // copies of the same logic never drift apart.
    it('collects the FK field id from every relationship', () => {
        const ids = computeForeignKeyFieldIds([
            rel({
                sourceFieldId: 'f1',
                targetFieldId: 'f2',
                sourceCardinality: 'many',
                targetCardinality: 'one',
            }),
            rel({
                sourceFieldId: 'f3',
                targetFieldId: 'f4',
                sourceCardinality: 'one',
                targetCardinality: 'many',
            }),
        ]);
        expect(ids).toEqual(new Set(['f1', 'f4']));
    });

    it('returns an empty set for no relationships', () => {
        expect(computeForeignKeyFieldIds([])).toEqual(new Set());
    });
});
