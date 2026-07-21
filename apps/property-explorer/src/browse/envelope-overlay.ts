// apps/property-explorer/src/browse/envelope-overlay.ts
//
// The WEDGE VISUAL: turn a resolved buildable envelope into a drawable
// OverlaySpec so the map paints "what you can build, drawn" — an amber inset
// polygon inside the parcel, the gap to the parcel edge = the setback.
//
// Two envelope shapes flow into `handleEnvelope` (ExplorerMap), and this module
// normalizes BOTH into one draw path:
//
//   BAKED (place_layer_snapshots, status "ok"):
//     { status:"ok", geojson: FeatureCollection<Polygon>, setbacks, buildableAreaPct, ... }
//     -> the inset buildable polygon is `geojson.features[0].geometry` (a real
//        Polygon computed server-side, shape-only / no roads = Tier-1).
//
//   LIVE fallback (POST buildable-envelope, un-baked nodes):
//     { ok:true, geometry: Polygon, setbacks, summary, ... }
//     -> the inset polygon is the bare `geometry`.
//
// HONESTY (commitment #1):
//   - "ok" with a real inset Polygon  -> draw the amber inset fill + dashed edge.
//   - "no-buildable-area" (0%)        -> the server returns geometry:null (the
//        setbacks consume the whole lot). We DRAW NOTHING amber (a fill would be
//        a fabricated buildable area). When we have the parcel ring we outline
//        the FULL parcel in the dashed setback style so the "entirely setback"
//        state reads visually; the card carries the honest 0% wording. Never an
//        empty, unexplained map.
//   - "declined" / no geometry        -> nothing to draw; the card states why.
//
// Any drawn envelope is Tier-1 (shape-only, no roads): the card always carries
// the "approximate — not survey grade" treatment. This module fabricates no
// geometry it was not handed (the client-side inset fallback below is used ONLY
// when the server gave setbacks + a real parcel ring but no inset polygon).

import type { OverlaySpec } from "@hauska/map-renderer";

/** The stable overlay key for the buildable-envelope wedge visual. */
export const ENVELOPE_LAYER_KEY = "buildable-envelope";
/** The overlay key for the "entirely setback" 0%-case parcel outline. */
export const ENVELOPE_SETBACK_LINE_KEY = "buildable-envelope-setback";

// Amber calibrated for the imagery/parcel to show through (extension F12/F13):
// a low-opacity fill + a bold, STATIC-dashed boundary (the setback edge).
const AMBER_FILL = "#f2a23c";
const AMBER_LINE = "#f2a23c";
const FILL_OPACITY = 0.12; // low, so the parcel/satellite shows through.
const LINE_WIDTH = 2.2;
// STATIC literal dash — the safe channel (the crash guard forbids only a
// feature-state-driven line-dasharray; a literal [3,2] is explicitly allowed).
const STATIC_DASH: [number, number] = [3, 2];

type Ring = Array<[number, number]>;

interface NormalizedEnvelope {
  /** "ok" (draw amber inset) | "empty" (0%, outline parcel) | "none". */
  kind: "ok" | "empty" | "none";
  /** The inset buildable Polygon geometry (GeoJSON), when kind === "ok". */
  insetGeometry: unknown | null;
}

/** A GeoJSON-ish Polygon: { type:"Polygon", coordinates:[ring, ...holes] }. */
function isPolygon(g: unknown): g is { type: "Polygon"; coordinates: Ring[] } {
  return (
    !!g &&
    typeof g === "object" &&
    (g as { type?: unknown }).type === "Polygon" &&
    Array.isArray((g as { coordinates?: unknown }).coordinates)
  );
}

