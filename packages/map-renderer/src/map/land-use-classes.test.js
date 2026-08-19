/**
 * W3 — land-use classification, palette gates, and the DIVERGENCE TEST.
 *
 * DEV_PROCESS 2.4: one rule with two implementations is the CTRL-1 shape, and
 * the divergence test is the control. `classifyLandUseCode` (JS) and
 * `landUseClassExpr` (MapLibre) both encode the PTAD state-category rule, so
 * this file evaluates the expression over the real corpus and asserts they
 * agree. Change one without the other and this goes red.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DATA_LAND_USE_COLORS,
  LAND_USE_CLASS_KEYS,
  LAND_USE_LEGEND,
  classifyLandUseCode,
  landUseClassExpr,
  landUseClassLabel,
  landUseFillColorExpr,
  landUseLineColorExpr,
} from "./land-use-classes.js";
import { evalExpr } from "./expr-eval.js";
import { deltaE, deltaEcvd, oklch, wcagContrast } from "./color-metrics.js";

/**
 * Every `landUseCode` value observed in the live browse corpus on 2026-08-18.
 * Sources: PMTiles tilestats for `parcels.b692c6534d26.pmtiles` (141 distinct
 * values, first 100 published) plus an MVT decode of eight z14 tiles spanning
 * Bastrop, Austin, Houston, Dallas, Midland, Caldwell, Hays and San Antonio
 * (15,286 features, 51 distinct codes).
 */
const CORPUS_CODES = [
  "A", "A00", "A01", "A021", "A023", "A024", "A1", "A10", "A11", "A12", "A13",
  "A2", "A20", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "AC",
  "B", "B1", "B11", "B12", "B2", "B3", "B4", "B6", "B9", "BB", "BC", "BD", "BE", "BF",
  "C", "C1", "C11", "C12", "C13", "C14", "C1A", "C2", "C3", "C4", "C5", "C6", "C7",
  "D1", "D10", "D2", "D3", "D4", "D5", "D6",
  "E", "E1", "E10", "E11", "E2", "E3", "E4", "E5", "E6", "E7", "E9", "EC",
  "EX", "EX1", "EX10", "EX2", "EX3", "EX4", "EX5", "EX6", "EX7", "EX9",
  "F010", "F1", "F10", "F1H", "F2", "F20", "F3", "F4", "F5", "F6", "F7", "F9",
  "G3", "G30",
  "J1", "J1A", "J2", "J2A", "J3", "J30", "J3A", "J4", "J4A", "J5", "J51",
  "L1", "L2", "M1", "M2", "N", "O", "S", "X", "XA", "XG", "XV",
];

/** Reserved hues the DATA palette must never impersonate (taxonomy rule). */
const RESERVED = {
  "SUBJECT amber": "#f2a23c",
  "SUBJECT amber bright": "#ffe14d",
  "SUBJECT amber soft": "#fff2b0",
  "INTERACTION cyan": "#7dd3fc",
  "FEMA floodway fill": "#21458f",
  "FEMA AE fill": "#3576cc",
  "FEMA shaded-X fill": "#c5dbf6",
};

