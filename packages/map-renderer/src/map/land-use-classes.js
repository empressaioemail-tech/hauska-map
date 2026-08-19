/**
 * Land-use classification (DATA role) — Texas PTAD state category codes.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The browse-parcel PMTiles corpus carries `landUseCode` straight off the county
 * CAD roll, and those codes are Texas Property Tax Assistance Division STATE
 * CATEGORY codes: A / A1 / A2 …, B / B1 …, C / C1 …, D1 / D2 …, E / E1 …,
 * F1 / F2 / F10 / F20 …, G, J, L, M, O, S, and the exempt family (X, XV, XA, XG,
 * EX, EX1 …). Verified at source 2026-08-18 by decoding the live archive
 * `parcels.b692c6534d26.pmtiles`: tilestats reports 141 distinct `landUseCode`
 * values and 14 distinct `landUseDescription` values, and an MVT decode of
 * z16/15051/27015 (downtown Bastrop, 203 features) returned
 * F1 81 · A1 56 · XV 40 · C1 8 · B2 6 · E1 4 · A2 1 · A3 1 · E2 1 · absent 5.
 *
 * The paint this replaces matched a hardcoded ladder of `P-5`, `P-4`, `P-2`,
 * `SFR`, `R-1`, `MF`, `COM`, `AG` — none of which occur in the corpus — and then
 * fell through to a keyword scan of the description. That left C (vacant) on
 * `#c98f5e` and F1 (commercial) on `#ff8c1a`, two oranges 9.7 OKLab ΔE apart,
 * which is the operator's "C-D-E-F are all orange" verbatim; it also collapsed
 * rural E1 onto single-family A1 (both descriptions contain "single"), and it
 * painted a POSITIVE classification (XV exempt) identically to an ABSENCE.
 *
 * ONE RULE, TWO IMPLEMENTATIONS — AND A DIVERGENCE TEST
 * -----------------------------------------------------
 * `classifyLandUseCode()` is the plain-JS classifier (legend, tooltips, tests).
 * `landUseClassExpr()` is the MapLibre expression the GPU runs. Two
 * implementations of one rule is the CTRL-1 shape, so the control is a
 * divergence test: `land-use-classes.test.js` evaluates the expression over
 * every code family in the corpus and asserts it agrees with the function.
 * Change one without the other and the suite goes red.
 *
 * ABSENCE IS NOT A CLASS
 * ----------------------
 * 61.3% of 15,286 features sampled across eight z14 tiles (Bastrop, Austin,
 * Houston, Dallas, Midland, Caldwell, Hays, San Antonio) carry NO `landUseCode`
 * at all — whole counties publish none (Houston 48201: 4,061 of 4,061 absent).
 * `unclassified` is therefore its own state with its own neutral and its own
 * legend row naming what would fill it, never folded into "other".
 */

/** The nine paint buckets. Seven are categorical; two are states. */
export const LAND_USE_CLASS_KEYS = Object.freeze([
  "singleFamily",
  "multiFamily",
  "vacant",
  "agricultural",
  "rural",
  "commercial",
  "industrial",
  "otherClassified",
  "unclassified",
]);

/**
 * DATA-role categorical palette.
 *
 * Selected by a max-min search in OKLab, not by eye. Constraints held:
 *   - hue bands 52-104 deg (SUBJECT amber) and 224-276 deg (INTERACTION cyan +
 *     the FEMA blue family) are excluded outright, so a land-use fill can never
 *     impersonate the subject parcel or the flood layer;
 *   - every slot sits >= 14 OKLab ΔE (normal vision) and >= 7 ΔE (protan/deutan,
 *     Machado 2009 severity 1.0) from all eight reserved hues;
 *   - worst ALL-PAIRS separation across the seven categorical slots is
 *     ΔE 8.6 CVD (target >= 8) and ΔE 15.6 normal vision (hard floor >= 15).
 *     All-pairs, not adjacent, because a choropleth puts any two classes side
 *     by side.
 *
 * SEVEN, not eight, is a measured ceiling rather than a preference: over this
 * gamut the best achievable worst all-pairs pair is N=7 -> 8.9/16.9,
 * N=8 -> 8.3/14.5, N=9 -> 7.5/14.0. Eight cannot clear the normal-vision floor,
 * so the exempt family folds into `otherClassified` — it is the one common class
 * that is not transactable, which makes it the cheapest fold on a
 * property-research surface.
 *
 * `otherClassified` and `unclassified` are deliberately BELOW the categorical
 * chroma floor. They read as grey on purpose: neither is an identity, one is
 * "some other determination" and the other is "no determination". They are held
 * 17.2 OKLab dE apart so the two never blur into one another, and `unclassified`
 * is a NEUTRAL grey rather than a slate blue - a first pass used #606a75, which
 * the reserved-hue gate in this module's test caught at 13.6 dE from the FEMA
 * 100-year fill.
 */
