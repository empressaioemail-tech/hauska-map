/**
 * FEMA NFHL flood-zone classification (CONTEXT role).
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The operator, on the live surface: "The current flood map is a little hard to
 * read could you color code it... so that we can quickly identify the sections
 * that are in and out of the zones."
 *
 * Measured at source 2026-08-18, one Bastrop viewport through the live
 * `map-data/gis-layer` endpoint (provider "FEMA NFHL", 204 features, all
 * counted):
 *
 *     X   | 0.2 PCT ANNUAL CHANCE FLOOD HAZARD | SFHA=F   86
 *     AE  | (null)                             | SFHA=T   61
 *     X   | AREA OF MINIMAL FLOOD HAZARD       | SFHA=F   36
 *     A   | (null)                             | SFHA=T   11
 *     AE  | FLOODWAY                           | SFHA=T    7
 *     AO  | (null)                             | SFHA=T    3
 *
 * Six real classes. The paint this replaces produced THREE colours, and
 * effectively two: it matched only `X` and `X500` to the light step and sent
 * everything else to the mid step. So the 86 shaded-X polygons (0.2% annual
 * chance — a mapped hazard) and the 36 minimal-hazard polygons (definitively
 * OUTSIDE the floodplain) were painted the same colour at the same opacity.
 * That is precisely why in-versus-out was unreadable.
 *
 * THE IN/OUT SIGNAL IS FILL-VERSUS-NO-FILL, NOT HUE
 * -------------------------------------------------
 * Every mapped hazard class carries a fill from one ordinal blue ramp.
 * Unshaded Zone X — minimal hazard, outside the floodplain — carries NO FILL at
 * all, only a hairline outline. Empty means out. This buys the in/out contrast
 * without touching ROLE_BUDGET.CONTEXT.fillOpacityMax (0.2), which exists
 * because of a real wash-out incident and is not this lane's to spend.
 *
 * `SFHA_TF` (published "T"/"F" on every feature) is the authoritative in/out
 * flag and is used as the catch-all: an SFHA zone code we did not enumerate
 * still renders as IN rather than as unknown. Conversely the match DEFAULT is
 * now a neutral "zone not stated" grey — the previous default painted any
 * unrecognised zone as 100-year floodplain, which over-claimed hazard.
 *
 * ONE RULE, TWO IMPLEMENTATIONS: `classifyFemaZone()` is the plain-JS
 * classifier and `femaZoneClassExpr()` is the MapLibre expression. A divergence
 * test in `fema-zones.test.js` holds them together.
 */

/** Ordinal severity ramp keys plus the two off-ramp states, in paint order. */
export const FEMA_ZONE_KEYS = Object.freeze([
  "floodway",
  "coastal",
  "sfhaBfe",
  "sfhaSheet",
  "sfhaNoBfe",
  "shadedX",
  "openWater",
  "undetermined",
  "minimal",
]);

/**
 * Paint table.
 *
 * `floodway → coastal → sfhaBfe → sfhaSheet → sfhaNoBfe → shadedX` is a single
 * ORDINAL ramp: one hue (OKLCH hue spread 11 degrees), monotone lightness,
 * every adjacent step >= 0.06 ΔL. It validates as an ordinal ramp against both
 * the dark map canvas (#16110c) and a mid-tone satellite surface (#787878);
 * the Esri imagery over Bastrop measures mean luminance 120.5, which is why the
 * mid-tone surface is the one that matters.
 *
 * `openWater` and `undetermined` are deliberately OFF the ramp — the first is a
 * different subject, the second is the absence of a determination and is the
 * only achromatic swatch in the layer.
 *
 * `minimal` has fillOpacity 0. Its `fill` is recorded only so the legend swatch
 * can render as an empty outlined box.
 */
