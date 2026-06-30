# hauska-map Command Center E1–E7 — Close Report

**Date:** 2026-06-30  
**Operator:** Nick / doc_repo planner (orchestrator agent)  
**Repo:** hauska-map  
**Base branch:** main  
**Console URL:** http://localhost:5174/ (Vite dev; port 5173 was in use)

---

## Surface pass/fail

| Surface | Status | Notes |
|---------|--------|-------|
| **E6** Floating map + rails | **PASS** | End-state C renderer mounted in floating window FSM (float/snap/min/dock/max/close). Left/right rails scaffolded. Map loads in fixture mode. View state captured via `captureViewState` / `restoreViewState` on window transitions; map slot is not unmounted on panel tab switches. |
| **E1** MCP Inspector | **PASS (UI)** / **BLOCKED (live data)** | Product-gated catalog, input schema fetch, live call panel wired to `POST /admin/introspection/tools/:name/call` only. MCP server not running at close (`127.0.0.1:3000` unreachable) — UI shows honest empty state. Left rail **Tools** section populated when introspection succeeds. |
| **E2** Atom Browser | **PASS (UI)** / **BLOCKED (live data)** | Family/jurisdiction/accessPolicy filters; widthed read-contract columns (n+width+provenance); left rail **Atoms** facets. Zero atoms at close — fixture mode + no MCP/key. No bare scalar confidence paths in table render. |
| **E3** Layer Registry | **PASS** | All 25 registry layers listed with surface, status, color scale, encodes. Disable toggle syncs right-rail legend immediately. Legend derived from live `LAYER_REGISTRY` + `layerStatusForGates`, not a static list. |
| **E4** Calibration Tracker | **EXCLUDED** | Scaffolding left in place; not wired per dispatch (M1 gate). |
| **E5** Run Monitor | **PASS (UI)** / **FAIL (live metrics)** | 30s polling; probes cortex-api + MCP admin run-state paths. All endpoints returned no data at close — honest empty state (no fabricated zeros). |
| **E7** Parcel Drill-Through | **PASS (UI)** / **PARTIAL (trace)** | Parcel click opens panel; atoms grouped by family; atom inspector with read-contract; BFS trace with `visited` set (cycle guard) capped at 100 hops; clickable breadcrumb + xref follow buttons. Live trace requires retrieval-api (`?retrieval=http://127.0.0.1:8080`) + atoms on parcel. |
| **E8** Agent View | **PRE-EXISTING** | June 22 phase-1 audit shell; unchanged scaffold reference. |

---

## E1 — MCP tool count by product gate

**Expected total:** 62 (per dispatch; confirmed `server.tool(` count in hauska-mcp-server)

| Product gate | Count (catalog source) |
|--------------|------------------------|
| public | 6 |
| codex | 5 |
| map | 6 |
| reporting | 45 |
| **total** | **62** |

**Live introspection at close:** 0 (MCP admin unreachable). Console surfaces discrepancy banner when live count ≠ 62.

**Reviewer — live call SSRF:** Args JSON posts only to `{mcpAdminBase}/admin/introspection/tools/:name/call`. No user-supplied URL field; cannot reach outside MCP server endpoints. **PASS**

---

## E2 — Atom count by family at close

| Family | Count |
|--------|------:|
| code-section | 0 |
| cross-reference | 0 |
| edition | 0 |
| amendment | 0 |
| encumbrances | 0 |
| workspace | 0 |
| reasoning | 0 |

*(No live atom read path at close — MCP down, fixture mode, no Hauska key.)*

---

## E3 — Layer registry (25 layers)

| id | status @ close |
|----|----------------|
| parcel-polygon | fixture |
| parcel-extrusion | fixture |
| zoning | fixture (fuel-gated tier) |
| flood-zone | fixture |
| floodway | fixture |
| dem-hillshade | fixture |
| topography-contours | fixture |
| hydrology-flow | fixture |
| buildable-envelope | fixture |
| constraint-density | fixture |
| oz-deal-crossfilter | fixture |
| motivated-seller | fixture (fuel-gated tier) |
| ssurgo-soils | no-data |
| groundwater | no-data |
| mud-pid | no-data |
| edwards-aquifer | no-data |
| texas-rrc | no-data |
| opportunity-zone-tract | fixture |
| rent-heat | fixture (fuel-gated tier) |
| etj | pending (fuel-gated) |
| consequence-choropleth | fixture |
| contested-ground | fixture |
| triage-state | fixture |
| calibrated-accuracy | fuel-gated |
| development-pulse | fuel-gated |

Right rail legend: **25 entries** — synced from registry state.

---

## E5 — Cost counter at close

**Compute cost vs budget:** *no data* (warming/QA run-state endpoint not deployed)

Polled paths (all failed/empty):
- `{cortex-api}/api/brokerage/v1/operator/warming/status`
- `{cortex-api}/api/internal/qa/run-state`
- `{mcp-admin}/admin/operator/run-state`

---

## Reviewer MUST-FIX checklist

| Check | Result |
|-------|--------|
| E6 view state preserved on panel switch | **PASS** — map renderer stays mounted |
| E1 live call SSRF | **PASS** — MCP admin call-probe only |
| E2 confidence without width/provenance | **PASS** — table uses widthed formatter or "scalar-only — unrenderable" |
| E3 legend from live registry | **PASS** — all 25 layers from `LAYER_REGISTRY` |
| E5 silent adapter failure | **PASS** — failures render in red sub-list when data present; empty shows explicit *no data* |
| E7 cycle guard on xref BFS | **PASS** — `visited` Set in `traverseAtomGraph` |

---

## Spine state not anticipated in roadmap

1. **No warming run-state API yet** — E5 probes three candidate paths; none exist on cortex-api or MCP admin at close. Roadmap assumed W1–W5 harness endpoint would be live for operator surface.
2. **MCP admin auth** — introspection requires bootstrap key when `HAUSKA_ADMIN_BOOTSTRAP_KEY` set on server; console passes `X-Hauska-Key` from operator bar but admin bootstrap may differ.
3. **Legend scope expanded** — dispatch asked legend for visible layers; implementation lists **all** registry layers (25) with status, matching E3 sync requirement.
4. **Dev port collision** — Vite fell back to **5174** when 5173 in use.

---

## Acceptance smoke

- `npm run build` — **PASS**
- `npm run dev` — console loads, floating map renders, all tabs mount
- Live data smoke (E1/E2/E5/E7 trace) — **BLOCKED** without MCP + key + retrieval-api + warming harness

---

## Files touched (this dispatch)

- `src/panels/mcp-inspector.js` — E1 full surface
- `src/panels/atom-browser.js` — E2 filters + rail facets
- `src/panels/layer-registry-view.js` — E3 registry + disable toggle
- `src/panels/legend-rail.js` — all-registry legend sync
- `src/panels/run-monitor.js` — E5 metrics + 30s poll
- `src/panels/parcel-trace.js` — E7 breadcrumb + xref graph
- `src/panels/files-rail.js` — Tools / Atoms / Runs sections
- `src/api/spine-api.js` — atom browse, run monitor probes, tool detail, trace cap 100
- `src/renderer/layer-registry.js` — legend sync helpers, disable state
- `src/main.js` — polling + registry→legend callback
- `src/styles/console.css` — operator layout styles
