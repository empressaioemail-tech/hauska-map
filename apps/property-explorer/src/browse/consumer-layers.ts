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

import type { LayerKey } from "@hauska/map-renderer";

export const CONSUMER_EXCLUDED_LAYERS = new Set<LayerKey>([
  "rent-heat",
  "dem-hillshade",
  "hydrology-flow",
]);

export function filterConsumerLayers(seed: Set<LayerKey>): Set<LayerKey> {
  const next = new Set<LayerKey>();
  for (const key of seed) {
    if (!CONSUMER_EXCLUDED_LAYERS.has(key)) next.add(key);
  }
  return next;
}
