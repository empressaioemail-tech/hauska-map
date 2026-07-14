# Command Center Proxy Contract

This document enumerates every endpoint called by Command Center panels and workspace tiles, mapped to the `/api/spine/*` proxy routes.

> **UPDATED 2026-07-13 (remote-spine pass).** Added the path-pinned MCP admin introspection route (`/api/spine/mcp-introspection/tools[/:name]`, `MCP_ADMIN_KEY`), retrieval Bearer auth (`RETRIEVAL_API_KEY` — the retrieval API was never actually "no auth"; every non-health route Bearer-gates), and the anonymous→public MCP fallback when `MCP_PRODUCT_KEY` is unset. Fixed the Parcel Trace retrieval path (`/atoms/trace/:did`, not `/v1/atoms/trace/:did`).
>
> **REWRITTEN 2026-07-07 (ground-truth pass).** The previous revision of this file documented tile paths that do not exist on cortex-api (`/api/engagements/:id/findings`, `/api/place/*`, `/api/saved-spaces`, `/api/product-specs`, ...). Probing those paths returns the cortex SPA's index.html (200, text/html) because cortex mounts a GET catch-all SPA AFTER the API router — a fallthrough, not an auth failure. The shipping packages (`@empressaio/cortex-client@0.1.1`, `@empressaio/cortex-tiles@0.1.3`) call the `/plan-review/...` BFF and L-surface paths below, which exist and accept the service Bearer. This revision documents what the code actually calls, verified against legacy-design-tools main (2026-07-07) and live probes through cmdcenter-blush.vercel.app.

## Proxy Architecture

The Command Center is deployed on Vercel with a same-origin serverless proxy (`api/spine.ts`) that holds all service keys server-side. Browser clients NEVER hold credentials.

**Routing** (via `vercel.json` rewrite): `/api/spine/(.*) → /api/spine?upath=$1`, routed by first path segment:
- `/api/spine/cortex/*` → CORTEX_API_URL with `Authorization: Bearer CORTEX_SERVICE_API_KEY`
- `/api/spine/mcp/*` → MCP_URL with `X-Hauska-Key: MCP_PRODUCT_KEY` (key optional: when unset the proxy sends NO key header and the MCP server resolves the anonymous path to product `public` — the console then serves the public catalog only; a malformed key would 401)
- `/api/spine/mcp-metering/summary` → MCP metering summary (path-pinned; anything else 403; MCP_PRODUCT_KEY REQUIRED and must be a `platform_internal` key or upstream 401/403s)
- `/api/spine/mcp-introspection/tools[/:name]` → MCP `/admin/introspection/tools[/:name]` with `X-Hauska-Admin-Key: MCP_ADMIN_KEY` (GET-only, path-pinned; the POST `tools/:name/call` live probe and every other `/admin/*` path are 403 — the admin key never rides an operator-supplied path)
- `/api/spine/retrieval/*` → RETRIEVAL_API_URL with `Authorization: Bearer RETRIEVAL_API_KEY` (the retrieval API Bearer-gates every route except `/health`, `/healthz`, `/ready` per its DEPLOY.md; missing env var → 503 `{missing: "RETRIEVAL_API_KEY"}` for non-health paths)

Client base for cortex calls: `/api/spine/cortex/api` (`cortexClient.ts`), so a cortex-client call to `/plan-review/x` reaches upstream `/api/plan-review/x`.

**Deployment env vars** (Vercel project settings):

| Env var | Attached as | Required for | Notes |
|---------|-------------|--------------|-------|
| `CORTEX_API_URL` | — | optional | defaults to the Cloud Run cortex-api URL |
| `CORTEX_SERVICE_API_KEY` | `Authorization: Bearer` | all cortex panels/tiles | 503 `{missing}` when unset |
| `MCP_URL` | — | optional | defaults to the Cloud Run MCP URL |
| `MCP_PRODUCT_KEY` | `X-Hauska-Key` | Atoms panel results + Revenue Meter | must resolve to a `platform_internal` key for `/metering/summary`. Unset → anonymous → public product: `tools/list` still shows the full inventory (gating is call-time), but `search_atoms` returns public-free atoms only — verified 2026-07-13 to be 0 rows for typical queries against the deployed snapshot, so the Atoms panel needs a real key to populate |
| `MCP_ADMIN_KEY` | `X-Hauska-Admin-Key` | Surface & Gate + MCP Inspector catalog | value of the MCP server's `HAUSKA_ADMIN_BOOTSTRAP_KEY`; only ever sent to the pinned introspection catalog paths. 503 `{missing}` when unset |
| `RETRIEVAL_API_KEY` | `Authorization: Bearer` | Parcel Trace atom-trace (and any future retrieval panel) | value of the retrieval service's `RETRIEVAL_API_KEY` env. 503 `{missing}` for non-health retrieval paths when unset |

