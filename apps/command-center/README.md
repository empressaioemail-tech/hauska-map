# Command Center

Hauska Spine Command Center — the React/Vite operator/admin console for the Hauska map platform.

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

Backend endpoints are configurable via environment variables. See `.env.example` for defaults.

```bash
# .env.local (development overrides)
VITE_CORTEX_API_URL=http://localhost:8000
VITE_MCP_URL=http://localhost:3000/mcp
VITE_RETRIEVAL_API_URL=http://localhost:8080
```

Production defaults (set in Vercel):
- `VITE_CORTEX_API_URL`: https://cortex-api-tds7av26va-uc.a.run.app
- `VITE_MCP_URL`: https://mcp.hauska.dev/mcp
- `VITE_RETRIEVAL_API_URL`: (stub, localhost fallback)

## Deployment

### Vercel

Deploy from the monorepo root with `apps/command-center` as the project directory:

1. **Framework Preset**: Other (custom build command in vercel.json)
2. **Root Directory**: `apps/command-center`
3. **Build Command**: (auto from vercel.json) `cd ../.. && pnpm install && pnpm --filter command-center build`
4. **Output Directory**: `dist`
5. **Environment Variables**: Set `VITE_*` vars in Vercel project settings

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
