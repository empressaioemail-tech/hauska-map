# fill-extrusion-base anchoring with production terrain (T-010 / WDLL item 5)

## Shader finding (MapLibre 5.24 — PASS for Phase 1)

Source: `node_modules/maplibre-gl/src/shaders/glsl/fill_extrusion.vertex.glsl`

When `TERRAIN3D` is defined (active after `setTerrain`):

```glsl
float height_terrain3d_offset = get_elevation(a_centroid);
float base_terrain3d_offset = height_terrain3d_offset - (base > 0.0 ? 0.0 : 10.0);
base = max(0.0, base) + base_terrain3d_offset;
height = max(0.0, height) + height_terrain3d_offset;
```

**Interpretation:** Extrusions anchor at the **polygon centroid** terrain elevation, not z=0 sea level. For `fill-extrusion-base: 0`, MapLibre applies a **10 m basement** below centroid elevation to reduce hover on slopes.

## Verdict: PASS (shader-cited; live confirm after GCS publish)

| Criterion | Result |
|-----------|--------|
| Base follows ground vs sea level | **PASS** — base offset by centroid DEM elevation |
| `base: 0` on slopes | **PASS with caveat** — 10 m basement hack; may over-dig on steep bluffs |
| Large polygons on steep slopes | **Centroid artifact risk** (MapLibre #2513 class) — Bastrop envelope parcels are typically small enough for Phase 1 |

## Live verify procedure (post GCS rsync + PE deploy)

1. Enable **3D terrain** layer (`dem-hillshade` chip) on PE or CC fixture stack.
2. Pitch map to **45°** over Bastrop bluff AOI (cold-open center ~30.11, -97.32).
3. CC fixture: toggle **parcel-extrusion**; PE: use envelope overlay + fixture CC if needed.
4. Screenshot: extrusion floor should track relief, not float at flat sea level.

If live probe shows float **> ~2 m** rendering tolerance on a representative parcel, escalate before Phase 1/3 scheduling.

## Phase 3 note

Flood depth (`BFE − ground`) remains on engine contours/3DEP until per-report NAVD88 migration — **not** this terrain tile URL.
