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
  reverts someone else's concurrent edit. This is the **one remaining use
  of local browser storage**: the per-user undo/redo stack lives in the
  browser (`Y.UndoManager`'s in-memory stack, optionally mirrored to
  `localStorage`/IndexedDB so it survives a page refresh within the same
  session) — it is never synced to other users or to the server, and it
  holds *only* undo/redo entries, not diagram state. `StorageProvider`/Dexie
  is retired from its current role as diagram-data source of truth; if kept
  at all, it's repurposed for this narrow undo-stack use — see §8 Migration.

### 5.3 Server: NestJS

NestJS is not a Yjs server out of the box (unlike Hocuspocus), so the sync
protocol is implemented as a NestJS WebSocket Gateway using `y-protocols`
(`sync` + `awareness`) directly. Trade-off: more code to write than dropping
in Hocuspocus, but auth guards, DI, and logging integrate naturally with the
rest of a NestJS app.

- **Gateway**: one WebSocket namespace/room per `diagramId`. Incoming
  connections join the room; the gateway relays `y-protocols` sync messages
  and awareness updates to all other room members.
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
(Y.UndoManager, optionally mirrored to localStorage) — never synced,
never touches Postgres/Redis.
```

## 6. Impact on existing code

| Area | Change |
|---|---|
| `ChartDBProvider` | Needs an adapter layer: existing `add*/update*/remove*` methods read/write through the `Y.Doc` instead of raw React state. Public API surface stays the same where possible to limit blast radius on consumers (canvas, side panel, dialogs). |
| `HistoryProvider` / `RedoUndoStackProvider` | Replaced by Yjs `UndoManager`, scoped per client origin. |
| `StorageProvider` (Dexie) | Retired as diagram-data source of truth entirely (that's now Postgres, server-side). Not replaced by an offline cache — this system has no offline mode. If kept, it's narrowed to storing only the per-user undo/redo stack. |
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
- **Persisted undo stack, stale references**: the local-only undo/redo
  stack (§5.2) holds entries that point at specific table/field/relationship
  IDs. If another user deletes that table before you hit undo, what
  happens — the entry silently no-ops, gets dropped from the stack, or
  something else? Also needs: scope of the persisted stack (per diagram +
  per browser tab/session, or shared across tabs on the same diagram?),
  and a size/age limit so it doesn't grow unbounded in `localStorage`.
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

### Phase 1 — Data-model + invariant fixes (client-only, still single-user, no Yjs yet)

**Goal:** close every Appendix B finding that's a property of the data
model or invariant logic itself, independent of whether a CRDT is
involved — so the *next* phase (the Yjs adapter) starts from state that's
already safe to merge, instead of trying to fix these two things at once.
- Re-model `fields`/`indexes`/`checkConstraints` as keyed collections
  instead of opaque arrays (**Appendix B #2**) — the foundation everything
  else in this phase sits on top of.
- Make cascade-delete of relationships/dependencies a derived
  recomputation (from current state, not a captured closure) instead of a
  one-shot list (**#3**).
- Add existence re-validation at relationship/dependency creation commit
  time, not just at UI-render time (**#4**).
- Turn the self-healing effects (PK-implies-not-null,
  `checkParentAreas`'s `parentAreaId` correction) into idempotent
  single-pass corrections instead of effects that re-fire off their own
  writes (**#5**).
- Rebase debounced field writes against current value at commit time, or
  surface a conflict indicator (**#6**).
- Recompute the primary-key/unique invariant from full current state after
  any write, not from a pre-write local count (**#7**).
- Derive handle-index assignment from relationship id, not array position
  (**#8** — this is the same bug class `81dae56` already fixed once;
  fixing it properly here means it can't regress a third time).
- Derive default name/order from an incrementing counter, not
  `array.length` (**#9**).
- Switch `apply-ids.ts` matching to stable-id-first, name-based only as
  fallback for external imports (**#11**).
- Gate the diff-preview readonly path so it can't write through whatever
  the eventual Y.Doc adapter is (**#12**) — verify this explicitly once
  Phase 2 exists, but the gate itself belongs here.
- Undo/redo: stop replaying whole-array snapshots via `forceOverride`
  (**#1**) as a standalone fix, ahead of the full `Y.UndoManager` swap in
  Phase 5 — this one is worth fixing early since it's actively wrong for
  single-user undo too (an in-between edit to *any* table gets clobbered
  by an unrelated undo today).
**Exit criteria:** Phase 0 suite still green; app is still 100%
single-user with zero networking; every fix above is independently
verifiable without a CRDT in place.

### Phase 2 — `Y.Doc` ⇄ `ChartDBProvider` adapter (in-process, no server)

**Goal:** prove the data-model mapping (§5.2) works, entirely in-memory,
before any network code exists.
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
Yjs-merge simulation tests for every Appendix B scenario pass.

### Phase 3 — Server scaffold (NestJS, fresh)

**Goal:** a running server with no client wired up yet.
- New `server/` NestJS project (do not attempt to recover or reference the
  old `dist/` — see Appendix A).
- WebSocket Gateway using `y-protocols` (sync + awareness), one room per
  `diagramId`.
- Postgres schema: append-only Yjs update log + periodic compacted
  snapshot per diagram.
- Single instance only — no Redis yet.
**Exit criteria:** a server that a raw `y-websocket`-compatible client can
connect to, sync a doc against, and see it survive a server restart via
Postgres.

### Phase 4 — End-to-end sync

**Goal:** two real browser tabs editing the same diagram live.
- Wire the Phase 2 adapter's `Y.Doc` to the Phase 3 server over
  WebSocket.
- Manual + scripted two-client tests reproducing the Appendix B scenarios
  against the real server (not just the in-memory simulation from Phase 2)
  — this is what actually proves the fixes hold end-to-end.
- Confirm the online-only behavior: killing the WebSocket connection stops
  local edits from silently queuing (per the "no offline mode" decision in
  §3/§5.2) — even if the disconnect *UI* isn't built yet (that's Phase 5).
**Exit criteria:** two tabs, same diagram, concurrent edits merge
correctly; a killed connection does not let one client silently drift from
the server's state.

### Phase 5 — Presence, undo, and disconnect UX

**Goal:** the parts of the design that are about the *experience* of
multiplayer, not just correctness.
- Awareness-driven presence: remote cursors, per-user selection highlight,
  "X is editing this table" indicator, typed display name.
- Swap `HistoryProvider` for `Y.UndoManager`, scoped per client origin —
  finishes what Phase 1's targeted `#1` fix started.
- Local-only per-user undo/redo stack, optionally mirrored to
  `localStorage` — resolve the open questions from §9 (stale references,
  scope, size/age limit) as part of building this, not after.
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
