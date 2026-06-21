# hauska-map

White-label map renderer and operator spine console for the Calibrated Spine program.

## Wave 1 — Spine console shell

Function-only, all-white localhost dashboard (End-state E). No warming, no calibration layers.

### Run

```powershell
cd P:\hauska-map
npm install
npm run dev
```

Open http://localhost:5173/

Query params:

- `?fixture=0` — attempt live cortex-api GIS (requires `hauskaKey` in localStorage)
- `?api=https://cortex-api-...` — override API base
- `?mcp=http://127.0.0.1:3000/mcp` — MCP introspection endpoint

### V1 renderer contract

Four signals: `mount(slot)`, `resize()`, `setLayerVisibility(Set)`, `bindContext(ctx)`.

See `src/renderer/map-renderer.js`.

### Port source

Map render libs ported from `hauska-brief-extension` (`gis-map-render`, fixture data, paint stack).
