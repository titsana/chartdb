import React, { useCallback, useMemo } from 'react';
import type { StorageContext } from './storage-context';
import { storageContext } from './storage-context';
import type { Diagram } from '@/lib/domain/diagram';
import type { DBTable } from '@/lib/domain/db-table';
import type { DBField } from '@/lib/domain/db-field';
import type { DBRelationship } from '@/lib/domain/db-relationship';
import type { ChartDBConfig } from '@/lib/domain/config';
import type { DBDependency } from '@/lib/domain/db-dependency';
import type { Area } from '@/lib/domain/area';
import type { DBCustomType } from '@/lib/domain/db-custom-type';
import type { DiagramFilter } from '@/lib/domain/diagram-filter/diagram-filter';
import type { Note } from '@/lib/domain/note';
import type { Group } from '@/lib/domain/group';
import { API_BASE_URL, AZURE_AD_ENABLED } from '@/lib/env';
import { getAccessToken } from '@/lib/auth-token';

async function getAuthHeader(): Promise<Record<string, string>> {
    const token = await getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
}

// ponytail: no per-account logout — a 401 just wipes the MSAL cache and
// reloads to the sign-in screen, add real logout if a shared-machine need shows up
function handleUnauthorized() {
    sessionStorage.clear();
    window.location.reload();
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
// JSON.parse doesn't revive dates: Diagram.createdAt/updatedAt are Date
// objects domain-wide (e.g. sorted with .getTime() in open-diagram-dialog),
// but the wire format is an ISO string — revive it back or callers throw.
//
// Also drop `null`: Postgres returns NULL for unset optional columns (e.g.
// Area.order, Diagram.databaseEdition), but those domain fields are typed
// as `T | undefined`, not `T | null` — callers that only check `!== undefined`
// (or destructure without a null-aware default) would otherwise misbehave.
function reviveDates(_key: string, value: unknown) {
    if (typeof value === 'string' && ISO_DATE_RE.test(value)) {
        return new Date(value);
    }
    if (value === null) {
        return undefined;
    }
    return value;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const authHeader = await getAuthHeader();
    const res = await fetch(`${API_BASE_URL}${path}`, {
        credentials: 'include',
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...authHeader,
            ...init?.headers,
        },
    });

    if (res.status === 401 && AZURE_AD_ENABLED) {
        handleUnauthorized();
    }

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        const message = (() => {
            try {
                return JSON.parse(body)?.message;
            } catch {
                return undefined;
            }
        })();
        throw new Error(
            message ??
                `API ${init?.method ?? 'GET'} ${path} failed: ${res.status}`
        );
    }

    // 204 or a 200 with an empty body (e.g. "not found" returning undefined)
    const text = await res.text();
    return (text ? JSON.parse(text, reviveDates) : undefined) as T;
}

function toQuery(options?: Record<string, boolean | undefined>): string {
    if (!options) return '';
    const params = new URLSearchParams();
    Object.entries(options).forEach(([key, value]) => {
        if (value) params.set(key, 'true');
    });
    const qs = params.toString();
    return qs ? `?${qs}` : '';
}

