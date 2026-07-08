# Command Center Proxy Contract

This document enumerates every endpoint called by Command Center panels and workspace tiles, mapped to the `/api/spine/*` proxy routes.

> **REWRITTEN 2026-07-07 (ground-truth pass).** The previous revision of this file documented tile paths that do not exist on cortex-api (`/api/engagements/:id/findings`, `/api/place/*`, `/api/saved-spaces`, `/api/product-specs`, ...). Probing those paths returns the cortex SPA's index.html (200, text/html) because cortex mounts a GET catch-all SPA AFTER the API router — a fallthrough, not an auth failure. The shipping packages (`@empressaio/cortex-client@0.1.1`, `@empressaio/cortex-tiles@0.1.3`) call the `/plan-review/...` BFF and L-surface paths below, which exist and accept the service Bearer. This revision documents what the code actually calls, verified against legacy-design-tools main (2026-07-07) and live probes through cmdcenter-blush.vercel.app.

## Proxy Architecture (unchanged)

The Command Center is deployed on Vercel with a same-origin serverless proxy (`api/spine.ts`) that holds all service keys server-side. Browser clients NEVER hold credentials.

**Routing** (via `vercel.json` rewrite): `/api/spine/(.*) → /api/spine?upath=$1`, routed by first path segment:
- `/api/spine/cortex/*` → CORTEX_API_URL with `Authorization: Bearer CORTEX_SERVICE_API_KEY`
- `/api/spine/mcp/*` → MCP_URL with `X-Hauska-Key: MCP_PRODUCT_KEY`
- `/api/spine/mcp-metering/summary` → MCP metering summary (path-pinned; anything else 403)
- `/api/spine/retrieval/*` → RETRIEVAL_API_URL (no auth)

Client base for cortex calls: `/api/spine/cortex/api` (`cortexClient.ts`), so a cortex-client call to `/plan-review/x` reaches upstream `/api/plan-review/x`.

## SPA-fallthrough gotcha (read this before adding paths)

cortex-api mounts its API router at `/api` and THEN a root SPA with a GET catch-all. Any GET to a nonexistent `/api/...` path returns the SPA's index.html with HTTP 200. If a panel receives HTML where it expected JSON, the path is wrong — it is not an auth problem (auth failures return JSON 401/403).

## Panel Endpoint Inventory

| Panel | Method | Upstream path (cortex unless noted) | Auth guard | Status |
|-------|--------|-------------------------------------|-----------|--------|
| Atom Inspector / Agent View | POST | MCP `/mcp` (JSON-RPC: initialize, tools/list, tools/call) | X-Hauska-Key (server-side) | ✅ live |
| MCP Inspector | GET/POST | `/admin/introspection/*` | n/a | 🚫 blocked by design (admin) |
| Layer Registry View | GET | `/api/brokerage/v1/map-data/gis-layers` | `requireBrokerageAuthOrServiceToken` + route-level tier gate | ⚠️ 403 `tier_required` under the service key — the tier resolution ignores the service caller; fix in flight (`fix/cc-setbacks-gis-service`) |
| Revenue Meter | GET | MCP `/metering/summary?days=N` via `/api/spine/mcp-metering/summary` | internal (server-side key) | ✅ live |
| Settings / Run Monitor / Surface Gate Inspector / Parcel Trace / Calibration Tracker | — | localStorage / stubs | — | n/a |

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
| MCP Inspector | `/admin/introspection/*` | Admin-only; requires direct operator access with key |
| Agent View | `/llms.txt`, `/.well-known/agents.txt` | MCP server root (not under `/mcp/*`); not routed |

## Proxy Allowlist Summary

- All cortex paths GET/HEAD-allowed by default.
- MCP `/mcp` POST for JSON-RPC; `/api/spine/mcp-metering/summary` pinned.
- Mutating methods allowed for: `api/engagements` (POST), `api/intake/parse`, `api/plan-review/geocode`, `api/place/geocode` (legacy), `api/plan-review/spaces*`, `api/saved-spaces*` (legacy), plan-review engagement sub-resources, and `api/engagements/:id/(reports|letter|findings|submissions|documents|sheets)/*`.
- Blocked: any MCP `/admin/*` path.

## Testing

`proxyContract.test.ts` walks this inventory. When a panel shows an error, first classify: JSON 401/403 (auth/tier), JSON 404 (real route, missing resource — often an empty-state bug), HTML 200 (path does not exist upstream — fix the path).
