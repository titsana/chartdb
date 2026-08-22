import { describe, expect, it } from 'vitest';
import {
    computeRelationshipTargetHandleIndexes,
    computeDependencyTargetHandleIndexes,
} from '../canvas-handle-index';

/**
 * Phase 1 (docs/design/realtime-collaboration.md §10) regression guard for
 * the appendix-b:8 fix: handle-index assignment must be a pure function of
 * the *set* of relationships/dependencies sharing a target, not the order
 * they happen to appear in the array — Yjs doesn't guarantee that order
 * stays identical across replicas after a merge. This is also the "deferred
 * canvas test" the Phase 0 harness flagged as a gap: fixing #8 made the
 * handler logic extractable and directly unit-testable, without a
 * ReactFlow/DOM harness.
 */

describe('computeRelationshipTargetHandleIndexes', () => {
    const rel = (id: string, targetTableId: string, targetFieldId: string) => ({
        id,
        targetTableId,
        targetFieldId,
    });

    it('assigns 0 to a relationship that is the only one targeting a field', () => {
        const result = computeRelationshipTargetHandleIndexes([
            rel('rel-1', 'table-1', 'field-1'),
        ]);
        expect(result.get('rel-1')).toBe(0);
    });

    it('assigns distinct indexes to relationships sharing the same target field, ordered by relationship id', () => {
        const result = computeRelationshipTargetHandleIndexes([
            rel('rel-b', 'table-1', 'field-1'),
            rel('rel-a', 'table-1', 'field-1'),
            rel('rel-c', 'table-1', 'field-1'),
        ]);
        expect(result.get('rel-a')).toBe(0);
        expect(result.get('rel-b')).toBe(1);
        expect(result.get('rel-c')).toBe(2);
    });

    it('fix for appendix-b:8 — the assignment is identical regardless of array iteration order (the actual bug)', () => {
        const relationships = [
            rel('rel-b', 'table-1', 'field-1'),
            rel('rel-a', 'table-1', 'field-1'),
            rel('rel-c', 'table-1', 'field-1'),
        ];
        // simulates two Yjs replicas iterating the same set of
        // relationships in a different order after a merge
        const shuffled = [relationships[2], relationships[0], relationships[1]];

        const fromOriginalOrder =
            computeRelationshipTargetHandleIndexes(relationships);
        const fromShuffledOrder =
            computeRelationshipTargetHandleIndexes(shuffled);

        for (const r of relationships) {
            expect(fromShuffledOrder.get(r.id)).toBe(
                fromOriginalOrder.get(r.id)
            );
        }
    });

    it('does not let relationships targeting different fields share an index space', () => {
        const result = computeRelationshipTargetHandleIndexes([
            rel('rel-1', 'table-1', 'field-1'),
            rel('rel-2', 'table-1', 'field-2'),
        ]);
        expect(result.get('rel-1')).toBe(0);
        expect(result.get('rel-2')).toBe(0); // independent group, own index space
    });
});

describe('computeDependencyTargetHandleIndexes', () => {
    const dep = (id: string, tableId: string) => ({ id, tableId });

    it('assigns distinct indexes to dependencies sharing the same target table, ordered by dependency id', () => {
        const result = computeDependencyTargetHandleIndexes([
            dep('dep-b', 'table-1'),
            dep('dep-a', 'table-1'),
        ]);
        expect(result.get('dep-a')).toBe(0);
        expect(result.get('dep-b')).toBe(1);
    });

    it('fix for appendix-b:8 — the assignment is identical regardless of array iteration order', () => {
        const dependencies = [
            dep('dep-b', 'table-1'),
            dep('dep-a', 'table-1'),
            dep('dep-c', 'table-1'),
        ];
        const shuffled = [dependencies[2], dependencies[0], dependencies[1]];

        const fromOriginalOrder =
            computeDependencyTargetHandleIndexes(dependencies);
        const fromShuffledOrder =
            computeDependencyTargetHandleIndexes(shuffled);

        for (const d of dependencies) {
            expect(fromShuffledOrder.get(d.id)).toBe(
                fromOriginalOrder.get(d.id)
            );
        }
    });
});