// Extracted from the provider so `collab-storage-provider.tsx` can reuse the
// same REST implementations for reads without duplicating apiFetch/reviveDates
// plumbing (it overrides the write methods to go over the collab socket).
// eslint-disable-next-line react-refresh/only-export-components
export function useApiStorage(): StorageContext {
    const getConfig: StorageContext['getConfig'] = useCallback(async () => {
        return await apiFetch<ChartDBConfig | undefined>('/config');
    }, []);

    const updateConfig: StorageContext['updateConfig'] = useCallback(
        async (config) => {
            await apiFetch('/config', {
                method: 'PATCH',
                body: JSON.stringify(config),
            });
        },
        []
    );

    const getDiagramFilter: StorageContext['getDiagramFilter'] = useCallback(
        async (diagramId) => {
            return await apiFetch<DiagramFilter | undefined>(
                `/diagrams/${diagramId}/filter`
            );
        },
        []
    );

    const updateDiagramFilter: StorageContext['updateDiagramFilter'] =
        useCallback(async (diagramId, filter) => {
            await apiFetch(`/diagrams/${diagramId}/filter`, {
                method: 'PUT',
                body: JSON.stringify(filter),
            });
        }, []);

    const deleteDiagramFilter: StorageContext['deleteDiagramFilter'] =
        useCallback(async (diagramId) => {
            await apiFetch(`/diagrams/${diagramId}/filter`, {
                method: 'DELETE',
            });
        }, []);

    const addDiagram: StorageContext['addDiagram'] = useCallback(
        async ({ diagram }) => {
            await apiFetch('/diagrams', {
                method: 'POST',
                body: JSON.stringify(diagram),
            });
        },
        []
    );

    const listDiagrams: StorageContext['listDiagrams'] = useCallback(
        async (options): Promise<Diagram[]> => {
            return await apiFetch<Diagram[]>(`/diagrams${toQuery(options)}`);
        },
        []
    );

    const getDiagram: StorageContext['getDiagram'] = useCallback(
        async (id, options): Promise<Diagram | undefined> => {
            return await apiFetch<Diagram | undefined>(
                `/diagrams/${id}${toQuery(options)}`
            );
        },
        []
    );

    const updateDiagram: StorageContext['updateDiagram'] = useCallback(
        async ({ id, attributes }) => {
            await apiFetch(`/diagrams/${id}`, {
                method: 'PATCH',
                body: JSON.stringify(attributes),
            });
        },
        []
    );

    const deleteDiagram: StorageContext['deleteDiagram'] = useCallback(
        async (id) => {
            await apiFetch(`/diagrams/${id}`, { method: 'DELETE' });
        },
        []
    );

    const addGroup: StorageContext['addGroup'] = useCallback(
        async ({ group }) => {
            await apiFetch('/groups', {
                method: 'POST',
                body: JSON.stringify(group),
            });
        },
        []
    );

    const listGroups: StorageContext['listGroups'] = useCallback(async () => {
        return await apiFetch<Group[]>('/groups');
    }, []);

    const updateGroup: StorageContext['updateGroup'] = useCallback(
        async ({ id, attributes }) => {
            await apiFetch(`/groups/${id}`, {
                method: 'PATCH',
                body: JSON.stringify(attributes),
            });
        },
        []
    );

    const deleteGroup: StorageContext['deleteGroup'] = useCallback(
        async (id) => {
            await apiFetch(`/groups/${id}`, { method: 'DELETE' });
        },
        []
    );

    const addTable: StorageContext['addTable'] = useCallback(
        async ({ diagramId, table }) => {
            await apiFetch(`/diagrams/${diagramId}/tables`, {
                method: 'POST',
                body: JSON.stringify(table),
            });
        },
        []
    );

    const getTable: StorageContext['getTable'] = useCallback(
        async ({ diagramId, id }) => {
            return await apiFetch<DBTable | undefined>(
                `/diagrams/${diagramId}/tables/${id}`
            );
        },
        []
    );

    const updateTable: StorageContext['updateTable'] = useCallback(
        async ({ id, attributes }) => {
            await apiFetch(`/tables/${id}`, {
                method: 'PATCH',
                body: JSON.stringify(attributes),
            });
        },
        []
    );

    const putTable: StorageContext['putTable'] = useCallback(
        async ({ diagramId, table }) => {
            await apiFetch(`/diagrams/${diagramId}/tables/${table.id}`, {
                method: 'PUT',
                body: JSON.stringify(table),
            });
        },
        []
    );

    const deleteTable: StorageContext['deleteTable'] = useCallback(
        async ({ diagramId, id }) => {
            await apiFetch(`/diagrams/${diagramId}/tables/${id}`, {
                method: 'DELETE',
            });
        },
        []
    );

    const listTables: StorageContext['listTables'] = useCallback(
        async (diagramId) => {
            return await apiFetch<DBTable[]>(`/diagrams/${diagramId}/tables`);
        },
        []
    );

    const deleteDiagramTables: StorageContext['deleteDiagramTables'] =
        useCallback(async (diagramId) => {
            await apiFetch(`/diagrams/${diagramId}/tables`, {
                method: 'DELETE',
            });
        }, []);

    const addField: StorageContext['addField'] = useCallback(
        async ({ diagramId, tableId, field }) => {
            await apiFetch(`/diagrams/${diagramId}/tables/${tableId}/fields`, {
                method: 'POST',
                body: JSON.stringify(field),
            });
        },
        []
    );

    const getField: StorageContext['getField'] = useCallback(
        async ({ diagramId, tableId, id }) => {
            return await apiFetch<DBField | undefined>(
                `/diagrams/${diagramId}/tables/${tableId}/fields/${id}`
            );
        },
        []
    );

    const updateField: StorageContext['updateField'] = useCallback(
        async ({ id, attributes }) => {
            await apiFetch(`/fields/${id}`, {
                method: 'PATCH',
                body: JSON.stringify(attributes),
            });
        },
        []
    );

    const deleteField: StorageContext['deleteField'] = useCallback(
        async ({ diagramId, tableId, id, tableAttributes }) => {
            await apiFetch(
                `/diagrams/${diagramId}/tables/${tableId}/fields/${id}`,
                {
                    method: 'DELETE',
                    body: JSON.stringify(tableAttributes),
                }
            );
        },
        []
    );

    const addRelationship: StorageContext['addRelationship'] = useCallback(
        async ({ diagramId, relationship }) => {
            await apiFetch(`/diagrams/${diagramId}/relationships`, {
                method: 'POST',
                body: JSON.stringify(relationship),
            });
        },
        []
    );

    const getRelationship: StorageContext['getRelationship'] = useCallback(
        async ({ diagramId, id }) => {
            return await apiFetch<DBRelationship | undefined>(
                `/diagrams/${diagramId}/relationships/${id}`
            );
        },
        []
    );

    const updateRelationship: StorageContext['updateRelationship'] =
        useCallback(async ({ id, attributes }) => {
            await apiFetch(`/relationships/${id}`, {
                method: 'PATCH',
                body: JSON.stringify(attributes),
            });
        }, []);

    const deleteRelationship: StorageContext['deleteRelationship'] =
        useCallback(async ({ diagramId, id }) => {
            await apiFetch(`/diagrams/${diagramId}/relationships/${id}`, {
                method: 'DELETE',
            });
        }, []);

    const listRelationships: StorageContext['listRelationships'] = useCallback(
        async (diagramId) => {
            return await apiFetch<DBRelationship[]>(
                `/diagrams/${diagramId}/relationships`
            );
        },
        []
    );

    const deleteDiagramRelationships: StorageContext['deleteDiagramRelationships'] =
        useCallback(async (diagramId) => {
            await apiFetch(`/diagrams/${diagramId}/relationships`, {
                method: 'DELETE',
            });
        }, []);

    const addDependency: StorageContext['addDependency'] = useCallback(
        async ({ diagramId, dependency }) => {
            await apiFetch(`/diagrams/${diagramId}/dependencies`, {
                method: 'POST',
                body: JSON.stringify(dependency),
            });
        },
        []
    );

    const getDependency: StorageContext['getDependency'] = useCallback(
        async ({ diagramId, id }) => {
            return await apiFetch<DBDependency | undefined>(
                `/diagrams/${diagramId}/dependencies/${id}`
            );
        },
        []
    );

    const updateDependency: StorageContext['updateDependency'] = useCallback(
        async ({ id, attributes }) => {
            await apiFetch(`/dependencies/${id}`, {
                method: 'PATCH',
                body: JSON.stringify(attributes),
            });
        },
        []
    );

    const deleteDependency: StorageContext['deleteDependency'] = useCallback(
        async ({ diagramId, id }) => {
            await apiFetch(`/diagrams/${diagramId}/dependencies/${id}`, {
                method: 'DELETE',
            });
        },
        []
    );

    const listDependencies: StorageContext['listDependencies'] = useCallback(
        async (diagramId) => {
            return await apiFetch<DBDependency[]>(
                `/diagrams/${diagramId}/dependencies`
            );
        },
        []
    );

    const deleteDiagramDependencies: StorageContext['deleteDiagramDependencies'] =
        useCallback(async (diagramId) => {
            await apiFetch(`/diagrams/${diagramId}/dependencies`, {
                method: 'DELETE',
            });
        }, []);

    const addArea: StorageContext['addArea'] = useCallback(
        async ({ diagramId, area }) => {
            await apiFetch(`/diagrams/${diagramId}/areas`, {
                method: 'POST',
                body: JSON.stringify(area),
            });
        },
        []
    );

    const getArea: StorageContext['getArea'] = useCallback(
        async ({ diagramId, id }) => {
            return await apiFetch<Area | undefined>(
                `/diagrams/${diagramId}/areas/${id}`
            );
        },
        []
    );

    const updateArea: StorageContext['updateArea'] = useCallback(
        async ({ id, attributes }) => {
            await apiFetch(`/areas/${id}`, {
                method: 'PATCH',
                body: JSON.stringify(attributes),
            });
        },
        []
    );

    const deleteArea: StorageContext['deleteArea'] = useCallback(
        async ({ diagramId, id }) => {
            await apiFetch(`/diagrams/${diagramId}/areas/${id}`, {
                method: 'DELETE',
            });
        },
        []
    );

    const listAreas: StorageContext['listAreas'] = useCallback(
        async (diagramId) => {
            return await apiFetch<Area[]>(`/diagrams/${diagramId}/areas`);
        },
        []
    );

    const deleteDiagramAreas: StorageContext['deleteDiagramAreas'] =
        useCallback(async (diagramId) => {
            await apiFetch(`/diagrams/${diagramId}/areas`, {
                method: 'DELETE',
            });
        }, []);

    const addCustomType: StorageContext['addCustomType'] = useCallback(
        async ({ diagramId, customType }) => {
            await apiFetch(`/diagrams/${diagramId}/custom-types`, {
                method: 'POST',
                body: JSON.stringify(customType),
            });
        },
        []
    );

    const getCustomType: StorageContext['getCustomType'] = useCallback(
        async ({ diagramId, id }) => {
            return await apiFetch<DBCustomType | undefined>(
                `/diagrams/${diagramId}/custom-types/${id}`
            );
        },
        []
    );

    const updateCustomType: StorageContext['updateCustomType'] = useCallback(
        async ({ id, attributes }) => {
            await apiFetch(`/custom-types/${id}`, {
                method: 'PATCH',
                body: JSON.stringify(attributes),
            });
        },
        []
    );

    const deleteCustomType: StorageContext['deleteCustomType'] = useCallback(
        async ({ diagramId, id }) => {
            await apiFetch(`/diagrams/${diagramId}/custom-types/${id}`, {
                method: 'DELETE',
            });
        },
        []
    );

    const listCustomTypes: StorageContext['listCustomTypes'] = useCallback(
        async (diagramId) => {
            return await apiFetch<DBCustomType[]>(
                `/diagrams/${diagramId}/custom-types`
            );
        },
        []
    );

    const deleteDiagramCustomTypes: StorageContext['deleteDiagramCustomTypes'] =
        useCallback(async (diagramId) => {
            await apiFetch(`/diagrams/${diagramId}/custom-types`, {
                method: 'DELETE',
            });
        }, []);

    const addNote: StorageContext['addNote'] = useCallback(
        async ({ diagramId, note }) => {
            await apiFetch(`/diagrams/${diagramId}/notes`, {
                method: 'POST',
                body: JSON.stringify(note),
            });
        },
        []
    );

    const getNote: StorageContext['getNote'] = useCallback(
        async ({ diagramId, id }) => {
            return await apiFetch<Note | undefined>(
                `/diagrams/${diagramId}/notes/${id}`
            );
        },
        []
    );

    const updateNote: StorageContext['updateNote'] = useCallback(
        async ({ id, attributes }) => {
            await apiFetch(`/notes/${id}`, {
                method: 'PATCH',
                body: JSON.stringify(attributes),
            });
        },
        []
    );

    const deleteNote: StorageContext['deleteNote'] = useCallback(
        async ({ diagramId, id }) => {
            await apiFetch(`/diagrams/${diagramId}/notes/${id}`, {
                method: 'DELETE',
            });
        },
        []
    );

    const listNotes: StorageContext['listNotes'] = useCallback(
        async (diagramId) => {
            return await apiFetch<Note[]>(`/diagrams/${diagramId}/notes`);
        },
        []
    );

    const deleteDiagramNotes: StorageContext['deleteDiagramNotes'] =
        useCallback(async (diagramId) => {
            await apiFetch(`/diagrams/${diagramId}/notes`, {
                method: 'DELETE',
            });
        }, []);

    const value = useMemo<StorageContext>(
        () => ({
            getConfig,
            updateConfig,
            getDiagramFilter,
            updateDiagramFilter,
            deleteDiagramFilter,
            addDiagram,
            listDiagrams,
            getDiagram,
            updateDiagram,
            deleteDiagram,
            addGroup,
            listGroups,
            updateGroup,
            deleteGroup,
            addTable,
            getTable,
            updateTable,
            putTable,
            deleteTable,
            listTables,
            deleteDiagramTables,
            addField,
            getField,
            updateField,
            deleteField,
            addRelationship,
            getRelationship,
            updateRelationship,
            deleteRelationship,
            listRelationships,
            deleteDiagramRelationships,
            addDependency,
            getDependency,
            updateDependency,
            deleteDependency,
            listDependencies,
            deleteDiagramDependencies,
            addArea,
            getArea,
            updateArea,
            deleteArea,
            listAreas,
            deleteDiagramAreas,
            addCustomType,
            getCustomType,
            updateCustomType,
            deleteCustomType,
            listCustomTypes,
            deleteDiagramCustomTypes,
            addNote,
            getNote,
            updateNote,
            deleteNote,
            listNotes,
            deleteDiagramNotes,
        }),
        [
            getConfig,
            updateConfig,
            getDiagramFilter,
            updateDiagramFilter,
            deleteDiagramFilter,
            addDiagram,
            listDiagrams,
            getDiagram,
            updateDiagram,
            deleteDiagram,
            addGroup,
            listGroups,
            updateGroup,
            deleteGroup,
            addTable,
            getTable,
            updateTable,
            putTable,
            deleteTable,
            listTables,
            deleteDiagramTables,
            addField,
            getField,
            updateField,
            deleteField,
            addRelationship,
            getRelationship,
            updateRelationship,
            deleteRelationship,
            listRelationships,
            deleteDiagramRelationships,
            addDependency,
            getDependency,
            updateDependency,
            deleteDependency,
            listDependencies,
            deleteDiagramDependencies,
            addArea,
            getArea,
            updateArea,
            deleteArea,
            listAreas,
            deleteDiagramAreas,
            addCustomType,
            getCustomType,
            updateCustomType,
            deleteCustomType,
            listCustomTypes,
            deleteDiagramCustomTypes,
            addNote,
            getNote,
            updateNote,
            deleteNote,
            listNotes,
            deleteDiagramNotes,
        ]
    );

    return value;
}

export const ApiStorageProvider: React.FC<React.PropsWithChildren> = ({
    children,
}) => {
    const value = useApiStorage();

    return (
        <storageContext.Provider value={value}>
            {children}
        </storageContext.Provider>
    );
};
