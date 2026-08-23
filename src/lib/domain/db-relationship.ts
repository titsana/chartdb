import { z } from 'zod';

export interface DBRelationship {
    id: string;
    name: string;
    sourceSchema?: string | null;
    sourceTableId: string;
    targetSchema?: string | null;
    targetTableId: string;
    sourceFieldId: string;
    targetFieldId: string;
    sourceCardinality: Cardinality;
    targetCardinality: Cardinality;
    createdAt: number;
}

export const dbRelationshipSchema: z.ZodType<DBRelationship> = z.object({
    id: z.string(),
    name: z.string(),
    sourceSchema: z.string().or(z.null()).optional(),
    sourceTableId: z.string(),
    targetSchema: z.string().or(z.null()).optional(),
    targetTableId: z.string(),
    sourceFieldId: z.string(),
    targetFieldId: z.string(),
    sourceCardinality: z.union([z.literal('one'), z.literal('many')]),
    targetCardinality: z.union([z.literal('one'), z.literal('many')]),
    createdAt: z.number(),
});

export type RelationshipType =
    | 'one_to_one'
    | 'one_to_many'
    | 'many_to_one'
    | 'many_to_many';
export type Cardinality = 'one' | 'many';

export const determineRelationshipType = ({
    sourceCardinality,
    targetCardinality,
}: {
    sourceCardinality: Cardinality;
    targetCardinality: Cardinality;
}): RelationshipType => {
    if (sourceCardinality === 'one' && targetCardinality === 'one')
        return 'one_to_one';
    if (sourceCardinality === 'one' && targetCardinality === 'many')
        return 'one_to_many';
    if (sourceCardinality === 'many' && targetCardinality === 'one')
        return 'many_to_one';
    return 'many_to_many';
};

/**
 * Which field a relationship's foreign key sits on: the source field for
 * many:one (the FK always goes on the "many" side when cardinalities
 * differ), the target field for every other case (one:one, one:many,
 * many:many all put it on target). Single source of truth for this —
 * previously duplicated inline in canvas.tsx and table-node-field.tsx,
 * which risked the two copies silently diverging.
 */
export const foreignKeyFieldId = (
    rel: Pick<
        DBRelationship,
        | 'sourceFieldId'
        | 'targetFieldId'
        | 'sourceCardinality'
        | 'targetCardinality'
    >
): string =>
    determineRelationshipType(rel) === 'many_to_one'
        ? rel.sourceFieldId
        : rel.targetFieldId;

/**
 * Perf: builds the fieldId -> "is this a foreign key" index in ONE pass
 * over `relationships`, instead of every field scanning the whole array
 * itself (O(fields × relationships) on a large diagram — found via
 * manual testing that this was a real jank contributor when many table
 * nodes mount at once, e.g. zooming out after a large import).
 */
export const computeForeignKeyFieldIds = (
    relationships: Pick<
        DBRelationship,
        | 'sourceFieldId'
        | 'targetFieldId'
        | 'sourceCardinality'
        | 'targetCardinality'
    >[]
): Set<string> => {
    const ids = new Set<string>();
    relationships.forEach((rel) => ids.add(foreignKeyFieldId(rel)));
    return ids;
};

export const determineCardinalities = (
    relationshipType: RelationshipType
): {
    sourceCardinality: Cardinality;
    targetCardinality: Cardinality;
} => {
    switch (relationshipType) {
        case 'one_to_one':
            return { sourceCardinality: 'one', targetCardinality: 'one' };
        case 'one_to_many':
            return { sourceCardinality: 'one', targetCardinality: 'many' };
        case 'many_to_one':
            return { sourceCardinality: 'many', targetCardinality: 'one' };
        case 'many_to_many':
            return { sourceCardinality: 'many', targetCardinality: 'many' };
    }
};