export const DATA_LAND_USE_COLORS = Object.freeze({
  singleFamily: { fill: "#e492c9", stroke: "#ffc4f3" },
  multiFamily: { fill: "#c952cf", stroke: "#f78afb" },
  vacant: { fill: "#28b093", stroke: "#7cddc2" },
  agricultural: { fill: "#1b6a00", stroke: "#559647" },
  rural: { fill: "#958802", stroke: "#c1b760" },
  commercial: { fill: "#b93c4e", stroke: "#e4747d" },
  industrial: { fill: "#7c41ae", stroke: "#a674d7" },
  otherClassified: { fill: "#938875", stroke: "#c1b6a4" },
  unclassified: { fill: "#5a5852", stroke: "#88867f" },
});

/**
 * Legend rows, in paint order. `basis` is what the row asserts and where it
 * comes from; `wouldBeFilledBy` is only present on the honest-absence row
 * (parcel fact sheet invariant I4: an absence that cannot say what would fill
 * it is not honest, it is just empty).
 */
export const LAND_USE_LEGEND = Object.freeze([
  {
    key: "singleFamily",
    code: "A",
    label: "Single-family residential",
    fill: DATA_LAND_USE_COLORS.singleFamily.fill,
    stroke: DATA_LAND_USE_COLORS.singleFamily.stroke,
  },
  {
    key: "multiFamily",
    code: "B",
    label: "Multifamily residential",
    fill: DATA_LAND_USE_COLORS.multiFamily.fill,
    stroke: DATA_LAND_USE_COLORS.multiFamily.stroke,
  },
  {
    key: "vacant",
    code: "C",
    label: "Vacant lot or tract",
    fill: DATA_LAND_USE_COLORS.vacant.fill,
    stroke: DATA_LAND_USE_COLORS.vacant.stroke,
  },
  {
    key: "agricultural",
    code: "D",
    label: "Agricultural / open space",
    fill: DATA_LAND_USE_COLORS.agricultural.fill,
    stroke: DATA_LAND_USE_COLORS.agricultural.stroke,
  },
  {
    key: "rural",
    code: "E",
    label: "Rural land and improvements",
    fill: DATA_LAND_USE_COLORS.rural.fill,
    stroke: DATA_LAND_USE_COLORS.rural.stroke,
  },
  {
    key: "commercial",
    code: "F1",
    label: "Commercial",
    fill: DATA_LAND_USE_COLORS.commercial.fill,
    stroke: DATA_LAND_USE_COLORS.commercial.stroke,
  },
  {
    key: "industrial",
    code: "F2",
    label: "Industrial",
    fill: DATA_LAND_USE_COLORS.industrial.fill,
    stroke: DATA_LAND_USE_COLORS.industrial.stroke,
  },
  {
    key: "otherClassified",
    code: "X / G / J / L / M / O / S",
    label: "Exempt, utility and other classified",
    fill: DATA_LAND_USE_COLORS.otherClassified.fill,
    stroke: DATA_LAND_USE_COLORS.otherClassified.stroke,
  },
  {
    key: "unclassified",
    code: "—",
    label: "Not classified here",
    fill: DATA_LAND_USE_COLORS.unclassified.fill,
    stroke: DATA_LAND_USE_COLORS.unclassified.stroke,
    wouldBeFilledBy: "county CAD land-use roll",
  },
]);

/** Human label for a class key (used by the legend and by inspect surfaces). */
export function landUseClassLabel(classKey) {
  const row = LAND_USE_LEGEND.find((r) => r.key === classKey);
  return row ? row.label : LAND_USE_LEGEND[LAND_USE_LEGEND.length - 1].label;
}

