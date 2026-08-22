import type { DBRelationship } from '../domain/db-relationship';
import type { DBDependency } from '../domain/db-dependency';

/**
 * appendix-b:8 fix — assigns each relationship a handle-index suffix for
 * its target field, keyed by a stable sort (relationship id) instead of
 * the `relationships` array's iteration order. Yjs doesn't guarantee
 * identical array iteration order across replicas after a merge, so two
 * peers computing this by array position (`targetIndexes[key]++`) could
 * assign different suffixes to the same relationships, rendering edges on
 * the wrong handle. Sorting the ids sharing a target is a pure function of
 * the *set* of relationships, not the order they happen to iterate in.
 */
export function computeRelationshipTargetHandleIndexes(
    relationships: Pick<
        DBRelationship,
        'id' | 'targetTableId' | 'targetFieldId'
    >[]
): Map<string, number> {
    const idsByTargetKey = new Map<string, string[]>();
    for (const relationship of relationships) {
        const key = `${relationship.targetTableId}${relationship.targetFieldId}`;
        const ids = idsByTargetKey.get(key) ?? [];
        ids.push(relationship.id);
        idsByTargetKey.set(key, ids);
    }

    const indexByRelationshipId = new Map<string, number>();
    for (const ids of idsByTargetKey.values()) {
        [...ids].sort().forEach((id, index) => {
            indexByRelationshipId.set(id, index);
        });
    }
    return indexByRelationshipId;
}

/** Same fix as {@link computeRelationshipTargetHandleIndexes}, for dependency edges. */
export function computeDependencyTargetHandleIndexes(
    dependencies: Pick<DBDependency, 'id' | 'tableId'>[]
): Map<string, number> {
    const idsByTableId = new Map<string, string[]>();
    for (const dependency of dependencies) {
        const ids = idsByTableId.get(dependency.tableId) ?? [];
        ids.push(dependency.id);
        idsByTableId.set(dependency.tableId, ids);
    }

    const indexByDependencyId = new Map<string, number>();
    for (const ids of idsByTableId.values()) {
        [...ids].sort().forEach((id, index) => {
            indexByDependencyId.set(id, index);
        });
    }
    return indexByDependencyId;
}
