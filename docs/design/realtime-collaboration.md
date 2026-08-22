# Design Doc: Real-Time Multiplayer Collaboration

- **Status:** Draft — pending review
- **Branch:** `feature/collaboration_v2_2`
- **Author:** (fill in)
- **Date:** 2026-08-22

## 1. Summary

Add real-time multiplayer editing to ChartDB: multiple users open the same
diagram and see each other's edits, cursors, and selections live. This is a
ground-up addition — the app is currently 100% client-side (React + IndexedDB
via Dexie), with no server, no auth, and no network sync of any kind.

## 2. Goals

- Multiple browser tabs/users editing the same diagram see each other's
  changes propagate in real time.
- Concurrent edits (drag a table, rename a field, add a relationship) merge
  without manual conflict resolution.
- Users see who else is present: name, cursor position, what they're
  currently editing.

## 3. Non-goals (for this iteration)

- No real user accounts / SSO. Identity is anonymous + a display name typed
  by the user for the session.
- No fine-grained permissions (viewer/editor roles, invite links with scoped
  access). Anyone with the room/diagram ID can join and edit.
- No server-side history/versioning UI beyond what's needed for crash
  recovery (that's a separate, later design).
- **No offline editing.** This is an **online-only** system: a diagram can
  only be edited while connected to the collaboration server. Local browser
  storage is *not* a diagram-data cache or an offline queue — see §5.2.

## 4. Current architecture (baseline)

- `ChartDBProvider` (`src/context/chartdb-context/chartdb-provider.tsx`) is
  the single source of truth on the client: every add/update/delete mutates
  React state directly, and separately triggers a write to
  `StorageProvider` (Dexie/IndexedDB) and — when history is enabled — a
  local undo/redo entry.
- `HistoryProvider` keeps local-only undo/redo stacks; there is no concept
  of "whose edit is this" because there has only ever been one editor.
- No WebSocket, no server process, no shared persistence — each browser has
  its own independent copy of every diagram.

This doc proposes inserting a sync layer between the existing
`ChartDBProvider` API surface and a new server, so that downstream
components (canvas, side panel, dialogs) need minimal changes.

## 5. Proposed architecture

### 5.1 Sync engine: Yjs (CRDT)

Yjs is chosen over OT or naive last-write-wins broadcast because ChartDB's
edit patterns (drag a table, rename a field, add an index) are naturally
field-level and conflict-free under CRDT merge — no central sequencer or
manual conflict UI needed.

### 5.2 Client-side changes

- One `Y.Doc` per diagram; **room key = existing `diagram.id`** (no new ID
  scheme needed).
- Domain collections map to nested `Y.Map`s so merges happen at the field
  level, not the whole-object level:

  ```
  Y.Doc
  ├─ tables:        Y.Map<tableId, Y.Map<field, value>>
  ├─ relationships:  Y.Map<relId, Y.Map<field, value>>
  ├─ dependencies:   Y.Map<depId, Y.Map<field, value>>
  ├─ areas:          Y.Map<areaId, Y.Map<field, value>>
  ├─ customTypes:    Y.Map<typeId, Y.Map<field, value>>
  └─ notes:          Y.Map<noteId, Y.Map<field, value>>
  ```

  Example: two users dragging different tables at the same time each only
  touch their table's `x`/`y` fields inside its own `Y.Map` — no whole-array
  conflict.

- **This system is online-only.** The `Y.Doc` has **no local persistence
  provider** (no `y-indexeddb`, no offline queue) — Postgres on the server
  is the only durable copy of diagram data. If the WebSocket connection
  drops, the client stops accepting edits (see §9) until it reconnects and
  re-syncs from the server; there is nothing to reconcile because nothing
  was written locally while disconnected.
- A WebSocket provider connects to the new server and syncs `Y.Doc` updates
  in both directions whenever connected.
- **Presence** (cursor position, current selection, typed display name) uses
  Yjs's `Awareness` protocol — a separate, ephemeral channel that is *not*
  persisted, so presence data never pollutes the diagram's durable state.
- **Undo/redo**: replace `HistoryProvider`'s local stacks with Yjs's
  `UndoManager`, scoped per client/origin, so undoing your own action never
  reverts someone else's concurrent edit. The per-user undo/redo stack is
  **in-memory only** (`Y.UndoManager`'s own stack) — no `localStorage`, no
  IndexedDB, no persistence of any kind. It is never synced to other users
  or to the server. This means a page refresh loses undo history, which is
  the correct, unsurprising behavior for an online-only system: a refresh
  already means reconnect + resync a fresh `Y.Doc`, so there is no session
  for an undo stack to survive into anyway. `StorageProvider`/Dexie has
  **no remaining role** in this design — it is retired entirely, not
  repurposed — see §8 Migration.

### 5.3 Server: NestJS + Hocuspocus

**Revised during Phase 3** (see that section for the full trace): the
original plan below this paragraph was a NestJS WebSocket Gateway
implementing `y-protocols` (`sync` + `awareness`) by hand, on the reasoning
that auth guards/DI/logging integrate more naturally with a pure NestJS
gateway than with dropping in Hocuspocus. Revisited before writing that
gateway: Hocuspocus's own hook system (`onLoadDocument`/`onStoreDocument`
for persistence, `onAuthenticate` for auth) covers the same integration
points, for much less hand-rolled protocol code — and hand-rolled
sync-protocol code is exactly the highest-risk surface here. Hocuspocus is
wired in as a plain NestJS **provider** (constructed inside a module,
`OnModuleInit`/`OnModuleDestroy`-managed, receiving injected dependencies
like the Postgres pool through its constructor) rather than run via its own
standalone `Server` class, so it still shares Nest's DI container and one
HTTP port instead of needing its own.

**Consequence worth being explicit about**: Hocuspocus's wire protocol
prefixes every message with the document name, which a plain `y-websocket`
client never sends and has no fallback for — the two are not
interchangeable at the wire level despite both being "a Yjs WebSocket
server using y-protocols under the hood". The client library is
`@hocuspocus/provider`, not `y-websocket`, from Phase 3 onward; Phase 4's
"wire the Phase 2 adapter's `Y.Doc` to the Phase 3 server" now means
importing `@hocuspocus/provider` into the client bundle, not `y-websocket`.
Confirmed directly against the `@hocuspocus/server` source before committing
to this (`ClientConnection.ts`'s message dispatch reads a `varString`
document-name prefix unconditionally, no legacy-format branch), not assumed.

- **Gateway**: one Hocuspocus instance per process; it multiplexes every
  diagram's room internally by document name (read from each wire message,
  not from the WebSocket URL — the URL is the same single endpoint for
  every diagram). A NestJS provider (`WsUpgradeService`) attaches the
  WebSocket upgrade handling directly to Nest's own HTTP server (one port,
  matching "single instance only" below) and forwards each raw `ws`
  connection's `message`/`close` events into the `ClientConnection` that
  `hocuspocus.handleConnection()` returns — that forwarding isn't automatic
  (`handleConnection` only registers the connection; it attaches no
  listeners to the socket itself, confirmed by reading `ClientConnection.ts`
  — there simply are no `.on(...)` calls in it), and missing it produces no
  error on either side: the client sees a normal "connected" status, but
  sync never completes.
- **Redis**: pub/sub broadcast across NestJS instances (so this scales
  horizontally — a client connected to instance A gets updates from a peer
  on instance B), and a hot cache of currently-active rooms/awareness state.
- **Postgres**: durable store for each diagram's Yjs update log (`bytea`
  column, append-only) plus a periodically compacted snapshot, so a server
  restart or Redis eviction never loses data. This is the new
  server-side source of truth; the client's IndexedDB copy is a
  synced replica.
- **Identity**: no real auth. A client joins a room with `diagramId` +
  a self-chosen display name, used only for presence labels (cursor name
  tag, "X is editing this table").

### 5.4 Data flow

```
Browser A                     NestJS server                    Browser B
─────────                     ─────────────                    ─────────
Y.Doc (in-memory only,
no local persistence)
     │
     │ WebSocket (y-protocols: sync + awareness) — required, no offline mode
     ▼
NestJS Gateway  ──Redis pub/sub──▶ other instances ──▶ NestJS Gateway ──▶ Y.Doc (in-memory) ── Browser B
     │
     ▼
Postgres (update log + periodic snapshot — the only durable copy)

Browser A also keeps a separate, local-only per-user undo/redo stack
(Y.UndoManager, in-memory only, no persistence) — never synced, never
touches Postgres/Redis, and lost on page refresh (consistent with
online-only: a refresh means reconnect + resync a fresh Y.Doc anyway).
```

## 6. Impact on existing code

