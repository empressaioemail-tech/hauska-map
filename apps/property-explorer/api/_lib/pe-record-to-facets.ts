// api/_lib/pe-record-to-facets.ts
//
// P-152 PANEL (OPS-23 lane 2 of 2): compose PE's existing wire-fact shapes
// directly from the Hauska retrieval service's
// `GET /property-nodes/:id/record` (lane 1, hauska-engine PR #417/418/419),
// instead of from cortex's `/api/brokerage/v1/place/node/:id/facets` merge.
//
// SCOPE (see the P152-PANEL close for the full reasoning): this module only
// composes rails that (a) are genuinely independent of the atom-chain's own
// zoning/envelope product truth (untouched — P-153/P-154/R-2 territory),
// (b) carry no entitlement gate today (cadRoll's four dollar rails and the
// owner fact stay cortex-sourced unchanged — "the entitlement gate is not
// yours to change"), and (c) are not part of the situs/address family P-151
// and P-172 are actively re-seeding this same wave (apn, situsAddress,
// situsCity, situsState, landUse are deliberately left on the cortex path —
// landUse was already flagged "may remain on cortex temporarily" in this
// repo's own atom-chain-to-facets.ts module doc before this lane started).
//
// Every composer below reproduces, field-for-field, the SAME translation
// legacy-design-tools' `<rail>FactFromParcelRecord.ts` files already apply
// to the identical parcel_record cell (cortex PR #658) — read there as
// reference, not imported (different repo, different seat). This is a
// vendoring choice, not a rewrite: the falsifier requires byte-for-byte
// parity with what cortex already serves for these rails, and cortex's own
// translation is already correct and already diffed clean by lane 1.
//
// A rail whose `serve` is anything but `"record"` produces NO patch entry —
// the caller (`pe-property-atoms.ts`) leaves whatever the existing
// atom-chain / cortex-merge path already produced for that field untouched.

import { interpretRecordCell, noSuchCellRefusal, type RecordCellRead, type RecordCompanionRow } from "./pe-record-cell-interpret.js";
import { readEtjFact, resolveEtjDetermination } from "./pe-etj-determination.js";
import {
  NEVER_LOOKED_DATE_READ,
  readSetbackDateFromRowAtSource,
  todayIso,
  type SetbackDateRead,
} from "./setback-citation-vintage.js";
import type {
  AgValuationFactWire,
  CityLimitsFactWire,
  FloodHazardFactWire,
  MaxImperviousCoverPctFactWire,
  OverlayDistrictsFactWire,
  PeBakedFacetPayload,
  SchoolDistrictFactWire,
  SpecialDistrictFactWire,
  UtilityServiceFactWire,
  WellFactWire,
} from "./atom-chain-to-facets.js";
import {
  DECLARED_ABSENCE_VERDICT,
  type SitusCityBasis,
} from "../../src/lib/situs-address.js";

/**
 * Fact-family `source` constants, vendored verbatim from legacy-design-tools'
 * own `<rail>FactRead.ts` modules (cross-repo reference only). Cortex's
 * existing parcel_record-fed adapters already stamp these exact strings on
 * `source` today (e.g. `floodHazardFactFromParcelRecord.ts` uses
 * `FLOOD_HAZARD_FACT_SOURCE`, not a generic `"parcel_record"` label) — this
 * lane's own composers must match, or the falsifier's "value, source, or
 * vintage" parity check fails on `source` alone even though every other
 * field agrees byte-for-byte (caught live: the first deploy used a generic
 * `"parcel_record"` string here and diffed non-identical against production
 * on four of the five probe parcels before this fix).
 */
const FLOOD_HAZARD_FACT_SOURCE = "flood-hazard-fact";
const SPECIAL_DISTRICT_FACT_SOURCE = "special-district-fact";
const WELL_FACT_SOURCE = "well-fact";
const SCHOOL_DISTRICT_FACT_SOURCE = "school-district-fact";
const UTILITY_SERVICE_FACT_SOURCE = "utility-service-fact";
const OVERLAY_DISTRICTS_FACT_SOURCE = "overlay-districts-fact";
const AG_VALUATION_FACT_SOURCE = "ag-valuation-fact";
const MAX_IMPERVIOUS_COVER_PCT_FACT_SOURCE = "max-impervious-cover-pct-fact";

/** Mirrors hauska-engine services/retrieval-api's ParcelRecordRailResponse (P-152 lane 1). */
export interface RecordRail {
  cell: Record<string, unknown> | null;
  gate: { verdict: "pass" | "refuse" | "excluded" | null; evaluatedAt: string | null };
  serve: "record" | "refused" | "legacy-transitional";
  atom: { did: string; entityType: string; body: unknown } | null;
  atomBacked: boolean;
  rendering: { text: string; atomVersion: string; vocabVersion: string } | null;
  companions: unknown[];
}

/** Mirrors hauska-engine services/retrieval-api's ParcelRecordResponse (P-152 lane 1). */
export interface ParcelRecordResponse {
  parcelNodeId: string;
  placeKey: string | null;
  countyFips: string;
  railRegistrySha: string;
  readAt: string;
  rails: Record<string, RecordRail>;
  refused: { reason: string } | null;
}

/** The rail keys this lane's BFF actually composes onto the PE wire. Every other slated rail is left to the existing cortex-merge path — see module doc. */
export const COMPOSED_RECORD_RAIL_KEYS = [
  "cityLimits",
  "flood",
  "specialDistricts",
  "wells",
  "schoolDistrict",
  "utilityService",
  "overlayDistricts",
  "agValuation",
  "maxImperviousCoverPct",
  "acreageAcres",
  "acreageSqft",
  "acreageMethod",
  "livingAreaSqft",
  "yearBuilt",
  // P-270 ADDRESS HALF (2026-09-18): the address components the card's address
  // line now takes from the ledger (see `composeBaseFactsSitus`). Listed here so
  // `recordRailStates` reports what the reader actually served for each of them
  // — the panel's honest-absence ledger is where a customer-facing "the roll
  // states no city" is distinguishable from "nobody looked". `situsAddress`
  // itself stays on the cortex path (P-151/P-172 own the situs family).
  "situsState",
  "situsZip",
  "situsCity",
] as const;

/**
 * P152-RAILS (OPS-23 P-152 lane 3): the zoning-district and per-axis setback
 * rail keys the reader carries (`parcel-record-rail-registry.ts` zoning-
 * envelope group). Composed SEPARATELY from `COMPOSED_RECORD_RAIL_KEYS`
 * above because these do not replace a whole fact object — they OVERRIDE
 * individual fields (`facets.zoning.district`, one or more
 * `facets.envelope.setbacks.<axis>`) on top of whatever
 * `adaptAtomChainToBakedFacets` already built from the atom chain. R-2
 * (ENVELOPE DRAWN, FIGURE REFUSED) stays: this module never touches
 * `envelope.status`, `envelope.geojson`, `envelope.buildableAreaSqFt`,
 * `envelope.buildableAreaPct`, or `envelope.summary` — those stay atom-owned.
 * A rail whose `serve` is anything but `"record"` is left alone: for 48021
 * today that means `setbackSideFt`/`setbackRearFt`/`setbackCornerFt` keep
 * their atom-chain value untouched (unslated — see the P152-RAILS close's
 * leave_behind for the current per-parcel serve counts).
 */
