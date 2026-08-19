/**
 * W3 — FEMA zone classification, the ordinal ramp, and the DIVERGENCE TEST.
 *
 * Fixtures below are the EXACT attribute combinations returned by the live
 * `map-data/gis-layer` FEMA endpoint for a Bastrop viewport on 2026-08-18
 * (provider "FEMA NFHL", 204 features, every feature counted):
 *
 *     X  | 0.2 PCT ANNUAL CHANCE FLOOD HAZARD | SFHA=F   86
 *     AE | (null)                             | SFHA=T   61
 *     X  | AREA OF MINIMAL FLOOD HAZARD       | SFHA=F   36
 *     A  | (null)                             | SFHA=T   11
 *     AE | FLOODWAY                           | SFHA=T    7
 *     AO | (null)                             | SFHA=T    3
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONTEXT_FEMA_ZONES,
  FEMA_LEGEND,
  FEMA_ZONE_KEYS,
  classifyFemaZone,
  femaZoneClassExpr,
  femaZoneFillColorExpr,
  femaZoneFillOpacityExpr,
  femaZoneLineColorExpr,
  femaZoneLineWidthExpr,
  isInSfha,
} from "./fema-zones.js";
import { evalExpr } from "./expr-eval.js";
import { deltaE, oklch, wcagContrast } from "./color-metrics.js";
import { ROLE_BUDGET } from "./layer-role-taxonomy.js";
import { DATA_LAND_USE_COLORS } from "./land-use-classes.js";

/** The six real combinations measured in the Bastrop probe, with their counts. */
const LIVE_BASTROP = [
  { n: 86, props: { FLD_ZONE: "X", ZONE_SUBTY: "0.2 PCT ANNUAL CHANCE FLOOD HAZARD", SFHA_TF: "F" }, expect: "shadedX" },
  { n: 61, props: { FLD_ZONE: "AE", ZONE_SUBTY: null, SFHA_TF: "T" }, expect: "sfhaBfe" },
  { n: 36, props: { FLD_ZONE: "X", ZONE_SUBTY: "AREA OF MINIMAL FLOOD HAZARD", SFHA_TF: "F" }, expect: "minimal" },
  { n: 11, props: { FLD_ZONE: "A", ZONE_SUBTY: null, SFHA_TF: "T" }, expect: "sfhaNoBfe" },
  { n: 7, props: { FLD_ZONE: "AE", ZONE_SUBTY: "FLOODWAY", SFHA_TF: "T" }, expect: "floodway" },
  { n: 3, props: { FLD_ZONE: "AO", ZONE_SUBTY: null, SFHA_TF: "T" }, expect: "sfhaSheet" },
];

/** The rest of the published NFHL zone set, which Bastrop happens not to carry. */
const OTHER_NFHL = [
  { props: { FLD_ZONE: "AH", SFHA_TF: "T" }, expect: "sfhaBfe" },
  { props: { FLD_ZONE: "VE", SFHA_TF: "T" }, expect: "coastal" },
  { props: { FLD_ZONE: "V", SFHA_TF: "T" }, expect: "coastal" },
  { props: { FLD_ZONE: "A99", SFHA_TF: "T" }, expect: "sfhaNoBfe" },
  { props: { FLD_ZONE: "AR", SFHA_TF: "T" }, expect: "sfhaNoBfe" },
  { props: { FLD_ZONE: "D", SFHA_TF: "F" }, expect: "undetermined" },
  { props: { FLD_ZONE: "OPEN WATER" }, expect: "openWater" },
  { props: { FLD_ZONE: "AREA NOT INCLUDED" }, expect: "undetermined" },
  { props: { FLD_ZONE: "FLOODWAY" }, expect: "floodway" },
  // The honest catch-all: FEMA says IN, we did not enumerate the code.
  { props: { FLD_ZONE: "ZZ-UNKNOWN", SFHA_TF: "T" }, expect: "sfhaNoBfe" },
  // FEMA says OUT with no subtype we recognise.
  { props: { FLD_ZONE: "ZZ-UNKNOWN", SFHA_TF: "F" }, expect: "minimal" },
  // Nothing usable published at all.
  { props: {}, expect: "undetermined" },
];

