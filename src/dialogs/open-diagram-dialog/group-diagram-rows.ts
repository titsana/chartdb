import type { Diagram } from '@/lib/domain/diagram';
import type { DiagramGroup } from '@/lib/domain/diagram-group';

/**
 * Phase 7 (folder-style diagram grouping). Flattens groups+diagrams into
 * one ordered render list for open-diagram-dialog.tsx's table — each
 * group's header followed by its diagrams (already-sorted order
 * preserved), then an "Ungrouped" bucket last for anything with no
 * groupId. `selectionIndex` is assigned only to actual diagram rows
 * (group headers aren't keyboard-selectable) and stays contiguous across
 * group boundaries — handleRowKeyDown's ArrowUp/ArrowDown walk it.
 *
 * The "Ungrouped" header only appears once at least one real group
 * exists — with none, the result looks exactly like the pre-grouping
 * flat list (every diagram, no headers at all).
 *
 * Pure, extracted specifically so this logic is unit-testable —
 * open-diagram-dialog.tsx has no test harness of its own.
 */
export type DiagramListRow =
    | { type: 'group-header'; group: DiagramGroup }
    | { type: 'ungrouped-header' }
    | { type: 'diagram'; diagram: Diagram; selectionIndex: number };

export function groupDiagramRows(
    diagrams: Diagram[],
    groups: DiagramGroup[]
): DiagramListRow[] {
    const diagramsByGroupId = new Map<string, Diagram[]>();
    for (const diagram of diagrams) {
        const key = diagram.groupId ?? '';
        const bucket = diagramsByGroupId.get(key);
        if (bucket) {
            bucket.push(diagram);
        } else {
            diagramsByGroupId.set(key, [diagram]);
        }
    }

    const rows: DiagramListRow[] = [];
    let selectionIndex = 0;
    for (const group of groups) {
        rows.push({ type: 'group-header', group });
        for (const diagram of diagramsByGroupId.get(group.id) ?? []) {
            rows.push({
                type: 'diagram',
                diagram,
                selectionIndex: selectionIndex++,
            });
        }
    }

    const ungroupedDiagrams = diagramsByGroupId.get('') ?? [];
    if (groups.length > 0 && ungroupedDiagrams.length > 0) {
        rows.push({ type: 'ungrouped-header' });
    }
    for (const diagram of ungroupedDiagrams) {
        rows.push({
            type: 'diagram',
            diagram,
            selectionIndex: selectionIndex++,
        });
    }

    return rows;
}
