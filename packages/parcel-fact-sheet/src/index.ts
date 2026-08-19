// packages/parcel-fact-sheet/src/index.ts
//
// THE PARCEL FACT SHEET CONTRACT — frozen 2026-08-18 by the planner.
//
// One parcel. One resolve. One sealed sheet. Every surface RENDERS this sheet
// and no surface RE-DERIVES anything on it: not the inspect card, not the
// property brief, not compare, not share, not the site-plan sheets, not the
// X-ray PDF, not Command Center.
//
// This contract exists because a single X-ray PDF for parcel 48021:36521
// printed "Zone AO" on sheet 1, "Zone AO" on sheet 2 and "Flood zone AE" on
// sheet 4; said "buildable envelope not derived here" on sheet 1 while sheet 3
// DREW an envelope and sheet 4 measured it at 6,325 sq ft; and reported
// "County name is not on file for this parcel" for a parcel whose id begins
// with the county FIPS. Nothing was lying. Five code paths answered the same
// questions separately and nobody reconciled them.
//
// The types below are built so those specific defects are UNREPRESENTABLE.
// Read CONTRACT_RULES.md for the six invariants that make this binding.

/* ------------------------------------------------------------------ */
/* Units — every measurement carries its unit. No bare numbers.        */
/* ------------------------------------------------------------------ */

export type LengthUnit = "ft" | "m";
export type AreaUnit = "sqft" | "sqm" | "acre";
export type Unit = LengthUnit | AreaUnit;

/**
 * A measurement is stored ONCE in its native unit and converted at render.
 * Never store a pre-formatted string: the report printed elevation in metres
 * and the layer control said feet, and the DXF exported metres into a Revit
 * US template, because units lived in prose instead of in the type.
 */
export interface Measurement<U extends Unit = Unit> {
  value: number;
  unit: U;
}

export type DisplaySystem = "us" | "metric";

/* ------------------------------------------------------------------ */
/* Provenance — a SIBLING of the value, never concatenated into it.    */
/* ------------------------------------------------------------------ */

/**
 * Confidence basis per structural commitment 2 (confidence is earned, not
 * asserted). An asserted number carrying provenance and verification state is
 * permitted; a bare number presented as earned is not.
 */
export type ConfidenceBasis = "asserted" | "measured" | "calibrated";

export interface Provenance {
  /** Machine source key, e.g. "cad-roll", "city-zoning-map", "fema-nfhl". */
  source: string;
  /** Human label for disclosure UI, e.g. "Bastrop County appraisal roll". */
  sourceLabel: string;
  /** Source vintage as published, e.g. "data-export-01.14.2026". */
  vintage: string | null;
  /** Derivation method where one applies, e.g. "shoelace-wgs84". */
  method: string | null;
  retrievedAt: string | null;
  confidence: number | null;
  confidenceBasis: ConfidenceBasis;
  /** Deep link to the source record where one exists. */
  sourceUrl: string | null;
  /**
   * AMENDMENT 1 (2026-08-18, planner). The atom DIDs backing this fact.
   *
   * Added because lane SS-W1 found the frozen v1 could not express the shipped
   * AtomChip popover, which resolves a `did` through `fetchAtomByDid`. Swapping
   * the card onto a sheet without this would have silently deleted the feature.
   *
   * This is not a compatibility patch, it is a hole in the contract's own logic.
   * A provenance record that cannot name the atoms it came from is the wrong
   * shape for a product whose thesis is that the reasoning chain IS the good
   * being sold. Empty array means no atom backs this fact, which is itself a
   * fact worth rendering; it never means "unknown".
   */
  atomDids: AtomRef[];
}

/**
 * AMENDMENT 2 (2026-08-18, planner). A referenced atom carries its display
 * label, not just its id.
 *
 * Amendment 1 shipped `atomDids: string[]`, which lost the label the shipped
 * chip renderer already uses: `InspectCard.tsx` pushes
 * `{ did: cs.atomDid, label: cs.sectionNumber }`, so a code-section chip reads
 * as its section number. A bare id list degraded those chips to unlabelled.
 *
 * Same class of defect as Amendment 1: the type could not express what the
 * surface already renders.
 */
export interface AtomRef {
  did: string;
  /** Display label, e.g. a code section number. Null when the atom has none. */
  label: string | null;
}

/* ------------------------------------------------------------------ */
/* Fact — four states, and FAILURE is not one of the absences.         */
/* ------------------------------------------------------------------ */

