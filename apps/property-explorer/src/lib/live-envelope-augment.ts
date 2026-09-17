/**
 * Re-derive envelope geometry via the live buildable-envelope POST (labelEdges+derive).
 * Facets carry setback scalars only; geometry is never trusted from depth-warm atoms.
 *
 * P-91 O1 / ruling B: the fact-sheet headline must NOT consume this path.
 * Live derive is not a buildable-envelope atom. Sheet envelope stays
 * not-derived / atom_path_pending until that atom exists.
 *
 * Reconciliation (boundary-envelope atom program item 2's PE-side counterpart —
 * see doc_repo _decisions/2026-09-06_boundary_envelope_atom_program_scope.md):
 * when the baked facets already carry a real buildable-area number, it came
 * from the property atom chain's own reported outcome (atom-chain-to-facets.ts
 * sets buildableAreaSqFt from envAtom.outcome.areaSqFt only — never from the
 * codified-setback-table / Bastrop-per-parcel scalar supplement, which drives
 * setback dimensions, not area). Live-derive still owns geometry (the atom
 * never carries a shape), but must not silently substitute its own
 * independently-recomputed area for the atom's when the two disagree — the
 * same discipline legacy-design-tools' reconcileAtomEnvelope.ts (#626) applies
 * on its own route. Disagreement is disclosed, never silent.
 */

import type { BakedFacetPayload } from "./baked-facets.js";
import {
  fetchBuildableEnvelope,
  type BuildableEnvelopeResult,
} from "./buildable-envelope.js";
// P-272: the single definition, shared with fact-sheet-resolver.ts,
// baked-facets.ts, buildable-envelope.js and the API's atom-chain-to-facets.ts.
import { isUsableSitusAddress } from "./situs-address";

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/**
 * Duplicated from fact-sheet-resolver.ts's `composedSitusAddress` (P-151) —
 * importing back would be circular (fact-sheet-resolver.ts already imports FROM
 * this module's `facetsNeedLiveEnvelopeDerive`). P-272 moved
 * `isUsableSitusAddress` itself OUT of both files into `./situs-address`, where
 * it is shared with no cycle at all; only this compose helper stays local.
 * situsAddress + city + state, composed ONLY for the outbound live-derive
 * POST — never for what `baseFacts.situsAddress` displays elsewhere.
 */
function composedSitusAddress(facets: BakedFacetPayload): string | null {
  const base = facets.baseFacts ?? {};
  const address = str(base.situsAddress);
  if (!address) return null;
  const addressLower = address.toLowerCase();
  const parts = [address];
  const city = str(base.situsCity);
  if (city && !addressLower.includes(city.toLowerCase())) parts.push(city);
  const state = str(base.situsState);
  if (state && !addressLower.includes(state.toLowerCase())) parts.push(state);
  return parts.join(", ");
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

/**
 * The atom chain's own reported buildable area, read from the baked facets
 * BEFORE any live-derive merge. Null when the bake carried no atom-derived
 * area (e.g. a codified-table/Bastrop-scalar-only supplement on a
 * warm-verify-declined envelope) — nothing to reconcile against, so
 * live-derive's own number stays authoritative exactly as before.
 */
function atomBuildableAreaSqFt(
  env: NonNullable<BakedFacetPayload["envelope"]>,
): number | null {
  return typeof env.buildableAreaSqFt === "number" &&
    Number.isFinite(env.buildableAreaSqFt) &&
    env.buildableAreaSqFt >= 0
    ? env.buildableAreaSqFt
    : null;
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
  if (situs && isUsableSitusAddress(situs)) {
    // Prefer the FULL composed address (situsAddress + city + state) built
    // off the record's own baseFacts when it carries a matching, usable
    // situsAddress (P-151 — Travis stores city separately, and a bare street
    // line alone geocodes poorly). Falls back to the bare `situs` string
    // unchanged when `input.facets` carries no usable baseFacts of its own —
    // e.g. every existing caller of this module today, which passes the
    // address as a plain string without baseFacts attached.
    return composedSitusAddress(input.facets) ?? situs;
  }
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

  const address = resolveDeriveAddress(input) ?? str(input.situsAddress);
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
  if (expectedParcelNodeId && envNodeId && envNodeId !== expectedParcelNodeId) {
    return facets;
  }

  const env = facets.envelope!;
  const atomAreaSqFt = atomBuildableAreaSqFt(env);
  /**
   * P-249 (2026-09-16): the atom-chain adapter marks the unverified
   * `no-buildable-area` branch `figureWithheld` (polygon yes, figure no — the
   * 2026-09-11 R-2 ruling). This module owns the polygon (the atom carries
   * none), so it must NOT re-stamp its own independently-recomputed area onto
   * a payload that declared the figure withheld: that would put a buildable
   * AREA on the wire with no verified atom behind it (A-180).
   */
  const figureWithheld = env.figureWithheld === true;
  const withheldDisclosure = `${str(env.disclosure) ?? "Buildable area withheld — this parcel's buildable-envelope outcome has not passed ground-truth verification."} Envelope outline from live derive (labelEdges+derive), not from a verified atom.`;

  if (live.status === "no-buildable-area") {
    if (atomAreaSqFt != null) {
      // The atom reported a real buildable area but live-derive found none —
      // a real disagreement. The atom (engine source of truth) wins; there is
      // no polygon to draw since live-derive's own gates found none.
      return {
        ...facets,
        envelope: {
          ...env,
          status: "ok",
          geojson: undefined,
          buildableAreaSqFt: atomAreaSqFt,
          disclosure:
            `Buildable area from the property atom chain (engine source of truth): ` +
            `${Math.round(atomAreaSqFt)} sq ft. Local map geometry unavailable for ` +
            `this outcome, area shown without a drawn shape. Approximate: ` +
            `verify with a survey and the city.`,
        },
      };
    }
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
          "Setbacks consume the lot: no buildable area remains.",
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

  const liveAreaSqFt = num(live.summary?.buildableAreaSqFt as number | undefined);
  const liveAgreesWithAtom =
    atomAreaSqFt != null &&
    liveAreaSqFt != null &&
    Math.round(liveAreaSqFt) === Math.round(atomAreaSqFt);

  if (atomAreaSqFt != null && !liveAgreesWithAtom && !figureWithheld) {
    // Real disagreement between the atom's reported area and live-derive's own
    // independently-recomputed one. The atom wins on the number (engine source
    // of truth); live-derive's geometry is still used — the atom carries none.
    return {
      ...facets,
      envelope: {
        ...env,
        status: "ok",
        geojson,
        buildableAreaSqFt: atomAreaSqFt,
        buildableAreaPct: env.buildableAreaPct,
        disclosure:
          `Buildable area from the property atom chain (engine source of truth): ` +
          `${Math.round(atomAreaSqFt)} sq ft. Approximate: verify with a survey and the city.`,
      },
    };
  }

  return {
    ...facets,
    envelope: {
      ...env,
      status: "ok",
      geojson,
      // P-249: a withheld figure stays withheld through the augmentation —
      // geometry is this pass's contribution, the area is not.
      ...(figureWithheld
        ? {}
        : {
            buildableAreaSqFt: liveAreaSqFt ?? env.buildableAreaSqFt,
            buildableAreaPct:
              num(live.summary?.buildableAreaPct as number | undefined) ?? env.buildableAreaPct,
          }),
      disclosure: figureWithheld
        ? withheldDisclosure
        : (str(live.disclosure) ??
          "Buildable envelope from live derive (labelEdges+derive); map/export parity."),
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
