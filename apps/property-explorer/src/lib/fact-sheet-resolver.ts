// apps/property-explorer/src/lib/fact-sheet-resolver.ts
//
// THE ONE READ PATH (invariant I1). `resolve(parcelNodeId)` is the only place
// parcel facts are read, and `bySheetId(factSheetId)` is how every export gets
// the SAME sealed sheet back. No export takes a free-text query, an address, or
// a parcel id captured by its own panel.
//
// It replaces the five paths that each answered the same questions separately:
//   - src/lib/baked-facets.ts       deriveBakedCardModel  (inspect card)
//   - src/lib/parcel-lookup.ts      resolveParcelLookup   (search + deep link)
//   - src/lib/buildable-envelope.js fetchBuildableEnvelope(envelope + centring)
//   - src/browse/brief-view-model.ts                      (brief panel)
//   - src/workbench/tools/compare-facts.ts                (compare columns)
// Those five are why one X-ray PDF printed "Zone AO" on sheet 1 and "Flood zone
// AE" on sheet 4, and said "buildable envelope not derived here" on sheet 1
// while sheet 3 drew an envelope and sheet 4 measured it at 6,325 sq ft.
//
// SOURCES, in the order the resolver consults them (all uniform public record,
// all through the same-origin proxy — the browser holds no credential):
//   1. GET  {facets}/…/:parcelNodeId/facets   identity, land use, zoning,
//                                             setbacks, envelope, acreage,
//                                             provenance, and the tier2 sibling
//                                             that carries flood.
//   2. POST {cortex}/…/place/buildable-envelope   the backend's authoritative
//                                             resolution of the parcel to a
//                                             point (its `coord:` placeKey),
//                                             used ONLY as a geometry seed.
//   3. POST {cortex}/…/map-data/gis-layer     a small bbox around that seed,
//                                             from which the parcel's own ring
//                                             is picked by node id, then APN,
//                                             then point containment.
//
// HONESTY: every Fact carries its provenance as a SIBLING of the value (I3), a
// failed lookup is `unresolved` and never an absence (I4), and an
// `absent-uncovered` fact always names what would fill it.

import {
  type Fact,
  type FactSheetResolver,
  type FloodDetermination,
  type FloodZoneShare,
  type ParcelFactSheet,
  type ParcelGeometry,
  type Provenance,
  type Ring,
  type Setbacks,
  type ZoningDistrict,
  composeVerdict,
} from "@hauska/parcel-fact-sheet";
import { fetchBakedNodeFacets, type BakedFacetPayload } from "./baked-facets";
import { fetchBuildableEnvelope, parsePlaceKey } from "./buildable-envelope.js";
import { fetchGeocodeSuggestions } from "./geocodeClient";
import { CORTEX_PROXY_BASE, PE_FACETS_PROXY_BASE } from "./config";
import { isValidParcelNodeId, normalizeParcelNodeId } from "./parcel-node-id";
import {
  acresToSqFt,
  bboxAround,
  buildParcelGeometry,
  ringsContainPoint,
  ringsFromGeoJson,
} from "./parcel-geometry";

/** Bumped whenever the resolver's derivation changes. Part of factSheetId. */
export const RESOLVER_VERSION = "pe-fact-sheet-1";

/** Half-width of the geometry bbox probe, in metres. One suburban block. */
const GEOMETRY_PROBE_METRES = 150;

/**
 * County names for the FIPS the served payload does not name. The FIPS is a
 * substring of every parcel node id, so a sheet that cannot name its county is
 * MALFORMED rather than honestly absent — this is what makes "County name is
 * not on file for this parcel" on a 48021 parcel unrepresentable. Every entry
 * here is already named in this repo's own source (county-fips-viewport.ts,
 * atom-chain-to-facets.ts, the 2026-08-18 QA defect list).
 */
const COUNTY_NAMES: Record<string, string> = {
  "48021": "Bastrop",
  "48027": "Bell",
  "48029": "Bexar",
  "48055": "Caldwell",
  "48209": "Hays",
  "48453": "Travis",
  "48491": "Williamson",
};

export class FactSheetResolveError extends Error {
  readonly kind: "invalid-id" | "not-found" | "unresolved" | "no-geometry";
  readonly retryable: boolean;
  constructor(
    kind: FactSheetResolveError["kind"],
    message: string,
    retryable = false,
  ) {
    super(message);
    this.name = "FactSheetResolveError";
    this.kind = kind;
    this.retryable = retryable;
  }
}

