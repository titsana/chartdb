import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { AUTH_MODE, COLLAB_WS_URL } from '@/lib/env';
import { getEntraAccessToken } from '@/lib/auth/get-entra-token';
import type { Diagram } from '@/lib/domain/diagram';
import { upsertTable, upsertItem, isRoomEmpty } from './y-diagram';
import { seedWhenDecided } from './seed-gate';

/**
 * Phase 4.5 (docs/design/realtime-collaboration.md §10): pushes a freshly
 * created diagram's content into its collab room, for every creation flow
 * that can't rely on the current tab's own ChartDBProvider adopting it the
 * normal way (loadDiagramFromData) — either because there's no
 * ChartDBProvider anywhere in that component's tree (clone-template-
 * page.tsx, examples-page.tsx are standalone routes wrapped only in
 * StorageProvider/LocalConfigProvider/ThemeProvider), or because calling
 * loadDiagramFromData would hijack the diagram the user currently has open
 * (diagram-row-actions-menu.tsx's "duplicate", which deliberately doesn't
 * navigate away).
 *
 * One mechanism for all five creation-ish call sites (blank/import/clone/
 * example/duplicate) rather than splitting into "the two dialogs that
 * happen to have provider access take a shortcut" — see the design doc's
 * Phase 4.5 section for why the shortcut was rejected even though it'd save
 * a network round trip for those two.
 *
 * Independent of any ChartDBProvider instance: opens its own short-lived
 * Y.Doc + HocuspocusProvider, writes, confirms the write actually reached
 * the server, then tears down. MUST be called after the diagram's
 * collab_diagrams row already exists server-side (i.e. after `POST
 * /diagrams` resolves) — the FK on yjs_updates/yjs_snapshots (server/src/
 * db/pool.ts) rejects any write for an unregistered id, and Hocuspocus
 * closes the connection when that happens.
 *
 * A no-op if COLLAB_WS_URL isn't configured — matches loadDiagramFromData's
 * own local-only fallback (its `!readonlyProp && COLLAB_WS_URL` check).
 * There's nowhere else for this content to durably land without a server.
 */
export async function seedDiagramRoom(diagram: Diagram): Promise<void> {
    if (!COLLAB_WS_URL) return;

    const doc = new Y.Doc();
    const provider = new HocuspocusProvider({
        url: COLLAB_WS_URL,
        name: diagram.id,
        document: doc,
        token: AUTH_MODE === 'azure-ad' ? getEntraAccessToken : null,
    });

    try {
        await new Promise<void>((resolve) => {
            seedWhenDecided(provider, () => {
                // Only seed an actually-empty room — a second clone of the
                // same fixed-id template/example (or a duplicate racing
                // another tab's write) would otherwise merge this
                // diagram's content into whatever's already there via
                // upsertTable/upsertItem, rather than the clean replace the
                // caller expects. The delete-then-recreate the caller
                // already does (see clone-template-page.tsx/examples-
                // page.tsx) is what's supposed to make this true; this is
                // the belt-and-suspenders check in case that round trip's
                // own delete raced something.
                if (isRoomEmpty(doc)) {
                    const tablesMap = doc.getMap<unknown>('tables');
                    const relationshipsMap =
                        doc.getMap<unknown>('relationships');
                    const dependenciesMap = doc.getMap<unknown>('dependencies');
                    const areasMap = doc.getMap<unknown>('areas');
                    const notesMap = doc.getMap<unknown>('notes');
                    const customTypesMap = doc.getMap<unknown>('customTypes');

                    doc.transact(() => {
                        (diagram.tables ?? []).forEach((table) =>
                            upsertTable(tablesMap, table)
                        );
                        (diagram.relationships ?? []).forEach((relationship) =>
                            upsertItem(relationshipsMap, relationship)
                        );
                        (diagram.dependencies ?? []).forEach((dependency) =>
                            upsertItem(dependenciesMap, dependency)
                        );
                        (diagram.areas ?? []).forEach((area) =>
                            upsertItem(areasMap, area)
                        );
                        (diagram.notes ?? []).forEach((note) =>
                            upsertItem(notesMap, note)
                        );
                        (diagram.customTypes ?? []).forEach((customType) =>
                            upsertItem(customTypesMap, customType)
                        );
                    });
                }
                resolve();
            });
        });

        // Confirm the write actually reached the server (and was applied)
        // before tearing the connection down — `synced` (what
        // seedWhenDecided waits on) only means the initial handshake
        // completed, not that this write was sent/acked (see
        // HocuspocusProvider's own doc comment on `synced` vs
        // `hasUnsyncedChanges`). Verified against the actual provider
        // source (dist/hocuspocus-provider.cjs): this provider is
        // constructed without `flushDelay`, so `batchingEnabled` is false
        // and `documentUpdateHandler` sends the transact()'d update
        // synchronously rather than buffering it — `hasUnsyncedChanges`
        // flips true at that same synchronous point and back to false only
        // once the server's SyncStatus message (a genuine "the update you
        // sent was applied" ack — see applySyncStatusMessage) comes back.
        // Polling it rather than trusting a fixed delay or an inferred
        // "no error was thrown", matching this codebase's established
        // preference (see the reconnect-convergence integration test) for
        // a real signal over a guess.
        //
        // Honesty note: sabotage-testing this exact loop (deleting it,
        // destroying right after resolve()) did NOT reproduce a failure in
        // this file's own integration test, over loopback — the
        // synchronous `send()` above apparently hands the bytes to the OS
        // socket before this point runs either way, and closing the
        // provider doesn't retract them. So this test suite doesn't prove
        // this poll is load-bearing. Kept anyway as a real, if unproven-
        // here, defense against a slower/lossier connection where the
        // socket might not have flushed before a synchronous destroy() —
        // the risk this loop guards against is real even where a fast
        // local loopback can't be made to demonstrate it.
        const deadline = Date.now() + 8_000;
        while (provider.hasUnsyncedChanges && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
    } finally {
        provider.destroy();
        doc.destroy();
    }
}
