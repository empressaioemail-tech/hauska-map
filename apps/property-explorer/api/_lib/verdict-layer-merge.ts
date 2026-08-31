// api/_lib/verdict-layer-merge.ts — copy cortex P-63 verdict fields onto PE facets (P-63 Track B CP2).

import type { PeBakedFacetPayload, PeBakedFacetsResponse } from "./atom-chain-to-facets.js";

type LayerAbsenceVerdict = "absent-verified" | "lookup-failed" | "not-applicable";

type LayerAbsenceWire = {
  status: "absent";
  verdict: LayerAbsenceVerdict;
  authority: string;
  scopeSearched: string;
  asOf: string;
  basis: string;
  provenanceClass?: string;
};

type LayerWire<T> =
  | { status: "populated"; value: T }
  | LayerAbsenceWire;

function layerAbsenceFromRecord(value: unknown): LayerAbsenceWire | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  if (o.status !== "absent" || typeof o.verdict !== "string") return null;
  if (
    typeof o.authority !== "string" ||
    typeof o.scopeSearched !== "string" ||
    typeof o.asOf !== "string" ||
    typeof o.basis !== "string"
  ) {
    return null;
  }
  const verdict = o.verdict;
  if (
    verdict !== "absent-verified" &&
    verdict !== "lookup-failed" &&
    verdict !== "not-applicable"
  ) {
    return null;
  }
  return {
    status: "absent",
    verdict,
    authority: o.authority,
    scopeSearched: o.scopeSearched,
    asOf: o.asOf,
    basis: o.basis,
    provenanceClass:
      typeof o.provenanceClass === "string" ? o.provenanceClass : undefined,
    subjectKind:
      o.subjectKind === "intensional" ? "intensional" : o.subjectKind === "extensional" ? "extensional" : undefined,
    chainAnchoring:
      o.chainAnchoring === "contemporaneous"
        ? "contemporaneous"
        : o.chainAnchoring === "backfill"
          ? "backfill"
          : undefined,
    serveLayer: typeof o.serveLayer === "string" ? o.serveLayer : undefined,
    entityType: typeof o.entityType === "string" ? o.entityType : undefined,
  };
}

function structuralFactToLivingAreaWire(fact: unknown): LayerWire<number> | null {
  if (!fact || typeof fact !== "object" || Array.isArray(fact)) return null;
  const o = fact as Record<string, unknown>;
  if (o.state === "present") {
    const sqft = o.livingAreaSqft;
    if (typeof sqft === "number" && Number.isFinite(sqft) && sqft > 0) {
      return { status: "populated", value: sqft };
    }
    return null;
  }
  return layerAbsenceFromRecord(fact);
}

function structuralFactToYearBuiltWire(fact: unknown): LayerWire<number> | null {
  if (!fact || typeof fact !== "object" || Array.isArray(fact)) return null;
  const o = fact as Record<string, unknown>;
  if (o.state === "present") {
    const year = o.yearBuilt;
    if (typeof year === "number" && Number.isFinite(year)) {
      return { status: "populated", value: year };
    }
    return null;
  }
  return null;
}

function structuralFactYearBuiltSource(fact: unknown): string | null {
  if (!fact || typeof fact !== "object" || Array.isArray(fact)) return null;
  const o = fact as Record<string, unknown>;
  if (o.state !== "present") return null;
  const year = o.yearBuilt;
  if (typeof year !== "number" || !Number.isFinite(year)) return null;
  if (typeof o.source === "string" && o.source.trim()) return o.source.trim();
  return "cad_property";
}

function bakedZoningHasDistrict(zoning: PeBakedFacetPayload["zoning"]): boolean {
  if (!zoning || typeof zoning !== "object" || Array.isArray(zoning)) return false;
  if ("status" in zoning && zoning.status === "absent") return false;
  const district = (zoning as { district?: unknown }).district;
  return typeof district === "string" && district.trim().length > 0;
}

/** Cortex JSON ROOT only — never invents verdicts. */
export function verdictLayersFromCortexRoot(bakedBody: unknown): {
  livingAreaSqft?: LayerWire<number> | null;
  yearBuilt?: LayerWire<number> | null;
  yearBuiltSource?: string | null;
  zoning?: LayerAbsenceWire | null;
  structuralCoverage?: boolean;
} {
  if (!bakedBody || typeof bakedBody !== "object" || Array.isArray(bakedBody)) {
    return {};
  }
  const root = bakedBody as {
    structuralFact?: unknown;
    landUseFact?: unknown;
    facets?: { zoning?: PeBakedFacetPayload["zoning"] };
  };
  const livingAreaSqft = structuralFactToLivingAreaWire(root.structuralFact);
  const yearBuilt = structuralFactToYearBuiltWire(root.structuralFact);
  const yearBuiltSource = structuralFactYearBuiltSource(root.structuralFact);
  const landAbsence = layerAbsenceFromRecord(root.landUseFact);
  const zoning =
    landAbsence?.verdict === "not-applicable" &&
    !bakedZoningHasDistrict(root.facets?.zoning ?? null)
      ? landAbsence
      : null;
  return {
    livingAreaSqft: livingAreaSqft ?? undefined,
    yearBuilt: yearBuilt ?? undefined,
    yearBuiltSource: yearBuiltSource ?? undefined,
    zoning: zoning ?? undefined,
    structuralCoverage: root.structuralFact != null,
  };
}

export function withVerdictLayerFields(
  response: PeBakedFacetsResponse,
  bakedBody: unknown,
): PeBakedFacetsResponse {
  const layers = verdictLayersFromCortexRoot(bakedBody);
  if (
    layers.livingAreaSqft === undefined &&
    layers.yearBuilt === undefined &&
    layers.zoning === undefined &&
    !layers.structuralCoverage
  ) {
    return response;
  }
  const facets = { ...response.facets };
  const cov = { ...(facets.facetCoverage ?? {}) };
  if (layers.structuralCoverage) {
    cov.structural = true;
  }
  if (layers.livingAreaSqft !== undefined) {
    facets.livingAreaSqft = layers.livingAreaSqft;
  }
  if (layers.yearBuilt !== undefined) {
    facets.yearBuilt = layers.yearBuilt;
  }
  if (layers.yearBuiltSource !== undefined) {
    facets.yearBuiltSource = layers.yearBuiltSource;
  }
  if (layers.zoning !== undefined) {
    facets.zoning = layers.zoning;
    cov.zoning = false;
  }
  facets.facetCoverage = cov;
  return { ...response, facets };
}
