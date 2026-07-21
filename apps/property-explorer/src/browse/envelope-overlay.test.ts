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