/**
 * Why a fact is absent. The distinction is the whole point: a user reading
 * three grey "not verified here" rows currently cannot tell whether the system
 * is honest, blind, or broken, and reads all three as errors.
 *
 *  - absent-covered:   we cover this area and this parcel carries no value.
 *  - absent-uncovered: this area is not stamped. Names what would fill it.
 *  - unresolved:       the lookup FAILED. This is an error and must never be
 *                      rendered in the honest-absence treatment.
 */
export type Fact<T> =
  | { state: "present"; value: T; provenance: Provenance }
  | { state: "absent-covered"; reason: string; provenance: Provenance }
  | { state: "absent-uncovered"; reason: string; wouldBeFilledBy: string }
  | { state: "unresolved"; reason: string; retryable: boolean };

export function isPresent<T>(
  f: Fact<T>,
): f is { state: "present"; value: T; provenance: Provenance } {
  return f.state === "present";
}

/** True when this fact is an ERROR, not an honest absence. Style differently. */
export function isFailure<T>(f: Fact<T>): boolean {
  return f.state === "unresolved";
}

/* ------------------------------------------------------------------ */
/* Geometry — REQUIRED, and the sole authority for "where is this".    */
/* ------------------------------------------------------------------ */

export type Ring = Array<[number, number]>;

/**
 * Geometry is non-optional and its centroid is the ONLY navigation authority.
 *
 * Today the app geocodes the situs ADDRESS to decide where to fly. Parcels
 * with no address therefore never move the map, which is why a missing address
 * (a data gap) presents as a broken Find (a navigation bug). Centering off
 * geometry decouples them permanently.
 */
export interface ParcelGeometry {
  rings: Ring[];
  centroid: { lat: number; lng: number };
  bbox: [number, number, number, number];
  lotArea: Measurement<"sqft">;
  /** WGS84 unless a resolver states otherwise. */
  crs: "EPSG:4326";
}

/* ------------------------------------------------------------------ */
/* Identity — county can never be "unavailable".                       */
/* ------------------------------------------------------------------ */

export interface ParcelIdentity {
  parcelNodeId: string;
  /**
   * NOT a Fact. The FIPS is a substring of parcelNodeId, so a sheet that
   * cannot name its county is malformed, not honestly absent. This kills
   * "County name is not on file for this parcel" on a 48021:* parcel.
   */
  county: { fips: string; name: string };
  apn: Fact<string>;
  /**
   * Genuinely absent on a material share of single-family parcels across at
   * least Bastrop (48021:36521 = 1503 Farm St on the CAD roll) and Travis
   * (17005 Simsbrook Dr, Pflugerville). Absence here is a DATA gap and must
   * never degrade navigation or block an export.
   */
  situsAddress: Fact<string>;
  owner: Fact<string>;
}

/* ------------------------------------------------------------------ */
/* Zoning and setbacks.                                                */
/* ------------------------------------------------------------------ */

export interface ZoningDistrict {
  /** The district code as the jurisdiction publishes it, e.g. "GC", "SF-1". */
  code: string;
  /** The jurisdiction's own name for it. Never invented. */
  name: string | null;
  /** Stamping jurisdiction key, e.g. "bastrop_city_tx". */
  jurisdiction: string;
}

/**
 * One setback axis. AMENDMENT 1 (2026-08-18, planner): an axis carries its own
 * governance and note, not just a number.
 *
 * Added because lane SS-W1 found the frozen v1 could not express the shipped
 * setback X-ray disclosure (`SetbackXrayDetail`, driven by per-axis
 * `governedBy` / `fieldNotes`). A flat four-number Setbacks would have silently
 * deleted it on the swap.
 *
 * The deeper reason to keep it: two adjacent lots produced 1,896 and 4,321 sq ft
 * of buildable area, and the front setbacks differed (25 ft against 20 ft) with
 * no visible reason. Per-axis governance is what makes that answerable instead
 * of arguable.
 */