## SPA-fallthrough gotcha (read this before adding paths)

cortex-api mounts its API router at `/api` and THEN a root SPA with a GET catch-all. Any GET to a nonexistent `/api/...` path returns the SPA's index.html with HTTP 200. If a panel receives HTML where it expected JSON, the path is wrong — it is not an auth problem (auth failures return JSON 401/403).

## Panel Endpoint Inventory

| Panel | Method | Upstream path (cortex unless noted) | Auth guard | Status |
|-------|--------|-------------------------------------|-----------|--------|
| Atom Inspector / Agent View | POST | MCP `/mcp` (JSON-RPC: initialize, tools/list, tools/call) | X-Hauska-Key (server-side; anonymous→public fallback) | ✅ live |
| Surface & Gate / MCP Inspector (catalog) | GET | MCP `/admin/introspection/tools` via `/api/spine/mcp-introspection/tools` (path-pinned) | X-Hauska-Admin-Key (server-side, MCP_ADMIN_KEY) | ✅ live (2026-07-13) |
| MCP Inspector (live call probe) | POST | `/admin/introspection/tools/:name/call` | n/a | 🚫 blocked by design (executes tools under simulated auth; direct operator mode only) |
| Layer Registry View | GET | `/api/brokerage/v1/map-data/gis-layers` | `requireBrokerageAuthOrServiceToken` + route-level tier gate | ⚠️ 403 `tier_required` under the service key — the tier resolution ignores the service caller; fix in flight (`fix/cc-setbacks-gis-service`) |
| Map tile (live GIS viewport) | POST | `/api/brokerage/v1/map-data`, `/api/brokerage/v1/map-data/gis-layer`, `/api/brokerage/v1/map-data/composite-layer` (bbox bodies; upstream `brokerageMapData` router) | service Bearer + `packageTier === "max"` tier gate | ✅ allowlisted (2026-07-13) — exact-match POST only, no prefix rule; GET `gis-layers`/`composite-layers` list paths already pass via the GET default |
| Revenue Meter | GET | MCP `/metering/summary?days=N` via `/api/spine/mcp-metering/summary` | internal (server-side platform_internal key) | ✅ live |
| Parcel Trace (atom trace) | GET | retrieval `/atoms/trace/:did` via `/api/spine/retrieval/atoms/trace/:did` (routes are unprefixed — no `/v1`) | Bearer RETRIEVAL_API_KEY (server-side) | ✅ live (2026-07-13) |
| Parcel Trace (place resolve) | GET | `/api/brokerage/v1/place/resolve` | — | 🚫 path does not exist on cortex-api (SPA fallthrough HTML 200, live-probed 2026-07-13); the resolve→atoms flow cannot populate until cortex ships it |
| Run Monitor | GET | `/api/brokerage/v1/operator/warming/status`, `/api/internal/qa/run-state` | service Bearer | honest-empty (run-state endpoint not built yet; MCP `/admin/operator/run-state` probe skipped in proxy mode) |
| Settings / Calibration Tracker | — | localStorage / static honest-empty | — | n/a |

## Workspace Tile Endpoint Inventory (cortex-client 0.1.1 / cortex-tiles 0.1.3 — actual emitted paths)

All engagement/report tiles ride the plan-review BFF (`/api/plan-review/...`), guarded by `requireServiceTokenOrSession` — the service Bearer works.

