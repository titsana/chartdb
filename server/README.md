# chartdb-collab-server

Phase 3 of `docs/design/realtime-collaboration.md` §10: a Hocuspocus
WebSocket server, one room per `diagramId`, Postgres-backed persistence.
No auth yet, single instance, no Redis. Standalone project — its own
`package.json`/`node_modules`/tsconfig, not part of the root npm workspace
or the root `eslint`/`tsc -b`.

## Setup

```bash
npm install
cp .env.example .env   # then fill in DATABASE_URL
```

Needs a real Postgres reachable at `DATABASE_URL` — the schema (two
tables, `yjs_updates`/`yjs_snapshots`) is applied automatically on boot.

## Scripts

- `npm run dev` — run with `tsx watch` (no build step)
- `npm run build` — `tsc` to `dist/`
- `npm start` — run the built `dist/main.js`
- `npm test` — builds first (`pretest`), then `vitest run`. The
  integration suite (`src/collab/__tests__/collab.integration.test.ts`)
  spawns the real built server as a child process and drives it with a
  real `@hocuspocus/provider` client; it skips itself if `DATABASE_URL`
  isn't reachable.

## Why the client has to be `@hocuspocus/provider`, not `y-websocket`

Hocuspocus's own wire protocol prefixes every message with the document
name (a `varString`), which plain `y-websocket` clients never send — there
is no fallback for it. A `y-websocket` client can open the TCP connection
but the handshake will never complete. See `docs/design/realtime-collaboration.md`'s
Phase 3 section for the full trade-off writeup (this was a mid-course
correction from an original raw-NestJS-gateway plan, which *would* have
been `y-websocket`-compatible).

## `WEBSOCKET_ORIGIN_ALLOWLIST`

The only access control this phase has (§5.3: "no real auth yet"). A
request with no `Origin` header — any non-browser client — is always let
through regardless of the allowlist; see `isOriginAllowed`'s doc comment
in `src/config.ts` for the reasoning and the trade-off it accepts.

## Gotchas worth knowing before touching this again

- **`handleConnection()` doesn't wire itself up.** It returns a
  `ClientConnection` but attaches no listeners to the raw `ws` socket —
  `ws.on('message', ...)`/`ws.on('close', ...)` forwarding into
  `clientConnection.handleMessage`/`handleClose` has to be done by the
  caller (see `ws-upgrade.service.ts`). Miss this and connections look
  "connected" client-side but never sync, with no error on either side.
- **Table names are prefixed `yjs_`, not `diagram_*`.** This Postgres
  instance carries leftover tables from the abandoned
  `feature/collaboration_v2` branch under names like `diagram_snapshots`
  (a completely different, incompatible schema) — `CREATE TABLE IF NOT
  EXISTS diagram_snapshots (...)` would silently no-op against it. See
  `src/db/pool.ts`'s schema comment.
- **This project needs its own `vitest.config.ts`** (`environment:
  'node'`) — without one, `vitest run` from here walks up and picks the
  root project's `environment: 'happy-dom'`, under which the integration
  suite hung silently instead of failing.
- **Compaction's `getMaxUpdateId` must run before `Y.encodeStateAsUpdate`,
  never after** — see that function's doc comment in
  `src/db/persistence.ts` for why the order is the whole safety property.
