import type { DBTable } from '@/lib/domain/db-table';
import type { DBRelationship } from '@/lib/domain/db-relationship';
import type { Area } from '@/lib/domain/area';
import type { Note } from '@/lib/domain/note';
import {
    adjustTablePositionsWithoutAreas,
    calcTableHeight,
    getTableDimensions,
    MIN_TABLE_SIZE,
} from '@/lib/domain/db-table';

/**
 * Check if a rectangle is completely inside an area
 */
const isRectInsideArea = (
    rect: { x: number; y: number; width: number; height: number },
    area: Area
): boolean => {
    const rectLeft = rect.x;
    const rectRight = rect.x + rect.width;
    const rectTop = rect.y;
    const rectBottom = rect.y + rect.height;

    const areaLeft = area.x;
    const areaRight = area.x + area.width;
    const areaTop = area.y;
    const areaBottom = area.y + area.height;

    return (
        rectLeft >= areaLeft &&
        rectRight <= areaRight &&
        rectTop >= areaTop &&
        rectBottom <= areaBottom
    );
};

/**
 * Sort areas by order (if available) to prioritize top-most areas
 */
const sortAreasByOrder = (areas: Area[]): Area[] =>
    [...areas].sort((a, b) => (b.order ?? 0) - (a.order ?? 0));

/**
 * Check if a table is inside an area based on their positions and dimensions
 */
export const isTableInsideArea = (table: DBTable, area: Area): boolean => {
    // Get table dimensions (assuming default width if not specified)
    const tableWidth = table.width ?? MIN_TABLE_SIZE;
    const tableHeight = calcTableHeight(table);

    return isRectInsideArea(
        { x: table.x, y: table.y, width: tableWidth, height: tableHeight },
        area
    );
};

/**
 * Find which area contains a table
 */
export const findContainingArea = (
    table: DBTable,
    areas: Area[]
): Area | null => {
    for (const area of sortAreasByOrder(areas)) {
        if (isTableInsideArea(table, area)) {
            return area;
        }
    }

    return null;
};

/**
 * Update tables with their parent area IDs based on containment
 */
export const updateTablesParentAreas = (
    tables: DBTable[],
    areas: Area[]
): DBTable[] => {
    return tables.map((table) => {
        const containingArea = findContainingArea(table, areas);
        const newParentAreaId = containingArea?.id || null;

        // Only update if parentAreaId has changed
        if (table.parentAreaId !== newParentAreaId) {
            return {
                ...table,
                parentAreaId: newParentAreaId,
            };
        }

        return table;
    });
};

/**
 * Get all tables that are inside a specific area
 */
export const getTablesInArea = (
    areaId: string,
    tables: DBTable[]
): DBTable[] => {
    return tables.filter((table) => table.parentAreaId === areaId);
};

/**
 * Check if a note is inside an area based on their positions and dimensions
 */
export const isNoteInsideArea = (note: Note, area: Area): boolean =>
    isRectInsideArea(note, area);

/**
 * Find which area contains a note
 */
export const findContainingAreaForNote = (
    note: Note,
    areas: Area[]
): Area | null => {
    for (const area of sortAreasByOrder(areas)) {
        if (isNoteInsideArea(note, area)) {
            return area;
        }
    }

    return null;
};

/**
 * Update notes with their parent area IDs based on containment
 */
export const updateNotesParentAreas = (
    notes: Note[],
    areas: Area[]
): Note[] => {
    return notes.map((note) => {
        const containingArea = findContainingAreaForNote(note, areas);
        const newParentAreaId = containingArea?.id || null;

        // Only update if parentAreaId has changed
        if (note.parentAreaId !== newParentAreaId) {
            return {
                ...note,
                parentAreaId: newParentAreaId,
            };
        }

        return note;
    });
};

/**
 * Get all notes that are inside a specific area
 */
export const getNotesInArea = (areaId: string, notes: Note[]): Note[] => {
    return notes.filter((note) => note.parentAreaId === areaId);
};

const AREA_PADDING = 30;
const AREA_HEADER_HEIGHT = 50;

/**
 * Arrange tables using the relationship-aware algorithm and fit them into an area.
 * Returns the arranged positions and the required area dimensions.
 */
export const arrangeTablesForArea = (
    tablesToArrange: DBTable[],
    relationships: DBRelationship[],
    areaRect: { x: number; y: number; width: number; height: number }
): {
    positions: { id: string; x: number; y: number }[];
    requiredWidth: number;
    requiredHeight: number;
} => {
    if (tablesToArrange.length === 0) {
        return {
            positions: [],
            requiredWidth: areaRect.width,
            requiredHeight: areaRect.height,
        };
    }

    const cloned = tablesToArrange.map((t) => ({ ...t }));

    const ids = new Set(cloned.map((t) => t.id));
    const areaRels = relationships.filter(
        (rel) => ids.has(rel.sourceTableId) && ids.has(rel.targetTableId)
    );

    adjustTablePositionsWithoutAreas(cloned, areaRels, 'all');

    // Calculate bounding box
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    cloned.forEach((t) => {
        const { width, height } = getTableDimensions(t);
        minX = Math.min(minX, t.x);
        minY = Math.min(minY, t.y);
        maxX = Math.max(maxX, t.x + width);
        maxY = Math.max(maxY, t.y + height);
    });

    // Translate into area
    const offsetX = areaRect.x + AREA_PADDING - minX;
    const offsetY = areaRect.y + AREA_HEADER_HEIGHT - minY;

    return {
        positions: cloned.map((t) => ({
            id: t.id,
            x: t.x + offsetX,
            y: t.y + offsetY,
        })),
        requiredWidth: maxX - minX + 2 * AREA_PADDING,
        requiredHeight: maxY - minY + AREA_PADDING + AREA_HEADER_HEIGHT,
    };
};