/** Pull the first feature geometry out of a FeatureCollection / Feature. */
function firstGeometry(geojson: unknown): unknown | null {
  if (!geojson || typeof geojson !== "object") return null;
  const g = geojson as {
    type?: string;
    geometry?: unknown;
    features?: Array<{ geometry?: unknown }>;
  };
  if (g.type === "FeatureCollection" && Array.isArray(g.features)) {
    return g.features[0]?.geometry ?? null;
  }
  if (g.type === "Feature") return g.geometry ?? null;
  if (g.type === "Polygon" || g.type === "MultiPolygon") return geojson;
  return null;
}

/**
 * Normalize either envelope shape (baked or live) into a draw decision + the
 * inset geometry to draw. Reads the geometry the SERVER produced; it does not
 * invent one (client-side inset is a separate, explicit fallback below).
 */
export function normalizeEnvelope(result: unknown): NormalizedEnvelope {
  if (!result || typeof result !== "object") return { kind: "none", insetGeometry: null };
  const r = result as Record<string, unknown>;

  const status = typeof r.status === "string" ? r.status : null;
  const declined = status === "declined";
  if (declined) return { kind: "none", insetGeometry: null };

  // The honest 0% state: baked "no-buildable-area", or the live path's empty
  // signal (ok:false + status "no-buildable-area").
  const isEmpty =
    status === "no-buildable-area" ||
    (r.ok === false && status === "no-buildable-area") ||
    r.empty === true;

  // The inset geometry: live bare `geometry`, or baked `geojson` FeatureCollection.
  const geom = firstGeometry(r.geometry ?? r.geojson ?? null);
  const hasInset = isPolygon(geom);

  if (hasInset && !isEmpty) return { kind: "ok", insetGeometry: geom };
  if (isEmpty || !hasInset) {
    // Empty (0%) OR ok-but-no-geometry (declined-ish) -> no amber fill.
    return { kind: isEmpty ? "empty" : "none", insetGeometry: null };
  }
  return { kind: "ok", insetGeometry: geom };
}

/**
 * Build the amber inset OverlaySpec — the wedge visual. Low-opacity amber fill
 * (parcel/imagery shows through) + a bold STATIC-dashed boundary (the setback
 * edge). Namespaced under ENVELOPE_LAYER_KEY so it clears cleanly on the next
 * inspect.
 */
export function envelopeInsetOverlay(insetGeometry: unknown): OverlaySpec {
  return {
    layerKey: ENVELOPE_LAYER_KEY,
    layerKind: "buildable-envelope",
    geojson: {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { kind: "buildable-envelope" }, geometry: insetGeometry },
      ],
    },
    paint: {
      "fill-color": AMBER_FILL,
      "fill-opacity": FILL_OPACITY,
      "line-color": AMBER_LINE,
      "line-width": LINE_WIDTH,
      "line-dasharray": STATIC_DASH,
    },
  };
}

/**
 * The 0%-case outline: when the envelope is honestly empty (setbacks consume
 * the lot) and we have the clicked parcel's ring, outline the FULL parcel in the
 * dashed setback style (no fill) so "entirely setback" reads visually. Returns
 * null when we have no parcel geometry — the card wording then carries the
 * honesty and the map simply draws nothing (never a fabricated shape).
 */
export function setbackConsumedOverlay(parcelGeometry: unknown): OverlaySpec | null {
  const geom = firstGeometry(parcelGeometry);
  if (!isPolygon(geom)) return null;
  return {
    layerKey: ENVELOPE_SETBACK_LINE_KEY,
    layerKind: "buildable-envelope-empty",
    geojson: {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { kind: "setback-consumed" }, geometry: geom },
      ],
    },
    paint: {
      // No fill (0% buildable — a fill would fabricate buildable area). Dashed
      // amber outline only, marking the whole lot as setback.
      "fill-opacity": 0,
      "line-color": AMBER_LINE,
      "line-width": LINE_WIDTH,
      "line-dasharray": STATIC_DASH,
    },
  };
}

