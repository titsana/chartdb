# Design: Browser OAuth login for the MCP endpoint

Status: approved (D1–D9 as proposed, 2026-10-03) · Branch: `feat/mcp-server`

## 1. Goal

A user adds the `chartdb` MCP server (via the `mp` plugin or `claude mcp add`), runs `/mcp`, chooses **Authenticate**, signs in with Microsoft in the browser, and is connected. That's the same experience as ClickUp's MCP. There's no `az` CLI, no `headersHelper`, and no per-user setup beyond the server URL.

## 2. Why not point MCP clients at Entra directly

MCP clients (Claude Code included) run the MCP authorization flow:

1. They discover the authorization server through `/.well-known/oauth-protected-resource`.
2. They register themselves through Dynamic Client Registration (DCR).
3. They log in with PKCE and send the RFC 8707 `resource` parameter set to the MCP server URL.

Entra breaks two of those steps:

- **No DCR.** A pre-registered `--client-id` works around this, but then every user has to configure it.
- **`resource` is rejected** (reported, not yet reproduced here). Entra expects `resource` to be the App ID URI (`api://<client-id>`), but the client sends the server's `https://` URL. The reported error is `AADSTS9010010`, and the reports say there's no client-side option to override or omit `resource`.

The broker in §3 is needed even if the `resource` problem turns out to be avoidable: without DCR, every user would need a pre-registered client ID.

## 3. Approach: chartdb as an OAuth broker

The chartdb server becomes the OAuth authorization server that MCP clients talk to. It handles login by redirecting to Entra with its own confidential-client credentials, then issues **its own** tokens, which only `/api/mcp` accepts.

```
Claude Code                chartdb server                         Entra
    │  GET /api/mcp → 401 + WWW-Authenticate (resource_metadata)    │
    │  GET /.well-known/oauth-protected-resource                    │
    │  GET /.well-known/oauth-authorization-server                  │
    │  POST /register  (DCR, loopback redirect only)                │
    │  GET /authorize?…&code_challenge&resource ──▶ store pending ──▶ 302 to Entra /authorize
    │                                                user signs in ◀┤
    │                        GET /oauth/callback?code ◀────────────┤
    │                        exchange code (client secret) ───────▶│
    │                        verify id_token / access token ◀──────┤
    │  302 localhost callback?code=<chartdb code>&state             │
    │  POST /token (code + PKCE verifier) ──▶ chartdb access+refresh token
    │  POST /api/mcp  Authorization: Bearer <chartdb token>         │
```

The browser SPA and REST API keep using Entra tokens directly, so nothing changes for them.

### Building blocks

`@modelcontextprotocol/sdk` (already a dependency) supplies:

- `mcpAuthRouter`, an Express router for metadata, `/authorize`, `/token`, `/register` and `/revoke`. It validates requests, enforces PKCE, and rate-limits.
- the `OAuthServerProvider` interface. We implement it as `EntraBrokerProvider`.
- `requireBearerAuth`, middleware that calls `provider.verifyAccessToken`.

We don't use `ProxyOAuthServerProvider`, because it forwards DCR and `resource` straight to Entra, which brings back both problems from §2.

## 4. Decisions (proposed defaults, each needs a yes)

| # | Decision | Proposal | Why |
|---|---|---|---|
| D1 | Token format | **Opaque random tokens, SHA-256 hashed in Postgres** | Revocation is a `DELETE`. There's no signing key to manage or rotate. The per-request DB lookup is cheap at this scale |
| D2 | Access token lifetime | **1 hour** | Short enough to make revocation and offboarding matter. MCP clients refresh silently |
| D3 | Refresh token | **Rotated on every use, 30-day absolute cap from login** | Rotation catches theft. The cap means someone removed from Entra loses access within 30 days, even without manual revocation |
| D4 | Offboarding | **30-day cap (D3) plus `DELETE` by Entra `oid`**, documented as a SQL one-liner. An admin UI is out of scope | Smallest thing that works. We can add a check against Entra on refresh later if 30 days is too long |
| D5 | Who may log in | **Any user of `ENTRA_TENANT_ID`** (single-tenant app). Optional `MCP_ALLOWED_GROUP` later | Same rule the web app uses today |
| D6 | DCR policy | **Open registration, but `redirect_uris` must be loopback** (`http://localhost:*`, `http://127.0.0.1:*`) | Every MCP client we target is a local app. An attacker-registered client can't send codes to a remote host |
| D7 | Scope | **One scope: `mcp`** | Tools don't need anything finer yet |
| D8 | Identity in tools | **Store `oid` and `preferred_username` on the token.** Pass them to tool handlers through Hocuspocus direct connection `context` | This gives us audit and "who edited" for free |
| D9 | Per-client consent | **A chartdb-owned consent page at `/authorize`, before redirecting to Entra.** It's shown on every authorize for now, since the user isn't known until after Entra login. Approved (oid, client_id) pairs are stored server-side | Required, not optional. The MCP security best practices ("Confused Deputy Problem") say proxy servers that use a static upstream client ID with open DCR **MUST** do this. Entra remembers consent for our static client, so without our own page an attacker-registered client gets codes with no prompt. D6 narrows the attack but doesn't replace consent |

