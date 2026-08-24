/**
 * P-60 multi-shape peel — composer inventory + visible-ring predicate.
 *
 * WDLL `_inbox/2026-08-24_lane1_multi_shape_peel_WDLL.md` items 1, 2, 3, 6.
 * One visible lot ring. Inspected lot may add one envelope. Fetch-ok is not
 * paint. Tile-line suppress stays fail-open (item 5).
 */

export const PEEL_PARCEL_MESH = true;

export const PARCEL_RING_COMPOSERS = [
  {
    id: "pmtiles-line",
    fileFn: "packages/map-renderer/src/map/parcel-tiles.js:addParcelTiles",
    kind: "ring" as const,
    paints: "Every lot outline while the parcel-polygon toggle is on.",
  },
  {
    id: "pmtiles-feature-state",
    fileFn: "packages/map-renderer/src/map/parcel-tiles.js:setParcelFeatureState",
    kind: "ring" as const,
    paints:
      "Subject/inspected tile stroke + glow. Pre-seal only after peel; countyRing demotes it.",
  },
  {
    id: "live-gis-mesh",
    fileFn: "packages/map-renderer/src/live-gis.ts:toLiveOverlays",
    kind: "ring" as const,
    paints:
      "Viewport county mesh lines (CONTEXT_PARCEL_LINE 1.1px). Extra composer on Travis lots.",
  },
  {
    id: "inspect-ring",
    fileFn:
      "apps/property-explorer/src/browse/inspect-highlight.ts:countyExactInspectOverlays",
    kind: "ring" as const,
    paints: "Sealed sheet outer ring on the inspected lot only.",
  },
  {
    id: "envelope",
    fileFn: "apps/property-explorer/src/browse/envelope-overlay.ts:envelopeInsetOverlay",
    kind: "envelope" as const,
    paints: "Amber dashed inset or consumed outline. At most one, inspected lot only.",
  },
  {
    id: "search-highlight",
    fileFn: "apps/property-explorer/src/browse/ExplorerMap.tsx:setSearchOverlays",
    kind: "transient" as const,
    paints: "Street-search box. Self-fades. Not a lot ring.",
  },
] as const;

export type LotPaint = {
  pmtilesLine: boolean;
  pmtilesFeatureStateStroke: boolean;
  liveGisMeshLine: boolean;
  inspectRing: boolean;
  envelope: boolean;
  searchHighlight: boolean;
};

/** Lot-outline composers only. Envelope and search are not lot rings. */
export function visibleParcelRings(lot: LotPaint): string[] {
  const rings: string[] = [];
  if (lot.pmtilesLine) rings.push("pmtiles-line");
  if (lot.pmtilesFeatureStateStroke) rings.push("pmtiles-feature-state");
  if (lot.liveGisMeshLine) rings.push("live-gis-mesh");
  if (lot.inspectRing) rings.push("inspect-ring");
  return rings;
}

export function envelopeCount(lot: LotPaint): number {
  return lot.envelope ? 1 : 0;
}

export function assertOneRingNeighbor(lot: LotPaint): void {
  const rings = visibleParcelRings(lot);
  if (rings.length !== 1) {
    throw new Error(
      `neighbor lot must show one ring, got ${rings.length}: ${rings.join(",")}`,
    );
  }
}

export function assertInspectedRingPlusEnvelope(lot: LotPaint): void {
  const rings = visibleParcelRings(lot);
  if (rings.length !== 1) {
    throw new Error(
      `inspected lot must show one ring, got ${rings.length}: ${rings.join(",")}`,
    );
  }
  if (envelopeCount(lot) > 1) {
    throw new Error("inspected lot may carry at most one envelope");
  }
}

/** Operator leftover after #208: tiles + mesh + inspect + envelope on 280239. */
export const STACKED_TRAVIS_BEFORE: LotPaint = {
  pmtilesLine: true,
  pmtilesFeatureStateStroke: true,
  liveGisMeshLine: true,
  inspectRing: true,
  envelope: true,
  searchHighlight: false,
};

/** Neighbor after peel: PMTiles line only. */
export const PEELED_NEIGHBOR: LotPaint = {
  pmtilesLine: true,
  pmtilesFeatureStateStroke: false,
  liveGisMeshLine: false,
  inspectRing: false,
  envelope: false,
  searchHighlight: false,
};

/** Inspected after seal: county ring + at most one envelope. Tile stroke demoted. */
export const PEELED_INSPECTED: LotPaint = {
  pmtilesLine: false,
  pmtilesFeatureStateStroke: false,
  liveGisMeshLine: false,
  inspectRing: true,
  envelope: true,
  searchHighlight: false,
};

export function liveOverlayVisibility(opts: {
  parcelToggle: boolean;
  femaToggle: boolean;
}): { parcels: boolean; fema: boolean; peelParcelMesh: true } {
  return {
    parcels: opts.parcelToggle,
    fema: opts.femaToggle,
    peelParcelMesh: PEEL_PARCEL_MESH,
  };
}