export const COMPOSED_ZONING_SETBACK_RAIL_KEYS = [
  "zoningDistrict",
  "zoningJurisdictionKey",
  "zoningProvenance",
  "setbackFrontFt",
  "setbackSideFt",
  "setbackRearFt",
  "setbackCornerFt",
] as const;

export interface RecordPatch {
  cityLimitsFact?: CityLimitsFactWire;
  floodHazardFact?: FloodHazardFactWire;
  specialDistrictFact?: SpecialDistrictFactWire;
  wellFact?: WellFactWire;
  schoolDistrictFact?: SchoolDistrictFactWire;
  utilityServiceFact?: UtilityServiceFactWire;
  overlayDistrictsFact?: OverlayDistrictsFactWire;
  agValuationFact?: AgValuationFactWire;
  maxImperviousCoverPctFact?: MaxImperviousCoverPctFactWire;
  baseFactsAcreage?: NonNullable<PeBakedFacetPayload["baseFacts"]>["acreage"];
  /** P-270 address half: the address components the ledger serves, for `baseFacts`. */
  baseFactsSitus?: BaseFactsSitus;
  livingAreaSqft?: { status: "populated"; value: number };
  yearBuilt?: { status: "populated"; value: number };
  yearBuiltSource?: string;
}

/** Per-rail state carried alongside the composed fact, for the panel to label the transition (P-167 vocabulary not yet landed — reuse the tokens the MCP/reader already use). */
export type RecordRailState = { serve: RecordRail["serve"]; atomBacked: boolean };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Some CAD source columns (rawAgFlag, agYear) are not coerced by the writer — preserve whichever primitive type actually came through, never invent one. */
function asNullableStringOrNumber(value: unknown): string | number | null {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function reasonFromBasis(basis: string | Record<string, unknown> | null): string {
  if (typeof basis === "string") return basis;
  const rec = asRecord(basis);
  if (rec) {
    const finding = asNullableString(rec.finding);
    if (finding) return finding;
    return JSON.stringify(rec);
  }
  return "parcel_record marked this cell absent with no basis recorded.";
}

function vintageFromBasis(basis: string | Record<string, unknown> | null): string | null {
  const rec = asRecord(basis);
  return rec ? asNullableString(rec.vintage) : null;
}

const REFUSAL_CODE_MAP = {
  unaccounted: "parcel-record-unaccounted",
  "engine-refused": "parcel-record-engine-refused",
  "no-such-parcel-or-rail": "parcel-record-cell-miss",
  "malformed-cell": "parcel-record-malformed-cell",
  "store-not-configured": "parcel-record-store-not-configured",
} as const;

function toCompanionRows(rail: RecordRail): RecordCompanionRow[] {
  return (rail.companions as RecordCompanionRow[] | undefined) ?? [];
}

/** cityLimits: parcel_record's own basis shape carries `disposition`, not `finding` (distinct from every other companion rail). */
function composeCityLimits(
  placeKey: string,
  rail: RecordRail,
  prior?: CityLimitsFactWire,
): CityLimitsFactWire | undefined {
  const cell = rail.cell
    ? interpretRecordCell(placeKey, "cityLimits", rail.cell, [])
    : noSuchCellRefusal(placeKey, "cityLimits");
  if (cell.state === "refused") {
    return finishCityLimits({
      status: "unmeasured",
      basis: `parcel_record cityLimits refused (${cell.code}): ${cell.reason}`,
      prior,
    });
  }
  if (cell.state === "absent") {
    const rec = asRecord(cell.basis);
    const disposition = rec ? asNullableString(rec.disposition) : typeof cell.basis === "string" ? null : null;
    const source = rec ? asNullableString(rec.source) : null;
    const basis = disposition
      ? `parcel_record cityLimits: ${disposition}${source ? ` (source: ${source})` : ""}.`
      : typeof cell.basis === "string"
        ? cell.basis
        : "parcel_record marked this parcel's jurisdiction absent-verified with no basis recorded.";
    return finishCityLimits({ status: "unincorporated", basis, prior });
  }
  const cityName = typeof cell.value === "string" ? cell.value : null;
  if (!cityName) {
    return finishCityLimits({
      status: "unmeasured",
      basis: `parcel_record_cell for ${placeKey}/cityLimits is kind=value but its value is not a usable city name (${JSON.stringify(cell.value)}). Refusing rather than inventing a city.`,
      prior,
    });
  }
  return finishCityLimits({
    status: "incorporated",
    cityName,
    basis: `parcel_record cityLimits: incorporated, city '${cityName}' (source: ${cell.cellSource}, vintage: ${cell.vintage || "unknown"}).`,
    prior,
  });
}

/**
 * P-332 (OPS-24 wave 1): THE place this module writes `etjStatus` — one call,
 * replacing the five literals (`etjStatus: "unresolved"`) that used to sit in
 * `composeCityLimits`'s four branches and in `recordUnavailableCityLimits`.
 *
 * The record reader's `cityLimits` cell is a CITY-LIMITS read: it has no ETJ
 * column and never did. The determination therefore comes from `prior` — the
 * fact this module is about to replace, which is where cortex's own read
 * (P-296) now lands since `isCityLimitsFactWire` stopped rejecting it. When
 * there is no determination to carry, the state is `unresolved` and
 * `etjReason` says why, rather than the ETJ status being silently invented
 * from the city-limits status.
 */
function finishCityLimits(args: {
  status: "incorporated" | "unincorporated" | "unmeasured";
  basis: string;
  cityName?: string;
  prior?: CityLimitsFactWire;
}): CityLimitsFactWire {
  const determination = resolveEtjDetermination({
    cityLimitsStatus: args.status,
    cityName: args.cityName ?? null,
    cityLimitsSource: "tx_city_boundary",
    cityLimitsBasis: args.basis,
    etjFact: readEtjFact(args.prior?.etjFact),
    etjStatusInHand: args.prior?.etjStatus,
  });
  return {
    status: args.status,
    etjStatus: determination.etjStatus,
    source: "tx_city_boundary",
    basis: args.basis,
    ...(args.cityName ? { cityName: args.cityName } : {}),
    ...(determination.etjFact ? { etjFact: determination.etjFact } : {}),
    ...(determination.etjConflict ? { etjConflict: determination.etjConflict } : {}),
    ...(determination.etjReason ? { etjReason: determination.etjReason } : {}),
  };
}

const SFHA_ZONE_PREFIXES = ["A", "V"];
function isSfhaZone(zone: string | null): boolean {
  if (!zone) return false;
  const z = zone.trim().toUpperCase();
  if (z === "X" || z === "D" || z.startsWith("X")) return false;
  return SFHA_ZONE_PREFIXES.some((p) => z.startsWith(p));
}

/**
 * flood is a COMPANION rail (`parcel-record-rail-registry.ts` grain
 * "companion") — unlike cityLimits/schoolDistrict, a "value" cell's zone
 * data lives on the companion row's `payload.zone` (and `payload.bfe`,
 * `payload.method`), never on the cell_state itself. Mirrors legacy-design-
 * tools' `parcelRecordFactRead.ts` `loadParcelRecordFloodFact` exactly —
 * caught live: the first deploy read `cell.raw.floodZone` (a field that
 * does not exist on this rail's cell_state) and silently produced a
 * present fact with no floodZone at all, dropping a real value the pre-
 * change capture had (`floodZone: "X"`).
 */
function composeFlood(placeKey: string, rail: RecordRail): FloodHazardFactWire | undefined {
  const cell = rail.cell
    ? interpretRecordCell(placeKey, "flood", rail.cell, toCompanionRows(rail))
    : noSuchCellRefusal(placeKey, "flood");
  if (cell.state === "refused") {
    // FloodHazardFactWire declares no top-level `reason` field (unlike most
    // of its sibling *FactWire types) — the classification lives in `code`;
    // the human-readable detail is dropped rather than smuggled onto an
    // undeclared field.
    return { state: "refused", code: REFUSAL_CODE_MAP[cell.code], source: FLOOD_HAZARD_FACT_SOURCE };
  }
  if (cell.state === "absent") {
    return {
      state: "absent",
      source: FLOOD_HAZARD_FACT_SOURCE,
      absence: { kind: cell.verdict, reason: reasonFromBasis(cell.basis) },
      sourceVintage: vintageFromBasis(cell.basis) ?? null,
    };
  }
  const payload = cell.companionRows[0] ? asRecord(cell.companionRows[0].payload) : null;
  if (!payload) {
    // kind=value but the companion row is missing/malformed — refuse rather
    // than inventing a zone, matching the vendored reference's own guard.
    return {
      state: "refused",
      code: "parcel-record-malformed-cell",
      source: FLOOD_HAZARD_FACT_SOURCE,
    };
  }
  const floodZone = asNullableString(payload.zone);
  return {
    state: "present",
    source: FLOOD_HAZARD_FACT_SOURCE,
    floodZone: floodZone ?? undefined,
    inSpecialFloodHazardArea: isSfhaZone(floodZone),
    sourceVintage: cell.vintage || undefined,
    evaluatedAt: cell.vintage || undefined,
  };
}

function composeSpecialDistricts(placeKey: string, rail: RecordRail): SpecialDistrictFactWire | undefined {
  const cell = rail.cell
    ? interpretRecordCell(placeKey, "specialDistricts", rail.cell, toCompanionRows(rail))
    : noSuchCellRefusal(placeKey, "specialDistricts");
  if (cell.state === "refused") {
    // SpecialDistrictFactWire, like FloodHazardFactWire, declares no
    // top-level `reason` field — `code` alone carries the classification.
    return { state: "refused", code: REFUSAL_CODE_MAP[cell.code], source: SPECIAL_DISTRICT_FACT_SOURCE };
  }
  if (cell.state === "absent") {
    return {
      state: "absent",
      source: SPECIAL_DISTRICT_FACT_SOURCE,
      absence: { kind: cell.verdict, reason: reasonFromBasis(cell.basis) },
      sourceVintage: vintageFromBasis(cell.basis) ?? null,
    };
  }
  const candidates = cell.companionRows
    .map((row) => {
      const rec = asRecord(row.payload);
      const districtId = rec ? asNullableString(rec.districtId) : null;
      if (!districtId) return null;
      return { districtId, districtType: rec ? asNullableString(rec.districtType) : null, districtName: rec ? asNullableString(rec.districtName) : null };
    })
    .filter((c): c is { districtId: string; districtType: string | null; districtName: string | null } => c !== null);
  if (candidates.length === 0) return undefined;
  const mudHits = candidates.filter((c) => c.districtType === "MUD");
  const pool = mudHits.length > 0 ? mudHits : candidates;
  const lead = [...pool].sort((a, b) => a.districtId.localeCompare(b.districtId))[0]!;
  return {
    state: "present",
    source: SPECIAL_DISTRICT_FACT_SOURCE,
    districtId: lead.districtId,
    districtType: lead.districtType ?? undefined,
    districtName: lead.districtName ?? undefined,
    evaluatedAt: cell.vintage || undefined,
  };
}

function composeWells(placeKey: string, rail: RecordRail): WellFactWire | undefined {
  const cell = rail.cell
    ? interpretRecordCell(placeKey, "wells", rail.cell, toCompanionRows(rail))
    : noSuchCellRefusal(placeKey, "wells");
  if (cell.state === "refused") {
    return { state: "refused", code: REFUSAL_CODE_MAP[cell.code], source: WELL_FACT_SOURCE, reason: cell.reason };
  }
  if (cell.state === "absent") {
    return {
      state: "absent",
      source: WELL_FACT_SOURCE,
      absence: { kind: cell.verdict, reason: reasonFromBasis(cell.basis) },
      sourceVintage: vintageFromBasis(cell.basis) ?? null,
    };
  }
  const wells = cell.companionRows
    .map((row) => {
      const rec = asRecord(row.payload);
      if (!rec) return null;
      const api = asNullableString(rec.api);
      return {
        wellKey: api ?? `row-${row.rowIndex}`,
        apiNumber14: api,
        wellStatus: asNullableString(rec.wellStatus),
      };
    })
    .filter((w): w is { wellKey: string; apiNumber14: string | null; wellStatus: string | null } => w !== null);
  if (wells.length === 0) return undefined;
  const lead = [...wells].sort((a, b) => a.wellKey.localeCompare(b.wellKey))[0]!;
  return {
    state: "present",
    source: WELL_FACT_SOURCE,
    apiNumber14: lead.apiNumber14 ?? undefined,
    wellStatus: lead.wellStatus ?? undefined,
    parcelRelation: "on-parcel",
    sourceVintage: cell.vintage || undefined,
    evaluatedAt: cell.vintage || undefined,
  };
}

function composeSchoolDistrict(placeKey: string, rail: RecordRail): SchoolDistrictFactWire | undefined {
  const cell = rail.cell
    ? interpretRecordCell(placeKey, "schoolDistrict", rail.cell, [])
    : noSuchCellRefusal(placeKey, "schoolDistrict");
  if (cell.state === "refused") {
    return { state: "refused", code: REFUSAL_CODE_MAP[cell.code], source: SCHOOL_DISTRICT_FACT_SOURCE, reason: cell.reason };
  }
  if (cell.state === "absent") {
    return {
      state: "absent",
      source: SCHOOL_DISTRICT_FACT_SOURCE,
      absence: { kind: cell.verdict, reason: reasonFromBasis(cell.basis) },
      sourceVintage: vintageFromBasis(cell.basis) ?? null,
    };
  }
  const districtName = typeof cell.value === "string" ? asNullableString(cell.value) : null;
  if (!districtName) return undefined;
  return {
    state: "present",
    source: SCHOOL_DISTRICT_FACT_SOURCE,
    districtName,
    sourceVintage: cell.vintage || undefined,
    evaluatedAt: cell.vintage || undefined,
  };
}

const UTILITY_ROW_INDEX = { water: 0, sewer: 1, electric: 2 } as const;

function composeUtilityService(placeKey: string, rail: RecordRail): UtilityServiceFactWire | undefined {
  const cell = rail.cell
    ? interpretRecordCell(placeKey, "utilityService", rail.cell, toCompanionRows(rail))
    : noSuchCellRefusal(placeKey, "utilityService");
  if (cell.state === "refused") {
    return { state: "refused", code: REFUSAL_CODE_MAP[cell.code], source: UTILITY_SERVICE_FACT_SOURCE, reason: cell.reason };
  }
  if (cell.state === "absent") {
    return {
      state: "absent",
      source: UTILITY_SERVICE_FACT_SOURCE,
      absence: { kind: cell.verdict, reason: reasonFromBasis(cell.basis) },
      sourceVintage: vintageFromBasis(cell.basis) ?? null,
    };
  }
  const byIndex = new Map(cell.companionRows.map((r) => [r.rowIndex, r] as const));
  const entryAt = (idx: number) => {
    const row = byIndex.get(idx);
    const rec = row ? asRecord(row.payload) : null;
    if (!rec) return null;
    return { ccnNo: asNullableString(rec.ccnNo), utility: asNullableString(rec.utility), status: asNullableString(rec.status), ccnType: asNullableString(rec.ccnType) };
  };
  const water = entryAt(UTILITY_ROW_INDEX.water);
  const sewer = entryAt(UTILITY_ROW_INDEX.sewer);
  const electric = entryAt(UTILITY_ROW_INDEX.electric);
  if (water === null && sewer === null && electric === null) return undefined;
  return { state: "present", source: UTILITY_SERVICE_FACT_SOURCE, water, sewer, electric, sourceVintage: cell.vintage || undefined, evaluatedAt: cell.vintage || undefined };
}

function composeOverlayDistricts(placeKey: string, rail: RecordRail): OverlayDistrictsFactWire | undefined {
  const cell = rail.cell
    ? interpretRecordCell(placeKey, "overlayDistricts", rail.cell, toCompanionRows(rail))
    : noSuchCellRefusal(placeKey, "overlayDistricts");
  if (cell.state === "refused") {
    return { state: "refused", code: REFUSAL_CODE_MAP[cell.code], source: OVERLAY_DISTRICTS_FACT_SOURCE, reason: cell.reason };
  }
  if (cell.state === "absent") {
    return {
      state: "absent",
      source: OVERLAY_DISTRICTS_FACT_SOURCE,
      absence: { kind: cell.verdict, reason: reasonFromBasis(cell.basis) },
      sourceVintage: vintageFromBasis(cell.basis) ?? null,
    };
  }
  const districts = cell.companionRows
    .map((row) => {
      const rec = asRecord(row.payload);
      if (!rec) return null;
      const city = asNullableString(rec.city);
      if (!city) return null;
      const { city: _city, ...attributes } = rec;
      return { city, attributes };
    })
    .filter((d): d is { city: string; attributes: Record<string, unknown> } => d !== null);
  if (districts.length === 0) return undefined;
  return { state: "present", source: OVERLAY_DISTRICTS_FACT_SOURCE, districts, sourceVintage: cell.vintage || undefined, evaluatedAt: cell.vintage || undefined };
}

function composeAgValuation(placeKey: string, rail: RecordRail): AgValuationFactWire | undefined {
  const cell = rail.cell
    ? interpretRecordCell(placeKey, "agValuation", rail.cell, toCompanionRows(rail))
    : noSuchCellRefusal(placeKey, "agValuation");
  if (cell.state === "refused") {
    return { state: "refused", code: REFUSAL_CODE_MAP[cell.code], source: AG_VALUATION_FACT_SOURCE, reason: cell.reason };
  }
  if (cell.state === "absent") {
    return {
      state: "absent",
      source: AG_VALUATION_FACT_SOURCE,
      absence: { kind: cell.verdict, reason: reasonFromBasis(cell.basis) },
      sourceVintage: vintageFromBasis(cell.basis) ?? null,
    };
  }
  // AgValuationFactWire types `entries` as `unknown` (no shape validation),
  // so the full vendored field set is included here for fidelity with
  // cortex's existing shape — nothing forces the narrower subset an earlier
  // draft of this composer used.
  const entries = cell.companionRows
    .map((row) => {
      const rec = asRecord(row.payload);
      if (!rec) return null;
      return {
        statecode: asNullableString(rec.statecode),
        landType: asNullableString(rec.landType),
        description: asNullableString(rec.description),
        acres: asNullableNumber(rec.acres),
        value: asNullableNumber(rec.value),
        currValue: asNullableNumber(rec.currValue),
        agFlag: rec.agFlag === true,
        rawAgFlag: asNullableStringOrNumber(rec.rawAgFlag),
        sequence: asNullableNumber(rec.sequence),
        apprMethod: asNullableString(rec.apprMethod),
        agYear: asNullableStringOrNumber(rec.agYear),
        propertyNumber: asNullableString(rec.propertyNumber),
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);
  if (entries.length === 0) return undefined;
  return { state: "present", source: AG_VALUATION_FACT_SOURCE, entries, sourceVintage: cell.vintage || undefined, evaluatedAt: cell.vintage || undefined };
}

function composeMaxImperviousCoverPct(placeKey: string, rail: RecordRail): MaxImperviousCoverPctFactWire | undefined {
  const cell = rail.cell
    ? interpretRecordCell(placeKey, "maxImperviousCoverPct", rail.cell, [])
    : noSuchCellRefusal(placeKey, "maxImperviousCoverPct");
  if (cell.state === "refused") {
    return { state: "refused", code: REFUSAL_CODE_MAP[cell.code], source: MAX_IMPERVIOUS_COVER_PCT_FACT_SOURCE, reason: cell.reason };
  }
  if (cell.state === "absent") {
    return {
      state: "absent",
      source: MAX_IMPERVIOUS_COVER_PCT_FACT_SOURCE,
      absence: { kind: cell.verdict, reason: reasonFromBasis(cell.basis) },
      sourceVintage: vintageFromBasis(cell.basis) ?? null,
    };
  }
  const percent = asNullableNumber(cell.value);
  if (percent === null) return undefined;
  return {
    state: "present",
    source: MAX_IMPERVIOUS_COVER_PCT_FACT_SOURCE,
    percent,
    watershedType: asNullableString(cell.raw.watershedType) ?? undefined,
    inRechargeZone: cell.raw.inRechargeZone === true,
    crosswalkCitation: asNullableString(cell.raw.crosswalkCitation) ?? undefined,
    sourceVintage: cell.vintage || undefined,
    evaluatedAt: cell.vintage || undefined,
  };
}

/** Acreage: three independent scalar rails, composed together only when all three resolve `serve==='record'` and the acres cell is a real positive number (never fabricate a partial acreage object). */
function composeAcreage(
  placeKey: string,
  acresRail: RecordRail | undefined,
  sqftRail: RecordRail | undefined,
  methodRail: RecordRail | undefined,
): NonNullable<PeBakedFacetPayload["baseFacts"]>["acreage"] | undefined {
  if (!acresRail || acresRail.serve !== "record") return undefined;
  const cell = acresRail.cell
    ? interpretRecordCell(placeKey, "acreageAcres", acresRail.cell, [])
    : noSuchCellRefusal(placeKey, "acreageAcres");
  if (cell.state !== "present") return undefined;
  const value = asNullableNumber(cell.value);
  if (value === null || value <= 0) return undefined;
  let sqft: number | undefined;
  if (sqftRail && sqftRail.serve === "record" && sqftRail.cell) {
    const sqftCell = interpretRecordCell(placeKey, "acreageSqft", sqftRail.cell, []);
    if (sqftCell.state === "present") {
      const n = asNullableNumber(sqftCell.value);
      if (n !== null && n > 0) sqft = n;
    }
  }
  let method: string | undefined;
  if (methodRail && methodRail.serve === "record" && methodRail.cell) {
    const methodCell = interpretRecordCell(placeKey, "acreageMethod", methodRail.cell, []);
    if (methodCell.state === "present" && typeof methodCell.value === "string") {
      method = methodCell.value;
    }
  }
  return { value, sqft, method };
}

/**
 * P-270 ADDRESS HALF (2026-09-18): where the ledger's address components become
 * `baseFacts` fields. Three scalar rails, read exactly as `composeAcreage` reads
 * its three: `serve === "record"` and a present cell, or nothing at all.
 *
 * WHAT THE LEDGER ACTUALLY HOLDS (measured live 2026-09-18 on Pflugerville
 * `48453:445501`): `situsZip` is a value (`78660`) and the roll's `situsCity` is
 * ABSENT-VERIFIED — the CAD-parcel-roll claim for this parcel carries no
 * situs city and the declared-vintage `cad_property.situs_city` is empty, so
 * both sources agree the ROLL has none. The card served neither, so it dropped a
 * ZIP its own ledger holds and named no city it could name.
 *
 * THE CITY IS LABELLED, NOT INVENTED. When the roll states no city and
 * `cityLimits` names an incorporated one, the city is carried with
 * `situsCityBasis: "city-limits"` — the city whose LIMITS CONTAIN the parcel,
 * which is a different claim from "the roll's mailing city" and must never be
 * rendered as one (dispatch item 2). `situsCityBasis: "cad-roll"` marks the
 * roll's own city. An unincorporated parcel with no roll city yields NO city
 * field at all rather than a guessed one. `cityLimits`'s own fact
 * (`cityLimitsFact`) is untouched and keeps describing jurisdiction; this only
 * lets an address line name the city a customer can recognise.
 *
 * WHAT THIS DOES NOT DO: it never writes `situsAddress` (P-151/P-172 own the
 * situs family — see the module doc), never invents a ZIP, and never labels a
 * city-limits city as the CAD roll's city.
 *
 * P-331 (2026-09-19): the basis vocabulary is declared ONCE in this repo, in
 * `src/lib/situs-address.ts` (the composer every reader shares), because a
 * shared literal can only be pinned by a `type NAME = ...` declaration with a
 * NAME. This module and `atom-chain-to-facets.ts` used to carry their own copies
 * of the same two words — the exact drift P-331 exists to catch, one level down.
 */
export type { SitusCityBasis };
export interface BaseFactsSitus {
  situsState?: string;
  situsZip?: string;
  situsCity?: string;
  situsCityBasis?: SitusCityBasis;
}

/** One scalar rail's cell, or null when the reader did not serve this rail at all. */
function servedRecordCell(
  placeKey: string,
  railKey: string,
  rail: RecordRail | undefined,
): RecordCellRead | null {
  if (!rail || rail.serve !== "record") return null;
  return rail.cell
    ? interpretRecordCell(placeKey, railKey, rail.cell, [])
    : noSuchCellRefusal(placeKey, railKey);
}

/** A present cell's value as a non-empty string — never an absent/refused cell, never a non-string. */
function cellString(cell: RecordCellRead | null): string | undefined {
  return cell?.state === "present" ? (asNullableString(cell.value) ?? undefined) : undefined;
}

function composeBaseFactsSitus(
  placeKey: string,
  rails: ParcelRecordResponse["rails"],
): BaseFactsSitus | undefined {
  const out: BaseFactsSitus = {};

  const state = cellString(servedRecordCell(placeKey, "situsState", rails.situsState));
  if (state) out.situsState = state;

  const zip = cellString(servedRecordCell(placeKey, "situsZip", rails.situsZip));
  if (zip) out.situsZip = zip;

  // The roll's own city first: it is the only one that may be rendered as the
  // roll's city.
  const rollCell = servedRecordCell(placeKey, "situsCity", rails.situsCity);
  const rollCity = cellString(rollCell);
  if (rollCity) {
    out.situsCity = rollCity;
    out.situsCityBasis = "cad-roll";
  } else if (rollCell?.state === "absent" && rollCell.verdict === DECLARED_ABSENCE_VERDICT) {
    // ONLY an ABSENT-VERIFIED roll city licenses the fallback. A rail that was
    // never slated, refused, or served a malformed cell says nothing about
    // whether the roll holds a city, and substituting the containing city there
    // would be inventing one (dispatch item 2, and the `not-applicable` verdict
    // is likewise not "the roll has none").
    const limitsCity = cellString(servedRecordCell(placeKey, "cityLimits", rails.cityLimits));
    if (limitsCity) {
      out.situsCity = limitsCity;
      out.situsCityBasis = "city-limits";
    }
  }

  return Object.keys(out).length ? out : undefined;
}

function composeLivingAreaSqft(placeKey: string, rail: RecordRail): { status: "populated"; value: number } | undefined {
  if (!rail.cell) return undefined;
  const cell = interpretRecordCell(placeKey, "livingAreaSqft", rail.cell, []);
  if (cell.state !== "present") return undefined;
  const raw = cell.value;
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : null;
  if (n === null || !Number.isFinite(n) || n <= 0) return undefined;
  return { status: "populated", value: n };
}

function composeYearBuilt(placeKey: string, rail: RecordRail): { value: { status: "populated"; value: number }; source: string } | undefined {
  if (!rail.cell) return undefined;
  const cell = interpretRecordCell(placeKey, "yearBuilt", rail.cell, []);
  if (cell.state !== "present") return undefined;
  const raw = cell.value;
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : null;
  if (n === null || !Number.isFinite(n) || n <= 0) return undefined;
  return { value: { status: "populated", value: Math.round(n) }, source: "parcel_record" };
}

/** Per-axis setback scalar: read the reader's own numeric cell, gated strictly on `serve === "record"`, never negative. */
function composeSetbackAxisScalar(placeKey: string, rail: RecordRail | undefined, railKey: string): number | undefined {
  return composeSetbackAxisScalarWithVintage(placeKey, rail, railKey)?.value;
}

/**
 * P-216 (2026-09-15): same read as {@link composeSetbackAxisScalar}, but also
 * returns the cell's own `vintage` — the parcel_record row's write time, a
 * DIFFERENT date from `setbackRulesEffectiveDate` (the ordinance's effective
 * date, from a separate companion rail, often absent). Without this, a
 * response applying a fresh axis override still carried the stale
 * atom-chain `snapshotAt` with no trace of which date backs which axis — a
 * payload that is part atom-chain, part parcel_record, labelled with only
 * the older of the two (the "hybrid payload wearing one date" defect).
 */
function composeSetbackAxisScalarWithVintage(
  placeKey: string,
  rail: RecordRail | undefined,
  railKey: string,
): { value: number; vintage: string | null } | undefined {
  if (!rail || rail.serve !== "record" || !rail.cell) return undefined;
  const cell = interpretRecordCell(placeKey, railKey, rail.cell, []);
  if (cell.state !== "present") return undefined;
  const n = asNullableNumber(cell.value);
  if (n === null || n < 0) return undefined;
  return { value: n, vintage: cell.vintage.trim() || null };
}

/** The latest of any parseable ISO dates given, or null when none parse. Never guesses a date from an unparseable string. */
export function latestParseableDate(dates: ReadonlyArray<string | null | undefined>): string | null {
  let latest: { raw: string; ms: number } | null = null;
  for (const raw of dates) {
    if (!raw) continue;
    const ms = Date.parse(raw);
    if (!Number.isFinite(ms)) continue;
    if (!latest || ms > latest.ms) latest = { raw, ms };
  }
  return latest?.raw ?? null;
}

/**
 * The `setbackRules` companion row's own two spellings of its effective-date
 * field. `readSetbackDateFromRowAtSource` reads whichever key is PRESENT, so a
 * row carrying neither reports absent-at-source and a row carrying one with a
 * value that is not a date reports unparseable — the two states this lane
 * exists to keep apart.
 */
const SETBACK_RULE_DATE_FIELD_KEYS = ["effectiveDate", "effective_date"] as const;

/**
 * P-354 (2026-09-18) — the rule's own ADOPTION date, in the same two
 * spellings. Read at source beside the effective date, never inferred from it:
 * the factory writer's companion row carries `adoptedDate` for a row that
 * states one (Georgetown's rewrite rows: `2026-08-11`), and the whole point of
 * carrying it is to name both dates when the effective date has not arrived.
 */
const SETBACK_RULE_ADOPTED_DATE_FIELD_KEYS = ["adoptedDate", "adopted_date"] as const;

/**
 * P-354 — the day being served, read ONCE per call so a facet build cannot
 * straddle midnight. It is used ONLY to decide whether a read date has
 * arrived; it is never a substituted date.
 */
function setbackVintageAsOf(): string {
  return todayIso();
}

/**
 * setbackRules is the companion rail carrying the rule's effective date +
 * citation. Field names are the rail's own two spellings
 * (`effectiveDate`/`effective_date`, `citationUrl`/`citation_url`).
 *
 * P-270 (OPS-24 X11): this function used to return
 * `{effectiveDate: null, citationUrl: null}` from FIVE situations that are not
 * the same situation — no rail, rail cell not `present`, no companion row, no
 * `effectiveDate` key, and a key whose value `asNullableString` rejected — so a
 * citation whose date could not be read was indistinguishable from a rail that
 * was never consulted, and the caller served the citation as though it were
 * current. The date read now goes through `readSetbackDateFromRowAtSource`
 * (setback-citation-vintage.ts), which keeps absent-at-source and
 * present-but-unparseable apart, and the two "nobody read anything" cases
 * report `never-looked` rather than a null that reads as an absence.
 */
function companionSetbackRulesMeta(
  placeKey: string,
  rail: RecordRail | undefined,
): {
  dateRead: SetbackDateRead;
  citationUrl: string | null;
  sourceLabel: string | null;
} {
  const RAIL_LABEL = "parcel_record setbackRules";
  if (!rail || !rail.cell) {
    return { dateRead: NEVER_LOOKED_DATE_READ, citationUrl: null, sourceLabel: null };
  }
  const cell = interpretRecordCell(placeKey, "setbackRules", rail.cell, toCompanionRows(rail));
  if (cell.state === "refused") {
    // The reader was asked and refused: this cell's date was never read.
    return { dateRead: NEVER_LOOKED_DATE_READ, citationUrl: null, sourceLabel: RAIL_LABEL };
  }
  const sourceLabel = `${RAIL_LABEL} (${cell.state === "present" ? cell.cellSource : cell.state})`;
  if (cell.state !== "present") {
    // absent / absent-verified: the source itself states it carries no rule row.
    return {
      dateRead: { sourceDate: null, state: "unreadable-absent-at-source" },
      citationUrl: null,
      sourceLabel,
    };
  }
  const row = cell.companionRows[0] ? asRecord(cell.companionRows[0].payload) : null;
  if (!row) {
    // kind=value with no companion row: the content this rail carries lives on
    // that row, so there is no date at source to read.
    return {
      dateRead: { sourceDate: null, state: "unreadable-absent-at-source" },
      citationUrl: null,
      sourceLabel,
    };
  }
  return {
    // P-354 (2026-09-18): the read now also asks whether the date it found has
    // ARRIVED. A readable future date is `future-effective`, not `read` -- the
    // state that stops the card printing a rule as if it were already in force.
    dateRead: readSetbackDateFromRowAtSource(row, SETBACK_RULE_DATE_FIELD_KEYS, {
      adoptedKeys: SETBACK_RULE_ADOPTED_DATE_FIELD_KEYS,
      asOf: setbackVintageAsOf(),
    }),
    citationUrl: asNullableString(row.citationUrl) ?? asNullableString(row.citation_url),
    sourceLabel,
  };
}

/** The override this lane applies onto `facets.zoning` / `facets.envelope.setbacks` — see COMPOSED_ZONING_SETBACK_RAIL_KEYS module doc for the R-2 boundary. */
export interface ZoningSetbackOverride {
  district?: string;
  jurisdictionKey?: string;
  /**
   * P-167 wave 5 (OPS-23 R-4). `record.rails.zoningProvenance`'s own value —
   * a flat citation string (e.g. "bastrop-development-code:2026-06-
   * ordinance"), per `zoningFactFromParcelRecord.ts`'s own documented
   * convention in legacy-design-tools ("this adapter serves it as a plain
   * citation string"). Distinct from `setbackRulesCitationUrl` above (a
   * DIFFERENT rail, `setbackRules`, carrying a richer {effectiveDate,
   * citationUrl} companion pair) — this was previously composed into
   * `railStates` (its serve state was tracked) but never applied to any
   * field of this override, a documented gap (pe-record-to-facets.test.ts,
   * OPS-23 P-152 lane 4 close leave_behind). Closed here: the panel's
   * zoning row now has somewhere to print it.
   */
  provenance?: string;
  setbackAxisOverrides?: {
    front_ft?: number;
    side_ft?: number;
    rear_ft?: number;
    side_corner_ft?: number;
  };
  /**
   * P-216 (2026-09-15): the latest `parcel_record` cell `vintage` among the
   * axes actually overridden — the write time of the freshest overriding
   * row, NOT `setbackRulesEffectiveDate` (a different rail's ordinance
   * effective date). Null when no axis overrode, or none carried a
   * parseable vintage. The caller uses this to keep a hybrid response's
   * `snapshotAt` from wearing only its OLDER (atom-chain) date — a payload
   * combining a 2026-07 atom-chain read with a 2026-09 parcel_record
   * override must not be labelled 2026-07.
   */
  setbackAxisOverrideVintage: string | null;
  setbackRulesEffectiveDate: string | null;
  setbackRulesCitationUrl: string | null;
  /**
   * P-270 (OPS-24 X11): how the served citation's effective date was
   * established AT SOURCE — `read`, or one of the three unreadable causes.
   * `setbackRulesEffectiveDate` above is its `sourceDate`, kept as its own
   * field only so existing callers keep working; the STATE is what must not
   * be collapsed.
   *
   * PRESENT ONLY WHEN THIS RAIL SERVED A CITATION. A payload whose
   * `setbackRulesCitationUrl` is null has no citation here for this override
   * to qualify, and the vintage of a citation this path never served is not
   * this path's to declare — the atom chain declares its own (see
   * atom-chain-to-facets.ts). Absent is therefore the honest value, not
   * `never-looked`: the same shape as `setbackRulesCitationUrl` itself.
   */
  setbackRulesCitationDateRead?: SetbackDateRead;
  /** P-270: the source whose date could not be read — named on the conflict row, never left implicit. */
  setbackRulesSourceLabel?: string | null;
}

/**
 * Compose the zoning/setback override from the reader's zoning-envelope
 * rail group, for whichever of those rails serve `"record"` today. Returns
 * an EMPTY override (no-op) when the record itself is a whole-parcel
 * refusal, or when none of the zoning/setback rails serve `"record"` yet —
 * the caller leaves the atom-chain-built zoning/envelope entirely alone in
 * that case, exactly as before this lane.
 */
export function composeZoningSetbackOverride(record: ParcelRecordResponse): {
  override: ZoningSetbackOverride;
  railStates: Record<string, RecordRailState>;
} {
  const placeKey = record.placeKey ?? record.parcelNodeId;
  const railStates: Record<string, RecordRailState> = {};
  for (const key of COMPOSED_ZONING_SETBACK_RAIL_KEYS) {
    const rail = record.rails[key];
    if (rail) railStates[key] = { serve: rail.serve, atomBacked: rail.atomBacked };
  }
  const override: ZoningSetbackOverride = {
    setbackAxisOverrideVintage: null,
    setbackRulesEffectiveDate: null,
    setbackRulesCitationUrl: null,
  };
  if (record.refused) return { override, railStates };

  const districtRail = record.rails.zoningDistrict;
  if (districtRail?.serve === "record" && districtRail.cell) {
    const cell = interpretRecordCell(placeKey, "zoningDistrict", districtRail.cell, []);
    if (cell.state === "present") {
      const district = asNullableString(cell.value);
      if (district) override.district = district;
    }
  }
  const jurisRail = record.rails.zoningJurisdictionKey;
  if (jurisRail?.serve === "record" && jurisRail.cell) {
    const cell = interpretRecordCell(placeKey, "zoningJurisdictionKey", jurisRail.cell, []);
    if (cell.state === "present") {
      const key = asNullableString(cell.value);
      if (key) override.jurisdictionKey = key;
    }
  }
  // P-167 wave 5 (OPS-23 R-4): closes the documented gap — this rail's value
  // now lands on `override.provenance` instead of being tracked in
  // railStates with nowhere to go.
  const provenanceRail = record.rails.zoningProvenance;
  if (provenanceRail?.serve === "record" && provenanceRail.cell) {
    const cell = interpretRecordCell(placeKey, "zoningProvenance", provenanceRail.cell, []);
    if (cell.state === "present") {
      const provenance = asNullableString(cell.value);
      if (provenance) override.provenance = provenance;
    }
  }

  const front = composeSetbackAxisScalarWithVintage(placeKey, record.rails.setbackFrontFt, "setbackFrontFt");
  const side = composeSetbackAxisScalarWithVintage(placeKey, record.rails.setbackSideFt, "setbackSideFt");
  const rear = composeSetbackAxisScalarWithVintage(placeKey, record.rails.setbackRearFt, "setbackRearFt");
  const corner = composeSetbackAxisScalarWithVintage(placeKey, record.rails.setbackCornerFt, "setbackCornerFt");
  if (front || side || rear || corner) {
    override.setbackAxisOverrides = {
      ...(front ? { front_ft: front.value } : {}),
      ...(side ? { side_ft: side.value } : {}),
      ...(rear ? { rear_ft: rear.value } : {}),
      ...(corner ? { side_corner_ft: corner.value } : {}),
    };
    override.setbackAxisOverrideVintage = latestParseableDate([
      front?.vintage,
      side?.vintage,
      rear?.vintage,
      corner?.vintage,
    ]);
  }

  const meta = companionSetbackRulesMeta(placeKey, record.rails.setbackRules);
  override.setbackRulesEffectiveDate = meta.dateRead.sourceDate;
  override.setbackRulesCitationUrl = meta.citationUrl;
  if (meta.citationUrl) {
    // P-270: declared only when this rail is actually serving a citation. With
    // no citation the keys stay absent, so nothing downstream can report a
    // vintage for a citation that did not come from here.
    override.setbackRulesCitationDateRead = meta.dateRead;
    override.setbackRulesSourceLabel = meta.sourceLabel;
  }

  return { override, railStates };
}

/**
 * P152-RAILS item 3: on a `/record` outage, every rail that WOULD have been
 * composed above is returned as a typed refusal carrying the reader's
 * errorClass and HTTP status — never a silent fall to whatever the cortex
 * merge already produced for the same field (R-6). Scoped to the nine rails
 * with a well-defined `*FactWire` refused shape; `acreageAcres/Sqft/Method`,
 * `livingAreaSqft` and `yearBuilt` have no honest refused shape this module
 * can construct without inventing a `LayerAbsenceWire`-shaped absence it has
 * no source data to back (same limitation the P152-PANEL close named for
 * the "present cell only" branch) — those three are left as-is on outage,
 * named in this lane's own leave_behind, not silently claimed fixed.
 */
export interface RecordFetchFailure {
  errorClass: "timeout" | "http-error" | "invalid-json" | "network-error";
  httpStatus: number | null;
  reason: string;
}

export function classifyRecordFetchFailure(reason: string): RecordFetchFailure {
  const httpMatch = reason.match(/record HTTP (\d+)/);
  if (httpMatch) return { errorClass: "http-error", httpStatus: Number(httpMatch[1]), reason };
  if (/aborted after \d+ms upstream timeout$/.test(reason)) {
    return { errorClass: "timeout", httpStatus: null, reason };
  }
  if (/invalid JSON$/.test(reason)) return { errorClass: "invalid-json", httpStatus: null, reason };
  return { errorClass: "network-error", httpStatus: null, reason };
}

function unavailableMessage(failure: RecordFetchFailure): string {
  return `parcel_record reader unavailable (${failure.errorClass}${
    failure.httpStatus ? ` ${failure.httpStatus}` : ""
  }): ${failure.reason}`;
}

/** Generic `state:'refused'` shape shared by flood/specialDistricts/wells/schoolDistrict/utilityService/overlayDistricts/agValuation/maxImperviousCoverPct. */
function recordUnavailableGenericFact(
  source: string,
  failure: RecordFetchFailure,
): { state: "refused"; code: string; source: string; reason: string } {
  return { state: "refused", code: "parcel-record-unavailable", source, reason: unavailableMessage(failure) };
}

function recordUnavailableCityLimits(
  failure: RecordFetchFailure,
  prior?: CityLimitsFactWire,
): CityLimitsFactWire {
  // P-332: an outage of the CITY-LIMITS reader says nothing about the ETJ
  // read, which came from a different source. A determination already in hand
  // is carried rather than blanked by an unrelated outage; with none in hand
  // the state stays `unresolved` and says why.
  return finishCityLimits({ status: "unmeasured", basis: unavailableMessage(failure), prior });
}

/**
 * Build the full "declared unavailable" patch for every rail this lane's
 * happy-path composer would have set, applied by the caller (pe-property-
 * atoms.ts) in place of the normal `composeRecordPatch` output whenever the
 * `/record` fetch itself failed.
 */
export function composeRecordUnavailablePatch(
  failure: RecordFetchFailure,
  priorCityLimits?: CityLimitsFactWire,
): RecordPatch {
  return {
    cityLimitsFact: recordUnavailableCityLimits(failure, priorCityLimits),
    floodHazardFact: recordUnavailableGenericFact(FLOOD_HAZARD_FACT_SOURCE, failure) as FloodHazardFactWire,
    specialDistrictFact: recordUnavailableGenericFact(SPECIAL_DISTRICT_FACT_SOURCE, failure) as SpecialDistrictFactWire,
    wellFact: recordUnavailableGenericFact(WELL_FACT_SOURCE, failure) as WellFactWire,
    schoolDistrictFact: recordUnavailableGenericFact(SCHOOL_DISTRICT_FACT_SOURCE, failure) as SchoolDistrictFactWire,
    utilityServiceFact: recordUnavailableGenericFact(UTILITY_SERVICE_FACT_SOURCE, failure) as UtilityServiceFactWire,
    overlayDistrictsFact: recordUnavailableGenericFact(OVERLAY_DISTRICTS_FACT_SOURCE, failure) as OverlayDistrictsFactWire,
    agValuationFact: recordUnavailableGenericFact(AG_VALUATION_FACT_SOURCE, failure) as AgValuationFactWire,
    maxImperviousCoverPctFact: recordUnavailableGenericFact(MAX_IMPERVIOUS_COVER_PCT_FACT_SOURCE, failure) as MaxImperviousCoverPctFactWire,
  };
}

/**
 * Compose the wire patch for every rail this lane converts, gated strictly
 * on `serve === "record"` (never `legacy-transitional`, never `refused`
 * without the rail's own honest-refusal shape). Returns the patch AND the
 * per-rail `{serve, atomBacked}` map for every rail this lane looked at, so
 * the caller can attach it as an additive, non-breaking field (P-167's
 * vocabulary is not yet landed — see dispatch item 1).
 */
export function composeRecordPatch(
  record: ParcelRecordResponse,
  /**
   * P-332: the city-limits fact this patch will REPLACE. The record reader has
   * no ETJ column, so this is where the determination in hand comes from —
   * cortex's own read, adopted (and normalised) by `withCityLimitsFact` before
   * this runs. Omitted by direct callers/tests, in which case the ETJ state is
   * honestly `unresolved` with a stated reason.
   */
  priorCityLimits?: CityLimitsFactWire,
): {
  patch: RecordPatch;
  railStates: Record<string, RecordRailState>;
} {
  const placeKey = record.placeKey ?? record.parcelNodeId;
  const railStates: Record<string, RecordRailState> = {};
  for (const key of COMPOSED_RECORD_RAIL_KEYS) {
    const rail = record.rails[key];
    if (rail) railStates[key] = { serve: rail.serve, atomBacked: rail.atomBacked };
  }

  const patch: RecordPatch = {};
  if (record.refused) return { patch, railStates };

  const cityLimits = record.rails.cityLimits;
  if (cityLimits?.serve === "record") {
    const fact = composeCityLimits(placeKey, cityLimits, priorCityLimits);
    if (fact) patch.cityLimitsFact = fact;
  }
  const flood = record.rails.flood;
  if (flood?.serve === "record") {
    const fact = composeFlood(placeKey, flood);
    if (fact) patch.floodHazardFact = fact;
  }
  const specialDistricts = record.rails.specialDistricts;
  if (specialDistricts?.serve === "record") {
    const fact = composeSpecialDistricts(placeKey, specialDistricts);
    if (fact) patch.specialDistrictFact = fact;
  }
  const wells = record.rails.wells;
  if (wells?.serve === "record") {
    const fact = composeWells(placeKey, wells);
    if (fact) patch.wellFact = fact;
  }
  const schoolDistrict = record.rails.schoolDistrict;
  if (schoolDistrict?.serve === "record") {
    const fact = composeSchoolDistrict(placeKey, schoolDistrict);
    if (fact) patch.schoolDistrictFact = fact;
  }
  const utilityService = record.rails.utilityService;
  if (utilityService?.serve === "record") {
    const fact = composeUtilityService(placeKey, utilityService);
    if (fact) patch.utilityServiceFact = fact;
  }
  const overlayDistricts = record.rails.overlayDistricts;
  if (overlayDistricts?.serve === "record") {
    const fact = composeOverlayDistricts(placeKey, overlayDistricts);
    if (fact) patch.overlayDistrictsFact = fact;
  }
  const agValuation = record.rails.agValuation;
  if (agValuation?.serve === "record") {
    const fact = composeAgValuation(placeKey, agValuation);
    if (fact) patch.agValuationFact = fact;
  }
  const maxImperviousCoverPct = record.rails.maxImperviousCoverPct;
  if (maxImperviousCoverPct?.serve === "record") {
    const fact = composeMaxImperviousCoverPct(placeKey, maxImperviousCoverPct);
    if (fact) patch.maxImperviousCoverPctFact = fact;
  }

  const acreage = composeAcreage(placeKey, record.rails.acreageAcres, record.rails.acreageSqft, record.rails.acreageMethod);
  if (acreage) patch.baseFactsAcreage = acreage;

  // P-270 address half. Independent of acreage: a parcel can serve either, both
  // or neither, and each is composed only from rails that genuinely served.
  const baseFactsSitus = composeBaseFactsSitus(placeKey, record.rails);
  if (baseFactsSitus) patch.baseFactsSitus = baseFactsSitus;

  const livingAreaRail = record.rails.livingAreaSqft;
  if (livingAreaRail?.serve === "record") {
    const fact = composeLivingAreaSqft(placeKey, livingAreaRail);
    if (fact) patch.livingAreaSqft = fact;
  }
  const yearBuiltRail = record.rails.yearBuilt;
  if (yearBuiltRail?.serve === "record") {
    const yb = composeYearBuilt(placeKey, yearBuiltRail);
    if (yb) {
      patch.yearBuilt = yb.value;
      patch.yearBuiltSource = yb.source;
    }
  }

  return { patch, railStates };
}
