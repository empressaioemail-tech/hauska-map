// apps/property-explorer/src/browse/consumer-layers.ts
//
// Consumer-honest layer filter for the browse LAYERS panel (extracted from
// ExplorerMap so the panel contract is unit-testable). Drops:
//  - AVM/valuation layers (no `rent-heat` on browse — WDLL 27).
//  - Fixture-only terrain layers that are NOT wired to live engine data on this
//    surface. PE runs `useFixture={false}`, so the fixture stack never draws.
//    `dem-hillshade` now controls production TxGIO terrain-RGB setTerrain (T-010).
//  - The derived D8 flow layer (`hydrology-flow`): RETIRED as a customer layer.
//    Real county-mapped streams ("Hydrography") replaced the D8 squiggle; the
//    D8 engine slot remains a report input only (no browse-map consumer).
//
// Phase 0A T-H03: cold-open visible is parcel-line only; the KNOWN set is the
// full consumer-eligible catalog so presets/checkboxes can turn layers on.

import type { LayerKey } from "@hauska/map-renderer";
import { LAYER_REGISTRY } from "../../../../packages/map-renderer/src/layer-registry.js";

export const CONSUMER_EXCLUDED_LAYERS = new Set<LayerKey>([
  "rent-heat",
  "hydrology-flow",
  // 3D terrain (TxGIO LiDAR) toggle removed from the PE layers panel: the 3D
  // push is PAUSED (operator decision, doc_repo 40_hauska_map_3d_implementation_
  // brief.md 2026-08-01). The underlying terrain-RGB / setTerrain code stays
  // banked for resume; only the user-facing toggle is withdrawn here.
  "dem-hillshade",
]);

/** Always-available PE water layer (not in DEFAULT_VISIBLE after Phase 0A). */
export const HYDROGRAPHY_TOGGLE_KEY = "hydrography" as LayerKey;

export function filterConsumerLayers(seed: Set<LayerKey>): Set<LayerKey> {
  const next = new Set<LayerKey>();
  for (const key of seed) {
    if (!CONSUMER_EXCLUDED_LAYERS.has(key)) next.add(key);
  }
  return next;
}

/**
 * Full set of layer keys the PE LAYERS panel should list (known), regardless
 * of cold-open visibility. Includes live-wired consumer rows only.
 */
export function consumerKnownLayers(): Set<LayerKey> {
  const next = new Set<LayerKey>();
  for (const entry of LAYER_REGISTRY as Array<{ key: string; live?: boolean }>) {
    const key = entry.key as LayerKey;
    if (CONSUMER_EXCLUDED_LAYERS.has(key)) continue;
    // Prefer live-wired rows; keep parcel-polygon + zoning + flood always.
    if (
      entry.live ||
      key === "parcel-polygon" ||
      key === "zoning" ||
      key === "flood-zone" ||
      key === "topography-contours" ||
      key === "dem-hillshade" ||
      key === "hydrography" ||
      key === "opportunity-zone-tract" ||
      key === "pedestrian-ways"
    ) {
      next.add(key);
    }
  }
  next.add(HYDROGRAPHY_TOGGLE_KEY);
  return next;
}

/**
 * Cold-open visible set for PE.
 *
 * Operator want (REBRAND map-chrome, 2026-08-03): when a user lands, EVERY
 * consumer layer initializes ON by default EXCEPT the satellite/aerial base
 * (which is a separate basemap toggle that stays default-OFF, not a member of
 * this set). So cold-open visible == the full consumer-eligible catalog. The
 * previous Phase 0A parcel-line-only default (`COLD_OPEN_VISIBLE_LAYERS`) is
 * withdrawn on this surface; it stays exported/imported only to keep the shared
 * taxonomy contract intact.
 *
 * This changes DEFAULTS only — every toggle in the LAYERS panel still works, so
 * a user can turn any layer off. `consumerKnownLayers()` already applies the
 * `CONSUMER_EXCLUDED_LAYERS` filter (drops rent-heat, hydrology-flow,
 * dem-hillshade), so no extra filter pass is needed here.
 */
export function consumerColdOpenVisible(): Set<LayerKey> {
  return consumerKnownLayers();
}
