# hauska-map

White-label map renderer and Empressa Command Center operator console for the Calibrated Spine program.

## Empressa Command Center

The unified operator console lives in `apps/command-center` (React + Vite, deployed on Vercel).

### Development

```powershell
cd P:\tmp\map-console-unify
pnpm install
pnpm --filter ./apps/command-center dev
```

Open http://localhost:5173/

### Build

```powershell
pnpm --filter ./apps/command-center build
```

### Deployment

The command-center is deployed to Vercel. Auth is attached server-side from Vercel env vars via the same-origin `/api/spine/*` proxy. The browser never holds service keys in deployed mode.

Production URL: (Vercel deployment)

### Configuration

The command-center reads config from localStorage + query params:

- `?api=...` — override cortexApiUrl
- `?mcp=...` — override mcpUrl  
- `?retrieval=...` — override retrievalApiUrl

For local-dev direct mode (VITE_ env overrides), operators can set a hauskaKey in the Settings panel.

### Panels

The command-center provides these operator panels:

**Substrate:**
- Atoms — search/browse spine atoms via MCP search_atoms
- Parcel Trace — place lookup + atom drill-through + trace graph
- MCP Tools — product-gated tool catalog + live call probe
- GIS Layers — layer registry + allocation metadata
- Calibration — calibration tracker

**Engines:**
- Runs — run monitor
- Agent Surface — third-party agent surface (catalog, discoverability, test harness)

**Governance:**
- Surface & Gate — surface gate inspector
- Settings — config + key management

## Map Renderer

The core map renderer lives in `packages/map-renderer` and is imported by command-center panels that need layer/allocation metadata.

### V3 allocation

`resolveLayerAllocation({ appId, reportType, tier })` in `packages/map-renderer/src/layer-allocation.js`.

### V4 read-contract

Read-contract parsing via `@hauska/atom-contract`. Scalar-only envelope fills do not render.

### V1 renderer contract

Four signals: `mount(slot)`, `resize()`, `setLayerVisibility(Set)`, `bindContext(ctx)`.

See `packages/map-renderer/src/map-renderer.js`.

## Port source

Map render libs ported from `hauska-brief-extension` (`gis-map-render`, fixture data, paint stack).

## Phase 3 Unification (2026-07-04)

The vanilla JS spine console (root index.html / src/*) has been retired. All capabilities migrated to `apps/command-center` as React panels. See decision `2026-07-04_master_map_and_console_unification`.
