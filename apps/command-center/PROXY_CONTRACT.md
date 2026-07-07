# Command Center Proxy Contract

This document enumerates **every endpoint** called by Command Center panels and workspace tiles, mapped to the `/api/spine/*` proxy routes and their allowlist status.

## Production Defects Fixed

1. **Atom Inspector panel**: MCP HTTP 403 - POST to `/api/spine/mcp` was rejected (upstreamPath mismatch)
2. **Reviewer Queue tile**: Getting HTML instead of JSON - upstream path mismatch (cortex API routes live under `/api/` prefix; fixed by updating baseUrl to `/api/spine/cortex/api` and re-prefixing mutation allowlist)

## Proxy Architecture

The Command Center is deployed on Vercel with a same-origin serverless proxy (`api/spine.ts`) that holds all service keys server-side. Browser clients NEVER hold credentials.

**Routing** (via `vercel.json` rewrite):
- `/api/spine/(.*) → /api/spine?upath=$1`
- The proxy routes by first path segment:
  - `/api/spine/cortex/*` → CORTEX_API_URL with `Authorization: Bearer CORTEX_SERVICE_API_KEY`
  - `/api/spine/mcp/*` → MCP_URL with `X-Hauska-Key: MCP_PRODUCT_KEY`
  - `/api/spine/retrieval/*` → RETRIEVAL_API_URL (no auth)

**Security posture**:
- Keys stay server-side
- `/admin/*` MCP paths blocked
- Methods allowlisted: GET by default, POST/PUT/PATCH/DELETE for specific cortex paths only
- MCP JSON-RPC POST path explicitly allowed

## Panel Endpoint Inventory