| Area | Change |
|---|---|
| `ChartDBProvider` | Needs an adapter layer: existing `add*/update*/remove*` methods read/write through the `Y.Doc` instead of raw React state. Public API surface stays the same where possible to limit blast radius on consumers (canvas, side panel, dialogs). |
| `HistoryProvider` / `RedoUndoStackProvider` | Replaced by Yjs `UndoManager`, scoped per client origin. |
| `StorageProvider` (Dexie) | Retired entirely — no remaining role. Diagram data lives in Postgres server-side; the per-user undo/redo stack is in-memory only (`Y.UndoManager`), not persisted anywhere client-side. |
| `CanvasProvider` / canvas components | New: render remote cursors, per-user selection highlight, "user is editing this table" indicator, driven by Yjs Awareness state. |
| Relationship creation | `81dae56` already fixed a race between edge creation and handle registration in the single-user case; multi-user concurrent relationship creation needs re-validation under this new model (two users drawing overlapping relationships at once). |
| ID generation | Table/field/relationship IDs are currently client-generated (`generateId()` in `src/lib/utils/utils.ts`). Needs re-verification that concurrent ID generation across clients can't collide (current scheme should already be collision-resistant, but confirm). |

## 7. Deployment

- New services added to `docker-compose`/deployment alongside the existing
  Vite + nginx setup: NestJS app, Postgres, Redis.
- Existing `public/config.js` runtime-override pattern is extended with a
  new collaboration server URL (e.g. `COLLAB_WS_URL`).

## 8. Migration / rollout plan

Once enabled, a diagram is fully online-only (no fallback to today's
local-storage mode) — this ships behind a feature flag while under
development. See **§10 Implementation plan** for the full phased
breakdown (data-model fixes → in-process adapter → server → end-to-end
sync → presence/UX → scale-out → hardening); that section is the
authoritative sequencing, kept here only as a one-line pointer so this
summary can't drift out of sync with it.

## 9. Open questions / risks

- **Disconnect behavior**: since this is online-only, what does the UI do
  the moment the WebSocket drops — freeze the canvas read-only, show a
  blocking "reconnecting…" overlay, or something less disruptive? Needs a
  concrete UX spec; "the user just can't edit" isn't enough on its own.
- **Undo semantics across users**: needs a concrete UX decision — does
  "undo" only ever revert your own last change, never someone else's,
  even if it was the most recent edit to the document? (Yjs `UndoManager`
  supports this via per-origin tracking, but the exact UX — e.g. what
  happens if the field you're undoing was since edited by someone else —
  needs a written spec before implementation.)
- **Undo stack stale references**: the in-memory undo/redo stack (§5.2)
  holds entries that point at specific table/field/relationship IDs. If
  another user deletes that table before you hit undo, what happens — the
  entry silently no-ops, gets dropped from the stack, or something else?
  (No persistence/size-limit question here anymore: the stack is in-memory
  only, scoped to one browser tab's session, and disappears on refresh —
  see §5.2.)
- **Room lifecycle**: when does a Postgres-backed room get created (on
  first collaborator join) vs. torn down (all users disconnect — do we
  keep the room "warm" for N minutes, or persist-and-close immediately)?
- **Abuse/spam**: with no auth, anyone with a diagram ID can join and edit.
  Acceptable for this iteration per the "anonymous" decision, but should be
  called out explicitly as a known limitation, not an oversight.
- **Concurrent relationship/index creation**: needs explicit test cases
  once implemented (two users creating a relationship between the same two
  tables simultaneously, two users adding an index with the same name,
  etc.).
- **No diagram-discovery path for a genuinely new collaborator — found via
  real manual two-browser testing after Phase 4 landed, not designed for
  by any phase above.** `loadDiagram(diagramId)` (`chartdb-provider.tsx`)
  reads **only** from local Dexie (`storageDB.getDiagram(...)`) — there is
  no fallback to fetch diagram metadata from the collab server. If a
  diagram id isn't already in a browser's own Dexie, `use-diagram-loader.tsx`
  shows the "open diagram" picker and never calls `loadDiagramFromData`,
  so that browser never even attempts to join the room — regardless of
  what the collab server already holds for that id. Concretely: everything
  Phase 4 built and verified (seed-vs-adopt, concurrent edits, reconnect
  convergence) only actually works between multiple tabs/windows of the
  *same* browser (same profile, same Dexie) — the same-origin
  IndexedDB is what makes it look like "two clients," not a second real
  user opening a shared link. A truly new collaborator, on a different
  browser/profile/machine who has never had this diagram locally, cannot
  open it at all today, no matter how the link or id reaches them. Needs a
  real fix before "share this diagram with someone else" is a genuine
  claim: at minimum, an endpoint to fetch a diagram's current state from
  the collab server (or Postgres) when it's missing locally, wired into
  `use-diagram-loader.tsx`'s not-found branch. Not scoped to any phase
  above yet — should land before Phase 5's presence/UX work, since
  presence for collaborators who can't even open the diagram is moot.

## Appendix A: Prior art found in `server/`

While starting this design, an existing `server/` directory was found in
the repo with a **fully compiled backend** (`server/dist/`) implementing a
large chunk of exactly this feature — `collaboration/diagram-ydoc.js`,
`realtime/room-server.js` (built on **Hocuspocus**, not a custom NestJS
gateway), `auth/entra-jwt.guard.js` (real Azure AD/Entra auth, not
anonymous), plus `membership/`, `groups/` (invite system), an `ai/` proxy
module, and `lifecycle/restore-drill.js` (backup/restore testing). Code
comments reference ticket IDs `COL-011` through `COL-018+`.

**However, `server/src/` (the TypeScript source) is empty** (no `.ts`
files) and `server/` is **not tracked in git** — only the compiled
`dist/` and `node_modules/` exist on disk, so this prior work cannot be
recovered from version control. Per direction from the project owner, this
design proceeds as a **fresh build** rather than attempting to reverse the
compiled output back into source.

This is left here as a reference in case it's useful later: the compiled
output shows a materially larger scope than what's specified above (real
auth, membership/invites, AI proxy) and could inform a v2 once the MVP
described in this doc is working.

