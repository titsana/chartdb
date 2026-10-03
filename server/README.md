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

## MCP endpoint (`/api/mcp`)

Stateless Streamable HTTP MCP server. Tools: `list_diagrams`,
`create_diagram`, `get_diagram` (summary for diagrams over 30 tables
unless `tableNames` is given), `upsert_table` (fields and indexes),
`remove_table`, `add_relationship`, `remove_relationship`. Tools edit the
live Y.Doc, so open browsers see changes immediately.

### `AUTH_MODE=public`

```bash
claude mcp add --transport http chartdb http://localhost:3001/api/mcp
```

### `AUTH_MODE=azure-ad`: browser sign-in (OAuth broker)

MCP clients sign in through the browser like any OAuth MCP server. Run
`/mcp` in Claude Code, pick `chartdb`, choose Authenticate, approve the
ChartDB consent page, and sign in with Microsoft. `/api/mcp` accepts only
tokens this broker issued; Entra tokens are not accepted there. Without
the broker configured, MCP is unavailable in `azure-ad` mode. Design and
security notes: `docs/design/mcp-oauth.md`.

One-time setup:

1. App registration → **Authentication** → **Add a platform** → **Web** →
   redirect URI `https://<host>/oauth/callback`. Keep the existing SPA entry.
2. **Certificates & secrets** → new client secret. Note its expiry date:
   MCP sign-in breaks when it expires.
3. Deploy with `PUBLIC_URL=https://<host>` and `ENTRA_CLIENT_SECRET=<secret>`
   (both, or neither to leave the broker off).

Then in Claude Code, the server needs only its URL:

```bash
claude mcp add --transport http chartdb https://<host>/api/mcp
```

If sign-in ends with `server_error`, the server log has a line starting
`MCP OAuth callback failed:` with Entra's error code. Seen so far:

- `401` / `AADSTS7000215`: wrong secret. Use the secret's **Value**, not its
  **Secret ID**, from the same app registration, with no stray whitespace.
- `AADSTS9002326`: `/oauth/callback` is registered under the
  **Single-page application** platform. It must be under **Web** only.
- `AADSTS50011`: `PUBLIC_URL` doesn't match the registered redirect URI
  exactly.

Revoke someone's MCP access immediately (otherwise it ends within 30 days
of their last sign-in):

```sql
DELETE FROM mcp_oauth_tokens WHERE oid = '<entra object id>';
```
