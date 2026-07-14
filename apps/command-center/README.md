# Command Center

Empressa Command Center — the React/Vite operator/admin console for the Empressa map platform.

## Architecture

This is the **canonical operator console** for production deployment. The root `src/` vanilla JS console is frozen for development/reference.

- **Framework**: React 18 + Vite 6 + TypeScript
- **Port**: 5174 (dev)
- **Backend APIs**:
  - Cortex API (Cloud Run): operator run-state, place/atoms
  - Hauska MCP server: search_atoms, get_atom, admin introspection
  - Retrieval API: atom trace/lineage (stubbed panels)

## Development

```bash
# From monorepo root
pnpm install
pnpm dev:cc

# Or from this directory
npm run dev
```

## Environment Configuration

**Deployed (default) mode** — the browser defaults to the same-origin `/api/spine/*` proxy (`api/spine.ts` at the repo root); no `VITE_*` vars are needed and no key ever ships to the browser. The proxy attaches auth server-side from these Vercel env vars (see `PROXY_CONTRACT.md` for the full table):

- `CORTEX_SERVICE_API_KEY` — Bearer for cortex-api (required for cortex panels/tiles)
- `MCP_PRODUCT_KEY` — `X-Hauska-Key` for the MCP server (optional: unset falls back to the anonymous public product; must be a `platform_internal` key for the Revenue Meter's `/metering/summary`)
- `MCP_ADMIN_KEY` — `X-Hauska-Admin-Key` for the path-pinned `/admin/introspection/tools` catalog (Surface & Gate, MCP Inspector)
- `RETRIEVAL_API_KEY` — Bearer for the retrieval API (Parcel Trace atom trace)
- `CORTEX_API_URL` / `MCP_URL` / `RETRIEVAL_API_URL` — upstream overrides (default to the Cloud Run URLs)

**Local-dev direct mode** — point the browser straight at locally running services (keys are then sent from the browser; paste one in Settings):

```bash
# .env.local (development overrides)
VITE_CORTEX_API_URL=http://localhost:8000
VITE_MCP_URL=http://localhost:3000/mcp
VITE_RETRIEVAL_API_URL=http://localhost:8080
```

The same overrides are reachable at runtime via query params (`?api=`, `?mcp=`, `?retrieval=`) or localStorage — see `Settings`.

## Deployment

### Vercel

Deploy from the monorepo root with `apps/command-center` as the project directory:

1. **Framework Preset**: Other (custom build command in vercel.json)
2. **Root Directory**: `apps/command-center`
3. **Build Command**: (auto from vercel.json) `cd ../.. && pnpm install && pnpm --filter command-center build`
4. **Output Directory**: `dist`
5. **Environment Variables**: Set the server-side proxy vars (`CORTEX_SERVICE_API_KEY`, `MCP_PRODUCT_KEY`, `MCP_ADMIN_KEY`, `RETRIEVAL_API_KEY`, optional `*_URL` overrides) in Vercel project settings. Do NOT set `VITE_*` vars in production — they bake direct upstream URLs into the bundle and bypass the proxy.

The `vercel.json` configures:
- Custom monorepo-aware build command
- SPA routing (all routes rewrite to `/index.html`)
- Static output from `dist/`

### Manual Build

```bash
# From monorepo root
pnpm install
pnpm --filter command-center build

# Output: apps/command-center/dist/
```

## Panels

Live operator panels:
- **Atoms**: Search and inspect atoms via MCP
- **Runs**: Monitor operator run-state from Cortex API
- **Surface & Gate**: Inspect surface gates
- **Calibration**: Track calibration status

Stubbed panels (placeholders for future implementation):
- Node & Graph, Lineage & Audit, Resolver, Autonomous Engines, License & Access

### Gaps vs Root Console

The frozen root `src/` console includes panels not yet in this app:
- **E1 MCP Inspector**: Direct MCP tool introspection UI
- **E7 Parcel Trace**: Full parcel resolution + atom trace
- **E8 Agent View**: Agent/LLM interaction panel
- **E3 Layer Registry**: Map layer visibility controls
- Map integration (floating window, legend rail, files rail)

These represent **operator-critical** features that may need migration based on production requirements.

## Authentication

Uses `X-Hauska-Key` header (not OAuth/Bearer). The key is stored in localStorage and shared with the root console (same storage key). Set via the config bar in the header.