export interface SetbackAxis {
  /**
   * AMENDMENT 2 (2026-08-18, planner): NULLABLE.
   *
   * A jurisdiction can govern an axis without setting a number — the shipped
   * `api/_lib/setback-not-specified.ts` exists entirely for this, with an
   * `allPrimaryNotSpecified` branch, and the payload carries
   * `setbacks.not_specified`. Such an axis has NO scalar. It is not zero.
   *
   * Amendment 1 made this non-optional, which forced a non-finite `Measurement`
   * as the carrier. SS-W1 was right to refuse that convention: a future
   * implementer reads NaN as a bug and "fixes" it to 0, which silently prints a
   * 0 ft setback and produces exactly the build-to-line error the
   * not-specified treatment exists to prevent. An unrepresentable state should
   * be made representable, never encoded in a sentinel.
   */
  distance: Measurement<"ft"> | null;
  /** The rule that set this number, e.g. a zoning district's front-yard rule. */
  governedBy: string | null;
  /** Human note for the X-ray disclosure. Never invented. */
  note: string | null;
  provenance: Provenance;
}

export interface Setbacks {
  front: SetbackAxis;
  side: SetbackAxis;
  rear: SetbackAxis;
  cornerSide: SetbackAxis | null;
}

/* ------------------------------------------------------------------ */
/* Flood — a SET of zones, because a parcel can be in more than one.   */
/* ------------------------------------------------------------------ */

export interface FloodZoneShare {
  /** FEMA zone code: AE, AO, A, VE, X, X500 ... */
  zone: string;
  subtype: string | null;
  /** Special Flood Hazard Area (the 1% annual-chance floodplain). */
  isSfha: boolean;
  /** Fraction 0..1 of the parcel's area in this zone. Shares sum to 1. */
  areaShare: number;
}

/**
 * A home can sit in the 100-year AND the 500-year floodplain at once, and a
 * lot can be part AE and part AO. The old scalar `floodZone: string | null`
 * could not express that, so two code paths each picked a different single
 * winner and the same PDF printed AO and AE. The set is the record.
 */
export interface FloodDetermination {
  /** Ordered by areaShare descending. Length may exceed 1. */
  zones: FloodZoneShare[];
  /**
   * Convenience ONLY, the largest share. Any surface rendering this alone MUST
   * indicate multiplicity when zones.length > 1. A renderer that shows
   * primaryZone and hides a second zone is in breach of this contract.
   */
  primaryZone: string | null;
  /** True when ANY zone isSfha. Drives the insurance line. */
  inSfha: boolean;
  baseFloodElevation: Measurement<"ft"> | null;
}

/* ------------------------------------------------------------------ */
/* Buildable envelope — ONE field, three exclusive outcomes.           */
/* ------------------------------------------------------------------ */

/**
 * Exclusive variants. It is structurally impossible for a sheet to say
 * "not derived here" and also carry an area, which is what sheets 1, 3 and 4
 * of the X-ray PDF managed between them.
 *
 * `derived` names the setbacks and geometry it consumed, so two adjacent lots
 * producing 1,896 and 4,321 sq ft (705 vs 707 Laurel, 0.2345 vs 0.2519 ac)
 * can be diffed at the input level instead of argued about at the output.
 */
export type BuildableEnvelope =
  | {
      kind: "derived";
      area: Measurement<"sqft">;
      areaPctOfLot: number;
      rings: Ring[];
      setbacksUsed: Setbacks;
      /** Anything else subtracted: easements, floodway, existing structures. */
      subtractions: Array<{ label: string; area: Measurement<"sqft"> }>;
      approximate: boolean;
      provenance: Provenance;
    }
  | {
      kind: "consumed";
      reason: string;
      setbacksUsed: Setbacks;
      provenance: Provenance;
    }
  | {
      kind: "not-derived";
      reason: string;
      /** Named blockers, e.g. ["setbacks", "parcel-geometry"]. */
      missing: string[];
    };

/* ------------------------------------------------------------------ */
/* Site conditions.                                                    */
/* ------------------------------------------------------------------ */

export interface StreetFrontage {
  streetName: string;
  /** "centerline-accurate" | "row-assumed" — never silently upgraded. */
  basis: string;
  frontageLength: Measurement<"ft"> | null;
}

export interface SiteConditions {
  elevationRange: { min: Measurement<"ft">; max: Measurement<"ft">; datum: string } | null;
  contourInterval: Measurement<"ft"> | null;
  frontage: Fact<StreetFrontage[]>;
}

/* ------------------------------------------------------------------ */
/* THE SHEET.                                                          */
/* ------------------------------------------------------------------ */

