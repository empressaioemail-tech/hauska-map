// Pure tests for the buildable-envelope wedge normalization + draw decision —
// the load-bearing "what draws" logic behind the map's amber inset. No DOM, no
// MapLibre: normalizeEnvelope + the overlay builders are pure. Locks BOTH
// envelope payload shapes (baked FeatureCollection, live bare Polygon), the
// honest 0% case, and the client-side inset fallback.
//
// Run: `npx vitest run src/browse/envelope-overlay.test.ts`

import { describe, it, expect } from "vitest";
import {
  ENVELOPE_LAYER_KEY,
  ENVELOPE_SETBACK_LINE_KEY,
  normalizeEnvelope,
  envelopeInsetOverlay,
  setbackConsumedOverlay,
  insetParcelBySetbacks,
  stripRingSpikes,
  stripEnvelopeSpikes,
} from "./envelope-overlay";

// A small square parcel ring (~ Bastrop lat), CCW-closed.
const PARCEL_RING: Array<[number, number]> = [
  [-97.4320, 30.0067],
  [-97.4300, 30.0067],
  [-97.4300, 30.0080],
  [-97.4320, 30.0080],
  [-97.4320, 30.0067],
];
const PARCEL_POLY = { type: "Polygon", coordinates: [PARCEL_RING] };
const INSET_POLY = {
  type: "Polygon",
  coordinates: [
    [
      [-97.4318, 30.0069],
      [-97.4302, 30.0069],
      [-97.4302, 30.0078],
      [-97.4318, 30.0078],
      [-97.4318, 30.0069],
    ],
  ],
};

describe("normalizeEnvelope", () => {
  it("BAKED ok: geojson FeatureCollection -> kind ok + inset geometry", () => {
    const baked = {
      status: "ok",
      geojson: {
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: {}, geometry: INSET_POLY }],
      },
      setbacks: { front_ft: 30, side_ft: 15, rear_ft: 20 },
      buildableAreaPct: 80,
    };
    const n = normalizeEnvelope(baked);
    expect(n.kind).toBe("ok");
    expect((n.insetGeometry as { type: string }).type).toBe("Polygon");
  });

  it("LIVE ok: bare geometry Polygon -> kind ok + inset geometry", () => {
    const live = {
      ok: true,
      status: "ok",
      geometry: INSET_POLY,
      setbacks: { front_ft: 30, side_ft: 15, rear_ft: 20 },
    };
    const n = normalizeEnvelope(live);
    expect(n.kind).toBe("ok");
    expect(n.insetGeometry).toBeTruthy();
  });

  it("no-buildable-area (baked, geometry null) -> kind empty, no inset", () => {
    const empty = {
      status: "no-buildable-area",
      geojson: {
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: {}, geometry: null }],
      },
      setbacks: { front_ft: 30, side_ft: 15, rear_ft: 20 },
      buildableAreaPct: 0,
    };
    const n = normalizeEnvelope(empty);
    expect(n.kind).toBe("empty");
    expect(n.insetGeometry).toBeNull();
  });

  it("live empty (ok:false, no-buildable-area) -> kind empty", () => {
    const n = normalizeEnvelope({ ok: false, status: "no-buildable-area", empty: true });
    expect(n.kind).toBe("empty");
  });

  it("card projection status empty -> kind empty (consumed lot)", () => {
    const n = normalizeEnvelope({
      status: "empty",
      setbacks: { front_ft: 30, side_ft: 15, rear_ft: 20 },
      reason: "setbacks consume the lot",
    });
    expect(n.kind).toBe("empty");
    expect(n.insetGeometry).toBeNull();
  });

  it("declined -> kind none, no inset", () => {
    const n = normalizeEnvelope({ status: "declined", declineReason: "no-setback-table" });
    expect(n.kind).toBe("none");
    expect(n.insetGeometry).toBeNull();
  });

  it("garbage input -> kind none", () => {
    expect(normalizeEnvelope(null).kind).toBe("none");
    expect(normalizeEnvelope(undefined).kind).toBe("none");
    expect(normalizeEnvelope({}).kind).toBe("none");
  });
});

describe("envelopeInsetOverlay", () => {
  it("builds the amber inset spec: low-opacity fill + STATIC dashed edge", () => {
    const spec = envelopeInsetOverlay(INSET_POLY);
    expect(spec.layerKey).toBe(ENVELOPE_LAYER_KEY);
    expect(spec.paint?.["fill-opacity"]).toBeLessThan(0.2); // shows through.
    expect(spec.paint?.["fill-color"]).toBe("#f2a23c"); // amber.
    // The dash MUST be a static literal array (crash guard), never an expression.
    const dash = spec.paint?.["line-dasharray"];
    expect(Array.isArray(dash)).toBe(true);
    expect((dash as unknown[]).every((n) => typeof n === "number")).toBe(true);
    expect(JSON.stringify(dash)).not.toContain("feature-state");
  });
});

