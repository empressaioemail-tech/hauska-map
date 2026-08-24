/**
 * Re-derive envelope geometry via the live buildable-envelope POST (labelEdges+derive).
 * Facets carry setback scalars only; geometry is never trusted from depth-warm atoms.
 */

import type { BakedFacetPayload } from "./baked-facets.js";
import { fetchBuildableEnvelope } from "./buildable-envelope.js";

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** Travis-style sentinels (`, TX`) are not navigation or geocode anchors. */
function isUsableSitusAddress(raw: string | null | undefined): boolean {
  if (!raw || typeof raw !== "string") return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  const street = (trimmed.split(",")[0] ?? "").trim();
  if (!street || !/^\d/.test(street)) return false;
  if (/^,\s*(TX)?\s*$/i.test(trimmed)) return false;
  return true;
}

/** True when facets carry setbacks — geometry must come from live derive. */
export function facetsNeedLiveEnvelopeDerive(facets: BakedFacetPayload): boolean {
  const env = facets.envelope;
  if (!env || env.status !== "ok") return false;
  const s = env.setbacks;
  if (!s) return false;
  return (
    num(s.front_ft) != null ||
    num(s.side_ft) != null ||
    num(s.rear_ft) != null ||
    num(s.side_interior_ft) != null ||
    num(s.side_corner_ft) != null
  );
}

export type LiveEnvelopeDeriveInput = {
  facets: BakedFacetPayload;
  parcelNodeId: string;
  /** CAD situs when usable. */
  situsAddress?: string | null;
  /** Search bar / navigation address when CAD situs is absent (`, TX` class). */
  navigationAddress?: string | null;
  cortexBase: string;
  fetchImpl?: typeof fetch;
  lat?: number | null;
  lng?: number | null;
};

function resolveDeriveAddress(input: LiveEnvelopeDeriveInput): string | null {
  const situs = str(input.situsAddress);
  if (situs && isUsableSitusAddress(situs)) return situs;
  const nav = str(input.navigationAddress);
  if (nav && isUsableSitusAddress(nav)) return nav;
  if (nav && nav.length > 3) return nav;
  return null;
}

export async function augmentFacetsWithLiveEnvelope(
  facets: BakedFacetPayload,
  situsOrNavAddress: string | null,
  cortexBase: string,
  fetchImpl: typeof fetch = fetch,
  expectedParcelNodeId?: string | null,
  options?: {
    navigationAddress?: string | null;
    lat?: number | null;
    lng?: number | null;
  },
): Promise<BakedFacetPayload> {
  if (!facetsNeedLiveEnvelopeDerive(facets)) return facets;

  const address =
    resolveDeriveAddress({
      facets,
      parcelNodeId: expectedParcelNodeId ?? "",
      situsAddress: situsOrNavAddress,
      navigationAddress: options?.navigationAddress ?? null,
      cortexBase,
      fetchImpl,
      lat: options?.lat,
      lng: options?.lng,
    }) ?? str(situsOrNavAddress);

  if (!address && (options?.lat == null || options?.lng == null)) return facets;

  try {
    const coords =
      options?.lat != null && options?.lng != null
        ? { lat: options.lat, lng: options.lng }
        : {};
    let live = await fetchBuildableEnvelope(
      {
        address: address ?? undefined,
        lat: coords.lat,
        lng: coords.lng,
      },
      cortexBase,
      fetchImpl,
    );
    // Navigation addresses can geocode_miss while the map click already holds
    // the rooftop point — retry coords-only and keep only a matching parcel.
    if (
      (!live.ok || !live.geometry) &&
      coords.lat != null &&
      coords.lng != null &&
      expectedParcelNodeId
    ) {
      const retry = await fetchBuildableEnvelope(
        { lat: coords.lat, lng: coords.lng },
        cortexBase,
        fetchImpl,
      );
      if (
        retry.ok &&
        retry.geometry &&
        str(retry.parcelNodeId) === expectedParcelNodeId
      ) {
        live = retry;
      }
    }
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
          "Buildable envelope from live derive (labelEdges+derive); map/export parity.",
      },
    };
  } catch {
    return facets;
  }
}