describe("land-use classification (W3)", () => {
  it("agrees with the MapLibre expression on every corpus code (divergence test)", () => {
    const expr = landUseClassExpr();
    const mismatches = [];
    for (const code of CORPUS_CODES) {
      const fromJs = classifyLandUseCode(code);
      const fromExpr = evalExpr(expr, { landUseCode: code });
      if (fromJs !== fromExpr) mismatches.push({ code, fromJs, fromExpr });
    }
    assert.deepEqual(mismatches, [], "JS classifier and paint expression diverged");
    assert.equal(new Set(CORPUS_CODES).size, CORPUS_CODES.length, "duplicate code in the corpus list");
  });

  it("treats a missing code as an ABSENCE, never as a class", () => {
    const expr = landUseClassExpr();
    for (const absent of [undefined, null, ""]) {
      assert.equal(classifyLandUseCode(absent), "unclassified");
      assert.equal(evalExpr(expr, { landUseCode: absent }), "unclassified");
    }
    // …and a POSITIVE "exempt" determination must NOT look like that absence.
    assert.equal(classifyLandUseCode("XV"), "otherClassified");
    assert.notEqual(
      DATA_LAND_USE_COLORS.otherClassified.fill,
      DATA_LAND_USE_COLORS.unclassified.fill,
    );
  });

  it("files the exempt EX* family under exempt, not under rural E", () => {
    // Caldwell County publishes E, E1, E2, E3 (rural) AND EX, EX4, EX5 (exempt)
    // in the same tile, so a naive leading-letter rule mis-files exempt land.
    for (const rural of ["E", "E1", "E2", "E3", "E11"]) {
      assert.equal(classifyLandUseCode(rural), "rural", rural);
    }
    for (const exempt of ["EX", "EX1", "EX4", "EX5", "EX10"]) {
      assert.equal(classifyLandUseCode(exempt), "otherClassified", exempt);
    }
  });

  it("splits F2 industrial out of F commercial", () => {
    for (const c of ["F1", "F10", "F3", "F4", "F5", "F1H", "F010"]) {
      assert.equal(classifyLandUseCode(c), "commercial", c);
    }
    for (const c of ["F2", "F20"]) {
      assert.equal(classifyLandUseCode(c), "industrial", c);
    }
  });

  it("keeps the four classes the operator named visually separate", () => {
    // "In Zoning C-D-E-F are all orange there is no variance in the colors"
    const named = ["vacant", "agricultural", "rural", "commercial", "industrial"];
    for (let i = 0; i < named.length; i += 1) {
      for (let j = i + 1; j < named.length; j += 1) {
        const a = DATA_LAND_USE_COLORS[named[i]].fill;
        const b = DATA_LAND_USE_COLORS[named[j]].fill;
        const d = deltaE(a, b);
        assert.ok(
          d >= 15,
          `${named[i]} ${a} vs ${named[j]} ${b}: normal-vision ΔE ${d.toFixed(1)} < 15`,
        );
      }
    }
  });

  it("clears the all-pairs CVD and normal-vision floors across the 7 categorical slots", () => {
    // A choropleth puts any two classes side by side, so the ALL-PAIRS list is
    // the one that binds — not the adjacent list a bar chart would use.
    const categorical = LAND_USE_CLASS_KEYS.filter(
      (k) => k !== "otherClassified" && k !== "unclassified",
    );
    assert.equal(categorical.length, 7);
    let worstCvd = Infinity;
    let worstNormal = Infinity;
    let worstCvdPair = null;
    let worstNormalPair = null;
    for (let i = 0; i < categorical.length; i += 1) {
      for (let j = i + 1; j < categorical.length; j += 1) {
        const a = DATA_LAND_USE_COLORS[categorical[i]].fill;
        const b = DATA_LAND_USE_COLORS[categorical[j]].fill;
        const c = deltaEcvd(a, b);
        const n = deltaE(a, b);
        if (c < worstCvd) {
          worstCvd = c;
          worstCvdPair = [categorical[i], categorical[j]];
        }
        if (n < worstNormal) {
          worstNormal = n;
          worstNormalPair = [categorical[i], categorical[j]];
        }
      }
    }
    assert.ok(
      worstCvd >= 8,
      `worst all-pairs CVD ΔE ${worstCvd.toFixed(1)} < 8 target (${worstCvdPair})`,
    );
    assert.ok(
      worstNormal >= 15,
      `worst all-pairs normal ΔE ${worstNormal.toFixed(1)} < 15 floor (${worstNormalPair})`,
    );
  });

  it("stays clear of every reserved role hue", () => {
    for (const key of LAND_USE_CLASS_KEYS) {
      const fill = DATA_LAND_USE_COLORS[key].fill;
      for (const [name, hex] of Object.entries(RESERVED)) {
        const d = deltaE(fill, hex);
        assert.ok(d >= 14, `${key} ${fill} sits ΔE ${d.toFixed(1)} from ${name} ${hex}`);
      }
    }
  });

  it("holds the categorical chroma floor and keeps the two neutrals below it", () => {
    for (const key of LAND_USE_CLASS_KEYS) {
      const { C } = oklch(DATA_LAND_USE_COLORS[key].fill);
      if (key === "otherClassified" || key === "unclassified") {
        assert.ok(C < 0.1, `${key} must read as grey, chroma ${C.toFixed(3)}`);
      } else {
        assert.ok(C >= 0.1, `${key} chroma ${C.toFixed(3)} below the 0.10 identity floor`);
      }
    }
  });

  it("gives every class a stroke that reads over the dark canvas", () => {
    for (const key of LAND_USE_CLASS_KEYS) {
      const ratio = wcagContrast(DATA_LAND_USE_COLORS[key].stroke, "#16110c");
      assert.ok(ratio >= 3, `${key} stroke contrast ${ratio.toFixed(2)}:1 < 3:1`);
    }
  });

  it("legend covers every paint bucket and names what fills the absence", () => {
    assert.equal(LAND_USE_LEGEND.length, LAND_USE_CLASS_KEYS.length);
    assert.deepEqual(
      LAND_USE_LEGEND.map((r) => r.key),
      [...LAND_USE_CLASS_KEYS],
    );
    const absent = LAND_USE_LEGEND.find((r) => r.key === "unclassified");
    assert.ok(absent.wouldBeFilledBy, "an absence that cannot say what fills it is not honest (I4)");
    for (const row of LAND_USE_LEGEND) {
      assert.equal(row.fill, DATA_LAND_USE_COLORS[row.key].fill);
      assert.equal(row.stroke, DATA_LAND_USE_COLORS[row.key].stroke);
    }
    assert.equal(landUseClassLabel("vacant"), "Vacant lot or tract");
  });

  it("paint expressions resolve to the palette for real corpus features", () => {
    const fill = landUseFillColorExpr();
    const line = landUseLineColorExpr();
    // The exact code mix of z16/15051/27015 (downtown Bastrop), 203 features.
    const bastropTile = { F1: 81, A1: 56, XV: 40, C1: 8, B2: 6, E1: 4, A2: 1, A3: 1, E2: 1 };
    for (const code of Object.keys(bastropTile)) {
      const key = classifyLandUseCode(code);
      assert.equal(evalExpr(fill, { landUseCode: code }), DATA_LAND_USE_COLORS[key].fill, code);
      assert.equal(evalExpr(line, { landUseCode: code }), DATA_LAND_USE_COLORS[key].stroke, code);
    }
    // The five uncoded features on that tile must land on the absence colour.
    assert.equal(evalExpr(fill, {}), DATA_LAND_USE_COLORS.unclassified.fill);
    // …and on that tile C1 and F1 are no longer two shades of the same orange.
    assert.ok(deltaE(DATA_LAND_USE_COLORS.vacant.fill, DATA_LAND_USE_COLORS.commercial.fill) >= 15);
    // …and rural E1 no longer paints as single-family A1.
    assert.notEqual(classifyLandUseCode("E1"), classifyLandUseCode("A1"));
  });

  it("drives no dasharray or gradient from data (blank-map crash guard)", () => {
    const serialized = JSON.stringify([landUseFillColorExpr(), landUseLineColorExpr()]);
    assert.ok(!serialized.includes("line-dasharray"));
    assert.ok(!serialized.includes("line-gradient"));
    assert.ok(!serialized.includes("feature-state"));
  });
});
