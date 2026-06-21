# hauska-map

White-label map renderer and operator spine console for the Calibrated Spine program.

## Wave 2 — Registry, read-contract, reasoning layers, live trace

Function-only spine console with V3 allocation, V4 read-contract consumption, V5 input-gated reasoning layers, live MCP introspection + atom trace wiring, and V9 positioning.

### Run

```powershell
cd P:\hauska-map
npm install
npm run dev
```

Open http://localhost:5173/

Query params:

- `?fixture=0` — live GIS + atoms (requires Hauska key in top bar)
- `?api=https://cortex-api-...` — override API base
- `?mcp=http://127.0.0.1:3000/mcp` — MCP URL (introspection at `/admin/introspection/tools`)
- `?retrieval=http://127.0.0.1:8080` — retrieval-api for atom trace
- `?app=cortex&report=property-brief` — V3 layer allocation context

### V3 allocation

`resolveLayerAllocation({ appId, reportType, tier })` in `src/renderer/layer-allocation.js`.

### V4 read-contract

`src/read-contract/index.js` mirrors atom-contract@1.4.0. Scalar-only envelope fills do not render.

### V1 renderer contract

Four signals: `mount(slot)`, `resize()`, `setLayerVisibility(Set)`, `bindContext(ctx)`.

See `src/renderer/map-renderer.js`.

### Port source

Map render libs ported from `hauska-brief-extension` (`gis-map-render`, fixture data, paint stack).
