// api/_lib/atom-chain-to-facets.ts
//
// Pure adapter: retrieval-api property atom-chain wire → Property Explorer
// baked-facets shape (facets.zoning / facets.envelope). Never invents a
// district or geometry. Honest-absence (Bexar no-zoning-stamp) maps to the
// same declineReason vocabulary cortex already serves.

export interface AtomChainAbsence {
  kind?: string;
  reason?: string;
}

export interface AtomChainZoningFact {
  district?: string | null;
  absence?: AtomChainAbsence | null;
  fetchedAt?: string;
  extractedAt?: string;
  parcelNodeId?: string;
}

export interface AtomChainSetbackRule {
  front?: number;
  side?: number;
  rear?: number;
  sideCornerFt?: number;
  districtCode?: string | null;
}

export interface AtomChainEnvelopeOutcome {
  kind?: string;
  areaSqFt?: number;
}

export interface AtomChainBuildableEnvelope {
  outcome?: AtomChainEnvelopeOutcome | null;
  geojson?: unknown;
  fetchedAt?: string;
  extractedAt?: string;
}

/** Minimal retrieval GET /property-nodes/:id/atom-chain body. */
export interface PropertyAtomChain {
  parcelNodeId?: string;
  zoningFact?: AtomChainZoningFact | null;
  setbackRule?: AtomChainSetbackRule | null;
  buildableEnvelope?: AtomChainBuildableEnvelope | null;
  atoms?: unknown[] | null;
}

/** Mirrors apps/property-explorer/src/lib/baked-facets.ts BakedFacetPayload. */
export interface PeBakedFacetPayload {
  parcelNodeId?: string;
  countyFips?: string;
  countyName?: string;
  baseFacts?: {
    apn?: string | null;
    situsAddress?: string | null;
    situsCity?: string | null;
    situsState?: string | null;
    landUse?: { code: string; description?: string | null } | null;
    acreage?: { value: number; sqft?: number; method?: string } | null;
  };
  zoning?: { district: string } | null;
  envelope?: {
    status: "ok" | "no-buildable-area" | "declined";
    confidence?: number;
    approximate?: boolean;
    provisional?: boolean;
    declineReason?: string;
    district?: string;
    setbacks?: { front_ft: number; side_ft: number; rear_ft: number };
    buildableAreaPct?: number;
    buildableAreaSqFt?: number;
    disclosure?: string;
    emptyReason?: string;
    citationUrl?: string;
    geojson?: unknown;
  } | null;
  facetCoverage?: {
    baseFacts?: boolean;
    landUse?: boolean;
    acreage?: boolean;
    zoning?: boolean;
    envelope?: boolean;
  };
  provenance?: {
    parcelSource?: string;
    parcelVintage?: string | null;
    landUseSource?: string | null;
    landUseGateBlocked?: boolean;
  };
  bakedAt?: string;
}

export interface PeBakedFacetsResponse {
  parcelNodeId: string;
  adapterKey: string;
  source: "atom-chain";
  snapshotAt: string | null;
  facets: PeBakedFacetPayload;
  readPath: "atom-chain";
}

export function isPropertyAtomPathEnabled(
  env: Record<string, string | undefined> = process.env as Record<
    string,
    string | undefined
  >,
): boolean {
  return env.PROPERTY_ATOM_PATH?.trim() === "1";
}

/**
 * Path shape after spine rewrite strip: property-atoms/:parcelNodeId/facets
 * (path[0] === 'property-atoms').
 */
export function parsePropertyAtomsPath(
  path: string[],
): { parcelNodeId: string } | null {
  if (path[0] !== "property-atoms") return null;
  const parcelNodeId = (path[1] || "").trim();
  const tail = path[2];
  if (!parcelNodeId || parcelNodeId.includes("..")) return null;
  if (tail !== "facets") return null;
  if (path.length !== 3) return null;
  // parcel ids are fips:propId (colon allowed; no slashes).
  if (parcelNodeId.includes("/")) return null;
  return { parcelNodeId };
}

/** True when the chain carries enough signal to serve (including honest absence). */
export function atomChainIsUsable(chain: PropertyAtomChain | null | undefined): boolean {
  if (!chain || typeof chain !== "object") return false;
  if (chain.zoningFact && typeof chain.zoningFact === "object") return true;
  if (Array.isArray(chain.atoms) && chain.atoms.length > 0) return true;
  return false;
}

function countyFipsFromNodeId(parcelNodeId: string): string | undefined {
  const fips = parcelNodeId.split(":")[0]?.trim();
  return fips && /^\d{5}$/.test(fips) ? fips : undefined;
}

function apnFromNodeId(parcelNodeId: string): string | undefined {
  const rest = parcelNodeId.split(":")[1]?.trim();
  return rest || undefined;
}

function mapSetbacks(
  rule: AtomChainSetbackRule | null | undefined,
): { front_ft: number; side_ft: number; rear_ft: number } | undefined {
  if (!rule) return undefined;
  const front = rule.front;
  const side = rule.side;
  const rear = rule.rear;
  if (
    typeof front !== "number" ||
    typeof side !== "number" ||
    typeof rear !== "number"
  ) {
    return undefined;
  }
  return { front_ft: front, side_ft: side, rear_ft: rear };
}

