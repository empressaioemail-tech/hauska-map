/**
 * Bastrop city per-parcel setback record — live fetch, vendored into PE.
 *
 * Mirrors hauska-engine's
 * `packages/adapters/src/local/setbacks/bastrop-per-parcel-record.ts`
 * (`fetchBastropPerParcelSetbackRecord` / `resolveBastropLayer23DominantRow` /
 * `parseSideSetbackText`) without pulling in engine-core or adapters, same
 * pattern as `pe-opportunity-zone-core.ts`'s direct CDFI/Census fetch — a
 * plain `fetch` call against the public ArcGIS FeatureServer, no privileged
 * relationship required, injectable fetchImpl/signal for tests.
 *
 * Trimmed relative to Engine's version: returns only the four codified
 * scalars PE's CodifiedSetbackScalars carries (front/rear/side/side-corner).
 * Engine's richer disclosure metadata (min lot size, fire-code city language,
 * split-zone minor-zone disclosure, layer-83 second-source conflict) is not
 * reproduced here — PE's codified-setback type has no slot for it today. If
 * PE's card grows one, port `SetbackDisplayMeta` next rather than re-deriving
 * it from scratch, per B3-GEOMGAP precedent of not letting a second
 * independently-written copy of ordinance parsing drift from the proven one.
 */

/** Layer 23 — per-parcel setback numbers + Ordinance_Link. Public endpoint. */
export const BASTROP_PARCELS_ONE_CLICK_LAYER_23 =
  "https://services7.arcgis.com/qOeXJdBtGknaCJC4/arcgis/rest/services/Parcels_One_Click/FeatureServer/23";

/** Numeric `ZoneTypeClass` on layer 23 → BDC district code (matches Engine's table). */
const BASTROP_ZONE_TYPE_CLASS: Readonly<Record<number, string>> = {
  1: "P/OS",
  2: "RR",
  3: "SF-1",
  4: "SF-2",
  5: "SF-3",
  6: "MU",
  7: "GC",
  8: "PI",
  9: "IND",
  10: "PDD",
};

const ZONE_TYPE_CLASS_BY_CODE: Readonly<Record<string, number>> = Object.fromEntries(
  Object.entries(BASTROP_ZONE_TYPE_CLASS).map(([n, code]) => [code, Number(n)]),
);

export type BastropPerParcelSetbackScalars = {
  front_ft: number;
  rear_ft: number;
  side_ft: number;
  side_corner_ft: number;
};

export type BastropPerParcelResult =
  | { kind: "ok"; scalars: BastropPerParcelSetbackScalars }
  | { kind: "decline"; code: string; reason: string };

type RawFeature = { attributes: Record<string, unknown> };