export const CONTEXT_FEMA_ZONES = Object.freeze({
  floodway: { fill: "#21458f", line: "#7ba3e0", fillOpacity: 0.2, lineWidth: 2.6 },
  coastal: { fill: "#2a5cad", line: "#86adde", fillOpacity: 0.2, lineWidth: 2.2 },
  sfhaBfe: { fill: "#3576cc", line: "#93bce8", fillOpacity: 0.18, lineWidth: 2 },
  sfhaSheet: { fill: "#5f96dd", line: "#a8caee", fillOpacity: 0.16, lineWidth: 1.8 },
  sfhaNoBfe: { fill: "#92b8ea", line: "#c0d8f4", fillOpacity: 0.14, lineWidth: 1.6 },
  shadedX: { fill: "#c5dbf6", line: "#7f9bba", fillOpacity: 0.1, lineWidth: 1.2 },
  openWater: { fill: "#3f8696", line: "#74afbe", fillOpacity: 0.18, lineWidth: 1.2 },
  undetermined: { fill: "#acaba7", line: "#d2d1cd", fillOpacity: 0.1, lineWidth: 1.2 },
  minimal: { fill: "transparent", line: "#9fa5ac", fillOpacity: 0, lineWidth: 0.8 },
});

/**
 * Legend rows in severity order. `inSfha` is the operator's in/out column: true
 * = inside the Special Flood Hazard Area (the 1% annual chance floodplain,
 * where the federal mandatory-purchase rule bites), false = outside it, null =
 * FEMA has published no determination.
 */
export const FEMA_LEGEND = Object.freeze([
  { key: "floodway", label: "Regulatory floodway", zones: "AE + FLOODWAY", inSfha: true },
  { key: "coastal", label: "Coastal high hazard (wave action)", zones: "V, VE", inSfha: true },
  { key: "sfhaBfe", label: "1% annual chance, base flood elevation set", zones: "AE, AH", inSfha: true },
  { key: "sfhaSheet", label: "1% annual chance, sheet flow", zones: "AO", inSfha: true },
  { key: "sfhaNoBfe", label: "1% annual chance, no elevation set", zones: "A, A99, AR", inSfha: true },
  { key: "shadedX", label: "0.2% annual chance (500-year)", zones: "X shaded", inSfha: false },
  { key: "openWater", label: "Open water", zones: "OPEN WATER", inSfha: null },
  { key: "undetermined", label: "Hazard undetermined / not analysed", zones: "D, area not included", inSfha: null },
  { key: "minimal", label: "Minimal hazard — outside the mapped floodplain", zones: "X unshaded", inSfha: false },
].map((row) => Object.freeze({ ...row, ...CONTEXT_FEMA_ZONES[row.key] })));

/** Zone codes that FEMA maps as Special Flood Hazard Area with no BFE. */
const NO_BFE_ZONES = new Set(["A", "A99", "AR"]);
/** Zone codes mapped as SFHA with a base flood elevation. */
const BFE_ZONES = new Set(["AE", "AH"]);
/** Coastal high-hazard zones. */
const COASTAL_ZONES = new Set(["V", "VE"]);

function norm(v) {
  return String(v ?? "").trim().toUpperCase();
}

/**
 * Plain-JS classifier over the three published NFHL attributes.
 *
 * @param {{ FLD_ZONE?: unknown, ZONE_SUBTY?: unknown, SFHA_TF?: unknown }} props
 * @returns {typeof FEMA_ZONE_KEYS[number]}
 */
export function classifyFemaZone(props) {
  const p = props || {};
  const zone = norm(p.FLD_ZONE ?? p.FLOOD_ZONE);
  const subty = norm(p.ZONE_SUBTY);
  const sfha = norm(p.SFHA_TF);

  // Floodway first: in NFHL the regulatory floodway is carried on ZONE_SUBTY
  // while FLD_ZONE still reads AE. Verified: all 7 floodway features in the
  // Bastrop probe are FLD_ZONE "AE" + ZONE_SUBTY "FLOODWAY".
  if (zone === "FLOODWAY" || subty.includes("FLOODWAY")) return "floodway";

  if (zone.includes("OPEN WATER") || subty.includes("OPEN WATER")) return "openWater";

  if (COASTAL_ZONES.has(zone)) return "coastal";
  if (BFE_ZONES.has(zone)) return "sfhaBfe";
  if (zone === "AO") return "sfhaSheet";
  if (NO_BFE_ZONES.has(zone)) return "sfhaNoBfe";

  // Honest catch-all: FEMA itself says this polygon is in the SFHA, so render it
  // as IN even though we did not enumerate its code. Never silently "unknown".
  if (sfha === "T") return "sfhaNoBfe";

  if (subty.includes("0.2 PCT")) return "shadedX";
  if (subty.includes("MINIMAL")) return "minimal";

  if (zone === "D" || zone.includes("NOT INCLUDED") || subty.includes("NOT INCLUDED")) {
    return "undetermined";
  }

  // A positive "not in the SFHA" with no subtype we recognise is still OUT.
  if (sfha === "F") return "minimal";

  // Nothing usable was published. Previously this defaulted to the 100-year
  // fill, which over-claimed hazard.
  return "undetermined";
}