/**
 * Adapt atom-chain → PE facets. Returns null when the chain is empty/unusable
 * so the BFF can fall back to cortex.
 */
export function adaptAtomChainToBakedFacets(
  chain: PropertyAtomChain | null | undefined,
): PeBakedFacetsResponse | null {
  if (!atomChainIsUsable(chain)) return null;
  const c = chain as PropertyAtomChain;
  const parcelNodeId = (c.parcelNodeId || "").trim();
  if (!parcelNodeId) return null;

  const zf = c.zoningFact ?? null;
  const rule = c.setbackRule ?? null;
  const envAtom = c.buildableEnvelope ?? null;
  const absenceKind =
    zf?.absence && typeof zf.absence.kind === "string"
      ? zf.absence.kind.trim()
      : "";
  const absenceReason =
    zf?.absence && typeof zf.absence.reason === "string"
      ? zf.absence.reason
      : undefined;

  // Honest absence: never invent a district (Bexar no-zoning-stamp).
  const hasDistrict =
    !absenceKind && typeof zf?.district === "string" && zf.district.trim().length > 0;
  const district = hasDistrict ? (zf!.district as string).trim() : null;

  const setbacks = mapSetbacks(rule);
  const outcomeKind =
    envAtom?.outcome && typeof envAtom.outcome.kind === "string"
      ? envAtom.outcome.kind
      : null;
  const areaSqFt =
    envAtom?.outcome && typeof envAtom.outcome.areaSqFt === "number"
      ? envAtom.outcome.areaSqFt
      : undefined;
  const geojson = envAtom?.geojson;

  let envelope: PeBakedFacetPayload["envelope"] = null;
  let envelopeCovered = false;

  if (absenceKind === "no-zoning-stamp") {
    // Align with cortex absentZoningHonesty / declineReason vocabulary.
    envelope = {
      status: "declined",
      declineReason: "no-zoning-stamp",
      approximate: true,
      provisional: true,
      disclosure:
        absenceReason ||
        "No zoning stamp on this parcel — honest absence; no district invented.",
    };
    envelopeCovered = false;
  } else if (!hasDistrict) {
    envelope = {
      status: "declined",
      declineReason: absenceKind || "zoning-absent",
      approximate: true,
      provisional: true,
      disclosure: absenceReason,
    };
    envelopeCovered = false;
  } else if (!setbacks) {
    envelope = {
      status: "declined",
      declineReason: "setback-rule-pending",
      district: district ?? undefined,
      approximate: true,
      provisional: true,
      disclosure: "Zoning present; setback-rule atom not yet on chain.",
    };
    envelopeCovered = false;
  } else if (outcomeKind === "no-buildable-area") {
    envelope = {
      status: "no-buildable-area",
      district: district ?? undefined,
      setbacks,
      approximate: true,
      provisional: true,
      emptyReason: "Setbacks consume the lot — no buildable area remains.",
      ...(typeof areaSqFt === "number" ? { buildableAreaSqFt: areaSqFt } : {}),
      ...(geojson !== undefined ? { geojson } : {}),
    };
    envelopeCovered = true;
  } else if (outcomeKind === "buildable" || setbacks) {
    // Proof atoms may omit geojson — honest partial OK; do not fabricate geometry.
    envelope = {
      status: "ok",
      district: district ?? undefined,
      setbacks,
      approximate: true,
      provisional: true,
      disclosure:
        geojson === undefined || geojson === null
          ? "Atom-chain envelope (setbacks present; geometry absent on proof atom — not fabricated)."
          : "Atom-chain buildable envelope.",
      ...(typeof areaSqFt === "number" ? { buildableAreaSqFt: areaSqFt } : {}),
      ...(geojson !== undefined && geojson !== null ? { geojson } : {}),
    };
    envelopeCovered = true;
  }

  const bakedAt =
    envAtom?.extractedAt ||
    envAtom?.fetchedAt ||
    zf?.extractedAt ||
    zf?.fetchedAt ||
    null;

  const apn = apnFromNodeId(parcelNodeId);

  return {
    parcelNodeId,
    adapterKey: "property-atom-chain",
    source: "atom-chain",
    snapshotAt: bakedAt,
    readPath: "atom-chain",
    facets: {
      parcelNodeId,
      countyFips: countyFipsFromNodeId(parcelNodeId),
      baseFacts: apn
        ? {
            apn,
            landUse: null,
            acreage: null,
            situsAddress: null,
          }
        : undefined,
      zoning: district ? { district } : null,
      envelope,
      facetCoverage: {
        baseFacts: !!apn,
        landUse: false,
        acreage: false,
        zoning: !!district,
        envelope: envelopeCovered,
      },
      provenance: {
        parcelSource: "property-atom-chain",
        parcelVintage: null,
        landUseSource: null,
        landUseGateBlocked: false,
      },
      bakedAt: bakedAt ?? undefined,
    },
  };
}