// ---------------------------------------------------------------------------
// Client-side inset FALLBACK (belt-and-suspenders). Used ONLY when the server
// gave setbacks + a real parcel ring but no inset polygon — we inset the parcel
// ring by the setback distances so the wedge still draws. This is an
// APPROXIMATION (uniform planar inset, no per-edge front/side/rear orientation),
// consistent with the always-on "approximate — not survey grade" treatment; it
// is never used to override a geometry the server already produced.
// ---------------------------------------------------------------------------

/** Meters-per-degree at a latitude, for a foot->degree inset distance. */
function degPerFoot(latDeg: number): { lat: number; lng: number } {
  const ft = 0.3048; // meters per foot
  const latM = 111_320; // meters per degree latitude (approx)
  const lngM = 111_320 * Math.cos((latDeg * Math.PI) / 180) || 1;
  return { lat: ft / latM, lng: ft / lngM };
}

/** Signed area (shoelace) of a ring in coordinate units; sign gives winding. */
function signedArea(ring: Ring): number {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return a / 2;
}

/**
 * Inset a single ring inward by `insetFt` feet (uniform), returning a new ring
 * or null if the inset collapses the polygon (a real 0% signal). Uses per-vertex
 * edge-normal offset — a robust-enough approximation for the wedge visual, not
 * survey geometry.
 */
function insetRing(ring: Ring, insetFt: number, latDeg: number): Ring | null {
  if (!Array.isArray(ring) || ring.length < 4) return null;
  const d = degPerFoot(latDeg);
  // Ensure closed ring and consistent (CCW) orientation for inward normals.
  const pts = ring.slice();
  const ccw = signedArea(pts) > 0;
  const src = ccw ? pts : pts.slice().reverse();
  const n = src.length - 1; // last == first
  const out: Ring = [];
  for (let i = 0; i < n; i++) {
    const prev = src[(i - 1 + n) % n];
    const cur = src[i];
    const next = src[(i + 1) % n];
    // Inward normals of the two adjacent edges (CCW ring -> left normal points in).
    const e1 = norm(cur[0] - prev[0], cur[1] - prev[1]);
    const e2 = norm(next[0] - cur[0], next[1] - cur[1]);
    const n1 = { x: -e1.y, y: e1.x };
    const n2 = { x: -e2.y, y: e2.x };
    let bx = n1.x + n2.x;
    let by = n1.y + n2.y;
    const bl = Math.hypot(bx, by);
    if (bl < 1e-9) continue;
    bx /= bl;
    by /= bl;
    out.push([cur[0] + bx * insetFt * d.lng, cur[1] + by * insetFt * d.lat]);
  }
  if (out.length < 3) return null;
  out.push(out[0]); // close.
  // If the inset flipped winding it collapsed through itself -> no buildable area.
  if (Math.sign(signedArea(out)) !== Math.sign(signedArea(src))) return null;
  return out;
}

function norm(x: number, y: number): { x: number; y: number } {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
}

/**
 * FALLBACK inset: given a parcel geometry and setback feet, produce an inset
 * Polygon (front/side/rear are averaged into a single uniform inset — an
 * approximation for the visual, consistent with "not survey grade"). Returns
 * null when the parcel collapses under the inset (a legitimate 0% signal).
 */
export function insetParcelBySetbacks(
  parcelGeometry: unknown,
  setbacks: { front_ft?: number | null; side_ft?: number | null; rear_ft?: number | null } | null,
): unknown | null {
  const geom = firstGeometry(parcelGeometry);
  if (!isPolygon(geom) || !setbacks) return null;
  const vals = [setbacks.front_ft, setbacks.side_ft, setbacks.rear_ft].filter(
    (v): v is number => typeof v === "number" && v > 0,
  );
  if (!vals.length) return null;
  const insetFt = vals.reduce((a, b) => a + b, 0) / vals.length;
  const rings = geom.coordinates;
  const outer = rings[0];
  const latDeg = outer[0]?.[1] ?? 30;
  const inset = insetRing(outer, insetFt, latDeg);
  if (!inset) return null;
  return { type: "Polygon", coordinates: [inset] };
}