| Panel | Method | Path | Proxied Route | Allowlist Status | Notes |
|-------|--------|------|---------------|------------------|-------|
| **Atom Inspector** | POST | `/mcp` | `/api/spine/mcp` | ✅ FIXED | MCP JSON-RPC call via HauskaMcpClient; was 403 (upstreamPath empty not 'mcp') |
| Atom Inspector | POST | `/mcp` (tools/list) | `/api/spine/mcp` | ✅ ALLOWED | MCP protocol: initialize, tools/list |
| Atom Inspector | POST | `/mcp` (tools/call: search_atoms) | `/api/spine/mcp` | ✅ ALLOWED | search_atoms tool call |
| **MCP Inspector** | GET | `/admin/introspection/tools` | N/A (blocked) | 🚫 EXCLUDED | Admin path blocked at proxy by design |
| MCP Inspector | POST | `/admin/introspection/tools/:name/call` | N/A (blocked) | 🚫 EXCLUDED | Admin path blocked at proxy by design |
| **Agent View** | POST | `/mcp` | `/api/spine/mcp` | ✅ ALLOWED | MCP protocol: tools/list, tools/call |
| Agent View | GET | `/llms.txt` | N/A (blocked) | 🚫 EXCLUDED | MCP root path (not under /mcp/*), blocked |
| Agent View | GET | `/.well-known/agents.txt` | N/A (blocked) | 🚫 EXCLUDED | MCP root path (not under /mcp/*), blocked |
| **Layer Registry View** | GET | `/api/brokerage/v1/map-data/gis-layers` | `/api/spine/cortex/api/brokerage/v1/map-data/gis-layers` | ✅ ALLOWED | GET allowed by default |
| **Settings** | N/A | (localStorage only) | N/A | N/A | No API calls |
| **Run Monitor** | Varies | (future stub) | N/A | N/A | Stub panel |
| **Surface Gate Inspector** | Varies | (future stub) | N/A | N/A | Stub panel |
| **Parcel Trace** | Varies | (future stub) | N/A | N/A | Stub panel |
| **Calibration Tracker** | Varies | (future stub) | N/A | N/A | Stub panel |
| **Revenue Meter** | GET | `/metering/summary?days=N` | `/api/spine/mcp-metering/summary?days=N` | ✅ ALLOWED | MCP metering API; days param validated (1..31) |

## Workspace Tile Endpoint Inventory

Workspace tiles are mounted via `@hauska/cortex-tiles` and call the cortex API through the proxy (`/api/spine/cortex`). All cortex endpoints are proxied with auth attached server-side.

### Intake & Submission Tiles

| Tile | Method | Path | Proxied Route | Allowlist Status | Notes |
|------|--------|------|---------------|------------------|-------|
| **IntakeQueue** | GET | `/engagements` | `/api/spine/cortex/engagements` | ✅ ALLOWED | List engagements |
| IntakeQueue | GET | `/engagements/:id` | `/api/spine/cortex/engagements/:id` | ✅ ALLOWED | Engagement detail |
| IntakeQueue | GET | `/engagements/:id/submissions` | `/api/spine/cortex/engagements/:id/submissions` | ✅ ALLOWED | List submissions |
| IntakeQueue | POST | `/engagements/:id/submissions` | `/api/spine/cortex/engagements/:id/submissions` | ✅ ALLOWED | Create submission |
| IntakeQueue | POST | `/engagements/:id/submissions/:sid/compliance` | `/api/spine/cortex/engagements/:id/submissions/:sid/compliance` | ✅ ALLOWED | Run compliance pass |
| IntakeQueue | GET | `/engagements/:id/reports/:type` | `/api/spine/cortex/engagements/:id/reports/:type` | ✅ ALLOWED | Report status |
| **Intake** | POST | `/engagements` | `/api/spine/cortex/engagements` | ✅ ALLOWED | Create engagement |
| Intake | POST | `/intake/parse` | `/api/spine/cortex/intake/parse` | ✅ ALLOWED | Parse intake content |

### Compliance Tiles

| Tile | Method | Path | Proxied Route | Allowlist Status | Notes |
|------|--------|------|---------------|------------------|-------|
| **FindingsLibrary** | GET | `/engagements/:id/findings` | `/api/spine/cortex/engagements/:id/findings` | ✅ ALLOWED | List findings |
| FindingsLibrary | PATCH | `/engagements/:id/findings/:fid` | `/api/spine/cortex/engagements/:id/findings/:fid` | ✅ ALLOWED | Update finding action |
| FindingsLibrary | POST | `/engagements/:id/reports/:type/run` | `/api/spine/cortex/engagements/:id/reports/:type/run` | ✅ ALLOWED | Run compliance pass |
| **ComplianceRun** | GET | `/engagements/:id/reports/:type` | `/api/spine/cortex/engagements/:id/reports/:type` | ✅ ALLOWED | Report detail |
| ComplianceRun | POST | `/engagements/:id/reports/:type/run` | `/api/spine/cortex/engagements/:id/reports/:type/run` | ✅ ALLOWED | Trigger run |

### Document & Dataroom Tiles

| Tile | Method | Path | Proxied Route | Allowlist Status | Notes |
|------|--------|------|---------------|------------------|-------|
| **DocumentViewer** | GET | `/engagements/:id/documents/:docId` | `/api/spine/cortex/engagements/:id/documents/:docId` | ✅ ALLOWED | Document metadata |
| DocumentViewer | GET | `/engagements/:id/documents/:docId/download` | `/api/spine/cortex/engagements/:id/documents/:docId/download` | ✅ ALLOWED | Download URL |
| **Dataroom** | GET | `/engagements/:id/documents` | `/api/spine/cortex/engagements/:id/documents` | ✅ ALLOWED | List documents |
| Dataroom | POST | `/engagements/:id/documents/request-upload-url` | `/api/spine/cortex/engagements/:id/documents/request-upload-url` | ✅ ALLOWED | Request GCS signed URL |
| Dataroom | POST | `/engagements/:id/documents/complete-upload` | `/api/spine/cortex/engagements/:id/documents/complete-upload` | ✅ ALLOWED | Complete upload |
| Dataroom | POST | `/engagements/:id/documents/:docId/ingest` | `/api/spine/cortex/engagements/:id/documents/:docId/ingest` | ✅ ALLOWED | Ingest dataroom doc |
| Dataroom | DELETE | `/engagements/:id/documents/:docId` | `/api/spine/cortex/engagements/:id/documents/:docId` | ✅ ALLOWED | Delete document |
| **SheetExtraction** | POST | `/engagements/:id/sheets/extract` | `/api/spine/cortex/engagements/:id/sheets/extract` | ✅ ALLOWED | Extract sheets |
| SheetExtraction | GET | `/engagements/:id/sheets` | `/api/spine/cortex/engagements/:id/sheets` | ✅ ALLOWED | List sheets |

### Site Analysis Tiles (GIS-backed)

| Tile | Method | Path | Proxied Route | Allowlist Status | Notes |
|------|--------|------|---------------|------------------|-------|
| **Map** | POST | `/place/geocode` | `/api/spine/cortex/place/geocode` | ✅ ALLOWED | Forward/reverse geocode |
| Map | GET | `/place/parcel` | `/api/spine/cortex/place/parcel` | ✅ ALLOWED | Parcel lookup |
| Map | GET | `/api/brokerage/v1/map-data/gis-layers` | `/api/spine/cortex/api/brokerage/v1/map-data/gis-layers` | ✅ ALLOWED | Layer catalog |
| **Topography** | GET | `/place/topography` | `/api/spine/cortex/place/topography` | ✅ ALLOWED | Topo data |
| **Drainage** | GET | `/place/drainage` | `/api/spine/cortex/place/drainage` | ✅ ALLOWED | Drainage data |
| **Hydrology** | GET | `/place/hydrology` | `/api/spine/cortex/place/hydrology` | ✅ ALLOWED | Hydrology data |
| **Subsurface** | GET | `/place/subsurface` | `/api/spine/cortex/place/subsurface` | ✅ ALLOWED | Subsurface data |

### Property Intel Tiles

| Tile | Method | Path | Proxied Route | Allowlist Status | Notes |
|------|--------|------|---------------|------------------|-------|
| **PropertyBrief** | GET | `/place/property-brief` | `/api/spine/cortex/place/property-brief` | ✅ ALLOWED | Property summary |
| **HazardProfile** | GET | `/place/hazards` | `/api/spine/cortex/place/hazards` | ✅ ALLOWED | Hazard profile |
| **Encumbrance** | GET | `/place/encumbrances` | `/api/spine/cortex/place/encumbrances` | ✅ ALLOWED | Encumbrances |
| **LocalSetbacks** | GET | `/place/setbacks` | `/api/spine/cortex/place/setbacks` | ✅ ALLOWED | Setback rules |

### Deliverable Tiles

| Tile | Method | Path | Proxied Route | Allowlist Status | Notes |
|------|--------|------|---------------|------------------|-------|
| **Letter** | POST | `/engagements/:id/letter/generate` | `/api/spine/cortex/engagements/:id/letter/generate` | ✅ ALLOWED | Generate comment letter |
| Letter | GET | `/engagements/:id/letter` | `/api/spine/cortex/engagements/:id/letter` | ✅ ALLOWED | Letter status |
| **ResponseTasks** | GET | `/engagements/:id/response-tasks` | `/api/spine/cortex/engagements/:id/response-tasks` | ✅ ALLOWED | List tasks |
| ResponseTasks | PATCH | `/engagements/:id/response-tasks/:tid` | `/api/spine/cortex/engagements/:id/response-tasks/:tid` | ✅ ALLOWED | Update task status |

### Design Accelerator Tiles

| Tile | Method | Path | Proxied Route | Allowlist Status | Notes |
|------|--------|------|---------------|------------------|-------|
| **DocumentParsing** | POST | `/engagements/:id/documents/:docId/parse` | `/api/spine/cortex/engagements/:id/documents/:docId/parse` | ✅ ALLOWED | Parse document |
| DocumentParsing | GET | `/engagements/:id/parsed-sections` | `/api/spine/cortex/engagements/:id/parsed-sections` | ✅ ALLOWED | List parsed sections |
| **ProductSpecReference** | GET | `/product-specs` | `/api/spine/cortex/product-specs` | ✅ ALLOWED | List specs |
| ProductSpecReference | GET | `/product-specs/:specId` | `/api/spine/cortex/product-specs/:specId` | ✅ ALLOWED | Spec detail |

### Workspace Management

| Feature | Method | Path | Proxied Route | Allowlist Status | Notes |
|---------|--------|------|---------------|------------------|-------|
| **SpaceBar (save)** | POST | `/saved-spaces` | `/api/spine/cortex/saved-spaces` | ✅ ALLOWED | Save workspace |
| SpaceBar (load) | GET | `/saved-spaces` | `/api/spine/cortex/saved-spaces` | ✅ ALLOWED | List saved spaces |
| SpaceBar (load detail) | GET | `/saved-spaces/:name` | `/api/spine/cortex/saved-spaces/:name` | ✅ ALLOWED | Load space |
| SpaceBar (delete) | DELETE | `/saved-spaces/:name` | `/api/spine/cortex/saved-spaces/:name` | ✅ ALLOWED | Delete space |
| SpaceBar (share) | POST | `/saved-spaces/:name/share` | `/api/spine/cortex/saved-spaces/:name/share` | ✅ ALLOWED | Share space |

## Excluded Endpoints (Not Proxied)

These endpoints are intentionally blocked at the proxy and panels show honest "not available through proxy" states:

| Panel/Feature | Path | Reason |
|---------------|------|--------|
| MCP Inspector | `/admin/introspection/*` | Admin-only MCP introspection; requires direct operator access with key |
| MCP Inspector | `/admin/introspection/tools/:name/call` | Admin-only tool call probe; blocked in deployed mode |
| Agent View | `/llms.txt` | MCP server root (not under `/mcp/*`); not routed through proxy |
| Agent View | `/.well-known/agents.txt` | MCP server root (not under `/mcp/*`); not routed through proxy |

## Proxy Allowlist Summary

### GET Allowlist
- **All cortex paths** are GET-allowed by default (method in `['GET', 'HEAD']`)
- **MCP `/mcp` path** POST for JSON-RPC
- **Retrieval API** all GET

### POST/PUT/PATCH/DELETE Allowlist (Cortex Only)
The proxy explicitly allows mutating methods for these cortex paths (with `/api/` prefix):
- `api/engagements` (POST to create)
- `api/intake/parse` (POST)
- `api/place/geocode` (POST)
- `api/saved-spaces` (POST/PUT/DELETE)
- `api/saved-spaces/:name/share` (POST)
- **Engagement sub-resources** matching pattern: `api/engagements/:id/(reports|letter|findings|submissions|documents|sheets)/*`
  - Allows POST/PUT/PATCH/DELETE to:
    - reports (run passes)
    - letter (generate)
    - findings (update actions)
    - submissions (create, run compliance)
    - documents (upload, ingest, delete)
    - sheets (extract)

### MCP POST Allowlist
- `/api/spine/mcp` (upstreamPath empty) → MCP JSON-RPC endpoint

### Blocked
- Any path containing `/admin/*` when routing to MCP

## Changes Made

### Before (Defects)
1. **MCP POST 403**: `api/spine.ts` line 99-101 required `upstreamPath === 'mcp'`, but when calling `/api/spine/mcp`, upstreamPath is empty string
2. **Cortex GET fallthrough**: Upstream path mismatch — cortex API routes live under `/api/` prefix, but baseUrl was `/api/spine/cortex`, causing requests like `/engagements` to hit upstream `/engagements` (cortex SPA fallthrough → HTML)

### After (Fixes)
1. **MCP POST fixed**: Changed condition to `path[0] === 'mcp' && (upstreamPath === 'mcp' || upstreamPath === '')` to allow POST to the MCP JSON-RPC endpoint at `/api/spine/mcp`
2. **Cortex upstream path fixed**: Changed baseUrl from `/api/spine/cortex` to `/api/spine/cortex/api`, so tile-relative paths like `/engagements` reach upstream `/api/engagements`. Re-prefixed mutation allowlist to match `api/engagements`, `api/intake/parse`, etc.

## Testing Notes

All panel endpoints are either:
- ✅ **Allowlisted** and carried by the proxy
- 🚫 **Explicitly excluded** with honest UI states

The proxy contract test (see `apps/command-center/src/admin/api/__tests__/proxyContract.test.ts`) walks this inventory and asserts coverage.
