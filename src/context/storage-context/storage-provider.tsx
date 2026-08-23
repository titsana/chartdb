import React, { useCallback } from 'react';
import type { StorageContext } from './storage-context';
import { storageContext } from './storage-context';
import type { Diagram } from '@/lib/domain/diagram';
import type { ChartDBConfig } from '@/lib/domain/config';
import type { DiagramFilter } from '@/lib/domain/diagram-filter/diagram-filter';
import { COLLAB_API_URL } from '@/lib/env';

/**
 * Phase 4.5 (docs/design/realtime-collaboration.md §10): Dexie removed
 * entirely — the collab server (server/src/diagrams, backed by the
 * `collab_diagrams` Postgres table) is now the only store for diagram
 * metadata/existence, and localStorage is the only store for the two
 * per-browser preferences that never had a server-side owner even before
 * this (no auth: "everyone can see every diagram" is the explicit product
 * decision, so there's no per-user account to hang these off of).
 *
 * The six per-collection groups below (tables/relationships/dependencies/
 * areas/customTypes/notes) are no-ops — Phase 2 already moved every one of
 * those collections to the shared Y.Doc (see chartdb-provider.tsx), and
 * these methods were left in only as a write-through sink, never read back
 * (confirmed by grep before deleting Dexie: nothing outside this file's own
 * old implementation called the get-one or list-all variants). The
 * StorageContext interface is kept as-is rather than shrunk, so none of the
 * 10 existing `useStorage()` consumers need to change their call shape.
 */

const noopVoid = async (): Promise<void> => {};
const noopUndefined = async (): Promise<undefined> => undefined;
const noopEmptyArray = async (): Promise<never[]> => [];

// --- localStorage-backed config / diagram-filter -----------------------
//
// Per-browser preferences with no server-side owner now that there's no
// auth (see the design doc's Phase 4.5 section for the "cut Dexie, no
// auth" decision this follows from) — same convention as
// local-config-provider.tsx, just kept behind StorageContext's existing
// Promise-returning interface so callers don't need to change.

const CONFIG_KEY = 'chartdb_config';
const diagramFilterKey = (diagramId: string) =>
    `chartdb_diagram_filter_${diagramId}`;

function readConfig(): ChartDBConfig | undefined {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return undefined;
    try {
        const parsed = JSON.parse(raw) as ChartDBConfig & {
            exportActions?: string[];
        };
        return {
            ...parsed,
            exportActions: parsed.exportActions?.map((d) => new Date(d)),
        };
    } catch {
        return undefined;
    }
}

function writeConfig(config: ChartDBConfig): void {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

// --- REST-backed diagram metadata ---------------------------------------
//
// `COLLAB_API_URL` is derived from `COLLAB_WS_URL` (see src/lib/env.ts) and
// so is always non-empty in a real deploy — the `!COLLAB_API_URL` branches
// below only ever take effect in unit tests (src/test/setup.ts mocks it to
// ''), the same way loadDiagramFromData's own `!readonlyProp &&
// COLLAB_WS_URL` check falls back to local-only when unconfigured. Matching
// that precedent here means the many existing component tests that mount a
// full provider tree don't need to mock `fetch` just to avoid real network
// I/O for a concern (diagram listing/metadata) they aren't testing.

interface DiagramMetadataDTO {
    id: string;
    name: string;
    databaseType: string;
    databaseEdition: string | null;
    createdAt: string;
    updatedAt: string;
}

function fromDTO(dto: DiagramMetadataDTO): Diagram {
    return {
        id: dto.id,
        name: dto.name,
        databaseType: dto.databaseType as Diagram['databaseType'],
        databaseEdition: (dto.databaseEdition ??
            undefined) as Diagram['databaseEdition'],
        createdAt: new Date(dto.createdAt),
        updatedAt: new Date(dto.updatedAt),
        // No server endpoint returns content for a list/single metadata
        // fetch — every collection lives only in the diagram's Y.Doc,
        // reachable only by actually opening its collab room (see
        // chartdb-provider.tsx's loadDiagramFromData/reconcileWithRoom).
        // Left undefined rather than `[]` so callers can tell "not fetched"
        // apart from "genuinely empty" if that distinction ever matters.
    };
}

// A killed/unreachable server can leave `fetch` pending forever (no
// close event to reject on) rather than failing fast — bug found via
// manual disconnect testing: a caller that does `showLoader(); await
// apiFetch(...); hideLoader();` with no timeout leaves the full-screen
// loading dialog stuck open indefinitely. 10s is generous for a local
// REST call but still bounds the hang.
const API_FETCH_TIMEOUT_MS = 10_000;

async function apiFetch<T>(
    path: string,
    init?: RequestInit
): Promise<{ status: number; body: T | undefined }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(`${COLLAB_API_URL}${path}`, {
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            ...init,
        });
        const body = res.status === 204 ? undefined : await res.json();
        return { status: res.status, body };
    } finally {
        clearTimeout(timeout);
    }
}