## 5. Server changes

1. **`EntraBrokerProvider`** in `server/src/mcp-auth/`:
   - `clientsStore`: `mcp_oauth_clients` table, enforcing D6 on register.
   - `authorize()`: renders the D9 consent page. It shows the client name, the exact registered `redirect_uri` (with a warning that it's a local app) and what access is granted. The page sends `X-Frame-Options: DENY` and `frame-ancestors 'none'`, and its form is CSRF-protected. Approving it:
     - records consent for that `client_id`;
     - saves a pending row (client, redirect_uri, code_challenge, client state, resource, expiring in 10 minutes);
     - generates a random Entra `state` **after** approval, stores it server-side and binds it to the pending row;
     - redirects to Entra `/oauth2/v2.0/authorize` with `scope=openid profile`, that state, a nonce and Entra PKCE.

     The user isn't known until Entra returns, so per-user consent works like this: the first time, the consent page always shows. After callback, consent is stored as (oid, client_id). A later `/authorize` from the same client still shows the page, because we can't identify the user before Entra login. Showing it every time is the simple, safe default. A signed `__Host-` cookie to skip repeats is a later optimization.
   - `/oauth/callback`, a new route outside the SDK router:
     - Rejects the request unless `state` exactly matches a stored, unexpired, unused value. State is single use.
     - Exchanges the Entra code with `ENTRA_CLIENT_SECRET`.
     - Validates the id_token: issuer, audience, nonce and tenant.
     - Mints a one-time chartdb auth code that expires in 60s and is bound to the pending row.
     - Redirects to the client's loopback URL.
   - `challengeForAuthorizationCode` and `exchangeAuthorizationCode`:
     - Codes are single use.
     - The `redirect_uri` and `resource` must match what `/authorize` received. `resource` must equal `<PUBLIC_URL>/api/mcp`.
     - Issues the tokens described in D1–D3.
   - `exchangeRefreshToken`: rotates the refresh token. If an already-rotated token is reused, revoke the whole token family.
   - `verifyAccessToken`: looks up the hash and checks expiry. Returns `AuthInfo` with `extra: { oid, upn }`.
   - `revokeToken`: deletes the row.
2. **Tables**, added to `db/pool.ts` migrate:
   - `mcp_oauth_clients`
   - `mcp_oauth_pending` (authorize requests and one-time codes)
   - `mcp_oauth_tokens`: hash, kind, family_id, client_id, oid, upn, expires_at, family_expires_at
   - A sweep of expired rows on boot and hourly.
3. **Mounting** in `main.ts`: `app.use(mcpAuthRouter({ provider, issuerUrl: PUBLIC_URL, resourceServerUrl: PUBLIC_URL/api/mcp }))`.
   - The router serves at the root (`/.well-known/*`, `/authorize`, `/token`, `/register`, `/revoke`).
   - Add those paths and `/oauth/callback` to `ServeStaticModule`'s `exclude` and to `setGlobalPrefix`'s exclude.
   - **Collisions:** none with the client router today (`src/router.tsx` has only `examples`, `templates…` and `*`). Any future client route named `authorize`, `token`, `register`, `revoke` or `oauth` would collide.
   - **Verify in step 1:** the SPA fallback doesn't swallow these paths, and `/.well-known/oauth-protected-resource/api/mcp` (the path-suffixed form) resolves.
   - **Rate limiting behind Cloudflare:** the SDK's `/register`, `/authorize` and `/token` use `express-rate-limit`, keyed on the client IP. Behind Cloudflare, every user would share one bucket, or the library would warn about `X-Forwarded-For` with `trust proxy` off.
     - Decision: pass the SDK handlers a `keyGenerator` that uses `CF-Connecting-IP`, falling back to the socket address.
     - Don't turn on Express-wide `trust proxy`. Nothing else here needs it, and it would let `X-Forwarded-For` be spoofed if the origin is ever reached without going through Cloudflare.
     - Test it: two requests with different `CF-Connecting-IP` values land in separate buckets.
4. **Guarding `/api/mcp` stays fail-closed.** Never mark it `@Public()`: Hocuspocus direct connections skip `onAuthenticate`, so the guard is the only gate. If middleware were mis-mounted, the route would silently allow writes to every diagram.
   - Extend `EntraAuthGuard` instead. On `/api/mcp` only, it accepts a broker access token (`provider.verifyAccessToken`) **or**, during rollout, an Entra token.
   - On rejection it sets `WWW-Authenticate: Bearer resource_metadata="<PUBLIC_URL>/.well-known/oauth-protected-resource/api/mcp"` before throwing 401. That header starts the browser flow.
   - Every other route keeps accepting Entra tokens only.
   - Tripwire: the existing "MCP is behind the same guard" assertion in `auth.integration.test.ts` must keep passing unchanged.
   - Token passthrough: the spec forbids accepting tokens not issued for this server. During rollout, an Entra token is accepted only with `aud` set to this API (`api://<ENTRA_CLIENT_ID>`) and scope `access_as_user`, which the verifier already enforces. Remove it in rollout step 5.
5. **Public mode:** none of this is mounted. `/api/mcp` stays open.

## 6. Config

New env vars, all required when `AUTH_MODE=azure-ad`. `loadConfig` throws at boot if any is missing:

| Var | Purpose |
|---|---|
| `PUBLIC_URL` | External base URL, e.g. `https://chartdb.example.com`. It's the issuer and resource. It can't be derived from the request because the server sits behind Cloudflare |
| `ENTRA_CLIENT_SECRET` | Confidential-client secret for the code exchange in `/oauth/callback` |

One-time Entra admin steps:

1. App registration → **Authentication** → add platform **Web** → redirect URI `https://<host>/oauth/callback`. The existing SPA platform entry stays.
2. **Certificates & secrets** → new client secret → put it in `ENTRA_CLIENT_SECRET` in the deploy. Note its expiry date, since secrets expire after 24 months at most.
3. The "Azure CLI as authorized client application" step from the `az` approach is no longer needed once that path is retired.

## 7. Client and plugin changes

- `mp` plugin `.mcp.json`: drop `headersHelper`. The `url` (`${user_config.chartdb_url}/api/mcp`) stays.
- `plugins/mp/scripts/chartdb-mcp-headers.sh`: delete it once every server runs the broker.
- Users: `/mcp` → `chartdb` → **Authenticate** → browser login. Done.

## 8. Tests

All tests run against real Postgres, using the spawned-`dist/main.js` pattern. Entra is replaced by a **fake OIDC server** started in-process by the test: it serves discovery, a JWKS, `/authorize` (auto-approve) and `/token`. `ENTRA_AUTHORITY` is overridable for tests only.

1. **Happy path:** register → authorize → consent approve → fake Entra login → callback → token → `tools/list` returns 200.
1a. **Consent:** `/authorize` never redirects to Entra without an approved consent POST. A consent POST without a valid CSRF token is rejected. The consent page has anti-framing headers.
1b. **State:** `/oauth/callback` rejects a missing, mismatched, reused or expired `state`.
2. **PKCE:** the wrong `code_verifier` is rejected, and a code can't be used twice.
3. **Redirect safety:** registering a non-loopback `redirect_uri` returns 400, and `/authorize` with an unregistered `redirect_uri` returns 400.
4. **`resource`:** a mismatched `resource` is rejected at `/token`.
5. **Refresh:** rotation works, reusing an old refresh token revokes the family, and the 30-day cap is enforced (test it by moving the clock).
6. **401 shape:** an unauthenticated `/api/mcp` call carries `WWW-Authenticate: Bearer resource_metadata=…`.
7. **Expiry:** an expired access token returns 401.
8. **Isolation:** a chartdb MCP token is rejected by `/api/diagrams`. Only the Entra guard protects REST.
9. **Manual:** a real Claude Code + real Entra login against a staging deploy, before rollout.

## 9. Rollout

1. Ship the broker alongside the `az` path. The guard accepts both.
2. An admin does the Entra steps in §6 and sets `PUBLIC_URL` and `ENTRA_CLIENT_SECRET`.
3. Run the manual test (§8.9) on staging.
4. Merge the `mp` change that drops `headersHelper`, and announce the update.
5. Later: remove raw-Entra-token acceptance on `/api/mcp` and the helper script.

## 10. Estimate and risks

- **Size:** about 2–2.5 days. The provider, consent page and tables take about a day, the fake OIDC server and tests about a day, and mounting, config, docs and plugin changes about half a day.
- **Security-sensitive.** This code issues credentials. Get a second reviewer on `EntraBrokerProvider`, and run `/security-review` on the branch before merge.
- **Unverified:** Claude Code's exact behavior is assumed to follow the MCP authorization spec. That covers whether it uses the path-suffixed protected-resource URL, its loopback port behavior, and whether it sends `resource` on refresh. Check this against the real client first: it's step 1 of implementation, using a stub provider that auto-approves.
- **Secret expiry:** if `ENTRA_CLIENT_SECRET` expires, MCP login breaks. Note the expiry date somewhere the team will see it.

## 11. Out of scope

- An admin UI for sessions and revocation (D4 uses SQL).
- Per-diagram permissions. Every authenticated tenant user can edit every diagram, the same as the web app today.
- Non-loopback MCP clients, such as claude.ai web connectors. They'd need registered HTTPS redirect URIs and a consent screen.