const ZONE_EXPR = ["upcase", ["to-string", ["coalesce", ["get", "FLD_ZONE"], ["get", "FLOOD_ZONE"], ""]]];
const SUBTY_EXPR = ["upcase", ["to-string", ["coalesce", ["get", "ZONE_SUBTY"], ""]]];
const SFHA_EXPR = ["upcase", ["to-string", ["coalesce", ["get", "SFHA_TF"], ""]]];

const inSet = (expr, values) => ["match", expr, values, true, false];
const contains = (expr, needle) => ["!=", ["index-of", needle, expr], -1];

/**
 * MapLibre expression yielding the zone key for a FEMA feature.
 * Mirrors `classifyFemaZone` exactly (see the divergence test).
 * @returns {unknown[]}
 */
export function femaZoneClassExpr() {
  return [
    "case",
    ["any", ["==", ZONE_EXPR, "FLOODWAY"], contains(SUBTY_EXPR, "FLOODWAY")],
    "floodway",
    ["any", contains(ZONE_EXPR, "OPEN WATER"), contains(SUBTY_EXPR, "OPEN WATER")],
    "openWater",
    inSet(ZONE_EXPR, ["V", "VE"]),
    "coastal",
    inSet(ZONE_EXPR, ["AE", "AH"]),
    "sfhaBfe",
    ["==", ZONE_EXPR, "AO"],
    "sfhaSheet",
    inSet(ZONE_EXPR, ["A", "A99", "AR"]),
    "sfhaNoBfe",
    ["==", SFHA_EXPR, "T"],
    "sfhaNoBfe",
    contains(SUBTY_EXPR, "0.2 PCT"),
    "shadedX",
    contains(SUBTY_EXPR, "MINIMAL"),
    "minimal",
    [
      "any",
      ["==", ZONE_EXPR, "D"],
      contains(ZONE_EXPR, "NOT INCLUDED"),
      contains(SUBTY_EXPR, "NOT INCLUDED"),
    ],
    "undetermined",
    ["==", SFHA_EXPR, "F"],
    "minimal",
    "undetermined",
  ];
}

function zoneMatchExpr(channel) {
  const out = ["match", femaZoneClassExpr()];
  for (const key of FEMA_ZONE_KEYS) {
    if (key === "undetermined") continue; // the match default
    out.push(key, CONTEXT_FEMA_ZONES[key][channel]);
  }
  out.push(CONTEXT_FEMA_ZONES.undetermined[channel]);
  return out;
}

/** Data-driven fill colour across the full NFHL zone set. */
export function femaZoneFillColorExpr() {
  return zoneMatchExpr("fill");
}

/**
 * Data-driven fill opacity. `minimal` resolves to 0, so land outside the mapped
 * floodplain carries no fill and reads as OUT at a glance. Every value stays at
 * or below ROLE_BUDGET.CONTEXT.fillOpacityMax.
 */
export function femaZoneFillOpacityExpr() {
  return zoneMatchExpr("fillOpacity");
}

/** Data-driven line colour — the identity channel that survives over imagery. */
export function femaZoneLineColorExpr() {
  return zoneMatchExpr("line");
}

/**
 * Data-driven line width, severity-weighted. Safe: `line-width` is an ordinary
 * data-driven paint property. `line-dasharray` and `line-gradient` are NOT
 * driven here — a data-driven dasharray is the documented per-frame
 * setConstantDashPositions crash that blanks the map.
 */
export function femaZoneLineWidthExpr() {
  return zoneMatchExpr("lineWidth");
}

/**
 * Is this feature inside the Special Flood Hazard Area? Returns true, false, or
 * null when FEMA published no determination. This is the in/out answer the
 * legend and the inspect surfaces render; it is derived from the class, so it
 * cannot drift away from the paint.
 * @param {{ FLD_ZONE?: unknown, ZONE_SUBTY?: unknown, SFHA_TF?: unknown }} props
 * @returns {boolean|null}
 */
export function isInSfha(props) {
  const key = classifyFemaZone(props);
  const row = FEMA_LEGEND.find((r) => r.key === key);
  return row ? row.inSfha : null;
}