describe("setbackConsumedOverlay (0% outline)", () => {
  it("outlines the parcel ring with NO fill (never a fabricated buildable area)", () => {
    const spec = setbackConsumedOverlay(PARCEL_POLY);
    expect(spec).not.toBeNull();
    expect(spec!.layerKey).toBe(ENVELOPE_SETBACK_LINE_KEY);
    expect(spec!.paint?.["fill-opacity"]).toBe(0); // no amber fill at 0%.
    expect(Array.isArray(spec!.paint?.["line-dasharray"])).toBe(true);
  });

  it("returns null when there is no parcel ring (map draws nothing, card carries honesty)", () => {
    expect(setbackConsumedOverlay(null)).toBeNull();
    expect(setbackConsumedOverlay({ type: "Point", coordinates: [0, 0] })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Ring-spike sanitizer. GROUND-TRUTH fixture: the exact inset ring the live
// buildable-envelope derive returned for 48453:280239 (17005 Simsbrook Dr,
// Pflugerville) on 2026-08-24. The frontage is digitized as 7 near-collinear
// chords; the ring carries five zero-width out-and-back excursions of exactly
// the 25 ft front setback (7.61 m), which drew as dashed strokes perpendicular
// to the frontage (the ladder defect this sanitizer removes).
// ---------------------------------------------------------------------------
const SIMSBROOK_SPIKED_RING: Array<[number, number]> = [
  [-97.6356118199237, 30.458985053650913],
  [-97.63553269353883, 30.458979263473758],
  [-97.63553311735974, 30.458974960010174],
  [-97.63531917292462, 30.458958667161184],
  [-97.63531536980175, 30.459004204674063],
  [-97.6353083874001, 30.459087812761624],
  [-97.63552530842573, 30.459092421151116],
  [-97.63552574036433, 30.459081101703276],
  [-97.6356051084325, 30.459083352046985],
  [-97.6355257715294, 30.459080395848016],
  [-97.63552700497142, 30.459055799728166],
  [-97.63560634187452, 30.459058755927135],
  [-97.63552704505922, 30.4590550865614],
  [-97.63552857605357, 30.4590305030106],
  [-97.63560787286887, 30.459034172376334],
  [-97.63552862423089, 30.45902979747914],
  [-97.63553044957862, 30.459005229137365],
  [-97.63560969821661, 30.45900960403456],
  [-97.63553050666077, 30.459004518784695],
  [-97.63553262836786, 30.45897996840105],
  [-97.6356118199237, 30.458985053650913],
];

/** Max deviation-from-straight across a closed ring's vertices, degrees. */
function maxTurnDeviationDeg(ring: Array<[number, number]>): number {
  const open = ring.slice(0, ring.length - 1);
  const lat0 = open[0][1];
  const mLng = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const mLat = 111_320;
  let max = 0;
  for (let i = 0; i < open.length; i++) {
    const a = open[(i - 1 + open.length) % open.length];
    const b = open[i];
    const c = open[(i + 1) % open.length];
    const ux = (b[0] - a[0]) * mLng;
    const uy = (b[1] - a[1]) * mLat;
    const vx = (c[0] - b[0]) * mLng;
    const vy = (c[1] - b[1]) * mLat;
    const ul = Math.hypot(ux, uy);
    const vl = Math.hypot(vx, vy);
    if (ul < 1e-9 || vl < 1e-9) continue;
    const cos = (ux * vx + uy * vy) / (ul * vl);
    const dev = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
    if (dev > max) max = dev;
  }
  return max;
}

/** Planar shoelace area in squared metres (local equirectangular). */
function areaSqM(ring: Array<[number, number]>): number {
  const lat0 = ring[0][1];
  const mLng = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const mLat = 111_320;
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = [ring[i][0] * mLng, ring[i][1] * mLat];
    const [x2, y2] = [ring[i + 1][0] * mLng, ring[i + 1][1] * mLat];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a / 2);
}

describe("stripRingSpikes (perpendicular setback-stripe defect)", () => {
  it("strips the five 25-ft reversal spikes from the Simsbrook incident ring", () => {
    // Before: the ring doubles back on itself (~179.4 deg deviation) at each
    // frontage chord junction — that is exactly what drew the ladder.
    expect(maxTurnDeviationDeg(SIMSBROOK_SPIKED_RING)).toBeGreaterThan(160);

    const clean = stripRingSpikes(SIMSBROOK_SPIKED_RING);
    // After: no reversal remains anywhere on the ring...
    expect(maxTurnDeviationDeg(clean)).toBeLessThan(160);
    // ...meaningfully fewer vertices (5 tips + their rejoin duplicates gone)...
    expect(clean.length).toBeLessThan(SIMSBROOK_SPIKED_RING.length - 8);
    expect(clean.length).toBeGreaterThanOrEqual(9); // still a real lot shape.
    // ...closed...
    expect(clean[0]).toEqual(clean[clean.length - 1]);
    // ...and the enclosed area is effectively unchanged. The five slivers are
    // ~8 cm wide x 7.61 m long, so stripping them moves the area by ~1.5 sq m
    // on a ~285 sq m envelope (measured 0.53%) — bound it at 1%.
    const before = areaSqM(SIMSBROOK_SPIKED_RING);
    const after = areaSqM(clean);
    expect(Math.abs(after - before)).toBeLessThan(before * 0.01);
  });

  it("leaves a straight-edge rectangular ring untouched (Bastrop 5-point case)", () => {
    expect(stripRingSpikes(PARCEL_RING)).toBe(PARCEL_RING); // identity, not a copy.
  });

  it("preserves a genuinely sharp lot corner (wide mouth = not a spike)", () => {
    // Falsifier: a wedge lot with a ~170 deg deviation vertex whose legs
    // DIVERGE (~55 m mouth). If the sanitizer ate this, it would be rewriting
    // real lot geometry, not removing zero-width artifacts.
    const wedge: Array<[number, number]> = [
      [-97.435, 30.0],
      [-97.4345, 30.0005], // sharp tip
      [-97.4348, 30.0], // legs rejoin ~30m apart -> mouth >> 1.5m
      [-97.4348, 29.9995],
      [-97.435, 29.9995],
      [-97.435, 30.0],
    ];
    expect(stripRingSpikes(wedge)).toBe(wedge);
  });

  it("returns the original ring rather than collapsing below a polygon", () => {
    // Pure out-and-back sliver: stripping would leave < 3 vertices.
    const sliver: Array<[number, number]> = [
      [-97.435, 30.0],
      [-97.4349, 30.0],
      [-97.435, 30.0000001],
      [-97.4349, 30.0000001],
      [-97.435, 30.0],
    ];
    const out = stripRingSpikes(sliver);
    expect(out.length).toBeGreaterThanOrEqual(4);
  });
});

describe("stripEnvelopeSpikes + envelopeInsetOverlay draw path", () => {
  it("the drawn overlay geometry carries the sanitized ring, not the spiked one", () => {
    const spiked = { type: "Polygon", coordinates: [SIMSBROOK_SPIKED_RING] };
    const spec = envelopeInsetOverlay(spiked);
    const drawn = (
      spec.geojson as {
        features: Array<{ geometry: { coordinates: Array<Array<[number, number]>> } }>;
      }
    ).features[0].geometry;
    expect(maxTurnDeviationDeg(drawn.coordinates[0])).toBeLessThan(160);
    expect(drawn.coordinates[0].length).toBeLessThan(SIMSBROOK_SPIKED_RING.length);
  });

  it("passes a clean polygon through by reference (no-op on the happy path)", () => {
    expect(stripEnvelopeSpikes(INSET_POLY)).toBe(INSET_POLY);
  });

  it("passes non-polygon geometry through verbatim (never invents a shape)", () => {
    const pt = { type: "Point", coordinates: [0, 0] };
    expect(stripEnvelopeSpikes(pt)).toBe(pt);
    expect(stripEnvelopeSpikes(null)).toBeNull();
  });
});

describe("insetParcelBySetbacks (client-side fallback)", () => {
  it("insets a real parcel ring by the setbacks -> a smaller Polygon", () => {
    const inset = insetParcelBySetbacks(PARCEL_POLY, {
      front_ft: 20,
      side_ft: 15,
      rear_ft: 20,
    }) as { type: string; coordinates: Array<Array<[number, number]>> } | null;
    expect(inset).not.toBeNull();
    expect(inset!.type).toBe("Polygon");
    // The inset ring must be strictly inside the parcel bbox (moved inward).
    const xs = inset!.coordinates[0].map((p) => p[0]);
    expect(Math.min(...xs)).toBeGreaterThan(-97.4320);
    expect(Math.max(...xs)).toBeLessThan(-97.4300);
  });

  it("returns null without a parcel ring or without setbacks (never fabricates)", () => {
    expect(insetParcelBySetbacks(null, { front_ft: 20 })).toBeNull();
    expect(insetParcelBySetbacks(PARCEL_POLY, null)).toBeNull();
    expect(insetParcelBySetbacks(PARCEL_POLY, { front_ft: 0, side_ft: 0, rear_ft: 0 })).toBeNull();
  });
});
