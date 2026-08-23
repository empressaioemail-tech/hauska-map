/**
 * When atom-chain serve withholds depth-warm envelope geojson but live setbacks
 * are present (#188 preferLiveOverWarm), re-derive geometry via the live
 * buildable-envelope POST — no rebake.
 */

import type { BakedFacetPayload } from "./baked-facets.js";
import { fetchBuildableEnvelope } from "./buildable-envelope.js";
import { ringsFromGeoJson } from "./parcel-geometry.js";

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** True when facets carry setbacks but no inset polygon (live-over-warm withhold). */
export function facetsNeedLiveEnvelopeDerive(facets: BakedFacetPayload): boolean {
  const env = facets.envelope;
  if (!env || env.status !== "ok") return false;
  const s = env.setbacks;
  if (!s) return false;
  const hasSetback =
    num(s.front_ft) != null ||
    num(s.side_ft) != null ||
    num(s.rear_ft) != null ||
    num(s.side_interior_ft) != null ||
    num(s.side_corner_ft) != null;
  if (!hasSetback) return false;
  if (ringsFromGeoJson(env.geojson).length > 0) return false;
  const disclosure = str(env.disclosure) ?? "";
  return (
    disclosure.includes("withheld") ||
    disclosure.includes("re-derive") ||
    disclosure.includes("geometry absent")
  );
}

export async function augmentFacetsWithLiveEnvelope(
  facets: BakedFacetPayload,
  situsAddress: string | null,
  cortexBase: string,
  fetchImpl: typeof fetch = fetch,
  expectedParcelNodeId?: string | null,
): Promise<BakedFacetPayload> {
  if (!facetsNeedLiveEnvelopeDerive(facets)) return facets;
  const address = str(situsAddress);
  if (!address) return facets;

  try {
    const live = await fetchBuildableEnvelope(
      { address },
      cortexBase,
      fetchImpl,
    );
    if (!live.ok || !live.geometry) return facets;
    const envNodeId = str(live.parcelNodeId);
    if (
      expectedParcelNodeId &&
      envNodeId &&
      envNodeId !== expectedParcelNodeId
    ) {
      return facets;
    }

    const env = facets.envelope!;
    const geojson = {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          properties: { kind: "buildable-envelope", source: "live-derive" },
          geometry: live.geometry,
        },
      ],
    };

    return {
      ...facets,
      envelope: {
        ...env,
        geojson,
        buildableAreaSqFt:
          num(live.summary?.buildableAreaSqFt) ?? env.buildableAreaSqFt,
        buildableAreaPct:
          num(live.summary?.buildableAreaPct) ?? env.buildableAreaPct,
        disclosure:
          str(live.disclosure) ??
          "Live buildable envelope re-derived from atom-chain setbacks.",
      },
    };
  } catch {
    return facets;
  }
}