// ---------------------------------------------------------------------------
// factSheetId — a stable content hash. Every rendered artifact prints it, so
// one PDF carrying two different ids is a defect the reader can see.
// ---------------------------------------------------------------------------

/** FNV-1a over a string. Synchronous, dependency-free, stable across runs. */
function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** JSON with object keys sorted, so key order can never move the hash. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const rec = value as Record<string, unknown>;
  const keys = Object.keys(rec).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(rec[k])}`).join(",")}}`;
}

/**
 * Hash over (parcelNodeId, resolverVersion, resolved inputs). `sealedAt` is
 * deliberately NOT an input: two resolves of the same inputs must produce the
 * same id, or the "same parcel, two ids" defect signal is noise.
 */
export function computeFactSheetId(
  parcelNodeId: string,
  resolverVersion: string,
  inputs: unknown,
): string {
  const body = canonical({ parcelNodeId, resolverVersion, inputs });
  // Two independently-seeded passes so a 32-bit collision needs both to clash.
  return `fs_${fnv1a(body)}${fnv1a(`${body}#salt`)}`;
}

// ---------------------------------------------------------------------------
// Small readers.
// ---------------------------------------------------------------------------

function rec(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function provenance(over: Partial<Provenance> & { source: string; sourceLabel: string }): Provenance {
  return {
    vintage: null,
    method: null,
    retrievedAt: null,
    confidence: null,
    confidenceBasis: "asserted",
    sourceUrl: null,
    ...over,
  };
}

function absentCovered<T>(reason: string, prov: Provenance): Fact<T> {
  return { state: "absent-covered", reason, provenance: prov };
}

function absentUncovered<T>(reason: string, wouldBeFilledBy: string): Fact<T> {
  return { state: "absent-uncovered", reason, wouldBeFilledBy };
}

// ---------------------------------------------------------------------------
// Facet mapping.
// ---------------------------------------------------------------------------

function cadProvenance(facets: BakedFacetPayload): Provenance {
  return provenance({
    source: facets.provenance?.parcelSource ?? "cad-roll",
    sourceLabel: facets.countyName
      ? `${facets.countyName} County appraisal roll`
      : "County appraisal roll",
    vintage: facets.provenance?.parcelVintage ?? null,
    retrievedAt: facets.bakedAt ?? null,
  });
}

function identityFacts(facets: BakedFacetPayload, parcelNodeId: string) {
  const prov = cadProvenance(facets);
  const base = facets.baseFacts ?? {};
  const propId = parcelNodeId.split(":")[1] ?? null;

  const apn: Fact<string> = str(base.apn)
    ? { state: "present", value: str(base.apn) as string, provenance: prov }
    : propId
      ? { state: "present", value: propId, provenance: provenance({
          source: "parcel-node-id",
          sourceLabel: "Parcel node id",
          method: "prop-id-substring",
        }) }
      : absentCovered("no APN on the county roll for this parcel", prov);

  // Genuinely absent on a material share of single-family parcels. Absence here
  // is a DATA gap: it must never degrade navigation or block an export.
  const situsAddress: Fact<string> = str(base.situsAddress)
    ? { state: "present", value: str(base.situsAddress) as string, provenance: prov }
    : absentCovered(
        "no situs address on the county roll for this parcel",
        prov,
      );

  // Owner is never served (the bake never wrote it and the endpoint strips it).
  const owner: Fact<string> = absentUncovered(
    "owner is not served on the public tier",
    "the paid owner facet",
  );

  return { apn, situsAddress, owner };
}

function landUseFact(
  facets: BakedFacetPayload,
): Fact<{ code: string; description: string }> {
  const lu = facets.baseFacts?.landUse ?? null;
  const code = str(lu?.code);
  const description = str(lu?.description);
  if (code || description) {
    // I3: provenance is a SIBLING here, never concatenated into the value the
    // way formatLandUseDisplay used to do.
    return {
      state: "present",
      value: { code: code ?? "", description: description ?? code ?? "" },
      provenance: provenance({
        source: str(lu?.source) ?? facets.provenance?.landUseSource ?? "cad-roll",
        sourceLabel: "County land-use classification",
        vintage: str(lu?.vintage) ?? null,
        retrievedAt: facets.bakedAt ?? null,
      }),
    };
  }
  if (facets.provenance?.landUseGateBlocked === true) {
    return absentUncovered(
      "land use is not served for this county",
      "a land-use grant for this county",
    );
  }
  if (facets.facetCoverage?.landUse === true) {
    return absentCovered(
      "no land-use value on record for this parcel",
      cadProvenance(facets),
    );
  }
  return absentUncovered(
    "land use is not stamped for this county",
    "a county land-use ingest",
  );
}

function zoningFact(facets: BakedFacetPayload, countyFips: string): Fact<ZoningDistrict> {
  const declineReason = facets.envelope?.status === "declined"
    ? str(facets.envelope.declineReason)
    : null;

  if (declineReason === "atom_path_pending") {
    // A FAILED / incomplete read shell, not honest absence (the Gate C bounce).
    return {
      state: "unresolved",
      reason: "the zoning atom chain has not resolved yet",
      retryable: true,
    };
  }
  const district = str(facets.zoning?.district);
  if (district) {
    return {
      state: "present",
      value: {
        code: district,
        name: null,
        jurisdiction: str(facets.zoning?.jurisdictionKey) ?? countyFips,
      },
      provenance: provenance({
        source: "zoning-stamp",
        sourceLabel: str(facets.zoning?.jurisdictionKey)
          ? `${facets.zoning?.jurisdictionKey} zoning layer`
          : "Jurisdiction zoning layer",
        retrievedAt: facets.bakedAt ?? null,
      }),
    };
  }
  if (declineReason === "no-zoning-stamp" || declineReason === "zoning-absent") {
    return absentUncovered(
      "this area is not zoned or not stamped",
      `a zoning stamp for ${countyFips}`,
    );
  }
  return absentUncovered(
    "no zoning stamp reaches this parcel",
    `a zoning stamp for ${countyFips}`,
  );
}

function setbacksFact(facets: BakedFacetPayload): Fact<Setbacks> {
  const s = facets.envelope?.setbacks;
  const front = num(s?.front_ft);
  const side = num(s?.side_ft ?? s?.side_interior_ft);
  const rear = num(s?.rear_ft);
  if (s && front != null && side != null && rear != null) {
    const corner = num(s.side_corner_ft);
    return {
      state: "present",
      value: {
        front: { value: front, unit: "ft" },
        side: { value: side, unit: "ft" },
        rear: { value: rear, unit: "ft" },
        cornerSide: corner != null ? { value: corner, unit: "ft" } : null,
      },
      provenance: provenance({
        source: "setback-table",
        sourceLabel: str(facets.envelope?.district)
          ? `Setback table, district ${facets.envelope?.district}`
          : "Jurisdiction setback table",
        retrievedAt: facets.bakedAt ?? null,
        sourceUrl: str(facets.envelope?.citationUrl),
      }),
    };
  }
  if (str(facets.envelope?.declineReason) === "atom_path_pending") {
    return {
      state: "unresolved",
      reason: "the setback rule has not resolved yet",
      retryable: true,
    };
  }
  return absentUncovered(
    "no setback table covers this parcel's district",
    "a ratified setback table for this jurisdiction",
  );
}

/**
 * ONE field, three EXCLUSIVE outcomes. This is what makes it structurally
 * impossible for one document to say "buildable envelope not derived here" and
 * also print 6,325 sq ft.
 */
function envelopeValue(
  facets: BakedFacetPayload,
  setbacks: Fact<Setbacks>,
  lotAreaSqFt: number | null,
): ParcelFactSheet["envelope"] {
  const env = facets.envelope ?? null;
  const setbacksUsed = setbacks.state === "present" ? setbacks.value : null;
  const prov = provenance({
    source: "buildable-envelope",
    sourceLabel: "Modelled buildable envelope",
    method: "setback-inset",
    retrievedAt: facets.bakedAt ?? null,
    confidence: null,
    confidenceBasis: "asserted",
    sourceUrl: str(env?.citationUrl),
  });

  if (!env || env.status === "declined" || !setbacksUsed) {
    const missing: string[] = [];
    if (!setbacksUsed) missing.push("setbacks");
    if (!env || env.status === "declined") missing.push("envelope-derivation");
    return {
      kind: "not-derived",
      reason:
        str(env?.declineReason) ??
        "no buildable envelope was derived for this parcel",
      missing,
    };
  }

  if (env.status === "no-buildable-area") {
    return {
      kind: "consumed",
      reason:
        str(env.emptyReason) ??
        str(env.disclosure) ??
        "setbacks consume the lot — no buildable area remains",
      setbacksUsed,
      provenance: prov,
    };
  }

  const areaSqFt = num(env.buildableAreaSqFt);
  const pct = num(env.buildableAreaPct);
  const rings = ringsFromGeoJson(env.geojson);
  if (areaSqFt == null && pct == null && rings.length === 0) {
    return {
      kind: "not-derived",
      reason: "the envelope resolved with neither an area nor a polygon",
      missing: ["envelope-area"],
    };
  }
  const resolvedArea =
    areaSqFt ??
    (pct != null && lotAreaSqFt != null && Number.isFinite(lotAreaSqFt)
      ? (pct / 100) * lotAreaSqFt
      : Number.NaN);
  const resolvedPct =
    pct ??
    (areaSqFt != null && lotAreaSqFt != null && lotAreaSqFt > 0
      ? (areaSqFt / lotAreaSqFt) * 100
      : Number.NaN);

  return {
    kind: "derived",
    area: { value: resolvedArea, unit: "sqft" },
    areaPctOfLot: resolvedPct,
    rings,
    setbacksUsed,
    // Named blockers only — nothing is silently subtracted.
    subtractions: [],
    // Tier-1 envelopes are shape-only (no roads, no easements): ALWAYS
    // approximate, never survey grade.
    approximate: env.approximate !== false,
    provenance: prov,
  };
}

/**
 * Flood as a SET (I6).
 *
 * FINDING, reported to the planner rather than papered over: the served facet
 * (`tier2.flood`) is still a SCALAR — `{ status, floodZone, zoneSubtype }`. The
 * contract's multiplicity is therefore REPRESENTABLE but not yet POPULATED: a
 * parcel that is genuinely part AE and part AO arrives here as one code, and
 * this resolver widens it to a one-element set with `areaShare: 1` and records
 * `method: "single-zone-from-scalar"` so nobody reads that share as measured.
 * When a multi-zone source lands, no surface needs to change.
 */
function floodFact(tier2: unknown): Fact<FloodDetermination> {
  const flood = rec(rec(tier2)?.flood);
  const status = flood ? str(flood.status) : null;
  const prov = provenance({
    source: str(rec(flood?.provenance)?.source) ?? "fema-nfhl",
    sourceLabel: "FEMA National Flood Hazard Layer",
    vintage: str(rec(flood?.provenance)?.vintage),
    method: "single-zone-from-scalar",
    sourceUrl: str(rec(flood?.provenance)?.url),
  });

  if (!flood || !status) {
    return absentUncovered(
      "no flood determination is served for this parcel",
      "a FEMA NFHL determination for this county",
    );
  }
  if (status === "unavailable") {
    return absentCovered(
      "FEMA mapping covers this area but returned no determination for this parcel",
      prov,
    );
  }

  const zoneCode = str(flood.floodZone);
  const subtype = str(flood.zoneSubtype);
  const inSfha = status === "in-sfha";

  // An explicit zone SET on the wire wins over the scalar the moment one lands.
  const wireZones = Array.isArray(flood.zones) ? flood.zones : null;
  const zones: FloodZoneShare[] = wireZones
    ? wireZones
        .map((z) => {
          const r = rec(z);
          const code = str(r?.zone);
          if (!code) return null;
          return {
            zone: code,
            subtype: str(r?.subtype),
            isSfha: r?.isSfha === true,
            areaShare: num(r?.areaShare) ?? 0,
          } satisfies FloodZoneShare;
        })
        .filter((z): z is FloodZoneShare => z !== null)
        .sort((a, b) => b.areaShare - a.areaShare)
    : zoneCode
      ? [{ zone: zoneCode, subtype, isSfha: inSfha, areaShare: 1 }]
      : [];

  if (zones.length === 0) {
    if (status === "outside-sfha") {
      return {
        state: "present",
        value: {
          zones: [{ zone: "X", subtype: null, isSfha: false, areaShare: 1 }],
          primaryZone: "X",
          inSfha: false,
          baseFloodElevation: null,
        },
        provenance: prov,
      };
    }
    return absentCovered(
      "FEMA returned a status with no zone code for this parcel",
      prov,
    );
  }

  const bfe = num(flood.baseFloodElevationFt ?? flood.baseFloodElevation);
  return {
    state: "present",
    value: {
      zones,
      primaryZone: zones[0]?.zone ?? null,
      inSfha: inSfha || zones.some((z) => z.isSfha),
      baseFloodElevation: bfe != null ? { value: bfe, unit: "ft" } : null,
    },
    provenance: prov,
  };
}

// ---------------------------------------------------------------------------
// Geometry acquisition.
// ---------------------------------------------------------------------------

interface GisFeature {
  geometry?: unknown;
  properties?: Record<string, unknown> | null;
}

/**
 * Pick THIS parcel's ring out of a bbox query. Node id first (the stable key),
 * then APN, then containment of the seed point. A near-miss is never accepted:
 * returning an adjacent lot's ring is exactly the wrong-target class this whole
 * lane exists to kill.
 */
export function pickParcelRings(
  features: GisFeature[],
  parcelNodeId: string,
  apn: string | null,
  seed: { lat: number; lng: number } | null,
): Ring[] {
  const byNodeId = features.find((f) => {
    const p = f.properties ?? {};
    const raw = p.parcel_node_id ?? p.parcelNodeId;
    return typeof raw === "string" && raw.trim() === parcelNodeId;
  });
  if (byNodeId) return ringsFromGeoJson(byNodeId.geometry);

  if (apn) {
    const byApn = features.find((f) => {
      const raw = (f.properties ?? {}).apn;
      return typeof raw === "string" && raw.trim() === apn;
    });
    if (byApn) return ringsFromGeoJson(byApn.geometry);
  }

  if (seed) {
    for (const f of features) {
      const rings = ringsFromGeoJson(f.geometry);
      if (rings.length && ringsContainPoint(rings, seed)) return rings;
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// The resolver.
// ---------------------------------------------------------------------------

/**
 * A geometry SEED a caller already holds. The map-click paths carry the
 * parcel's own ring (live-GIS) or at least its coordinates, and handing that
 * over means the resolver does not have to re-derive what the click already
 * knew. Purely an optimisation and a robustness belt: a hint is only ever used
 * for a parcel that has not resolved yet, and the ring probe still runs.
 */
export interface GeometrySeedHint {
  centroid?: { lat: number; lng: number } | null;
  /** GeoJSON geometry, Feature, or FeatureCollection. */
  geometry?: unknown;
}

export interface FactSheetResolverOptions {
  facetsBase?: string;
  cortexBase?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export class PeFactSheetResolver implements FactSheetResolver {
  private readonly facetsBase: string;
  private readonly cortexBase: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private readonly byParcel = new Map<string, Promise<ParcelFactSheet>>();
  private readonly bySheet = new Map<string, ParcelFactSheet>();
  private readonly seeds = new Map<string, GeometrySeedHint>();

  constructor(opts: FactSheetResolverOptions = {}) {
    this.facetsBase = opts.facetsBase ?? PE_FACETS_PROXY_BASE;
    this.cortexBase = opts.cortexBase ?? CORTEX_PROXY_BASE;
    this.fetchImpl = opts.fetchImpl ?? ((...args) => fetch(...args));
    this.now = opts.now ?? (() => new Date());
  }

  /** ONE resolve per parcel. Repeat calls return the SAME sealed sheet. */
  resolve(parcelNodeId: string): Promise<ParcelFactSheet> {
    const id = normalizeParcelNodeId(parcelNodeId);
    if (!id || !isValidParcelNodeId(id)) {
      return Promise.reject(
        new FactSheetResolveError(
          "invalid-id",
          `Not a parcel id: ${parcelNodeId}. Expected {fips}:{propId}, e.g. 48021:36521.`,
        ),
      );
    }
    const cached = this.byParcel.get(id);
    if (cached) return cached;

    const pending = this.resolveUncached(id).catch((err) => {
      // A failed resolve must not poison the cache — the next Find retries.
      this.byParcel.delete(id);
      throw err;
    });
    this.byParcel.set(id, pending);
    return pending;
  }

  /** Exports resolve the SAME sheet by id. They never re-query a parcel. */
  bySheetId(factSheetId: string): Promise<ParcelFactSheet | null> {
    return Promise.resolve(this.bySheet.get(factSheetId) ?? null);
  }

  /**
   * Offer a geometry seed for a parcel that has not resolved yet. Ignored once
   * the parcel is resolved — one resolve per parcel means one geometry, and a
   * later hint must never mutate a sealed sheet.
   */
  hint(parcelNodeId: string, seed: GeometrySeedHint): void {
    const id = normalizeParcelNodeId(parcelNodeId);
    if (!id || this.byParcel.has(id)) return;
    this.seeds.set(id, seed);
  }

  /** Test seam and sign-out hook. */
  clear(): void {
    this.byParcel.clear();
    this.bySheet.clear();
    this.seeds.clear();
  }

  private async resolveUncached(parcelNodeId: string): Promise<ParcelFactSheet> {
    const facetsResult = await fetchBakedNodeFacets(parcelNodeId, this.facetsBase);
    if (facetsResult.kind === "not_found") {
      throw new FactSheetResolveError(
        "not-found",
        `No parcel found for ${parcelNodeId}.`,
      );
    }
    if (facetsResult.kind !== "ok") {
      throw new FactSheetResolveError(
        "unresolved",
        facetsResult.kind === "transient"
          ? `Parcel facts temporarily unreachable for ${parcelNodeId} — retry.`
          : `Could not load parcel ${parcelNodeId}.`,
        facetsResult.kind === "transient",
      );
    }

    const wire = facetsResult.data as unknown as Record<string, unknown>;
    const facets = facetsResult.data.facets ?? {};
    const tier2 = wire.tier2 ?? null;

    const fips = str(facets.countyFips) ?? parcelNodeId.split(":")[0] ?? "";
    const countyName =
      str(facets.countyName) ?? COUNTY_NAMES[fips] ?? `FIPS ${fips}`;

    const identity = identityFacts(facets, parcelNodeId);
    const geometry = await this.resolveGeometry(parcelNodeId, facets, identity);
    const lotAreaSqFt = Number.isFinite(geometry.lotArea.value)
      ? geometry.lotArea.value
      : null;

    const landUse = landUseFact(facets);
    const zoning = zoningFact(facets, fips);
    const setbacks = setbacksFact(facets);
    const envelope = envelopeValue(facets, setbacks, lotAreaSqFt);
    const flood = floodFact(tier2);

    const site: ParcelFactSheet["site"] = {
      elevationRange: null,
      contourInterval: null,
      // Frontage rides the attaching-roads route, which is a separate paid
      // call; naming what would fill it is the honest state (I4).
      frontage: absentUncovered(
        "street frontage has not been derived for this parcel",
        `road-node ingest for ${fips}`,
      ),
    };

    const resolverVersion = RESOLVER_VERSION;
    const factSheetId = computeFactSheetId(parcelNodeId, resolverVersion, {
      identity,
      geometry,
      landUse,
      zoning,
      setbacks,
      envelope,
      flood,
      site,
      county: { fips, name: countyName },
    });

    const sheet: ParcelFactSheet = {
      factSheetId,
      resolverVersion,
      sealedAt: this.now().toISOString(),
      identity: {
        parcelNodeId,
        county: { fips, name: countyName },
        apn: identity.apn,
        situsAddress: identity.situsAddress,
        owner: identity.owner,
      },
      geometry,
      landUse,
      zoning,
      setbacks,
      envelope,
      flood,
      site,
      // Composed ONCE, by the one composer, from the fields above.
      verdict: "",
    };
    sheet.verdict = composeVerdict(sheet);

    this.bySheet.set(factSheetId, sheet);
    return sheet;
  }

  /**
   * I5: geometry is the navigation authority.
   *
   * Seed order: the baked envelope's own polygon, then the backend's
   * authoritative `coord:` placeKey for the situs address. Then the seed is
   * used to pull the parcel's TRUE ring out of the live parcel layer.
   *
   * The situs address is never the centring authority — it is only ever a way
   * to ask the backend for a coordinate when nothing geometric is on hand.
   */
  private async resolveGeometry(
    parcelNodeId: string,
    facets: BakedFacetPayload,
    identity: ReturnType<typeof identityFacts>,
  ): Promise<ParcelGeometry> {
    const acreage = facets.baseFacts?.acreage ?? null;
    const cadAcreageSqFt =
      num(acreage?.sqft) ??
      (num(acreage?.value) != null ? acresToSqFt(num(acreage?.value) as number) : null);
    const apn = identity.apn.state === "present" ? identity.apn.value : null;

    // 0. A seed the caller already held (a live-GIS click carries the ring).
    const hint = this.seeds.get(parcelNodeId) ?? null;
    const hintRings = hint?.geometry ? ringsFromGeoJson(hint.geometry) : [];

    // 1. The baked envelope polygon: real coordinates, already on hand.
    let seedRings = hintRings.length
      ? hintRings
      : ringsFromGeoJson(facets.envelope?.geojson);
    let seed =
      (seedRings.length
        ? (buildParcelGeometry({
            rings: seedRings,
            centroidFallback: null,
            cadAcreageSqFt: null,
          })?.centroid ?? null)
        : null) ?? hint?.centroid ?? null;

    // 2. The backend's authoritative resolution of the situs address to a
    //    point. Best effort — never a lookup failure.
    if (!seed && identity.situsAddress.state === "present") {
      try {
        const env = await fetchBuildableEnvelope(
          { address: identity.situsAddress.value },
          this.cortexBase,
          this.fetchImpl,
        );
        const envNodeId = str(env.parcelNodeId);
        // Only THIS parcel's resolution may seed THIS parcel's geometry.
        if (envNodeId === parcelNodeId) {
          const placeKey =
            str((env as Record<string, unknown>).placeKey) ??
            str(rec(env.parcel)?.placeKey);
          seed = parsePlaceKey(placeKey);
          const envRings = ringsFromGeoJson(env.geometry);
          if (!seedRings.length && envRings.length) seedRings = envRings;
          if (!seed && envRings.length) {
            seed =
              buildParcelGeometry({
                rings: envRings,
                centroidFallback: null,
                cadAcreageSqFt: null,
              })?.centroid ?? null;
          }
        }
      } catch {
        /* honest degrade — the ring probe below simply does not run */
      }
    }

    // 2b. LAST RESORT: geocode the situs address for a CAMERA seed only. This
    //     is the path invariant I5 demotes — it is never parcel data, never the
    //     boundary, and never runs when anything geometric was available. It
    //     stays because removing it outright would regress a parcel whose
    //     envelope declined into "cannot open at all", which is worse than a
    //     coarse centre.
    if (!seed && identity.situsAddress.state === "present") {
      try {
        const hits = await fetchGeocodeSuggestions(
          identity.situsAddress.value,
          null,
          new AbortController().signal,
          { limit: 1, fetchImpl: this.fetchImpl },
        );
        const hit = hits.find((h) => h.lat != null && h.lng != null);
        if (hit?.lat != null && hit.lng != null) {
          seed = { lat: hit.lat, lng: hit.lng };
        }
      } catch {
        /* honest degrade — resolveGeometry throws below if nothing seeded */
      }
    }

    // 3. The parcel's TRUE ring from the live parcel layer around the seed.
    let rings: Ring[] = [];
    if (seed) {
      try {
        const box = bboxAround(seed, GEOMETRY_PROBE_METRES);
        const res = await this.fetchImpl(
          `${this.cortexBase.replace(/\/$/, "")}/brokerage/v1/map-data/gis-layer`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ layer: "parcels", bbox: box }),
          },
        );
        if (res.ok) {
          const body = (await res.json()) as {
            geojson?: { features?: GisFeature[] };
          };
          const features = body?.geojson?.features ?? [];
          rings = pickParcelRings(features, parcelNodeId, apn, seed);
        }
      } catch {
        /* honest degrade — an empty ring list claims nothing about the lot */
      }
    }

    const geometry = buildParcelGeometry({
      rings,
      centroidFallback: seed,
      cadAcreageSqFt,
    });
    if (!geometry) {
      // Geometry is REQUIRED by the contract and nothing served a point. Fail
      // loudly rather than sealing a sheet whose centroid is a guess.
      throw new FactSheetResolveError(
        "no-geometry",
        `No geometry resolved for ${parcelNodeId} — the parcel could not be placed on the map.`,
      );
    }
    return geometry;
  }
}

/** The app's single resolver instance. */
export const factSheetResolver = new PeFactSheetResolver();