export interface ParcelFactSheet {
  /**
   * Stable content hash over (parcelNodeId, resolverVersion, resolved inputs).
   * EVERY rendered artifact prints it. Two artifacts showing the same parcel
   * with different factSheetIds is a defect the reader can see without us.
   */
  factSheetId: string;
  resolverVersion: string;
  sealedAt: string;

  identity: ParcelIdentity;
  /** Required. The navigation authority. */
  geometry: ParcelGeometry;

  landUse: Fact<{ code: string; description: string }>;
  zoning: Fact<ZoningDistrict>;
  setbacks: Fact<Setbacks>;
  envelope: BuildableEnvelope;
  flood: Fact<FloodDetermination>;
  site: SiteConditions;

  /**
   * The single sentence every surface uses as the headline. Composed ONCE from
   * the fields above by `composeVerdict`. There are currently four independent
   * verdict formatters (brief-verdict, share-verdict, compare-facts,
   * brief-view-model) and they disagree. All four are deleted.
   */
  verdict: string;
}

/* ------------------------------------------------------------------ */
/* The resolver and the renderer seam.                                 */
/* ------------------------------------------------------------------ */

/**
 * AMENDMENT 1 (2026-08-18, planner). A parcel we hold facts for but cannot
 * place on the map.
 *
 * Lane SS-W1 correctly implemented I5 (geometry required) and surfaced the
 * consequence: a parcel nothing can locate stopped opening at all. That trades
 * one honest failure for a worse one. The operator's QA pass was ABOUT parcels
 * that could not be found; answering it by making them vanish is not an
 * improvement.
 *
 * So geometry stays required ON THE SHEET, which is what makes I5 structural:
 * anything holding a ParcelFactSheet can be placed, with no null checks and no
 * still-map path. An unplaceable parcel is a DIFFERENT RESULT TYPE, rendered as
 * a designed state that says we hold the record and cannot place it, and names
 * what would fix that. It never silently becomes a sheet.
 */
export interface UnplaceableParcel {
  kind: "unplaceable";
  parcelNodeId: string;
  identity: ParcelIdentity;
  /** Why placement failed, in customer-readable terms. */
  reason: string;
  /** What would make it placeable, e.g. "parcel geometry for this county". */
  wouldBeFilledBy: string;
}

export type ResolveResult =
  | ({ kind: "sheet" } & ParcelFactSheet)
  | UnplaceableParcel;

export interface FactSheetResolver {
  /**
   * Never throws for an unplaceable parcel; returns the unplaceable result.
   * Throws only for a genuine failure (network, malformed upstream), which is
   * `Fact.unresolved` territory and must not be dressed as an absence.
   */
  resolve(parcelNodeId: string): Promise<ResolveResult>;
  /** Exports resolve the SAME sheet by id. They never re-query a parcel. */
  bySheetId(factSheetId: string): Promise<ParcelFactSheet | null>;
}

/* ------------------------------------------------------------------ */
/* composeVerdict + formatMeasurement — the two implementations.       */
/*                                                                     */
/* Everything above this banner is the planner's frozen contract,      */
/* verbatim. Everything below implements the two `declare function`    */
/* stubs it named, and adds ONE additive export (`composeVerdictTone`) */
/* because the surfaces that render the headline also style it, and    */
/* the four deleted composers each derived that styling separately.    */
/* The sheet's `verdict` field stays a bare string, unchanged.         */
/* ------------------------------------------------------------------ */

/**
 * How the headline should be styled. ADDITIVE to the frozen contract.
 *
 *  - "flag":    a red flag leads the sentence (inside the SFHA).
 *  - "caution": an absence, a failed lookup, or a soft flag is present.
 *  - "clear":   every core fact is present and clean. This is EARNED.
 */
export type VerdictTone = "flag" | "caution" | "clear";

interface VerdictSegment {
  text: string;
  /** Honest absence. Blocks the earned "no red flags" tail. */
  absent: boolean;
  /** The lookup FAILED (Fact state "unresolved"). Never an absence. */
  failed: boolean;
  /** Soft flag: approximate envelope, consumed lot, mapped-but-outside-SFHA. */
  caution: boolean;
  /** Hard flag: inside the Special Flood Hazard Area. Leads the sentence. */
  redFlag: boolean;
}

function segment(
  text: string,
  flags?: Partial<Omit<VerdictSegment, "text">>,
): VerdictSegment {
  return {
    text,
    absent: flags?.absent ?? false,
    failed: flags?.failed ?? false,
    caution: flags?.caution ?? false,
    redFlag: flags?.redFlag ?? false,
  };
}

