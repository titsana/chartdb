import { cloneDiagram } from './clone';
import type { Area } from './domain/area';
import type { DBCustomType } from './domain/db-custom-type';
import type { DBDependency } from './domain/db-dependency';
import type { DBRelationship } from './domain/db-relationship';
import { calcTableHeight, type DBTable } from './domain/db-table';
import { diagramSchema, type Diagram } from './domain/diagram';
import type { Note } from './domain/note';
import { generateDiagramId } from './utils';

export const runningIdGenerator = (): (() => string) => {
    let id = 0;
    return () => (id++).toString();
};

export const cloneDiagramWithRunningIds = (
    diagram: Diagram
): { diagram: Diagram; idsMap: Map<string, string> } => {
    const { diagram: clonedDiagram, idsMap } = cloneDiagram(diagram, {
        generateId: runningIdGenerator(),
    });

    return { diagram: clonedDiagram, idsMap };
};

export const diagramToJSONOutput = (diagram: Diagram): string => {
    const clonedDiagram = cloneDiagramWithRunningIds(diagram).diagram;
    return JSON.stringify(clonedDiagram, null, 2);
};

// Backups exported from the API storage provider carry Postgres NULLs for
// unset optional fields (e.g. Area.order, Diagram.databaseEdition), but the
// domain schemas only accept `undefined` there — drop nulls so those files
// still import.
function dropNulls(_key: string, value: unknown) {
    return value === null ? undefined : value;
}

export const parseDiagramJSON = (json: string): Diagram => {
    const loadedDiagram = JSON.parse(json, dropNulls);

    return diagramSchema.parse({
        ...loadedDiagram,
        createdAt: new Date(),
        updatedAt: new Date(),
    });
};

export const diagramFromJSONInput = (json: string): Diagram => ({
    ...cloneDiagram(parseDiagramJSON(json)).diagram,
    id: generateDiagramId(),
});

const LAYOUT_MARGIN = 100;

// Merges one or more already-parsed diagrams into a single new diagram:
// every table/relationship/area/note/customType from each is pooled as-is
// (no dedup, no merging of same-named tables). Each diagram's tables,
// areas and notes are shifted down so they never overlap on the canvas.
export const mergeDiagrams = (parsedDiagrams: Diagram[]): Diagram => {
    if (parsedDiagrams.length === 0) {
        throw new Error('No diagrams to merge');
    }

    const databaseType = parsedDiagrams[0].databaseType;
    if (parsedDiagrams.some((d) => d.databaseType !== databaseType)) {
        throw new Error(
            'All files must use the same database type to be merged into one diagram.'
        );
    }

    const tables: DBTable[] = [];
    const relationships: DBRelationship[] = [];
    const dependencies: DBDependency[] = [];
    const areas: Area[] = [];
    const notes: Note[] = [];
    const customTypes: DBCustomType[] = [];

    let yOffset = 0;

    parsedDiagrams.forEach((parsed) => {
        const { diagram: cloned } = cloneDiagram(parsed);

        const bottoms = [
            ...(cloned.tables ?? []).map((t) => t.y + calcTableHeight(t)),
            ...(cloned.areas ?? []).map((a) => a.y + a.height),
        ];
        const maxBottom = bottoms.length > 0 ? Math.max(...bottoms) : 0;

        tables.push(
            ...(cloned.tables ?? []).map((t) => ({ ...t, y: t.y + yOffset }))
        );
        areas.push(
            ...(cloned.areas ?? []).map((a) => ({ ...a, y: a.y + yOffset }))
        );
        notes.push(
            ...(cloned.notes ?? []).map((n) => ({ ...n, y: n.y + yOffset }))
        );
        relationships.push(...(cloned.relationships ?? []));
        dependencies.push(...(cloned.dependencies ?? []));
        customTypes.push(...(cloned.customTypes ?? []));

        yOffset += maxBottom + LAYOUT_MARGIN;
    });

    const first = parsedDiagrams[0];

    return {
        id: generateDiagramId(),
        name: first.name,
        databaseType,
        databaseEdition: first.databaseEdition,
        tables,
        relationships,
        dependencies,
        areas,
        notes,
        customTypes,
        createdAt: new Date(),
        updatedAt: new Date(),
    };
};
