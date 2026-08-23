import { describe, expect, it } from 'vitest';
import { groupDiagramRows } from '../group-diagram-rows';
import type { Diagram } from '@/lib/domain/diagram';
import type { DiagramGroup } from '@/lib/domain/diagram-group';
import { DatabaseType } from '@/lib/domain/database-type';

const diagram = (overrides: Partial<Diagram>): Diagram => ({
    id: 'd1',
    name: 'diagram',
    databaseType: DatabaseType.GENERIC,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
});

const group = (overrides: Partial<DiagramGroup>): DiagramGroup => ({
    id: 'g1',
    name: 'group',
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
});

describe('groupDiagramRows', () => {
    it('with no groups at all, looks exactly like a flat list — no header rows', () => {
        const diagrams = [
            diagram({ id: 'd1' }),
            diagram({ id: 'd2', groupId: null }),
        ];
        const rows = groupDiagramRows(diagrams, []);

        expect(rows).toEqual([
            { type: 'diagram', diagram: diagrams[0], selectionIndex: 0 },
            { type: 'diagram', diagram: diagrams[1], selectionIndex: 1 },
        ]);
    });

    it('groups diagrams under their group header, in group order', () => {
        const groupA = group({ id: 'a', name: 'A' });
        const groupB = group({ id: 'b', name: 'B' });
        const d1 = diagram({ id: 'd1', groupId: 'a' });
        const d2 = diagram({ id: 'd2', groupId: 'b' });

        const rows = groupDiagramRows([d1, d2], [groupA, groupB]);

        expect(rows).toEqual([
            { type: 'group-header', group: groupA },
            { type: 'diagram', diagram: d1, selectionIndex: 0 },
            { type: 'group-header', group: groupB },
            { type: 'diagram', diagram: d2, selectionIndex: 1 },
        ]);
    });

    it('shows an "Ungrouped" header for ungrouped diagrams only when at least one real group exists', () => {
        const groupA = group({ id: 'a', name: 'A' });
        const grouped = diagram({ id: 'd1', groupId: 'a' });
        const ungrouped = diagram({ id: 'd2', groupId: null });

        const rows = groupDiagramRows([grouped, ungrouped], [groupA]);

        expect(rows).toEqual([
            { type: 'group-header', group: groupA },
            { type: 'diagram', diagram: grouped, selectionIndex: 0 },
            { type: 'ungrouped-header' },
            { type: 'diagram', diagram: ungrouped, selectionIndex: 1 },
        ]);
    });

    it('an empty group with no diagrams still gets a header row (persists, per the "no empty group evaporates" decision)', () => {
        const emptyGroup = group({ id: 'empty', name: 'Empty' });
        const rows = groupDiagramRows([], [emptyGroup]);

        expect(rows).toEqual([{ type: 'group-header', group: emptyGroup }]);
    });

    it('selectionIndex stays contiguous across group boundaries (group headers are not counted)', () => {
        const groupA = group({ id: 'a', name: 'A' });
        const groupB = group({ id: 'b', name: 'B' });
        const rows = groupDiagramRows(
            [
                diagram({ id: 'd1', groupId: 'a' }),
                diagram({ id: 'd2', groupId: 'a' }),
                diagram({ id: 'd3', groupId: 'b' }),
            ],
            [groupA, groupB]
        );

        const selectionIndices = rows
            .filter((row) => row.type === 'diagram')
            .map((row) => (row.type === 'diagram' ? row.selectionIndex : -1));
        expect(selectionIndices).toEqual([0, 1, 2]);
    });

    it('collapsing a group hides its diagram rows but keeps the header row', () => {
        const groupA = group({ id: 'a', name: 'A' });
        const groupB = group({ id: 'b', name: 'B' });
        const d1 = diagram({ id: 'd1', groupId: 'a' });
        const d2 = diagram({ id: 'd2', groupId: 'b' });

        const rows = groupDiagramRows(
            [d1, d2],
            [groupA, groupB],
            new Set(['a'])
        );

        expect(rows).toEqual([
            { type: 'group-header', group: groupA },
            { type: 'group-header', group: groupB },
            { type: 'diagram', diagram: d2, selectionIndex: 0 },
        ]);
    });

    it('collapsing the Ungrouped bucket (key "") hides its diagram rows but keeps its header', () => {
        const groupA = group({ id: 'a', name: 'A' });
        const grouped = diagram({ id: 'd1', groupId: 'a' });
        const ungrouped = diagram({ id: 'd2', groupId: null });

        const rows = groupDiagramRows(
            [grouped, ungrouped],
            [groupA],
            new Set([''])
        );

        expect(rows).toEqual([
            { type: 'group-header', group: groupA },
            { type: 'diagram', diagram: grouped, selectionIndex: 0 },
            { type: 'ungrouped-header' },
        ]);
    });

    it('collapsing a group keeps selectionIndex contiguous across the gap (no skipped numbers)', () => {
        const groupA = group({ id: 'a', name: 'A' });
        const groupB = group({ id: 'b', name: 'B' });
        const rows = groupDiagramRows(
            [
                diagram({ id: 'd1', groupId: 'a' }),
                diagram({ id: 'd2', groupId: 'b' }),
                diagram({ id: 'd3', groupId: 'b' }),
            ],
            [groupA, groupB],
            new Set(['a'])
        );

        const selectionIndices = rows
            .filter((row) => row.type === 'diagram')
            .map((row) => (row.type === 'diagram' ? row.selectionIndex : -1));
        expect(selectionIndices).toEqual([0, 1]);
    });

    it('undefined groupId and null groupId both land in the same ungrouped bucket', () => {
        const groupA = group({ id: 'a', name: 'A' });
        const dUndefined = diagram({ id: 'd1', groupId: undefined });
        const dNull = diagram({ id: 'd2', groupId: null });

        const rows = groupDiagramRows([dUndefined, dNull], [groupA]);

        expect(rows).toEqual([
            { type: 'group-header', group: groupA },
            { type: 'ungrouped-header' },
            { type: 'diagram', diagram: dUndefined, selectionIndex: 0 },
            { type: 'diagram', diagram: dNull, selectionIndex: 1 },
        ]);
    });
});
