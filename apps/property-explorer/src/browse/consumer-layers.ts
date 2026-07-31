// apps/property-explorer/src/browse/consumer-layers.ts
//
// Consumer-honest layer filter for the browse LAYERS panel (extracted from
// ExplorerMap so the panel contract is unit-testable). Drops:
//  - AVM/valuation layers (no `rent-heat` on browse — WDLL 27).
//  - Fixture-only terrain layers that are NOT wired to live engine data on this
//    surface. PE runs `useFixture={false}`, so the fixture stack never draws — a
//    toggle for an unwired layer would do nothing (the "panel doesn't work"
//    report). We surface ONLY toggles that control a REAL layer: live parcels,
//    live FEMA, live contours (`topography-contours` -> engine topography-1ft),
//    and live hydrography (`hydrography` -> engine hydrography slot).
//    `dem-hillshade` stays excluded — no live hillshade endpoint yet (honest).
//  - The derived D8 flow layer (`hydrology-flow`): RETIRED as a customer layer.
//    Real county-mapped streams ("Hydrography") replaced the D8 squiggle; the
//    D8 engine slot remains a report input only (no browse-map consumer).
//
// Phase 0A T-H03: cold-open visible is parcel-line only; the KNOWN set is the
// full consumer-eligible catalog so presets/checkboxes can turn layers on.

import type { LayerKey } from "@hauska/map-renderer";
import { LAYER_REGISTRY } from "../../../../packages/map-renderer/src/layer-registry.js";
import { COLD_OPEN_VISIBLE_LAYERS } from "../../../../packages/map-renderer/src/map/layer-role-taxonomy.js";

export const CONSUMER_EXCLUDED_LAYERS = new Set<LayerKey>([
  "rent-heat",
  "dem-hillshade",
  "hydrology-flow",
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
      key === "hydrography"
    ) {
      next.add(key);
    }
  }
  next.add(HYDROGRAPHY_TOGGLE_KEY);
  return next;
}

/** Phase 0A cold-open visible set for PE (≤3 map layers; pins are chrome). */
export function consumerColdOpenVisible(): Set<LayerKey> {
  return filterConsumerLayers(
    new Set(COLD_OPEN_VISIBLE_LAYERS as readonly LayerKey[]),
  );
}
