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

import { interpretRecordCell, noSuchCellRefusal, type RecordCompanionRow } from "./pe-record-cell-interpret.js";
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

function methodFromBasis(basis: string | Record<string, unknown> | null): string | null {
  const rec = asRecord(basis);
  return rec ? asNullableString(rec.method) : null;
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
function composeCityLimits(placeKey: string, rail: RecordRail): CityLimitsFactWire | undefined {
  const cell = rail.cell
    ? interpretRecordCell(placeKey, "cityLimits", rail.cell, [])
    : noSuchCellRefusal(placeKey, "cityLimits");
  if (cell.state === "refused") {
    return {
      status: "unmeasured",
      etjStatus: "unresolved",
      source: "tx_city_boundary",
      basis: `parcel_record cityLimits refused (${cell.code}): ${cell.reason}`,
    };
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
    return { status: "unincorporated", etjStatus: "unresolved", source: "tx_city_boundary", basis };
  }
  const cityName = typeof cell.value === "string" ? cell.value : null;
  if (!cityName) {
    return {
      status: "unmeasured",
      etjStatus: "unresolved",
      source: "tx_city_boundary",
      basis: `parcel_record_cell for ${placeKey}/cityLimits is kind=value but its value is not a usable city name (${JSON.stringify(cell.value)}). Refusing rather than inventing a city.`,
    };
  }
  return {
    status: "incorporated",
    etjStatus: "unresolved",
    source: "tx_city_boundary",
    basis: `parcel_record cityLimits: incorporated, city '${cityName}' (source: ${cell.cellSource}, vintage: ${cell.vintage || "unknown"}).`,
    cityName,
  };
}

const SFHA_ZONE_PREFIXES = ["A", "V"];
function isSfhaZone(zone: string | null): boolean {
  if (!zone) return false;
  const z = zone.trim().toUpperCase();
  if (z === "X" || z === "D" || z.startsWith("X")) return false;
  return SFHA_ZONE_PREFIXES.some((p) => z.startsWith(p));
}

function composeFlood(placeKey: string, rail: RecordRail): FloodHazardFactWire | undefined {
  const cell = rail.cell
    ? interpretRecordCell(placeKey, "flood", rail.cell, [])
    : noSuchCellRefusal(placeKey, "flood");
  if (cell.state === "refused") {
    return { state: "refused", code: REFUSAL_CODE_MAP[cell.code], source: "parcel_record", reason: `parcel_record flood (${cell.code}): ${cell.reason}` };
  }
  if (cell.state === "absent") {
    return {
      state: "absent",
      source: "parcel_record",
      absence: { kind: cell.verdict, reason: reasonFromBasis(cell.basis) },
      sourceVintage: vintageFromBasis(cell.basis) ?? undefined,
    };
  }
  const raw = cell.raw;
  const floodZone = asNullableString(raw.floodZone);
  return {
    state: "present",
    source: "parcel_record",
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
    return { state: "refused", code: REFUSAL_CODE_MAP[cell.code], source: "parcel_record", reason: cell.reason };
  }
  if (cell.state === "absent") {
    return {
      state: "absent",
      source: "parcel_record",
      absence: { kind: cell.verdict, reason: reasonFromBasis(cell.basis) },
      sourceVintage: vintageFromBasis(cell.basis) ?? undefined,
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
    source: "parcel_record",
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
    return { state: "refused", code: REFUSAL_CODE_MAP[cell.code], source: "parcel_record", reason: cell.reason };
  }
  if (cell.state === "absent") {
    return {
      state: "absent",
      source: "parcel_record",
      absence: { kind: cell.verdict, reason: reasonFromBasis(cell.basis) },
      sourceVintage: vintageFromBasis(cell.basis) ?? undefined,
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
    source: "parcel_record",
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
    return { state: "refused", code: REFUSAL_CODE_MAP[cell.code], source: "parcel_record", reason: cell.reason };
  }
  if (cell.state === "absent") {
    return {
      state: "absent",
      source: "parcel_record",
      absence: { kind: cell.verdict, reason: reasonFromBasis(cell.basis) },
      sourceVintage: vintageFromBasis(cell.basis) ?? undefined,
    };
  }
  const districtName = typeof cell.value === "string" ? asNullableString(cell.value) : null;
  if (!districtName) return undefined;
  return {
    state: "present",
    source: "parcel_record",
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
    return { state: "refused", code: REFUSAL_CODE_MAP[cell.code], source: "parcel_record", reason: cell.reason };
  }
  if (cell.state === "absent") {
    return {
      state: "absent",
      source: "parcel_record",
      absence: { kind: cell.verdict, reason: reasonFromBasis(cell.basis) },
      sourceVintage: vintageFromBasis(cell.basis) ?? undefined,
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
  return { state: "present", source: "parcel_record", water, sewer, electric, sourceVintage: cell.vintage || undefined, evaluatedAt: cell.vintage || undefined };
}

function composeOverlayDistricts(placeKey: string, rail: RecordRail): OverlayDistrictsFactWire | undefined {
  const cell = rail.cell
    ? interpretRecordCell(placeKey, "overlayDistricts", rail.cell, toCompanionRows(rail))
    : noSuchCellRefusal(placeKey, "overlayDistricts");
  if (cell.state === "refused") {
    return { state: "refused", code: REFUSAL_CODE_MAP[cell.code], source: "parcel_record", reason: cell.reason };
  }
  if (cell.state === "absent") {
    return {
      state: "absent",
      source: "parcel_record",
      absence: { kind: cell.verdict, reason: reasonFromBasis(cell.basis) },
      sourceVintage: vintageFromBasis(cell.basis) ?? undefined,
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
  return { state: "present", source: "parcel_record", districts, sourceVintage: cell.vintage || undefined, evaluatedAt: cell.vintage || undefined };
}

function composeAgValuation(placeKey: string, rail: RecordRail): AgValuationFactWire | undefined {
  const cell = rail.cell
    ? interpretRecordCell(placeKey, "agValuation", rail.cell, toCompanionRows(rail))
    : noSuchCellRefusal(placeKey, "agValuation");
  if (cell.state === "refused") {
    return { state: "refused", code: REFUSAL_CODE_MAP[cell.code], source: "parcel_record", reason: cell.reason };
  }
  if (cell.state === "absent") {
    return {
      state: "absent",
      source: "parcel_record",
      absence: { kind: cell.verdict, reason: reasonFromBasis(cell.basis) },
      sourceVintage: vintageFromBasis(cell.basis) ?? undefined,
    };
  }
  const entries = cell.companionRows
    .map((row) => {
      const rec = asRecord(row.payload);
      if (!rec) return null;
      return {
        statecode: asNullableString(rec.statecode),
        landType: asNullableString(rec.landType),
        acres: asNullableNumber(rec.acres),
        value: asNullableNumber(rec.value),
      };
    })
    .filter((e): e is { statecode: string | null; landType: string | null; acres: number | null; value: number | null } => e !== null);
  if (entries.length === 0) return undefined;
  return { state: "present", source: "parcel_record", entries, sourceVintage: cell.vintage || undefined, evaluatedAt: cell.vintage || undefined };
}

function composeMaxImperviousCoverPct(placeKey: string, rail: RecordRail): MaxImperviousCoverPctFactWire | undefined {
  const cell = rail.cell
    ? interpretRecordCell(placeKey, "maxImperviousCoverPct", rail.cell, [])
    : noSuchCellRefusal(placeKey, "maxImperviousCoverPct");
  if (cell.state === "refused") {
    return { state: "refused", code: REFUSAL_CODE_MAP[cell.code], source: "parcel_record", reason: cell.reason };
  }
  if (cell.state === "absent") {
    return {
      state: "absent",
      source: "parcel_record",
      absence: { kind: cell.verdict, reason: reasonFromBasis(cell.basis) },
      sourceVintage: vintageFromBasis(cell.basis) ?? undefined,
    };
  }
  const percent = asNullableNumber(cell.value);
  if (percent === null) return undefined;
  return {
    state: "present",
    source: "parcel_record",
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

/**
 * Compose the wire patch for every rail this lane converts, gated strictly
 * on `serve === "record"` (never `legacy-transitional`, never `refused`
 * without the rail's own honest-refusal shape). Returns the patch AND the
 * per-rail `{serve, atomBacked}` map for every rail this lane looked at, so
 * the caller can attach it as an additive, non-breaking field (P-167's
 * vocabulary is not yet landed — see dispatch item 1).
 */
export function composeRecordPatch(record: ParcelRecordResponse): {
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
    const fact = composeCityLimits(placeKey, cityLimits);
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