export const StorageProvider: React.FC<React.PropsWithChildren> = ({
    children,
}) => {
    const getConfig: StorageContext['getConfig'] = useCallback(async () => {
        return readConfig();
    }, []);

    const updateConfig: StorageContext['updateConfig'] = useCallback(
        async (config) => {
            writeConfig({ ...readConfig(), ...config } as ChartDBConfig);
        },
        []
    );

    const getDiagramFilter: StorageContext['getDiagramFilter'] = useCallback(
        async (diagramId) => {
            const raw = localStorage.getItem(diagramFilterKey(diagramId));
            if (!raw) return undefined;
            try {
                return JSON.parse(raw) as DiagramFilter;
            } catch {
                return undefined;
            }
        },
        []
    );

    const updateDiagramFilter: StorageContext['updateDiagramFilter'] =
        useCallback(async (diagramId, filter) => {
            localStorage.setItem(
                diagramFilterKey(diagramId),
                JSON.stringify(filter)
            );
        }, []);

    const deleteDiagramFilter: StorageContext['deleteDiagramFilter'] =
        useCallback(async (diagramId) => {
            localStorage.removeItem(diagramFilterKey(diagramId));
        }, []);

    const addDiagram: StorageContext['addDiagram'] = useCallback(
        async ({ diagram }) => {
            if (!COLLAB_API_URL) return;
            const { status, body } = await apiFetch<{ message?: string }>(
                '/diagrams',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        id: diagram.id,
                        name: diagram.name,
                        databaseType: diagram.databaseType,
                        databaseEdition: diagram.databaseEdition,
                    }),
                }
            );
            if (status === 409) {
                throw new Error(
                    `A diagram with id ${diagram.id} already exists`
                );
            }
            if (status !== 201) {
                throw new Error(
                    `Failed to create diagram: ${body?.message ?? status}`
                );
            }
        },
        []
    );

    const listDiagrams: StorageContext['listDiagrams'] =
        useCallback(async () => {
            if (!COLLAB_API_URL) return [];
            const { body } = await apiFetch<DiagramMetadataDTO[]>('/diagrams');
            return (body ?? []).map(fromDTO);
        }, []);

    const getDiagram: StorageContext['getDiagram'] = useCallback(async (id) => {
        if (!COLLAB_API_URL) return undefined;
        const { status, body } = await apiFetch<DiagramMetadataDTO>(
            `/diagrams/${id}`
        );
        if (status === 404 || !body) return undefined;
        return fromDTO(body);
    }, []);

    const updateDiagram: StorageContext['updateDiagram'] = useCallback(
        async ({ id, attributes }) => {
            if (!COLLAB_API_URL) return;
            // Only name/databaseType/databaseEdition have a server-side
            // home (see db/diagrams.ts's UpdateDiagramInput) — an empty
            // patch is still a legitimate call (updateDiagramUpdatedAt
            // uses one to bump `updated_at` with no other change).
            // `attributes.id` (rename) isn't supported at all — see
            // chartdb-provider.tsx's updateDiagramId, which refuses before
            // ever reaching here.
            await apiFetch(`/diagrams/${id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    name: attributes.name,
                    databaseType: attributes.databaseType,
                    databaseEdition: attributes.databaseEdition,
                }),
            });
        },
        []
    );

    const deleteDiagram: StorageContext['deleteDiagram'] = useCallback(
        async (id) => {
            if (!COLLAB_API_URL) return;
            // A 404 here is expected, not exceptional — e.g.
            // clone-template-page.tsx/examples-page.tsx delete-then-
            // recreate a fixed-id diagram, and 404 on the very first clone
            // of a given template is the normal case, not an error.
            // Idempotent delete: "already gone" counts as success.
            const { status } = await apiFetch(`/diagrams/${id}`, {
                method: 'DELETE',
            });
            if (status !== 200 && status !== 404) {
                throw new Error(`Failed to delete diagram ${id}: ${status}`);
            }
        },
        []
    );

    return (
        <storageContext.Provider
            value={{
                getConfig,
                updateConfig,
                addDiagram,
                listDiagrams,
                getDiagram,
                updateDiagram,
                deleteDiagram,
                addTable: noopVoid,
                getTable: noopUndefined,
                updateTable: noopVoid,
                putTable: noopVoid,
                deleteTable: noopVoid,
                listTables: noopEmptyArray,
                deleteDiagramTables: noopVoid,
                addRelationship: noopVoid,
                getRelationship: noopUndefined,
                updateRelationship: noopVoid,
                deleteRelationship: noopVoid,
                listRelationships: noopEmptyArray,
                deleteDiagramRelationships: noopVoid,
                addDependency: noopVoid,
                getDependency: noopUndefined,
                updateDependency: noopVoid,
                deleteDependency: noopVoid,
                listDependencies: noopEmptyArray,
                deleteDiagramDependencies: noopVoid,
                addArea: noopVoid,
                getArea: noopUndefined,
                updateArea: noopVoid,
                deleteArea: noopVoid,
                listAreas: noopEmptyArray,
                deleteDiagramAreas: noopVoid,
                addCustomType: noopVoid,
                getCustomType: noopUndefined,
                updateCustomType: noopVoid,
                deleteCustomType: noopVoid,
                listCustomTypes: noopEmptyArray,
                deleteDiagramCustomTypes: noopVoid,
                addNote: noopVoid,
                getNote: noopUndefined,
                updateNote: noopVoid,
                deleteNote: noopVoid,
                listNotes: noopEmptyArray,
                deleteDiagramNotes: noopVoid,
                getDiagramFilter,
                updateDiagramFilter,
                deleteDiagramFilter,
            }}
        >
            {children}
        </storageContext.Provider>
    );
};
