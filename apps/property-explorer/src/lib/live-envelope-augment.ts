/**

 * Re-derive envelope geometry via the live buildable-envelope POST (labelEdges+derive).

 * Facets carry setback scalars only; geometry is never trusted from depth-warm atoms.

 */



import type { BakedFacetPayload } from "./baked-facets.js";

import {

  fetchBuildableEnvelope,

  type BuildableEnvelopeResult,

} from "./buildable-envelope.js";



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



/** One live POST for derive when situs/nav or map seed coords are available. */

export async function fetchLiveEnvelopeDerive(

  input: LiveEnvelopeDeriveInput,

): Promise<BuildableEnvelopeResult | null> {

  if (!facetsNeedLiveEnvelopeDerive(input.facets)) return null;



  const address =

    resolveDeriveAddress(input) ?? str(input.situsAddress);

  const lat = input.lat ?? null;

  const lng = input.lng ?? null;



  if (!address && (lat == null || lng == null)) return null;



  try {

    const coords =

      lat != null && lng != null ? { lat, lng } : ({} as { lat?: number; lng?: number });

    let live = await fetchBuildableEnvelope(

      {

        address: address ?? undefined,

        lat: coords.lat,

        lng: coords.lng,

      },

      input.cortexBase,

      input.fetchImpl ?? fetch,

    );

    // Navigation addresses can geocode_miss while the map click already holds

    // the rooftop point — retry coords-only and keep only a matching parcel.

    if (

      (!live.ok || !live.geometry) &&

      live.status !== "no-buildable-area" &&

      coords.lat != null &&

      coords.lng != null &&

      input.parcelNodeId

    ) {

      const retry = await fetchBuildableEnvelope(

        { lat: coords.lat, lng: coords.lng },

        input.cortexBase,

        input.fetchImpl ?? fetch,

      );

      if (

        (retry.ok || retry.status === "no-buildable-area") &&

        str(retry.parcelNodeId) === input.parcelNodeId

      ) {

        live = retry;

      }

    }

    return live;

  } catch {

    return null;

  }

}



/** Merge a live derive response into facet envelope fields (geometry or consumed). */

export function applyLiveDeriveToFacets(

  facets: BakedFacetPayload,

  live: BuildableEnvelopeResult,

  expectedParcelNodeId?: string | null,

): BakedFacetPayload {

  if (!facetsNeedLiveEnvelopeDerive(facets)) return facets;



  const envNodeId = str(live.parcelNodeId);

  if (

    expectedParcelNodeId &&

    envNodeId &&

    envNodeId !== expectedParcelNodeId

  ) {

    return facets;

  }



  const env = facets.envelope!;



  if (live.status === "no-buildable-area") {

    return {

      ...facets,

      envelope: {

        ...env,

        status: "no-buildable-area",

        geojson: undefined,

        buildableAreaSqFt: 0,

        buildableAreaPct: 0,

        emptyReason:

          str(live.reason) ??

          "Setbacks consume the lot — no buildable area remains.",

        disclosure:

          str(live.disclosure) ??

          str(live.reason) ??

          "Buildable envelope from live derive; setbacks consume the lot.",

      },

    };

  }



  if (!live.ok || !live.geometry) return facets;



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

      status: "ok",

      geojson,

      buildableAreaSqFt:

        num(live.summary?.buildableAreaSqFt as number | undefined) ??

        env.buildableAreaSqFt,

      buildableAreaPct:

        num(live.summary?.buildableAreaPct as number | undefined) ??

        env.buildableAreaPct,

      disclosure:

        str(live.disclosure) ??

        "Buildable envelope from live derive (labelEdges+derive); map/export parity.",

    },

  };

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

    /** When supplied, skip the POST and merge this result (P-60 single derive). */

    prefetchedLive?: BuildableEnvelopeResult | null;

  },

): Promise<BakedFacetPayload> {

  if (!facetsNeedLiveEnvelopeDerive(facets)) return facets;



  const live =

    options?.prefetchedLive !== undefined

      ? options.prefetchedLive

      : await fetchLiveEnvelopeDerive({

          facets,

          parcelNodeId: expectedParcelNodeId ?? "",

          situsAddress: situsOrNavAddress,

          navigationAddress: options?.navigationAddress ?? null,

          cortexBase,

          fetchImpl,

          lat: options?.lat,

          lng: options?.lng,

        });



  if (!live) return facets;

  return applyLiveDeriveToFacets(facets, live, expectedParcelNodeId);

}