function zoneTypeClassNumeric(attrs: Record<string, unknown>): number | null {
  const raw = attrs.ZoneTypeClass ?? attrs.ZONETYPECLASS ?? attrs.zone_type_class;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    const n = Number(raw.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function featureShapeArea(attrs: Record<string, unknown>): number {
  const raw = attrs.Shape__Area ?? attrs.SHAPE__Area ?? 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/** A split-zone sliver at/below this area (sq units) never governs the district (matches Engine's R26 epsilon). */
const SPLIT_ZONE_SLIVER_AREA_EPSILON = 1;

/**
 * R26 — split-zone dominant-area resolution: the largest-area layer-23 row
 * governs, not the engine zoning stamp (which may be a sliver). districtCode
 * only breaks ties among rows of equal area.
 */
function resolveDominantRow(
  features: ReadonlyArray<RawFeature>,
  districtCode?: string | null,
): Record<string, unknown> | null {
  if (features.length === 0) return null;
  const byArea = [...features].sort(
    (a, b) => featureShapeArea(b.attributes) - featureShapeArea(a.attributes),
  );
  const topArea = featureShapeArea(byArea[0]!.attributes);
  const wanted = (districtCode ?? "").trim().toUpperCase();
  const wantedNum = wanted ? ZONE_TYPE_CLASS_BY_CODE[wanted] : undefined;
  let dominant = byArea[0]!;
  if (wantedNum != null) {
    const tiedStamp = byArea.find(
      (f) =>
        featureShapeArea(f.attributes) >= topArea - SPLIT_ZONE_SLIVER_AREA_EPSILON &&
        zoneTypeClassNumeric(f.attributes) === wantedNum,
    );
    if (tiedStamp) dominant = tiedStamp;
  }
  return dominant.attributes;
}

function pickString(attrs: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = attrs[key];
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function pickPropId(attrs: Record<string, unknown>): string {
  const raw = attrs.prop_id ?? attrs.PROP_ID ?? attrs.Prop_ID;
  if (raw === undefined || raw === null) return "";
  return String(raw).trim();
}

const FEET_NUMBER_RE = /([\d.]+)\s*(?:'|ft\b)?/i;
const CORNER_SIDE_RE = /\(Corner Side Street Setback:\s*([\d.]+)\s*ft\)/i;
const NON_SCALAR_SIDE_RE = /(?:none\s*-\s*)?reference building code\/fire code/i;

/** R22 — fire-code standard applied when the city record defers a side yard to building/fire code. */
const FIRE_CODE_SIDE_SETBACK_FT = 5;

function parseScalarSetbackFeet(text: string | null | undefined): number | null {
  if (text == null) return null;
  const trimmed = String(text).trim();
  if (!trimmed) return null;
  const m = FEET_NUMBER_RE.exec(trimmed);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

type ParsedSideSetback =
  | { ok: true; sideInteriorFt: number; sideCornerFt: number }
  | { ok: false; reason: string };

/**
 * Parse SideSetback text: interior feet + optional corner embed. A
 * building/fire-code deferral resolves to the 5ft standard (matches Engine's
 * R22) rather than a whole-parcel decline; genuinely unparseable/empty side
 * text still honest-declines.
 */
function parseSideSetbackText(text: string | null | undefined): ParsedSideSetback {
  if (text == null || !String(text).trim()) {
    return { ok: false, reason: "SideSetback field empty." };
  }
  const raw = String(text).trim();
  if (NON_SCALAR_SIDE_RE.test(raw)) {
    return {
      ok: true,
      sideInteriorFt: FIRE_CODE_SIDE_SETBACK_FT,
      sideCornerFt: FIRE_CODE_SIDE_SETBACK_FT,
    };
  }
  const cornerMatch = CORNER_SIDE_RE.exec(raw);
  const cornerFt = cornerMatch ? Number(cornerMatch[1]) : null;
  const interiorSource = cornerMatch ? raw.slice(0, cornerMatch.index).trim() : raw;
  const interiorFt = parseScalarSetbackFeet(interiorSource);
  if (interiorFt == null) {
    return { ok: false, reason: `Could not parse interior side feet from "${raw}".` };
  }
  const resolvedCorner = cornerFt != null && Number.isFinite(cornerFt) ? cornerFt : interiorFt;
  return { ok: true, sideInteriorFt: interiorFt, sideCornerFt: resolvedCorner };
}

function parseAttributes(attrs: Record<string, unknown>): BastropPerParcelResult {
  const frontRaw = pickString(attrs, "FrontSetback_", "FrontSetback");
  const rearRaw = pickString(attrs, "RearSetback_", "RearSetback");
  const sideRaw = pickString(attrs, "SideSetback", "SideSetback_");

  const frontFt = parseScalarSetbackFeet(frontRaw);
  const rearFt = parseScalarSetbackFeet(rearRaw);
  if (frontFt == null || rearFt == null) {
    return {
      kind: "decline",
      code: "bastrop-per-parcel-incomplete-scalars",
      reason: "Front or rear setback missing or non-numeric on layer 23.",
    };
  }

  const sideParsed = parseSideSetbackText(sideRaw);
  if (!sideParsed.ok) {
    return {
      kind: "decline",
      code: "bastrop-per-parcel-nonscalar-side",
      reason: sideParsed.reason,
    };
  }

  return {
    kind: "ok",
    scalars: {
      front_ft: frontFt,
      rear_ft: rearFt,
      side_ft: sideParsed.sideInteriorFt,
      side_corner_ft: sideParsed.sideCornerFt,
    },
  };
}

export type FetchBastropPerParcelSetbackOptions = {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  /** ENGINE zoning stamp — selects the correct layer-23 row on split-zone overlaps. */
  districtCode?: string | null;
};

/** Live fetch layer 23 by prop_id (numeric; leading zeros stripped for match). */
export async function fetchBastropPerParcelSetback(
  propId: string,
  options: FetchBastropPerParcelSetbackOptions = {},
): Promise<BastropPerParcelResult> {
  const normalized = String(propId).trim().replace(/^0+/, "") || "0";
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) {
    return {
      kind: "decline",
      code: "bastrop-per-parcel-invalid-prop-id",
      reason: `Invalid prop_id "${propId}".`,
    };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const params = new URLSearchParams({
    where: `prop_id = ${numeric}`,
    outFields: "prop_id,ZoneTypeClass,FrontSetback_,FrontSetback,SideSetback,SideSetback_,RearSetback_,RearSetback,Shape__Area",
    returnGeometry: "false",
    f: "json",
  });
  const url = `${BASTROP_PARCELS_ONE_CLICK_LAYER_23}/query?${params.toString()}`;

  let body: { features?: RawFeature[] };
  try {
    const res = await fetchImpl(url, { signal: options.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        kind: "decline",
        code: "bastrop-per-parcel-fetch-failed",
        reason: `Bastrop layer 23 query failed (${res.status}): ${text.slice(0, 200)}`,
      };
    }
    body = await res.json();
  } catch (err) {
    return {
      kind: "decline",
      code: "bastrop-per-parcel-fetch-failed",
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  const features = body.features ?? [];
  if (features.length === 0) {
    return {
      kind: "decline",
      code: "bastrop-per-parcel-not-found",
      reason: `No layer-23 row for prop_id=${normalized}.`,
    };
  }

  const dominant = resolveDominantRow(features, options.districtCode);
  if (!dominant) {
    return {
      kind: "decline",
      code: "bastrop-per-parcel-empty-features",
      reason: `Layer 23 returned no usable attributes for prop_id=${normalized}.`,
    };
  }
  if (!pickPropId(dominant)) {
    return {
      kind: "decline",
      code: "bastrop-per-parcel-missing-prop-id",
      reason: "Layer 23 feature missing prop_id.",
    };
  }
  return parseAttributes(dominant);
}