/**
 * Plain-JS classifier. THE rule; the MapLibre expression below mirrors it and a
 * divergence test holds them together.
 *
 * Order matters. `EX*` is tested before the leading-letter fallback because the
 * exempt family and the rural E family share a first letter: Caldwell County
 * publishes E, E1, E2, E3 (rural) AND EX, EX4, EX5 (exempt) in the same tile, so
 * a naive leading-letter rule would file exempt land as rural.
 *
 * @param {unknown} rawCode  the parcel's `landUseCode` (or `zoningCode`)
 * @returns {typeof LAND_USE_CLASS_KEYS[number]}
 */
export function classifyLandUseCode(rawCode) {
  const code = String(rawCode ?? "").trim().toUpperCase();
  if (!code) return "unclassified";
  if (code.slice(0, 2) === "EX") return "otherClassified";
  switch (code.slice(0, 1)) {
    case "A":
      return "singleFamily";
    case "B":
      return "multiFamily";
    case "C":
      return "vacant";
    case "D":
      return "agricultural";
    case "E":
      return "rural";
    case "F":
      // F1/F3/F4/F5/F10 are commercial real property; F2/F20 are industrial.
      // Verified against the corpus: description "Industrial real property"
      // occurs exactly 24 times across the eight-tile scan and F2 (11) + F20
      // (13) also total exactly 24.
      return code.slice(0, 2) === "F2" ? "industrial" : "commercial";
    default:
      // G minerals, J utility, L personal property, M mobile home, O inventory,
      // S special inventory, X/XV/XA/XG exempt, and any county-local code we do
      // not recognise. All are POSITIVE determinations, so they land in
      // "other classified" and never in the absence bucket.
      return "otherClassified";
  }
}

/** The raw-code expression both class expressions read from. */
function rawCodeExpr() {
  return [
    "upcase",
    ["to-string", ["coalesce", ["get", "landUseCode"], ["get", "zoningCode"], ""]],
  ];
}

/**
 * MapLibre expression yielding the class key for a parcel feature.
 * Mirrors `classifyLandUseCode` exactly (see the divergence test).
 *
 * STATIC PAINT DISCIPLINE: this is a data expression over feature PROPERTIES
 * only. It drives `fill-color` and `line-color`, never `line-dasharray` or
 * `line-gradient` (the documented setConstantDashPositions blank-map crash).
 *
 * @returns {unknown[]}
 */
export function landUseClassExpr() {
  const code = rawCodeExpr();
  return [
    "case",
    ["==", code, ""],
    "unclassified",
    ["==", ["slice", code, 0, 2], "EX"],
    "otherClassified",
    ["==", ["slice", code, 0, 1], "A"],
    "singleFamily",
    ["==", ["slice", code, 0, 1], "B"],
    "multiFamily",
    ["==", ["slice", code, 0, 1], "C"],
    "vacant",
    ["==", ["slice", code, 0, 1], "D"],
    "agricultural",
    ["==", ["slice", code, 0, 1], "E"],
    "rural",
    ["==", ["slice", code, 0, 2], "F2"],
    "industrial",
    ["==", ["slice", code, 0, 1], "F"],
    "commercial",
    "otherClassified",
  ];
}

/** Build a `match` over the class expression using one channel of the palette. */
function classMatchExpr(channel) {
  const out = ["match", landUseClassExpr()];
  for (const key of LAND_USE_CLASS_KEYS) {
    if (key === "unclassified") continue; // the match default
    out.push(key, DATA_LAND_USE_COLORS[key][channel]);
  }
  out.push(DATA_LAND_USE_COLORS.unclassified[channel]);
  return out;
}

/** Data-driven fill colour for the land-use choropleth. */
export function landUseFillColorExpr() {
  return classMatchExpr("fill");
}

/**
 * Data-driven line colour. The stroke is the SECOND identity channel: it paints
 * at full opacity while the fill sits inside the DATA role's 0.22 opacity
 * budget, so class identity survives over satellite imagery where a 22% tint
 * alone would not.
 */
export function landUseLineColorExpr() {
  return classMatchExpr("stroke");
}