function sentenceCase(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Join a list the way a sentence does: "AE", "AE and AO", "AE, AO and X500". */
function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function envelopeSegment(sheet: ParcelFactSheet): VerdictSegment {
  const env = sheet.envelope;
  if (env.kind === "not-derived") {
    // "Buildable envelope not derived here" can no longer coexist with an
    // area: the three outcomes are exclusive variants of ONE field.
    const missing = env.missing.length ? ` (missing ${joinList(env.missing)})` : "";
    return segment(`buildable envelope not derived here${missing}`, {
      absent: true,
    });
  }
  if (env.kind === "consumed") {
    // The degenerate parcel says so PLAINLY. Never softened.
    return segment("no buildable area after setbacks", { caution: true });
  }
  const pct = Number.isFinite(env.areaPctOfLot)
    ? Math.round(env.areaPctOfLot)
    : null;
  const share = pct == null ? "" : `, ${pct}% of the lot`;
  return env.approximate
    ? segment(`buildable (approximate)${share}`, { caution: true })
    : segment(`buildable${share}`);
}

function floodSegment(sheet: ParcelFactSheet): VerdictSegment {
  const f = sheet.flood;
  if (f.state === "unresolved") {
    // I4: a FAILED lookup is an error, never an honest absence.
    return segment("flood could not be checked", { failed: true });
  }
  if (f.state !== "present") {
    return segment("flood not verified here", { absent: true });
  }
  const det = f.value;
  const codes = det.zones.map((z) => z.zone).filter((z) => z.trim().length > 0);
  // I6: a surface that names one zone while a second exists is in breach, so
  // the headline names EVERY zone whenever there is more than one.
  const zoneText =
    codes.length > 1
      ? ` (Zones ${joinList(codes)})`
      : codes.length === 1
        ? ` (Zone ${codes[0]})`
        : "";
  if (det.inSfha) {
    return segment(`inside the FEMA flood hazard area${zoneText}`, {
      redFlag: true,
    });
  }
  const mapped = det.zones.some(
    (z) => z.zone.trim() !== "" && z.zone.trim().toUpperCase() !== "X",
  );
  if (mapped) {
    return segment(`in a mapped FEMA flood zone${zoneText}, outside the SFHA`, {
      caution: true,
    });
  }
  return segment("outside mapped flood hazard");
}

function zoningSegment(sheet: ParcelFactSheet): VerdictSegment {
  const z = sheet.zoning;
  if (z.state === "unresolved") {
    return segment("zoning could not be checked", { failed: true });
  }
  if (z.state !== "present") {
    return segment("zoning not verified here", { absent: true });
  }
  return segment(`zoned ${z.value.code}`);
}

function landUseSegment(sheet: ParcelFactSheet): VerdictSegment {
  const lu = sheet.landUse;
  if (lu.state === "unresolved") {
    return segment("land use could not be checked", { failed: true });
  }
  if (lu.state !== "present") {
    return segment("no land-use classification on record", { absent: true });
  }
  const description = lu.value.description?.trim();
  return segment(
    description
      ? `${description.toLowerCase()} per county record`
      : `land use code ${lu.value.code} per county record`,
  );
}

function verdictParts(sheet: ParcelFactSheet): {
  line: string;
  tone: VerdictTone;
} {
  const env = envelopeSegment(sheet);
  const flood = floodSegment(sheet);
  const zoning = zoningSegment(sheet);
  const landUse = landUseSegment(sheet);

  if (flood.redFlag) {
    const line =
      [sentenceCase(flood.text), env.text, zoning.text, landUse.text].join(
        " · ",
      ) + ".";
    return { line, tone: "flag" };
  }

  const segments = [env, flood, zoning, landUse];
  const clean = !segments.some((s) => s.absent || s.failed || s.caution);
  const body = [
    sentenceCase(env.text),
    flood.text,
    zoning.text,
    landUse.text,
  ].join(" · ");
  // "No red flags" is EARNED: only when all four facts are present and clean.
  return {
    line: clean ? `${body} — no red flags.` : `${body}.`,
    tone: clean ? "clear" : "caution",
  };
}

/**
 * The one place a headline sentence is composed. Pure.
 *
 * Replaces `brief-verdict.ts`, `share-verdict.ts`, the verdict half of
 * `compare-facts.ts` and the verdict half of the brief view-model — four
 * composers that read four different payload shapes and disagreed.
 */
export function composeVerdict(sheet: ParcelFactSheet): string {
  return verdictParts(sheet).line;
}

/**
 * ADDITIVE: the tone that goes with `composeVerdict(sheet)`. Derived from the
 * SAME segments, so the sentence and its styling can never disagree.
 */
export function composeVerdictTone(sheet: ParcelFactSheet): VerdictTone {
  return verdictParts(sheet).tone;
}

/* ------------------------------------------------------------------ */
/* Unit conversion — exact factors, one place.                         */
/* ------------------------------------------------------------------ */

const FEET_PER_METRE = 3.280839895013123;
const SQFT_PER_SQM = 10.763910416709722;
const SQFT_PER_ACRE = 43560;
const SQM_PER_HECTARE = 10000;

/** Group an integer string in threes: 6325 -> "6,325". Locale-free. */
function groupThousands(intPart: string): string {
  const negative = intPart.startsWith("-");
  const digits = negative ? intPart.slice(1) : intPart;
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ",";
    out += digits[i];
  }
  return negative ? `-${out}` : out;
}