**Update, found at the start of Phase 3**: "not tracked in git" turned out
to be narrower than it read above — a local sibling branch,
`feature/collaboration_v2`, has a substantial `server/` implementation
that *is* in git (TypeORM entities, Hocuspocus gateway, real Entra ID auth,
1076 commits ahead of this branch's common ancestor). This is a different
discovery than the `dist/`-only prior art described above (that one really
is unrecoverable; this one just wasn't looked for on other branches).
Surfaced to the project owner before writing any Phase 3 code; the decision
was still to build fresh per this doc, not to reuse or reference `v2` — a
deliberate choice made with full information, not the forced one the
original "cannot be recovered" framing implied. One thing *was* carried
over from this discovery: this doc's WebSocket layer choice — see §5.3 —
because `v2`'s use of Hocuspocus prompted revisiting (not adopting)
NestJS-vs-Hocuspocus for Phase 3, on its own merits, independent of `v2`.

## Appendix B: Race Condition Audit (Editor Core)

Read-only audit of `src/context/chartdb-context/chartdb-provider.tsx`,
`history-provider.tsx`, `canvas.tsx`, `canvas-provider.tsx`,
`create-relationship-node.tsx`, `use-update-table-field.ts`,
`use-update-table.ts`, `db-table.ts`, `apply-ids.ts`, `clone.ts`, and
`utils.ts` — every place the current single-editor codebase assumes it's
the only writer, and what happens when a second concurrent user breaks
that assumption. Ordered by severity, most severe first. These need to be
fixed as part of the `ChartDBProvider` ⇄ `Y.Doc` adapter work (§8, step 2),
not deferred to a later pass.

### High — data corruption / crash

1. **Undo/redo wholesale-replaces the entire `tables` array.**
   `history-provider.tsx:64-69, 274-285` replay undo/redo via
   `updateTablesState(() => snapshotTables, { forceOverride: true })`, and
   `chartdb-provider.tsx:522-524` makes `forceOverride: true` return the
   snapshot as-is, bypassing the normal per-id merge (`:526-537`). This
   path fires on nearly every table drag/resize/reparent
   (`canvas.tsx:1141`, `:779`).
   *Break:* User A drags a table (undo entry = full-tables snapshot from
   before the drag). User B adds a new table. A hits Ctrl+Z → the old
   snapshot replaces the whole array → B's new table vanishes, and any
   edits B made to tables present in that snapshot are reverted too.
   *Fix direction:* undo/redo must never replay a whole-collection
   snapshot against a shared doc — scope it to only the fields the
   original action touched, or retire `HistoryProvider` for
   `Y.UndoManager` (already planned in §5.2) before this path can run
   concurrently.

2. **`fields`/`indexes`/`checkConstraints` are stored as one array value, not a keyed collection.**
   `updateField`/`removeField` (`chartdb-provider.tsx:656-799`) and
   `addIndex`/`removeIndex`/`updateIndex` (`:895-1065`) and
   `addCheckConstraint`/`removeCheckConstraint`/`updateCheckConstraint`
   (`:1067-1271`) all do whole-array read-modify-write against
   `table.fields`/`table.indexes`/`table.checkConstraints`.
   *Break:* User A renames a column; User B concurrently adds an index on
   a different column of the same table. Both compute a full `indexes`
   array from their own stale copy and write it back as one blob;
   whichever write lands second in the Y.Map wins entirely — B's new
   index is silently deleted by A's unrelated rename.
   *Fix direction:* model `fields`/`indexes`/`checkConstraints` as their
   own nested `Y.Map<id, Y.Map<...>>` keyed collections (per §5.2's
   pattern), not as an array under one key — this needs to happen
   *before* the adapter ships, not be treated as already covered by the
   existing `Y.Map<field, value>` design.

3. **Cascade-delete of relationships/dependencies is computed from a stale closure.**
   `removeTables` (`chartdb-provider.tsx:385-463`) and
   `updateTablesState` (`:515-646`) each compute
   `relationshipsToRemove`/`dependenciesToRemove` once from the closure
   captured at call time.
   *Break:* User A deletes Table T (cascade computed against A's current
   state). User B, in the same window, creates a relationship pointing at
   T (see #4 — no existence re-check). A's cascade list was computed
   before B's relationship existed, so it's never removed — a
   relationship permanently references a table that no longer exists,
   crashing or misrendering anywhere code assumes
   `getTable(relationship.sourceTableId)` is non-null (edge rendering,
   SQL export).
   *Fix direction:* enforce cascade-delete as a merge-time/server-side
   referential-integrity rule (drop any relationship/dependency whose
   endpoint table doesn't exist), not a client-computed one-shot list.

4. **No existence re-validation at relationship/dependency creation time.**
   `createRelationship` (`chartdb-provider.tsx:1317-1356`) fetches
   `sourceTable`/`targetTable` but proceeds even if either is `null`.
   `canvas.tsx:811-819`'s dependency-creation branch has *zero* guard at
   all (unlike the relationship branch right below it,
   `canvas.tsx:826-831`, which at least early-returns on a null field).
   `create-relationship-node.tsx:142-207`'s `handleCreate` can sit open
   for seconds (user picking a target field) before committing.
   *Break:* user drags a relationship onto Table T; before clicking
   "Create," a remote peer deletes T; `handleCreate` still fires and
   writes a relationship whose target no longer exists.
   *Fix direction:* re-validate source/target table+field existence at
   the point of merge/commit, not just at UI-render time.

### Medium — visible glitches / silently-wrong data

5. **Self-healing effects re-run independently on every client, causing echo-loops.**
   `use-update-table-field.ts:106-118` (PK-implies-not-null correction)
   and `canvas.tsx:746-799` (`checkParentAreas`, recomputes
   `parentAreaId` from node geometry) both fire as effects on every
   connected client. A moves an area → every client recomputes and writes
   back `parentAreaId` → that write changes `nodes` on every client →
   recompute fires again. Under a CRDT this is unbounded update-log growth
   and undo-stack pollution, not just re-render churn.
   *Fix direction:* derived/corrective writes must run once (server-side,
   or gated to a single elected writer), never as an effect every peer
   independently re-fires.

6. **Debounced field edits can silently discard a concurrent remote edit to the same field.**
   `use-update-table-field.ts:93-98` stops re-syncing the local input
   from incoming `field.name` once the user starts typing; `:275-285`'s
   `debouncedNameUpdate` then compares only against the stale closure and
   unconditionally overwrites.
   *Break:* A starts renaming a field; B renames the same field a moment
   later; A never sees B's version, and A's debounce silently overwrites
   B's rename with no conflict signal.
   *Fix direction:* rebase the debounced write against the current Y.Map
   value at commit time, or surface a "someone else changed this"
   indicator instead of a blind overwrite.

7. **Primary-key/unique auto-assignment races.**
   `use-update-table-field.ts:306-319` auto-sets `unique: true` only when
   `primaryKeyCount === 0`, computed from each client's own local field
   list.
   *Break:* A and B each mark a *different* field as PK on the same table
   while each locally sees `primaryKeyCount === 0`. After merge, two
   fields end up `primaryKey: true`, each independently `unique: true` —
   two single-column unique constraints instead of one correct composite
   PK. Silently wrong generated SQL, no crash.
   *Fix direction:* recompute this invariant from merged state after
   sync (or enforce server-side), not from a pre-merge local count.

8. **Handle-index assignment still depends on array order + a fixed timeout — the same bug class `81dae56` fixed, unresolved for multi-user.**
   `canvas.tsx:407-491` assigns edge/dependency handle suffixes by
   iterating `relationships`/`dependencies` in array order with
   post-incrementing counters, gated by a 100ms `setTimeout` readiness
   heuristic (lines 416, 481). `canvas.tsx:586-678` independently
   recomputes the mirror `targetEdgeCountsByField`.
   *Break:* Yjs doesn't guarantee identical iteration order across
   replicas after a merge — two peers can assign different index suffixes
   to the same relationships, rendering edges on the wrong handle. A
   burst of remotely-applied relationship inserts in one Yjs transaction
   can still outrun the fixed 100ms delay the same way the original
   single-user race did.
   *Fix direction:* derive the handle index from a stable per-relationship
   key (its id), not positional array order; gate on an actual "handles
   registered" signal, not a fixed timeout.

9. **Default name/order counters race on concurrent creation.**
   `createTable`/`createField`/`createIndex`/`createCustomType`/
   `createArea` (`chartdb-provider.tsx:341-343, 872, 1000, 1999, 1659`)
   all derive default name/order from the current local array length.
   *Break:* two users click "add table" simultaneously when both see 5
   tables → both create `table_6` (distinct ids, duplicate default name)
   with the same `order: 5`. Cosmetic (renamable), but duplicate names can
   produce invalid/ambiguous SQL on export if never renamed.
   *Fix direction:* derive default names/order from a counter that
   increments in the merged doc, not `array.length`.

10. **Independent full-diagram auto-layout runs computed against stale sibling positions.**
    `db-table.ts`'s `adjustTablePositions`/`adjustTablePositionsWithoutAreas`/
    `positionTablesWithinArea`/`isOverlapping`/`findNonOverlappingPosition`,
    invoked from `canvas-provider.tsx:86-153`'s `reorderTables` and the
    auto-arrange-area feature, compute a full new layout from one local
    snapshot.
    *Break:* two users trigger auto-arrange near-simultaneously; each
    computes a complete layout against its own stale view of sibling
    positions; per-table x/y writes interleave under last-write-wins,
    producing a merged layout that matches neither computed layout and
    can reintroduce overlaps each one individually eliminated.
    *Fix direction:* treat auto-arrange as a single-writer, non-concurrent
    operation (serialize server-side), not a client-local batch write.

11. **Name-based ID reconciliation breaks under a concurrent rename.**
    `apply-ids.ts:70-235` matches tables/fields/indexes/relationships/
    dependencies/custom types across two diagram snapshots purely by
    `schema::name` string keys.
    *Break:* an `applyIds` call (diff/reimport-style) runs while a remote
    peer renames the same table; the name-based key no longer matches, so
    the renamed entity is treated as brand-new instead of reconciled —
    duplicate/orphaned entries after the apply.
    *Fix direction:* match by stable id where available; keep name-based
    matching only for genuinely external imports.

12. **Diff-preview readonly gate only swaps the storage backend, not the shared document.**
    `chartdb-provider.tsx:46, 105-141` swap `readonly`/`db` between
    `storageInitialValue` and `storageDB`, but `diffCalculatedHandler`
    (`:80-96`) still mutates the same `tables`/`relationships`/`areas`
    React state unconditionally.
    *Break:* the obvious way to build the Y.Doc adapter — "these
    add*/update* methods now write through the Y.Doc instead of raw
    state" (§6) — would broadcast one user's private diff-preview scratch
    state to every connected peer, since `readonly` today only gates the
    storage layer, not the in-memory state the adapter would sync.
    *Fix direction:* the adapter must gate on `readonly` before ever
    writing to the Y.Doc, not just before writing to Dexie.

### Low — adapter hazards / cosmetic

13. **`addField` fires a persistence side-effect from inside the `setTables` state updater itself** (`chartdb-provider.tsx:808-824`) — a document write executed inside a React reducer is a concrete hazard for whatever adapter replaces `db.updateTable` with a Y.Doc transaction (risk of double-apply or writing outside the intended transaction boundary).

14. **`generateDiagramId()`'s collision-resistance is weaker than `generateId()`'s.**
    `utils.ts:15`: `generateId()` is a 25-char nanoid (~129 bits) —
    genuinely collision-free, no change needed. `:28-32`:
    `generateDiagramId()` is an 8-char per-browser workspace prefix
    (cached in `localStorage`) + 4 random chars. Since §5.2 makes
    `diagram.id` the Yjs room key, a new diagram's uniqueness rests almost
    entirely on that weaker scheme — worth strengthening explicitly
    rather than assuming "IDs are fine" covers this too.

15. **`overlapGraph` incremental computation is visual-only and self-correcting** (`canvas.tsx:908-965, 1338-1464`) — can flash a wrong highlight for a render or two if stale relative to a remote change, but recomputes on the next relevant change and never touches persisted data. No fix needed beyond what #8/#10 already cover for the underlying position data.

## 10. Implementation plan

Phased so that each phase ships something independently testable and
never leaves the app in a broken state. Race-condition fixes (Appendix B)
are front-loaded into Phase 1 — deliberately *before* any networking
exists — because they're far cheaper to test and verify against the
existing single-user test suite than after a live sync layer is in the
loop, and several of them (#1, #2, #3) change the shape of state that
later phases build directly on top of.

### Phase 0 — Safety net (no behavior change) — ✅ Done (`30f7df6`)

**Goal:** a regression harness that proves single-user behavior is
unchanged before any refactor starts.
- Add/extend tests around `ChartDBProvider`'s CRUD methods, `HistoryProvider`
  undo/redo, and the `canvas.tsx` connect/node-change handlers — the exact
  surfaces Phase 1 is about to touch.
- No product code changes in this phase.
**Exit criteria:** existing + new tests green; this suite is the thing
every later phase runs against.

**Result:** `history-provider.test.tsx` + `chartdb-provider.test.tsx` added
(no product code touched). Covers undo/redo LIFO ordering, hasUndo/hasRedo
transitions, the `removeTables` undo `Promise.all` concurrency shape, and
three `appendix-b:<n>` pins of current, known-broken behavior Phase 1 must
flip: **#1** (`updateTablesState({forceOverride:true})` clobbers a table
added after the snapshot), **#2** (`updateField` writes the whole `fields`
array back as one blob), **#9** (concurrent `createTable()` calls collide
on the same stale-closure default name). Also fixed: `test:ci` was
silently missing 18 suites (`ai`/`@ai-sdk/openai` absent from
`node_modules`, no lockfile change) — full suite is now 109 files / 842
tests green.
**Known gap, deferred to Phase 1:** `canvas.tsx` connect/node-change
handlers are *not* covered here — they sit behind `ReactFlowProvider` +
DOM measurement, too expensive to harness before the handler logic is
extractable. Appendix B's canvas-specific findings (#8 handle-index
assignment, #10 auto-layout) still need direct test coverage once Phase 1
makes that extraction cheap.

### Phase 1 — Data-model + invariant fixes (client-only, still single-user, no Yjs yet) — ✅ Done (9/9 items in scope)

**Goal:** close every Appendix B finding that's a property of the data
model or invariant logic itself, independent of whether a CRDT is
involved — so the *next* phase (the Yjs adapter) starts from state that's
already safe to merge, instead of trying to fix these two things at once.
> **#2 reclassified out of this phase.** Re-modeling `fields`/`indexes`/
> `checkConstraints` as keyed collections was originally listed here, but
> the audit's own fix direction for it is a nested `Y.Map<id, Y.Map<...>>`
> — the "keyed collection" *is* the Yjs type. There's no Yjs in the tree
> during Phase 1, so a client-only stand-in (e.g. `Record<string, DBField>`)
> would buy zero behavioral change while React state is the only writer,
> would cost every array consumer of `table.fields`/`table.indexes`
> (sql-export, dbml import/export, `apply-ids.ts`, `db-table.ts`, the zod
> schemas in `diagram.ts`, side panel, canvas renderers), and would force
> reintroducing field display-order that a plain keyed map drops. It also
> can't meet this phase's own exit criteria ("verifiable without a CRDT in
> place"). Moved to Phase 2 as its first task instead, where the
> two-in-memory-`Y.Doc` merge tests can verify it directly. See Phase 2
> below.
- Make cascade-delete of relationships/dependencies a derived
  recomputation (from current state, not a captured closure) instead of a
  one-shot list (**#3**). — ✅ Done (`1304e84`): the filter condition
  inside `setRelationships`/`setDependencies` is now re-evaluated against
  whatever is live when React applies the update (`removeTables`: against
  `ids` directly; `updateTablesState`: against `survivingTableIds`), not
  against a precomputed list from a closure snapshot. Verified by
  reverting the fix and confirming the new tests fail against the old
  code. The db.delete\*()/undo-data half of this still uses the closure
  snapshot — full enforcement there is merge-time/server-side, per the
  original fix direction.
- Add existence re-validation at relationship/dependency creation commit
  time, not just at UI-render time (**#4**). — ✅ Done (`410886b`):
  `createRelationship`/`createDependency` now throw if their source/
  target table or field no longer exists; all three call sites (dialog,
  create-relationship-node, canvas.tsx's two connect branches) updated
  to handle it with an error message/toast instead of proceeding or
  unhandled-rejecting.
- Turn the self-healing effects (PK-implies-not-null,
  `checkParentAreas`'s `parentAreaId` correction) into idempotent
  single-pass corrections instead of effects that re-fire off their own
  writes (**#5**). — ✅ Done (`cf265c1`), the `use-update-table-field.ts`
  half: the PK-implies-not-null correction now passes
  `{ updateHistory: false }` so it stops pushing its own undo entry.
  `canvas.tsx`'s `checkParentAreas` correction already did this (verified,
  no change needed there). The "runs once per peer, not once per shared
  doc" half of this finding is Yjs/server-era territory, correctly
  deferred past Phase 1. **Note:** the #7 fix below adds a second effect
  with this exact same deferred half — every client rendering a PK field
  independently re-fires the same `unique` correction once a shared doc
  exists. Single-user correct and tested now, but converges via N
  update-log entries instead of one; Phase 2 must gate *both* this effect
  and the #7 effect under one elected writer, not just this one.
- Rebase debounced field writes against current value at commit time, or
  surface a conflict indicator (**#6**). — ✅ Done (`eb3b4f7`): fixed the
  shared `debounce()` utility to expose a real `cancel()` — the caller
  already asked for it, it was a silent no-op. Closes the silent-overwrite
  case (a stale pending write no longer fires); doesn't make the user's
  own pending edit survive a same-field remote change non-destructively —
  that's Yjs/Y.Map's per-field merge, Phase 2+.
- Recompute the primary-key/unique invariant from full current state after
  any write, not from a pre-write local count (**#7**). — ✅ Done
  (`cf265c1`): removed the `unique` guess from
  `debouncedPrimaryKeyUpdate`'s write path; added a dedicated effect that
  recomputes it from the live, post-write `primaryKeyCount` every render.
- Derive handle-index assignment from relationship id, not array position
  (**#8** — this is the same bug class `81dae56` already fixed once;
  fixing it properly here means it can't regress a third time). — ✅ Done
  (`29760a7`): extracted into pure, unit-tested functions in
  `canvas-handle-index.ts` that sort ids sharing a target instead of
  relying on array iteration order — also closes the Phase 0 canvas.tsx
  coverage gap for this finding. The fixed-100ms-timeout half of #8
  (gate on a real "handles registered" signal) is left as a known,
  separately-scoped remaining gap.
- Derive default name/order from an incrementing counter, not
  `array.length` (**#9**). — ✅ Done (`9ee9a52`): ref-based monotonic
  counters in `chartdb-provider.tsx` for tables/fields/indexes/areas/
  custom types, reset on diagram load.
- Switch `apply-ids.ts` matching to stable-id-first, name-based only as
  fallback for external imports (**#11**). — ✅ Done (`893403a`): checks
  each entity's id against the source diagram's ids first, for every
  entity kind; only entities with no id overlap fall back to name-based
  matching (a no-op for the common fresh-import case).
- Gate the diff-preview readonly path so it can't write through whatever
  the eventual Y.Doc adapter is (**#12**) — verify this explicitly once
  Phase 2 exists, but the gate itself belongs here. — ✅ Done (`4ebdb30`):
  `diffCalculatedHandler` now gates on a `readonlyRef` mirrored every
  render before mutating tables/relationships/areas state. Re-verify
  against the real adapter once Phase 2 exists, per the note above.
  **Status re: Phase 2's `notes` slice:** still pending, and correctly
  so — `diffCalculatedHandler` only ever writes `tables`/`relationships`/
  `areas`, never `notes`, so there is nothing to re-verify for the
  collection actually migrated so far. This re-verification becomes real
  once `tables` (or `relationships`/`areas`) migrates to the doc.
- Undo/redo: stop replaying whole-array snapshots via `forceOverride`
  (**#1**) as a standalone fix, ahead of the full `Y.UndoManager` swap in
  Phase 5 — this one is worth fixing early since it's actively wrong for
  single-user undo too (an in-between edit to *any* table gets clobbered
  by an unrelated undo today). — ✅ Done (`8d9de0d`): undo/redo's updateFn
  now reconstructs from its live `currentTables` argument (patch touched
  tables, restore/re-delete via a new `deletedTableIds` field) instead of
  replaying a stale closure; `forceOverride` itself is unchanged and still
  used, just called correctly.
**Exit criteria:** Phase 0 suite still green; app is still 100%
single-user with zero networking; every fix above is independently
verifiable without a CRDT in place.

### Phase 2 — `Y.Doc` ⇄ `ChartDBProvider` adapter (in-process, no server) — ✅ Migration done, exit criteria partially verified (see below)

**Goal:** prove the data-model mapping (§5.2) works, entirely in-memory,
before any network code exists.
- **First task, moved from Phase 1:** re-model `fields`/`indexes`/
  `checkConstraints` as keyed `Y.Map<id, Y.Map<...>>` collections instead
  of opaque arrays (**Appendix B #2**) — the foundation everything else in
  this phase sits on top of. Do this as part of building the adapter
  itself, not as a separate client-only pass, since the keyed collection
  *is* the Yjs type. — ✅ Done (`42a460f`): `src/lib/collab/y-diagram.ts`
  has pure `diagramToYDoc`/`yDocToDiagram` functions, no provider wiring
  yet. Fields/indexes/checkConstraints are nested `Y.Map`s keyed by id;
  order is preserved via an internal `__order` ordinal stamped at encode
  time (not `createdAt`, which can collide). 7 tests cover round-trip
  fidelity plus the actual appendix-b:2 proof: two independent in-memory
  `Y.Doc`s merging a concurrent field edit vs. index add, concurrent PK
  toggles on two fields, and concurrent table creation, with nothing
  clobbered. **Not yet done:** wiring `chartdb-provider.tsx` to actually
  use this (next step below) — existing consumers are untouched so far.
- While wiring the adapter, gate the #5/#7 self-healing effects
  (PK-implies-not-null, PK-implies-unique) under one elected writer so a
  shared doc doesn't get N redundant correction writes from N clients —
  see the note on #5/#7 in Phase 1 above.
- **Provider wiring is migrated collection-by-collection, not all at
  once, and not by method.** `tables` (~25 methods) is too large a first
  slice, and `areas` looks self-contained (3 methods) but isn't —
  `DBTable.parentAreaId` cross-references it, and `checkParentAreas` in
  `canvas.tsx` continuously writes that table field, so an `areas`-only
  slice still has to reach into `tables`. `notes` is the actual first
  slice: `{id, content, x, y, width, height, color, order}`, nothing in
  any other collection holds a `noteId`/back-reference into it (verified
  by grep across `src/lib/domain` and `src/context`).
  - **Storage (Dexie) semantics for a Y.Doc-backed collection:** once
    `notes` is doc-backed, Dexie becomes a **write-through sink only** —
    every doc mutation still calls `db.addNote`/`db.updateNote`/
    `db.deleteNote` so existing persistence keeps working, but nothing
    ever reads `notes` back out of Dexie except the initial diagram
    load. The doc, not Dexie, is the in-memory source of truth from that
    point on. This is forward-compatible with Phase 5 retiring Dexie
    entirely (§5.2, §8) — the write-through calls just get deleted then,
    nothing about the doc-side logic changes.
  - **Undo/redo semantics for a Y.Doc-backed collection:** `HistoryProvider`'s
    undo/redo handlers for `notes` must write their restore *into the
    doc* (via `upsertItem`/`patchItem`/`removeItemFromCollection` from
    `y-diagram.ts`), never call `setNotes` directly. If a handler restores
    into React state instead, the next Yjs observer fire re-derives state
    from the doc and silently overwrites the undo — it would look like it
    worked and then not stick. This is also forward-compatible with
    Phase 5's swap to `Y.UndoManager`: both the interim handler and the
    eventual `UndoManager` write to the same doc, only the stack
    bookkeeping changes.
  - **Object identity:** `yDocToDiagram` builds all-new objects on every
    call. The observer must not feed a full re-projection into `setNotes`
    on every doc change — that gives every note a new object identity on
    every keystroke anywhere in the diagram, and ReactFlow re-renders
    every node. Project just the `notes` collection (not the whole
    diagram) and only update the entries the observer reports as
    changed.
  - ✅ **`notes` done (`6e805be`):** `notesYDocRef` is the source of truth;
    `addNotes`/`removeNotes`/`updateNote` write into it
    (`upsertItem`/`removeItemFromCollection`/`patchItem`); an
    `observeDeep` handler projects structural changes via a full
    `readCollection` and non-structural (single-entry) changes via
    `readItem`, preserving object identity for untouched notes.
    `HistoryProvider` needed **zero** changes — its notes undo/redo
    handlers already called through `addNotes`/`removeNotes`/`updateNote`
    rather than touching React state directly. 7 tests, each empirically
    confirmed discriminating (bug re-injected into
    `addNotes`/`updateNote`/`loadDiagramFromData`, confirmed the relevant
    test fails, then reverted). Two bugs surfaced by review after landing
    and fixed in follow-up commits, both worth remembering for every
    collection migrated next:
    - `upsertItem` (`ebb38dc`) stamped a new entry's `__order` as
      `collectionMap.size`, which collides with the last remaining
      entry's order after a prior delete (a gap, not a shrink). Fixed to
      one-past-the-current-max instead.
    - `Note`/`Area`/`DBCustomType`/`DBTable` all carry their own domain
      `order` field (the notes side panel's drag-to-reorder writes it),
      separate from this module's internal `__order`. `bd4d11a` made the
      domain field win the sort when present, and made the observer
      re-sort on a non-structural `order` patch — otherwise a drag-reorder
      would silently revert on the next unrelated structural change.
      **Any future collection with its own `order` field needs this same
      check**, not just notes.
  - ✅ **`customTypes` done (`b2ee533`):** same treatment as `notes`,
    sharing the *same* `Y.Doc` (renamed `notesYDocRef` -> `collabDocRef` —
    one doc per diagram, one top-level `Y.Map` per collection, matching
    §5.2; two separate per-collection docs would have been the wrong
    shape for Phase 4's one-room-per-diagram WebSocket sync). The
    observer logic itself was extracted into a shared hook,
    `useYCollectionSync` (`src/hooks/use-y-collection-sync.ts`), since
    `notes` and `customTypes` needed it identically — every future
    collection reuses this hook rather than re-deriving the
    structural/non-structural/reorder logic again. 6 tests, same
    discriminating-check discipline as `notes`.
  - **`{tables, relationships, dependencies, areas}` is one entangled
    cluster, not four independent slices** — `DBTable.parentAreaId`
    cross-references `areas` (and `checkParentAreas` in `canvas.tsx`
    continuously writes it), and the appendix-b:3 fix means
    `removeTables`/`updateTablesState` filter `relationships` and
    `dependencies` directly. This cluster has to be planned and migrated
    together, not incrementally like `notes`/`customTypes`.
  - ✅ **`{tables, relationships, dependencies, areas}` done (`da64472`,
    `0cc66b2`):** foundation first (`da64472`) — `reconcileCollection`
    (doc-equivalent of a whole-array replace: upsert every desired item,
    remove anything undesired), `upsertTable`/`reconcileTables` (a
    table's own scalars plus its nested `fields`/`indexes`/
    `checkConstraints` sub-collections, reconciled without replacing
    sibling Y.Maps in place — the literal appendix-b:2 proof at this
    layer), `removeItemsReferencing` (the appendix-b:3 cascade-delete,
    reading the live doc at transaction time instead of a closure
    snapshot), `readTables`/`readTableItem`. `useYCollectionSync`
    generalized to take `readAll`/`readOne` as parameters so `tables` can
    use the nested-aware read path instead of the flat one every other
    collection uses. Every `chartdb-provider.tsx` method touching these
    four collections (~25, including `diffCalculatedHandler` and
    `loadDiagramFromData`) now writes through `collabDocRef`.
    `clearDiagramData`/`deleteDiagram` now clear the doc itself
    (`clearCollabDoc`) instead of calling `setTables([])` etc. directly —
    that was a latent bug even in the already-migrated `notes`/
    `customTypes`: the next structural doc change would have silently
    resurrected the "cleared" data straight out of the still-populated
    doc.
    - **Concurrency bug found by review before writing tests, fixed in
      the same commit (`0cc66b2`):** every table-mutating method follows
      read-current-table -> transform -> `upsertTable`. The first cut
      read via `getTable(tableId)` — React state, updated only
      asynchronously by the `useYCollectionSync` observer. Two calls in
      the same tick (e.g. two field edits fired via `Promise.all` without
      awaiting each individually) both read the same pre-update snapshot;
      whichever call's `transact()` ran second reconciled a "whole new
      table" built from that stale snapshot, silently reverting the
      first call's write — the same bug class as appendix-b:3, on a new
      axis. Fixed with `getLiveTable` (reads straight off the doc via
      `readTableItem`, immediately before each write — Yjs transactions
      apply synchronously, so the second call sees the first's
      already-committed change); `updateTablesState`'s `tables`-closure
      base had the identical issue, fixed by reading `readTables`
      fresh instead. Verified discriminating (reverted `getLiveTable`
      back to `getTable` for one call site, confirmed the new test
      failed with the exact predicted symptom, restored).
- Build the adapter so `add*/update*/remove*` methods read/write through a
  local `Y.Doc` instead of raw React state.
- No `y-indexeddb`, no WebSocket — this `Y.Doc` only ever exists in one
  browser tab's memory, exactly as the online-only design intends (§5.2),
  just not yet talking to a server.
- Re-run the Phase 0 suite against the adapter.
- Write new tests simulating two independent `Y.Doc` instances applying
  concurrent updates and merging (Yjs supports this without a network — 
  `Y.applyUpdate` between two in-memory docs) covering the Appendix B
  scenarios directly: concurrent field edit vs. index add on the same
  table, concurrent PK assignment, concurrent table creation, etc.
**Exit criteria:** Phase 0 suite green through the adapter; the
Yjs-merge simulation tests for every Appendix B scenario pass. — All
six collections (`notes`, `customTypes`, `tables`, `relationships`,
`dependencies`, `areas`) are now `Y.Doc`-backed; `tsc -b` and
`npm run lint` both clean; full suite green (915 tests). **Read the
"every" above precisely:** true two-independent-`Y.Doc`-merge-simulation
tests (`y-diagram.test.ts`, no provider involved) exist for three
scenarios — concurrent field edit vs. index add, concurrent PK
assignment, concurrent table creation. The rest of Appendix B (the
readonly gate #12, referential integrity #3, the PK-implies-not-null/
unique self-heal #5/#7, the counter races #9, etc.) is covered by
single-doc provider-level regression tests, not genuine two-peer merge
simulations — those would need Phase 4's real WebSocket sync (or a
second in-memory doc wired the same way `y-diagram.test.ts` does it) to
verify at that level; worth doing before calling this exit criterion
fully met. **Not yet
covered:** a dedicated undo/redo regression test through
`chartdb-provider.tsx`'s wiring for each of `tables`/`relationships`/
`dependencies`/`areas` individually the way `notes`/`customTypes` each
got (this segment added plain add/update/remove-then-undo round-trips
for `relationships`/`dependencies`/`areas`, plus the two bugs found by
review, but not an exhaustive per-method discriminating test for all
~25 migrated methods) — worth revisiting if a regression shows up
there.

### Phase 3 — Server scaffold (NestJS + Hocuspocus, fresh) — ✅ Done

**Goal:** a running server with no client wired up yet.
- New `server/` NestJS project (do not attempt to recover or reference the
  old `dist/` — see Appendix A). **Before writing any of this**, a sibling
  local branch `feature/collaboration_v2` was found (1076 commits ahead of
  this branch's common ancestor, `server/` implemented with TypeORM +
  Hocuspocus + real Entra ID auth + diagram groups/membership) — unlike
  Appendix A's `dist/`-only prior art, this one *is* in git. Surfaced to the
  project owner before writing anything; decision was to build fresh per
  this doc and not reference `v2` — noted here since Appendix A's "cannot be
  recovered from version control" turned out to be wrong in this narrower
  sense (recoverable, on a branch — the decision to not use it was a fresh
  call, not a forced one).
- WebSocket layer, one room per `diagramId`. **Changed mid-phase from the
  originally-planned hand-rolled `y-protocols` gateway to Hocuspocus** — see
  §5.3 for the full trade-off and its consequence (client library is
  `@hocuspocus/provider`, not `y-websocket`).
- Postgres schema: append-only Yjs update log + periodic compacted
  snapshot per diagram — `yjs_updates`/`yjs_snapshots` (prefixed `yjs_`,
  not the more obvious `diagram_updates`/`diagram_snapshots`: this shared
  Postgres instance already had tables under those exact names, leftover
  from `feature/collaboration_v2`, one of them a completely different
  `diagram_id uuid` schema — `CREATE TABLE IF NOT EXISTS` against those
  names would have silently no-opped and every query would have hit the
  wrong table. Found this for real, not hypothetically: it happened, broke
  a test with a `uuid ~~ unknown` operator error, and got renamed before
  anything shipped on it).
- Single instance only — no Redis yet (a Redis container was already
  running locally too, also `v2` leftover — not used).
- No auth (§5.3's "no real auth yet"); `WEBSOCKET_ORIGIN_ALLOWLIST` is the
  one access control this phase has. Its policy: a request with **no**
  `Origin` header is always allowed, even against a non-empty allowlist —
  found necessary the hard way (a Node WebSocket/`@hocuspocus/provider`
  client sends no `Origin` at all, so a naive "no origin ⇒ reject" policy
  locked out every non-browser client unconditionally, including this
  phase's own integration test client). See `isOriginAllowed`'s doc comment
  in `server/src/config.ts` for the trade-off this accepts.
- Compaction ordering: `getMaxUpdateId` (read the log's current high-water
  mark) must run *before* `Y.encodeStateAsUpdate` (encode the snapshot to
  store), never after — reading it after would let a concurrently-appended
  update be silently folded into the snapshot's content while the recorded
  `through_update_id` still lagged behind it, and the next prune would then
  delete that update's row even though the snapshot claims a lower
  watermark than what it actually contains. See `getMaxUpdateId`'s doc
  comment in `server/src/db/persistence.ts`.
- Durable-write-before-ack: the append-log write happens in Hocuspocus's
  `beforeHandleMessage` hook (awaited, before the update is applied and
  acked/broadcast), not `onChange`/`onUpdate` (which fire after apply,
  unawaited — confirmed by reading `Document.ts`: `handleUpdate` calls
  `this.callbacks.onUpdate(...)` without awaiting it, then immediately
  broadcasts). Using the wrong hook here would silently reopen the exact
  failure the durable log exists to prevent: a crash between apply and
  persist loses an update that peers already have applied locally. A
  narrower version of the same failure mode was caught by review one level
  down: `extractUpdateFromRawMessage` (the wire-message decoder that finds
  the update bytes to log) originally swallowed every decode error into a
  "nothing to log" `null` — indistinguishable from a message that
  legitimately carries no update. A message this couldn't actually parse
  would then get applied and broadcast by Hocuspocus with nothing logged.
  Fixed to throw on a genuine parse failure instead (propagating out of
  `beforeHandleMessage` makes Hocuspocus close the connection before
  `receiver.apply()` runs, per `Connection.ts`'s `processMessages`), while
  still returning `null` for messages that decode cleanly and simply carry
  no update (sync step1, awareness, auth, ...).
- Compaction was verified as actually executing, not just inferred from
  the restart test passing: `loadMergedState` reads snapshot-plus-log, so a
  restart round-trip can "work" purely off unpruned log rows even if
  `onStoreDocument` never fires and the prune never runs. Checked directly
  (both manually against a real Postgres and as a permanent assertion in
  the restart test): after the first server's last connection closes,
  `yjs_snapshots.through_update_id` is non-zero and `yjs_updates` has zero
  remaining rows for that diagram — the ordering property and the prune
  both genuinely ran, not just the code path that would have made a broken
  version of either look fine.
- Two bugs found and fixed via direct, reproducible testing before this
  was considered working (not found by the test suite — found by manually
  reproducing "client connects but never syncs", once outside Vitest
  entirely to rule out the test harness): (1) `hocuspocus.handleConnection()`
  registers a connection but attaches no listeners to the raw socket —
  `ws.on('message'/'close', ...)` forwarding into the returned
  `ClientConnection` has to be wired by the caller, and missing it produces
  no error, just a client stuck at "connected" that never reaches "synced".
  (2) The origin-allowlist bug above. Both are now covered by regression
  tests (`server/src/config.test.ts`, the integration suite).
- Vitest gotcha, not a product bug but cost real debugging time: `server/`
  needs its **own** `vitest.config.ts` (`environment: 'node'`) — without
  one, running `vitest run` from `server/` walks up and silently picks the
  root client project's `environment: 'happy-dom'`, under which the
  integration suite hung for the full test timeout instead of failing with
  a real error.
**Exit criteria:** a server that a `@hocuspocus/provider` client (not
`y-websocket` — see §5.3) can connect to, sync a doc against, and see it
survive a server restart via Postgres — verified with a genuinely separate
OS process (`node dist/main.js` spawned fresh, not `NestFactory.create()`
reused in-process), against the real, already-running
`chartdb-collaboration-postgres-1` container. `server/src/collab/__tests__/collab.integration.test.ts`
covers both halves: two concurrent clients syncing an edit, and a
restart-recovers-from-Postgres round trip. 12 tests total in `server/`,
`tsc -p tsconfig.json` and the build both clean.

### Phase 4 — End-to-end sync — ✅ Done

**Goal:** two real browser tabs editing the same diagram live.

**Progress so far — single-client wiring, verified against the real
server:**
- Config: `COLLAB_WS_URL` added to `src/lib/env.ts` (same
  `window.env` → `VITE_*` build-time → hardcoded-fallback precedence as
  every other runtime-overridable setting there), `default.conf.template`/
  `entrypoint.sh`/`Dockerfile` extended to plumb it through at deploy time,
  matching §7's plan exactly.
- **Connects by default, for every diagram** (a deliberate product
  decision, not the more cautious default-off this doc's own author would
  have picked given no auth/disconnect-UI/feature-flag exists yet —
  explicitly confirmed with the project owner before implementing). Falls
  back to `ws://localhost:1234` (the Phase 3 server's own default port)
  when unconfigured, so local dev against a locally-running `server/`
  works with no setup; a real deployment must set this explicitly.
- `chartdb-provider.tsx`'s `loadDiagramFromData` — the diagram-(re)load
  path every real app usage goes through (`editor-page.tsx` mounts
  `ChartDBProvider` with no `diagram` prop and calls this after) —
  constructs a `HocuspocusProvider` for the new doc, named by
  `diagram.id`. **`template-page.tsx`'s readonly template-preview usage
  (`<ChartDBProvider diagram={...} readonly>`) is deliberately excluded** —
  gated on `readonlyProp`: a static preview has no business opening a live
  room for whatever id a template happens to carry, and the
  construction-time `if (!collabDocRef.current)` seeding block (which
  serves exactly that readonly-preview case) stays local-only, unchanged.
- **Seed-vs-adopt race, found by review before this shipped, not by a
  test**: the pre-Phase-4 code unconditionally seeded a fresh doc from
  whatever diagram data this tab loaded from Dexie. With a real room now
  attached, that becomes a real corruption risk — a client joining a room
  a collaborator already populated (or that this same diagram was already
  synced to before, from a now-stale local Dexie copy) would inject its
  own stale snapshot into the shared CRDT state. Fixed via
  `src/lib/collab/seed-gate.ts`'s `seedWhenDecided`: seed only if the room
  turns out to be genuinely empty once sync is resolved one way or the
  other; otherwise **adopt** the room's actual content — which needed an
  explicit re-derivation of React state from the doc (`setTables`/
  `setNotes`/etc., mirroring what `useYCollectionSync`'s decode functions
  already do), since that hook only reacts to *future* doc changes, not
  content that was already there before it started observing.
  - "Resolved one way or the other" is `synced` (room's actual state is
    now known) **or** a `disconnected` status arriving before `synced`
    ever did (a real connection attempt failed — presumed offline, don't
    leave the diagram permanently unseeded). Deliberately not a wall-clock
    timeout: confirmed against `@hocuspocus/provider` source that
    `disconnected` is only ever emitted once per real failed/dropped
    socket, never spuriously at construction — so this can't fire while a
    slow-but-live server is still mid-handshake the way a fixed timer
    would. Known remaining trade-off, accepted rather than solved: a
    transient failure immediately followed by a successful reconnect still
    seeds locally first, and the late-arriving server state then merges
    with it via ordinary Yjs semantics rather than one cleanly overwriting
    the other — same risk class as any offline-first Yjs client, not
    specific to this decision.
- **Verified end-to-end against the real, compiled server** (not a
  simulation): `chartdb-provider.collab.integration.test.tsx` spawns
  `server/dist/main.js` as a genuine OS process, renders a real
  `ChartDBProvider` pointed at it via `vi.doMock('@/lib/env', ...)` +
  dynamic `import()` (module-level exports can't be overridden after the
  fact), calls `loadDiagramFromData`, and has a second, independent
  `@hocuspocus/provider` client join the same room directly — proving the
  table it wrote reached the server for real, not just that local state
  looks right. **Vitest gotcha found along the way**: this project's
  default `environment: 'happy-dom'` has no global `WebSocket` at all
  (confirmed directly) — real browsers always do — so the test stubs one
  in via `vi.stubGlobal('WebSocket', wsPackageWebSocket)`, scoped to that
  file, rather than special-casing the provider construction in production
  code just to accommodate the test environment.
- `tsc -b`, lint, and the full suite (921 tests) all clean.

**Two-client tests against the real server — and two more real bugs found
writing them, neither catchable by Phase 2's single-doc tests:**

- **The ready-gate bug.** `loadDiagramFromData` sets React state
  synchronously, but on the collab-connect path `collabDocRef.current`'s
  `Y.Doc` itself stays *empty* until the provider's `synced`/`disconnected`
  event fires and `reconcileWithRoom` decides seed-vs-adopt. During that
  window (real network round-trip time — effectively instant against a
  local server, however long a real outage takes against a down one), a
  write landing in the gap was actively wrong three different ways
  depending on which method: `getLiveTable`-gated writes (`updateField` et
  al.) silently vanished — the doc had no entry to read; `addTables` (no
  such gate) wrote straight into the doc, which then made `roomIsEmpty`
  look non-empty and skipped seeding the rest of the diagram entirely;
  `removeTables` (no such gate either) no-opped the removal against the
  still-empty doc, and the seed then resurrected the "deleted" row. Found
  by hand (a debug probe on a failing single-client test, not the
  concurrent-edit test itself) before it could hide behind the harder
  concurrency bug below. **Fix, put to the project owner as a genuine UX
  fork rather than decided unilaterally** (block edits during the window vs.
  delay rendering the diagram until reconciled — chose **block edits, no
  render delay**): `collabReadyRef` (`chartdb-provider.tsx`), opened false
  the moment a new doc is built on the collab-connect path, closed true at
  the top of `reconcileWithRoom`. Every context-value write method is
  wrapped in `gateWrite`, which refuses the whole call (`console.warn`, no
  side effect at all — no doc write, no Dexie write, no undo entry) while
  the flag is false; `diffCalculatedHandler` isn't reachable through the
  context value, so it gets the same check inline. No disconnect/loading UI
  exists yet (that's still Phase 5) — this only logs and drops the call.
  Unit tests were never network-isolated before this either: `COLLAB_WS_URL`
  defaults to a real, non-empty URL (by design — "connects by default"
  above), so every existing test that calls `loadDiagramFromData` was
  quietly opening a real `HocuspocusProvider` connection. `src/test/setup.ts`
  now mocks `@/lib/env` to `COLLAB_WS_URL: ''` globally so ordinary tests
  take the synchronous, always-ready local-only branch; collab-specific test
  files override it back with their own `vi.doMock`, which — called after
  setup.ts already ran — wins for that one file.
- **The blind-reassertion CRDT bug — the deeper one.** `upsertItem`/
  `upsertTable` (`y-diagram.ts`) rebuild an item/table's *entire* property
  set from the caller's current view and `.set()` every key
  unconditionally, including ones the caller never meant to touch — because
  every provider method reads the whole current table, changes one thing,
  and pushes the whole reconstructed object back through `upsertTable`.
  Harmless on Phase 2's single, strictly-sequential doc (the "second" call
  always already sees the first's committed write). Fatal once two real
  `Y.Doc` replicas merge: Yjs resolves two concurrent `.set()`s on the same
  Map key by `(clock, clientID)`, not by value, so client B's `addIndex` —
  which reconstructs the table with its *own* unchanged `fields`/`name`/
  `x`/`y` — could silently clobber client A's concurrent, genuinely
  different field rename, purely because both happened to write the same
  key. Found by the new `concurrent-edit sanity` end-to-end test below,
  which failed flakily (coin-flip, matching the clientID tiebreak) even
  after the ready-gate fix. Fixed with `setIfChanged` (`y-diagram.ts`): skip
  the `.set()` entirely when the value already matches, using **deep**
  equality (`fast-deep-equal`, already a dependency) since these values are
  routinely objects/arrays (`type: {id, name}`, `fieldIds: string[]`) where
  `!==` would treat two structurally-identical values as "changed" and keep
  writing them unconditionally — silently reintroducing the same bug for
  every non-primitive key. Applied at all three unconditional-write sites:
  `upsertItem`'s property loop, `upsertTable`'s scalar-props loop, and the
  `__order` write. Verified discriminating twice: the new end-to-end test
  failed non-deterministically (2 of 5 runs) with the fix reverted and
  passed 8/8 with it restored; a companion pure two-`Y.Doc` unit test in
  `y-diagram.test.ts` (`docB` does an `addIndex`-shaped `upsertTable` call
  with its own unchanged fields while `docA` renames one) shows the same
  pattern deterministically enough to catch a regression without needing a
  real server.
- **Verified end-to-end against the real, compiled server** (not a
  simulation): `chartdb-provider.collab.integration.test.tsx` spawns
  `server/dist/main.js` as a genuine OS process and covers, each with a real
  second independent `ChartDBProvider`/`HocuspocusProvider` client, not a
  simulation:
  - single-client write, observed by an independent raw client (the
    original Phase 4 slice);
  - **seed-vs-adopt**: client A seeds a room, client B joins with different
    local (Dexie-shaped) data and asserts it adopts A's state rather than
    resurrecting its own;
  - **concurrent-edit sanity**: the two bugs above, found while writing
    this one test;
  - **appendix-b:3 cascade delete, across the real network**: client A
    creates a table + a relationship referencing it, client B adopts both,
    client A removes the table (cascading to the relationship via
    `removeItemsReferencing`, which only ran in A's process) — asserts both
    deletions reach B, proving the cascade's single transaction propagates
    as one atomic update over the wire, not just within one process's doc.
  **Vitest gotcha found along the way**: this project's default
  `environment: 'happy-dom'` has no global `WebSocket` at all (confirmed
  directly) — real browsers always do — so the test stubs one in via
  `vi.stubGlobal('WebSocket', wsPackageWebSocket)`, scoped to that file,
  rather than special-casing the provider construction in production code
  just to accommodate the test environment.
- `tsc -b`, lint, and the full suite (926 tests) all clean; the collab
  integration file specifically re-run 5x and 8x in isolation (not just as
  part of the full suite, which can mask a real failure behind lucky
  scheduling) to confirm the fixes made it deterministic, not just
  usually-green.
- **What "two tabs" actually means here — stated plainly, not overclaimed**:
  every test above is two (or three) independent `ChartDBProvider` React
  trees inside one Vitest/Node process, each with its own real
  `HocuspocusProvider` connecting over a real loopback TCP socket to the
  real compiled server — genuinely independent CRDT replicas and genuinely
  independent network connections, not a simulation. It is **not** two
  actual browser windows; nothing here exercises real browser networking
  (e.g. actual `Origin` headers — see §5.3's allowlist policy — tab
  backgrounding/throttling, a real OS-level TCP stack under contention). The
  original bullet below asked for "**Manual** + scripted two-client tests";
  only the scripted half was done. Manual two-browser-window verification
  against a locally-running `server/` has not been performed and is a fair
  gap to flag before calling multiplayer editing production-ready — it's a
  few minutes of manual work, not a design question, so it's noted here
  rather than blocking this phase on it.
- **Appendix B coverage, split honestly** (same discipline as Phase 2's
  exit-criteria correction): the concurrent field-edit-vs-index-add
  scenario and appendix-b:3 (cascade delete) now have real two-`Y.Doc`,
  over-the-wire coverage (both the pure-function test in `y-diagram.test.ts`
  *and* the end-to-end test above). Concurrent primary-key assignment and
  concurrent table creation (`y-diagram.test.ts`'s other two "appendix-b:2
  proof" tests) are still pure-function-only — proven at the CRDT-merge
  layer, never re-verified against the real server over a real network. A
  later reader shouldn't assume all of Appendix B is proven end-to-end from
  this phase; only the two named above are.

**Reconnect-convergence — the other exit-criteria half, now verified:**
`reconnect-convergence` in `chartdb-provider.collab.integration.test.tsx`
kills the real server process (not a socket-level disconnect —
`HocuspocusProvider.disconnect()` is a documented no-op per its own source,
and `providerRef` isn't exposed through the context value for a test to
reach the underlying `websocketProvider` directly), makes one edit on each
of two already-connected clients while it's down (asserted locally,
immediately — proving edits genuinely queue rather than throw/block, since
the ready-gate only guards the initial load window, not an
already-open diagram), restarts a fresh server process on the exact same
port, and waits for both clients *and* a third, independent client that
joins fresh after the restart (proving the server, not just the two React
trees, holds the merged state) to converge on both edits. 5/5 in isolation.
This directly confirms the corrected bullet below empirically rather than
just reasoning about it.
- ~~Confirm the online-only behavior: killing the WebSocket connection
  stops local edits from silently queuing~~ — **corrected before
  implementing**: this can't be true as originally written, and isn't a
  bug to fix. Yjs always queues locally — `collabDocRef`'s transactions
  are plain in-memory CRDT ops regardless of connection state, which is
  the data structure, not a config knob. A killed connection can't stop
  that; reconnecting flushes and merges, which is exactly what makes this
  stack resilient to network blips at all. The "no offline mode" product
  decision (§3/§5.2) has to be enforced at the *UI* gate — disabling
  editing while disconnected — which Phase 5 already owns ("Disconnect/
  reconnect UI"). Phase 4's job was narrower: confirm and document what
  actually happens (edits queue locally, flush on reconnect, no
  server-side divergence once reconnected) — now done, see above.
**Exit criteria:** two tabs, same diagram, concurrent edits merge
correctly (✅ verified end-to-end, including a fix for a real merge bug —
see above); a reconnect after a killed connection converges to the same
state on both tabs and the server (✅ verified end-to-end, including the
server itself via a fresh third client, not just the two tabs — see
above) (not: local edits are prevented while disconnected — see the
corrected bullet above for why that's Phase 5's criterion, not this one's).
Both halves met — **Phase 4 done.**

**Caveat found via real manual browser testing, right after "done" above
was written — read before treating this as cross-user collaboration**:
"two tabs" here, and everything verified above, means two tabs/windows of
the *same* browser profile (shared Dexie/IndexedDB) — not two different
real users. There is currently no way for a genuinely new collaborator
(different browser/profile/machine, diagram not already in their local
Dexie) to open a shared diagram at all — see the new §9 bullet
("No diagram-discovery path for a genuinely new collaborator") for why and
what it needs. Phase 4's own exit criteria are still honestly met (the
sync *protocol* is verified end-to-end); this caveat is about a gap
outside anything Phase 4 was ever scoped to cover, not a hole in Phase 4's
own claims.

### Phase 5 — Presence, undo, and disconnect UX

**Goal:** the parts of the design that are about the *experience* of
multiplayer, not just correctness.
- Awareness-driven presence: remote cursors, per-user selection highlight,
  "X is editing this table" indicator, typed display name.
- Swap `HistoryProvider` for `Y.UndoManager`, scoped per client origin —
  finishes what Phase 1's targeted `#1` fix started.
- Local-only per-user undo/redo stack, in-memory only, no persistence —
  resolve the §9 open question on stale references (an undo entry
  pointing at an entity a remote peer since deleted) as part of building
  this, not after.
- Disconnect/reconnect UI — resolve the §9 open question on exactly what
  the canvas does the moment the WebSocket drops.
**Exit criteria:** a user can tell who else is present and what they're
doing; undoing your own action never reverts someone else's; losing
connection has a defined, non-silent UX.

### Phase 6 — Scale-out (defer until actually needed)

**Goal:** support more than one NestJS instance.
- Redis pub/sub so a client on instance A gets updates from a peer on
  instance B.
- Redis-backed hot cache of active rooms/awareness state.
**Exit criteria:** only pursue this phase once running >1 instance is a
real requirement — per §8 of the original plan, it's explicitly
deferrable.

### Phase 7 — Hardening and rollout

**Goal:** ready for real usage, not just correctness demos.
- Feature-flag rollout (§8's original point 1): collaboration is opt-in
  per diagram until confidence is high.
- Turn every Appendix B scenario into a permanent regression test (not
  just a one-time verification in Phase 4).
- Explicitly document the known limitations called out in §9 (no auth —
  anyone with a diagram ID can join and edit) as user-facing, not just an
  internal risk note.
