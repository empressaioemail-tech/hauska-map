// Parcel lookup resolve helpers — address OR parcelNodeId → inspect target.
// Reachability gate for the atom-chain inspect card (no full search index).

import type { ParcelCardData } from "../browse/liveGis";
import {
  fetchBakedNodeFacets,
  type BakedFacetsResponse,
} from "./baked-facets";
import {
  fetchBuildableEnvelope,
  parsePlaceKey,
  type BuildableEnvelopeResult,
} from "./buildable-envelope.js";
import { CORTEX_PROXY_BASE, PE_FACETS_PROXY_BASE } from "./config";

/** Stable "{fips}:{propId}" — prop id may include letters (e.g. Williamson R062578). */
const PARCEL_NODE_ID_RE = /^(\d{5}):([A-Za-z0-9_-]+)$/;

export type LookupKind = "parcel-node-id" | "address";

export function classifyLookupQuery(raw: string): { kind: LookupKind; value: string } | null {
  const value = raw.trim();
  if (!value) return null;
  const m = value.match(PARCEL_NODE_ID_RE);
  if (m) return { kind: "parcel-node-id", value: `${m[1]}:${m[2]}` };
  return { kind: "address", value };
}

export function isParcelNodeIdQuery(raw: string): boolean {
  return classifyLookupQuery(raw)?.kind === "parcel-node-id";
}

export interface LookupInspectTarget {
  parcelNodeId: string;
  card: ParcelCardData;
  /** Optional geometry for envelope outline (address path may carry it). */
  geometry?: unknown;
  source: "parcel-node-id" | "address";
}

export type LookupResult =
  | { ok: true; target: LookupInspectTarget }
  | { ok: false; reason: string };

function cardFromFacets(resp: BakedFacetsResponse, parcelNodeId: string): ParcelCardData {
  const f = resp.facets ?? {};
  const base = f.baseFacts ?? {};
  const fips = f.countyFips ?? parcelNodeId.split(":")[0] ?? null;
  const propId = parcelNodeId.split(":")[1] ?? null;
  return {
    apn: base.apn ?? propId,
    situsAddress: base.situsAddress ?? null,
    owner: null,
    landUseDescription: base.landUse?.description ?? base.landUse?.code ?? null,
    county: f.countyName
      ? fips
        ? `${f.countyName} County (${fips})`
        : `${f.countyName} County`
      : fips
        ? `FIPS ${fips}`
        : null,
    provider: f.provenance?.parcelSource ?? resp.source ?? null,
    notSurveyGrade: true,
    retrievedAt: f.bakedAt ?? resp.snapshotAt ?? null,
    lat: null,
    lng: null,
  };
}

function cardFromEnvelope(
  env: BuildableEnvelopeResult,
  parcelNodeId: string,
  address: string,
): ParcelCardData {
  const envRec = env as unknown as Record<string, unknown>;
  const parcelRec =
    env.parcel && typeof env.parcel === "object"
      ? (env.parcel as Record<string, unknown>)
      : null;
  const placeKey =
    typeof envRec.placeKey === "string"
      ? envRec.placeKey
      : typeof parcelRec?.placeKey === "string"
        ? parcelRec.placeKey
        : null;
  const center = parsePlaceKey(placeKey);
  const propId = parcelNodeId.split(":")[1] ?? null;
  const fips = parcelNodeId.split(":")[0] ?? null;
  const summary = (env.summary ?? {}) as Record<string, unknown>;
  const apn =
    typeof summary.apn === "string"
      ? summary.apn
      : typeof (env.parcel as { apn?: unknown } | null | undefined)?.apn === "string"
        ? String((env.parcel as { apn: string }).apn)
        : propId;
  return {
    apn,
    situsAddress: address,
    owner: null,
    landUseDescription: null,
    county: fips ? `FIPS ${fips}` : null,
    provider: "buildable-envelope-resolve",
    notSurveyGrade: env.notSurveyGrade !== false,
    retrievedAt: null,
    lat: center?.lat ?? null,
    lng: center?.lng ?? null,
  };
}

/**
 * Resolve a lookup query to an inspect target.
 * Parcel-node-id path uses the dual-serve facets BFF (atom-chain when flagged).
 * Address path uses allowlisted buildable-envelope resolve (may return parcel
 * even when envelope is declined).
 */
export async function resolveParcelLookup(
  raw: string,
  opts?: {
    facetsBase?: string;
    cortexBase?: string;
    fetchImpl?: typeof fetch;
  },
): Promise<LookupResult> {
  const classified = classifyLookupQuery(raw);
  if (!classified) {
    return { ok: false, reason: "Enter a parcel id (48209:156346) or a street address." };
  }

  const facetsBase = opts?.facetsBase ?? PE_FACETS_PROXY_BASE;
  const cortexBase = opts?.cortexBase ?? CORTEX_PROXY_BASE;
  const fetchImpl = opts?.fetchImpl ?? fetch;

  if (classified.kind === "parcel-node-id") {
    const resp = await fetchBakedNodeFacets(classified.value, facetsBase);
    if (!resp) {
      return {
        ok: false,
        reason: `No parcel found for ${classified.value}.`,
      };
    }
    return {
      ok: true,
      target: {
        parcelNodeId: classified.value,
        card: cardFromFacets(resp, classified.value),
        source: "parcel-node-id",
      },
    };
  }

  const env = await fetchBuildableEnvelope(
    { address: classified.value },
    cortexBase,
    fetchImpl,
  );
  const parcelNodeId =
    typeof env.parcelNodeId === "string" && env.parcelNodeId.trim()
      ? env.parcelNodeId.trim()
      : null;
  if (!parcelNodeId) {
    return {
      ok: false,
      reason:
        env.reason?.trim() ||
        `Address not found or not pinned to a single parcel: ${classified.value}`,
    };
  }

  // Prefer atom/cortex facets card once we have the id (zoning + honest absence).
  const facets = await fetchBakedNodeFacets(parcelNodeId, facetsBase);
  const card = facets
    ? {
        ...cardFromFacets(facets, parcelNodeId),
        situsAddress:
          cardFromFacets(facets, parcelNodeId).situsAddress ?? classified.value,
        lat: cardFromEnvelope(env, parcelNodeId, classified.value).lat,
        lng: cardFromEnvelope(env, parcelNodeId, classified.value).lng,
      }
    : cardFromEnvelope(env, parcelNodeId, classified.value);

  return {
    ok: true,
    target: {
      parcelNodeId,
      card,
      geometry: env.geometry ?? null,
      source: "address",
    },
  };
}

/** Read deep-link query from a URLSearchParams (parcelNodeId | parcel | address). */
export function deepLinkLookupQuery(params: URLSearchParams): string | null {
  const id =
    params.get("parcelNodeId")?.trim() || params.get("parcel")?.trim() || null;
  if (id) return id;
  const address = params.get("address")?.trim();
  return address || null;
}