describe("FEMA zone classification (W3)", () => {
  it("agrees with the MapLibre expression on every case (divergence test)", () => {
    const expr = femaZoneClassExpr();
    const mismatches = [];
    for (const c of [...LIVE_BASTROP, ...OTHER_NFHL]) {
      const fromJs = classifyFemaZone(c.props);
      const fromExpr = evalExpr(expr, c.props);
      if (fromJs !== fromExpr) mismatches.push({ props: c.props, fromJs, fromExpr });
    }
    assert.deepEqual(mismatches, [], "JS classifier and paint expression diverged");
  });

  it("resolves all six live Bastrop combinations to their own class", () => {
    const seen = new Set();
    for (const c of LIVE_BASTROP) {
      const got = classifyFemaZone(c.props);
      assert.equal(got, c.expect, JSON.stringify(c.props));
      seen.add(got);
    }
    // The whole point: six real combinations, six distinct paint buckets. The
    // previous implementation produced three, and effectively two.
    assert.equal(seen.size, 6, "the live viewport must not collapse into fewer classes");
    assert.equal(
      LIVE_BASTROP.reduce((sum, c) => sum + c.n, 0),
      204,
      "fixture counts must still total the probed feature count",
    );
  });

  it("classifies the rest of the published NFHL zone set", () => {
    for (const c of OTHER_NFHL) {
      assert.equal(classifyFemaZone(c.props), c.expect, JSON.stringify(c.props));
    }
  });

  it("makes in-versus-out readable: OUT carries no fill at all", () => {
    const opacity = femaZoneFillOpacityExpr();
    const minimal = LIVE_BASTROP.find((c) => c.expect === "minimal");
    assert.equal(evalExpr(opacity, minimal.props), 0);
    // …while every mapped hazard does carry one.
    for (const c of LIVE_BASTROP.filter((x) => x.expect !== "minimal")) {
      assert.ok(evalExpr(opacity, c.props) > 0, JSON.stringify(c.props));
    }
    // The 0.2% band and the minimal band were the pair the operator could not
    // separate. They must now differ in BOTH channels.
    const shaded = LIVE_BASTROP.find((c) => c.expect === "shadedX");
    assert.notEqual(
      evalExpr(femaZoneFillColorExpr(), shaded.props),
      evalExpr(femaZoneFillColorExpr(), minimal.props),
    );
    assert.notEqual(
      evalExpr(opacity, shaded.props),
      evalExpr(opacity, minimal.props),
    );
  });

  it("never over-claims hazard on an unrecognised zone", () => {
    // The previous default painted anything unmatched as the 100-year fill.
    const unknown = classifyFemaZone({ FLD_ZONE: "SOMETHING NEW" });
    assert.equal(unknown, "undetermined");
    assert.notEqual(
      CONTEXT_FEMA_ZONES[unknown].fill,
      CONTEXT_FEMA_ZONES.sfhaBfe.fill,
    );
    assert.equal(isInSfha({ FLD_ZONE: "SOMETHING NEW" }), null, "no determination is not 'out'");
  });

  it("reports in/out as three states, never two", () => {
    assert.equal(isInSfha({ FLD_ZONE: "AE", SFHA_TF: "T" }), true);
    assert.equal(isInSfha({ FLD_ZONE: "X", ZONE_SUBTY: "AREA OF MINIMAL FLOOD HAZARD", SFHA_TF: "F" }), false);
    assert.equal(isInSfha({ FLD_ZONE: "D" }), null);
    const states = new Set(FEMA_LEGEND.map((r) => r.inSfha));
    assert.equal(states.size, 3);
  });

  it("holds the CONTEXT wash-out budget on every zone", () => {
    for (const key of FEMA_ZONE_KEYS) {
      const o = CONTEXT_FEMA_ZONES[key].fillOpacity;
      assert.ok(
        o <= ROLE_BUDGET.CONTEXT.fillOpacityMax,
        `${key} fillOpacity ${o} exceeds the CONTEXT budget ${ROLE_BUDGET.CONTEXT.fillOpacityMax}`,
      );
    }
  });

  it("is a monotone single-hue ordinal ramp over the mapped-hazard classes", () => {
    const ramp = ["floodway", "coastal", "sfhaBfe", "sfhaSheet", "sfhaNoBfe", "shadedX"];
    let prevL = -Infinity;
    const hues = [];
    for (const key of ramp) {
      const { L, H } = oklch(CONTEXT_FEMA_ZONES[key].fill);
      assert.ok(L > prevL, `${key} breaks the light->dark ordering`);
      prevL = L;
      hues.push(H);
    }
    // Adjacent lightness steps must be far enough apart to read as steps.
    for (let i = 1; i < ramp.length; i += 1) {
      const d = oklch(CONTEXT_FEMA_ZONES[ramp[i]].fill).L - oklch(CONTEXT_FEMA_ZONES[ramp[i - 1]].fill).L;
      assert.ok(d >= 0.06, `${ramp[i - 1]} -> ${ramp[i]} only ${d.toFixed(3)} apart in L`);
    }
    const spread = Math.max(...hues) - Math.min(...hues);
    assert.ok(spread <= 20, `ordinal ramp must be ONE hue; spread is ${spread.toFixed(0)} degrees`);
    // Severity is also carried on the stroke width, so it survives the fill
    // being nearly transparent over satellite imagery.
    let prevW = Infinity;
    for (const key of ramp) {
      const w = CONTEXT_FEMA_ZONES[key].lineWidth;
      assert.ok(w <= prevW, `${key} line width breaks the severity ordering`);
      prevW = w;
    }
  });

  it("keeps undetermined OFF the ramp and achromatic", () => {
    const { C } = oklch(CONTEXT_FEMA_ZONES.undetermined.fill);
    assert.ok(C < 0.05, `undetermined must read as grey, chroma ${C.toFixed(3)}`);
  });

  it("does not collide with the land-use palette", () => {
    // Both layers can be visible at once (flood is CONTEXT, land use is DATA).
    for (const zoneKey of FEMA_ZONE_KEYS) {
      if (CONTEXT_FEMA_ZONES[zoneKey].fillOpacity === 0) continue;
      for (const [landKey, land] of Object.entries(DATA_LAND_USE_COLORS)) {
        const d = deltaE(CONTEXT_FEMA_ZONES[zoneKey].fill, land.fill);
        assert.ok(d >= 9, `FEMA ${zoneKey} vs land-use ${landKey}: ΔE ${d.toFixed(1)}`);
      }
    }
  });

  it("gives every zone a stroke that reads over the dark canvas", () => {
    for (const key of FEMA_ZONE_KEYS) {
      const ratio = wcagContrast(CONTEXT_FEMA_ZONES[key].line, "#16110c");
      assert.ok(ratio >= 3, `${key} stroke contrast ${ratio.toFixed(2)}:1 < 3:1`);
    }
  });

  it("legend covers every zone, in severity order, with its zone codes", () => {
    assert.deepEqual(FEMA_LEGEND.map((r) => r.key), [...FEMA_ZONE_KEYS]);
    assert.equal(FEMA_LEGEND.length, 9, "nine rows against the two this replaced");
    for (const row of FEMA_LEGEND) {
      assert.ok(row.label, "every row is named");
      assert.ok(row.zones, "every row names the FEMA zone codes it covers");
    }
  });

  it("drives no dasharray or gradient from data (blank-map crash guard)", () => {
    const serialized = JSON.stringify([
      femaZoneFillColorExpr(),
      femaZoneFillOpacityExpr(),
      femaZoneLineColorExpr(),
      femaZoneLineWidthExpr(),
    ]);
    assert.ok(!serialized.includes("line-dasharray"));
    assert.ok(!serialized.includes("line-gradient"));
    assert.ok(!serialized.includes("feature-state"));
  });
});
