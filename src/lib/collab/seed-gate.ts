/**
 * Phase 4 (docs/design/realtime-collaboration.md §10): decides when it's
 * safe to seed a freshly-loaded diagram's local (Dexie) data into a
 * collab-doc-backed room, without racing the server's own authoritative
 * state for that room.
 *
 * `seedIfEmpty` runs at most once, triggered by whichever of these
 * happens first:
 *  - `synced` — the initial sync completed, so the doc now reflects
 *    whatever the room already had (possibly nothing, for a diagram never
 *    opened collaboratively before). `seedIfEmpty` is expected to check
 *    for itself and only actually write if the doc is still genuinely
 *    empty — this function doesn't know what "empty" means for the
 *    caller's collections.
 *  - a `status` of `'disconnected'` arriving before `synced` ever did —
 *    treated as "assume offline for now, don't leave the diagram
 *    permanently unseeded". Chosen over a wall-clock timeout: a
 *    `disconnected` status only ever follows a connection attempt that
 *    actually failed or dropped (confirmed against `@hocuspocus/provider`
 *    source — it's emitted once per real socket close, never spuriously
 *    at construction), so this never fires while a slow-but-live server is
 *    still mid-handshake the way a fixed timer would.
 *
 * Trade-off this doesn't fully close: a transient failure immediately
 * followed by a successful reconnect would still trigger `seedIfEmpty`
 * once (assuming offline), and the late-arriving server state then merges
 * with that local seed via ordinary Yjs CRDT semantics rather than one
 * cleanly overwriting the other. Accepted as rare in practice — a
 * genuinely unreachable server is the common case this guards against, not
 * a one-off reconnect blip — and no worse than what any offline-first Yjs
 * client already does when reconnecting after a local edit.
 */
export interface StatusEmitter {
    on(event: 'synced', cb: () => void): unknown;
    on(event: 'status', cb: (data: { status: string }) => void): unknown;
}

export function seedWhenDecided(
    provider: StatusEmitter,
    seedIfEmpty: () => void
): void {
    let decided = false;
    const decide = () => {
        if (decided) return;
        decided = true;
        seedIfEmpty();
    };
    provider.on('synced', decide);
    provider.on('status', ({ status }) => {
        if (status === 'disconnected') decide();
    });
}
