// apps/property-explorer/src/browse/inspect-highlight.ts
//
// COUNTY-EXACT inspect highlight (P-60d "offset / doubled lot shapes" fix).
//
// The clicked-parcel highlight is MapLibre feature-state on the PMTiles
// fill/line layers (parcel-tiles.js). The PMTiles bake is tippecanoe-simplified
// (~0.75 m deviation at z16, up to ~5 m corner cuts at z12-14) and
// feature-state paint can be tile-partial across a tile seam, so the highlight
// can visibly disagree with the exact county line mesh the live-GIS overlay
// co-draws from the SAME CAD fabric.
//
// The sealed fact sheet already carries the county-exact parcel ring
// (sheet.geometry.rings). Once the sheet seals for the inspected parcel,
// ExplorerMap redraws the highlight from that ring as a dedicated GeoJSON
// overlay (this module builds the spec) and demotes the tile feature-state
// fill. Feature-state remains the INSTANT click feedback before the seal.
//
// This module is the pure, testable core: no map handle, no React.

import type { LayerKey, OverlaySpec } from "@hauska/map-renderer";
import { CONTEXT_PARCEL_FILL_NEUTRAL } from "../../../../packages/map-renderer/src/map/layer-role-taxonomy.js";

/** Overlay key for the county-exact inspected-parcel ring. Already registered
 *  as a SUBJECT-role key in layer-role-taxonomy.js (LAYER_ROLE_BY_KEY). */
export const INSPECT_RING_LAYER_KEY = "parcel-inspected";

// Mirror of the parcel-tiles.js INSPECTED feature-state visual, so swapping
// the highlight source (tile feature-state -> sheet ring) changes geometry
// accuracy, not the UX: line #cfe8ff @ 1.8px (parcelLineColorExpr /
// parcelLineWidthExpr), neutral selection fill (the non-choropleth inspected
// treatment) at the 0.25 inspected opacity.
const INSPECT_LINE_COLOR = "#cfe8ff";
const INSPECT_LINE_WIDTH = 1.8;
const INSPECT_FILL_COLOR = CONTEXT_PARCEL_FILL_NEUTRAL;
const INSPECT_FILL_OPACITY = 0.25;

type Ring = Array<[number, number]>;

/** A minimally-valid closed ring: >= 4 positions of [number, number]. */
function isRing(r: unknown): r is Ring {
  return (
    Array.isArray(r) &&
    r.length >= 4 &&
    r.every(
      (p) =>
        Array.isArray(p) &&
        p.length >= 2 &&
        typeof p[0] === "number" &&
        typeof p[1] === "number",
    )
  );
}

/**
 * Build the county-exact inspect-highlight overlay from the sealed sheet's
 * `geometry.rings`. Outer ring only — the same convention every other consumer
 * of sheet rings in this app uses (runParcelLookup's geometry seed and the
 * consumed-lot parcelRing both take rings[0]).
 *
 * Returns [] when the sheet carries no usable ring, in which case the caller
 * keeps the feature-state highlight (an approximate highlight beats none).
 */
export function countyExactInspectOverlays(rings: unknown): OverlaySpec[] {
  if (!Array.isArray(rings) || rings.length === 0) return [];
  const outer = rings[0];
  if (!isRing(outer)) return [];
  return [
    {
      layerKey: INSPECT_RING_LAYER_KEY as LayerKey,
      layerKind: "inspected-parcel-ring",
      geojson: {
        type: "Feature",
        properties: { kind: "inspected-parcel-ring" },
        geometry: { type: "Polygon", coordinates: [outer] },
      },
      paint: {
        "fill-color": INSPECT_FILL_COLOR,
        "fill-opacity": INSPECT_FILL_OPACITY,
        "line-color": INSPECT_LINE_COLOR,
        "line-width": INSPECT_LINE_WIDTH,
      },
    },
  ];
}

/**
 * The consumed-lot (honest 0%) outline geometry decision — precedence AND
 * parcel identity in one place.
 *
 * Precedence: the sheet-sourced `parcelRing` wins. It is county-exact and, by
 * construction, belongs to the parcel the envelope was derived for; the
 * click-time ref is whatever geometry the LAST click stashed.
 *
 * Identity guard: click-time geometry is used ONLY when it provably belongs to
 * the same parcel node id as the envelope result. A late envelope resolve for
 * parcel A must never draw geometry stashed from a click on parcel B, and an
 * UNPROVEN identity (either id null) refuses rather than guessing — fail
 * closed; the card wording carries the 0% honesty when nothing draws.
 */
export function consumedLotOutlineGeometry(args: {
  /** `result.parcelRing` off the envelope state (sheet-sourced), or null. */
  sheetParcelRing: unknown;
  /** Geometry stashed at click time, or null. */
  clickGeometry: unknown;
  /** The parcel node id the click geometry was stashed FOR, or null. */
  clickParcelNodeId: string | null;
  /** The parcel node id the envelope result belongs to, or null. */
  envelopeParcelNodeId: string | null;
}): unknown | null {
  if (args.sheetParcelRing != null) return args.sheetParcelRing;
  if (
    args.clickGeometry != null &&
    args.clickParcelNodeId != null &&
    args.envelopeParcelNodeId != null &&
    args.clickParcelNodeId === args.envelopeParcelNodeId
  ) {
    return args.clickGeometry;
  }
  return null;
}