| Tile | Method | Upstream path | Live probe (2026-07-07) |
|------|--------|---------------|--------------------------|
| IntakeQueue | GET | `/api/plan-review/reviewer/engagements` (404-fallback to `/api/engagements`) | ✅ 200, 38 engagements |
| Engagement detail (shell) | GET | `/api/engagements/:id` (#234 service reads) | ✅ 200 |
| Submissions | GET/POST | `/api/engagements/:id/submissions` (#234) | ✅ 200 |
| FindingsLibrary / ComplianceRun findings | GET | `/api/plan-review/submissions/:sid/findings` (via getSubmissions → getSubmissionFindings) | ✅ 200 |
| Findings update | PATCH | plan-review BFF finding action routes | ✅ (BFF) |
| Reports: compliance, topography, drainage, hydrology, subsurface, hazard, encumbrances, brief (PropertyBrief tile: `property-brief`→`brief` normalized), avm | GET `/api/plan-review/engagements/:id/reports/:type`; POST `.../reports/:type/run` | ✅ 200 `{"status":"not-run"}` empty-state |
| Dataroom / DocumentViewer | GET | `/api/plan-review/engagements/:id/documents`, `.../dataroom-atoms`; annotations via `/api/plan-review/engagements/:id/annotations` | ✅ 200 |
| Document upload/ingest | POST | plan-review BFF document upload/complete/ingest routes | ✅ (BFF) |
| SheetExtraction | GET/POST | `/api/plan-review/engagements/:id/sheets`, `.../sheets/extract` | ✅ 200 |
| Letter | GET/POST | `/api/plan-review/engagements/:id/letter`, `.../letter/generate` | ✅ 200 |
| ResponseTasks | GET/PATCH | `/api/plan-review/engagements/:id/response-tasks` | ✅ 200 |
| DocumentParsing | GET | `/api/engagements/:id/attached-documents` (L2 surface; there is NO `parsed-sections` route) | ✅ 200 |
| ProductSpecReference | GET | `/api/engagements/:id/product-spec-references` (L5 surface; there is NO `/product-specs` route) | ✅ 200 |
| Deliverable letters (L3) | GET | `/api/engagements/:id/deliverable-letters` | ✅ 200 |
| LocalSetbacks | GET | `/api/local/setbacks/:jurisdictionKey` (unguarded) | ⚠️ 404 for geocoded slugs: geocode emits `bastrop_tx` (underscores), tables are keyed `bastrop-tx` (hyphens); normalization fix in flight (`fix/cc-setbacks-gis-service`) |
| Map | — | no cortex HTTP call (client-side render; composes PropertyBriefTile) | n/a |
| SpaceBar (saved spaces) | GET/PUT/DELETE | command-center uses localStorage; cortex-client's server spaces live at `/api/plan-review/spaces`, `/api/plan-review/spaces/by-name/:name` (NOT `/api/saved-spaces`) | ✅ 200 |
| Geocode (A5 context bar) | POST | `/api/plan-review/geocode` | ✅ 200 |

## Excluded Endpoints (Not Proxied)

| Panel/Feature | Path | Reason |
|---------------|------|--------|
| MCP Inspector | POST `/admin/introspection/tools/:name/call` | Live call probe executes tools under simulated auth; direct operator access only |
| MCP Inspector | any other `/admin/*` | Admin-only (key mint/revoke etc.); the pinned introspection catalog GET is the sole exception |
| Agent View | `/llms.txt`, `/.well-known/agents.txt` | MCP server root (not under `/mcp/*`); not routed |
| Run Monitor | MCP `/admin/operator/run-state` | Endpoint does not exist yet; probe skipped in proxy mode |

## Proxy Allowlist Summary

- All cortex paths GET/HEAD-allowed by default.
- MCP `/mcp` POST for JSON-RPC; `/api/spine/mcp-metering/summary` pinned; `/api/spine/mcp-introspection/tools[/:name]` pinned GET-only (admin key attached server-side, everything else under the segment 403).
- Retrieval paths GET/HEAD-only with server-side Bearer (health paths pass keyless).
- Mutating methods allowed for: `api/engagements` (POST), `api/intake/parse`, `api/plan-review/geocode`, `api/place/geocode` (legacy), `api/plan-review/spaces*`, `api/saved-spaces*` (legacy), plan-review engagement sub-resources, and `api/engagements/:id/(reports|letter|findings|submissions|documents|sheets)/*`.
- Map-data live GIS queries: POST allowed for exactly `api/brokerage/v1/map-data`, `api/brokerage/v1/map-data/gis-layer`, `api/brokerage/v1/map-data/composite-layer` (exact matches, POST only — deliberately outside the prefix rule so unlisted map-data sub-resources and PUT/DELETE/PATCH stay 403).
- Blocked: any MCP `/admin/*` path outside the pinned introspection catalog GETs.

## Testing

`proxyContract.test.ts` walks this inventory. When a panel shows an error, first classify: JSON 401/403 (auth/tier), JSON 404 (real route, missing resource — often an empty-state bug), HTML 200 (path does not exist upstream — fix the path).