/** Round to at most `places` decimals, drop trailing zeros, group thousands. */
function trimmed(value: number, places: number): string {
  const fixed = value.toFixed(places);
  const stripped = places > 0 ? fixed.replace(/\.?0+$/, "") : fixed;
  const [whole, fraction] = stripped.split(".");
  return fraction
    ? `${groupThousands(whole)}.${fraction}`
    : groupThousands(whole);
}

/**
 * The one place a measurement becomes text. Pure. A renderer that formats a
 * Measurement by hand is in breach.
 *
 * This is what stops elevation printing in metres beside a layer control that
 * says feet, and stops the DXF exporting metres into a Revit US template.
 */
export function formatMeasurement(
  m: Measurement,
  system: DisplaySystem,
): string {
  if (!m || typeof m.value !== "number" || !Number.isFinite(m.value)) {
    // Honest: a measurement with no finite value is NOT "0".
    return "not measured";
  }
  const v = m.value;
  if (system === "metric") {
    switch (m.unit) {
      case "ft":
        return `${trimmed(v / FEET_PER_METRE, 1)} m`;
      case "m":
        return `${trimmed(v, 1)} m`;
      case "sqft":
        return `${trimmed(v / SQFT_PER_SQM, 0)} m²`;
      case "sqm":
        return `${trimmed(v, 0)} m²`;
      case "acre":
        return `${trimmed(
          (v * SQFT_PER_ACRE) / SQFT_PER_SQM / SQM_PER_HECTARE,
          3,
        )} ha`;
    }
  }
  switch (m.unit) {
    case "ft":
      return `${trimmed(v, 1)} ft`;
    case "m":
      return `${trimmed(v * FEET_PER_METRE, 1)} ft`;
    case "sqft":
      return `${trimmed(v, 0)} sq ft`;
    case "sqm":
      return `${trimmed(v * SQFT_PER_SQM, 0)} sq ft`;
    case "acre":
      return `${trimmed(v, 3)} ac`;
  }
  return "not measured";
}

/* ------------------------------------------------------------------ */
/* The subject — one per app, read by everything.                      */
/* ------------------------------------------------------------------ */

/**
 * The single current subject. The search input, inspect card, compare panel,
 * every export panel and Command Center READ this. Nothing else holds a parcel
 * target.
 *
 * This exists because the search box and the selected parcel were separate
 * states, so a drainage report came back for parcel 48027:498770 when 498778
 * was selected, and a DXF export targeted "city of Bastrop" typed in the search
 * box while the sidebar displayed an address.
 */
export interface Subject {
  sheet: ParcelFactSheet;
  /** How this subject was established. For telemetry, never for behavior. */
  origin: "search" | "map-click" | "deep-link" | "share" | "geolocate" | "compare";
}

export interface SubjectStore {
  current(): Subject | null;
  set(subject: Subject): void;
  clear(): void;
  subscribe(fn: (s: Subject | null) => void): () => void;
}

/**
 * Exports take the subject's sheet id. They do NOT take a free-text query, a
 * parcel id typed elsewhere, or an address rendered in another panel.
 */
export interface ExportRequest {
  factSheetId: string;
  format: string;
  displaySystem: DisplaySystem;
}
