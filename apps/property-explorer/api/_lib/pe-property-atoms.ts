// api/_lib/pe-property-atoms.ts
//
// Property Explorer inspect-card facets BFF (anti-zombie cut, Master WDLL 3.7):
//   GET /api/spine/property-atoms/:parcelNodeId/facets
//
// PROPERTY_ATOM_PATH=1 → atom-chain only for envelope/zoning product truth.
// When the atom-chain is empty/unusable, optionally merge cortex baseFacts /
// landUse / flood (landUse may remain on cortex temporarily) but NEVER serve
// cortex envelope as product truth — honest atom_path_pending instead.
// Flag unset/0 → cortex-only rollback (envelope still stripped on that path
// for product honesty once dual-serve retires; rollback keeps prior behavior
// for emergency only via ATOM_PATH_CORTEX_ENVELOPE_ROLLBACK=1).
//
// Bearer key stays server-side (never exposed to the browser).

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  adaptAtomChainToBakedFacets,
  atomChainIsUsable,
  floodHazardFactFromCortexRoot,
  isPropertyAtomPathEnabled,
  landUseFactFromCortexRoot,
  mergeBakedBaseFacts,
  pipelineFactFromCortexRoot,
  specialDistrictFactFromCortexRoot,
  wellFactFromCortexRoot,
  buildingFootprintFactFromCortexRoot,
  boundaryEdgeFactFromCortexRoot,
  parsePropertyAtomsPath,
  type PeBakedFacetsResponse,
  type PropertyAtomChain,
  shouldSkipColdDerive,
} from "./atom-chain-to-facets.js";
import {
  echoRequestedParcelNodeId,
  parcelGrammarAlias,
} from "./parcel-node-id.js";

export { parsePropertyAtomsPath, isPropertyAtomPathEnabled, shouldSkipColdDerive };

const DEFAULT_RETRIEVAL =
  "https://hauska-retrieval-api-h7gvu7rgcq-uc.a.run.app";
const DEFAULT_CORTEX = "https://cortex-api-tds7av26va-uc.a.run.app";

export type PeReadPathHeader =
  | "atom-chain"
  | "atom-chain-warm"
  | "atom-pending"
  | "cortex"
  | "cortex-fallback";

function retrievalConfig(): { baseUrl: string; key: string | undefined } {
  const baseUrl = (
    process.env.HAUSKA_RETRIEVAL_API_URL?.trim() ||
    process.env.RETRIEVAL_API_URL?.trim() ||
    DEFAULT_RETRIEVAL
  ).replace(/\/$/, "");
  const key =
    process.env.HAUSKA_RETRIEVAL_API_KEY?.trim() ||
    process.env.RETRIEVAL_API_KEY?.trim();
  return { baseUrl, key };
}

function cortexConfig(): { baseUrl: string; key: string | undefined } {
  const baseUrl = (
    process.env.CORTEX_API_URL?.trim() || DEFAULT_CORTEX
  ).replace(/\/$/, "");
  const key = process.env.CORTEX_SERVICE_API_KEY?.trim();
  return { baseUrl, key };
}

function cortexEnvelopeRollbackEnabled(): boolean {
  return process.env.ATOM_PATH_CORTEX_ENVELOPE_ROLLBACK?.trim() === "1";
}

async function fetchCortexFacets(
  parcelNodeId: string,
): Promise<{ status: number; body: string; contentType: string | null }> {
  const { baseUrl, key } = cortexConfig();
  if (!key) {
    return {
      status: 503,
      body: JSON.stringify({
        error: "proxy not configured",
        missing: "CORTEX_SERVICE_API_KEY",
      }),
      contentType: "application/json",
    };
  }
  const url = `${baseUrl}/api/brokerage/v1/place/node/${encodeURIComponent(
    parcelNodeId,
  )}/facets`;
  const upstream = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
  });
  const text = await upstream.text();
  return {
    status: upstream.status,
    body: text,
    contentType: upstream.headers.get("content-type"),
  };
}

function cortexFloodFactMissing(body: string): boolean {
  try {
    return floodHazardFactFromCortexRoot(JSON.parse(body) as unknown) === undefined;
  } catch {
    return true;
  }
}

function cortexLandUseFactMissing(body: string): boolean {
  try {
    return landUseFactFromCortexRoot(JSON.parse(body) as unknown) === undefined;
  } catch {
    return true;
  }
}

function cortexSpecialDistrictFactMissing(body: string): boolean {
  try {
    return specialDistrictFactFromCortexRoot(JSON.parse(body) as unknown) === undefined;
  } catch {
    return true;
  }
}

function cortexPipelineFactMissing(body: string): boolean {
  try {
    return pipelineFactFromCortexRoot(JSON.parse(body) as unknown) === undefined;
  } catch {
    return true;
  }
}

function cortexWellFactMissing(body: string): boolean {
  try {
    return wellFactFromCortexRoot(JSON.parse(body) as unknown) === undefined;
  } catch {
    return true;
  }
}

function cortexBuildingFootprintFactMissing(body: string): boolean {
  try {
    return (
      buildingFootprintFactFromCortexRoot(JSON.parse(body) as unknown) ===
      undefined
    );
  } catch {
    return true;
  }
}

function cortexBoundaryEdgeFactMissing(body: string): boolean {
  try {
    return (
      boundaryEdgeFactFromCortexRoot(JSON.parse(body) as unknown) === undefined
    );
  } catch {
    return true;
  }
}

/** Missing flood / land-use / special-district / pipeline / well / footprint / boundary — same retry as each field alone. */
function cortexNeedsRootFactAlias(body: string): boolean {
  return (
    cortexFloodFactMissing(body) ||
    cortexLandUseFactMissing(body) ||
    cortexSpecialDistrictFactMissing(body) ||
    cortexPipelineFactMissing(body) ||
    cortexWellFactMissing(body) ||
    cortexBuildingFootprintFactMissing(body) ||
    cortexBoundaryEdgeFactMissing(body)
  );
}

function aliasFillsRootFactGap(
  primary: { status: number; body: string },
  aliasedBody: string,
): boolean {
  if (primary.status === 404) {
    return (
      !cortexFloodFactMissing(aliasedBody) ||
      !cortexLandUseFactMissing(aliasedBody) ||
      !cortexSpecialDistrictFactMissing(aliasedBody) ||
      !cortexPipelineFactMissing(aliasedBody) ||
      !cortexWellFactMissing(aliasedBody) ||
      !cortexBuildingFootprintFactMissing(aliasedBody) ||
      !cortexBoundaryEdgeFactMissing(aliasedBody)
    );
  }
  const floodGain =
    cortexFloodFactMissing(primary.body) && !cortexFloodFactMissing(aliasedBody);
  const landGain =
    cortexLandUseFactMissing(primary.body) && !cortexLandUseFactMissing(aliasedBody);
  const sdGain =
    cortexSpecialDistrictFactMissing(primary.body) &&
    !cortexSpecialDistrictFactMissing(aliasedBody);
  const pipelineGain =
    cortexPipelineFactMissing(primary.body) &&
    !cortexPipelineFactMissing(aliasedBody);
  const wellGain =
    cortexWellFactMissing(primary.body) && !cortexWellFactMissing(aliasedBody);
  const footprintGain =
    cortexBuildingFootprintFactMissing(primary.body) &&
    !cortexBuildingFootprintFactMissing(aliasedBody);
  const boundaryGain =
    cortexBoundaryEdgeFactMissing(primary.body) &&
    !cortexBoundaryEdgeFactMissing(aliasedBody);
  return (
    floodGain ||
    landGain ||
    sdGain ||
    pipelineGain ||
    wellGain ||
    footprintGain ||
    boundaryGain
  );
}

/**
 * Same grammar pair as atom-chain. If the requested key's cortex body has no
 * root floodHazardFact, landUseFact, specialDistrictFact, pipelineFact,
 * wellFact, buildingFootprintFact, or boundaryEdgeFact, try the alias. Never
 * reads tier2.flood. Never adopts cad-roll as landUseFact. Never adopts
 * bake / CAD / mud-pid as specialDistrictFact. Never adopts bake / CAD /
 * texas-rrc GIS as pipelineFact. Never adopts bake / CAD / texas-rrc GIS /
 * tx_rrc_well as wellFact. Never adopts bake / CAD / GIS /
 * tx_building_footprint as buildingFootprintFact. Never adopts bake / CAD /
 * GIS / txgio_parcel / parcel ring as boundaryEdgeFact.
 */
export async function fetchCortexFacetsWithAlias(
  parcelNodeId: string,
): Promise<{ status: number; body: string; contentType: string | null }> {
  const primary = await fetchCortexFacets(parcelNodeId);
  const retryable =
    (primary.status >= 200 &&
      primary.status < 300 &&
      cortexNeedsRootFactAlias(primary.body)) ||
    primary.status === 404;
  if (!retryable) return primary;
  const alias = parcelGrammarAlias(parcelNodeId);
  if (!alias) return primary;
  const aliased = await fetchCortexFacets(alias);
  if (aliased.status < 200 || aliased.status >= 300) return primary;
  if (!aliasFillsRootFactGap(primary, aliased.body)) return primary;
  return aliased;
}

/** Transient upstream failures — NEVER surface these as honest-absence. */
const TRANSIENT_ATOM_CHAIN =
  /unreachable|ECONNRESET|ETIMEDOUT|fetch failed|HTTP 5\d\d|HTTP 429|aborted|network|invalid JSON/i;
const ATOM_CHAIN_ATTEMPTS = 5;
const ATOM_CHAIN_BACKOFF_MS = [400, 900, 1_600, 2_400, 3_200];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isTransientAtomChainReason(reason: string): boolean {
  return TRANSIENT_ATOM_CHAIN.test(reason);
}

/** Auth/config mismatch — never fall back to cortex snapshot (would lie about envelope). */
export function isRetrievalAuthFailure(reason: string): boolean {
  return /^atom-chain HTTP 401$/i.test(reason.trim());
}

export async function fetchAtomChainOnce(
  parcelNodeId: string,
): Promise<{ ok: true; chain: PropertyAtomChain } | { ok: false; reason: string }> {
  const { baseUrl, key } = retrievalConfig();
  if (!key) {
    return { ok: false, reason: "missing HAUSKA_RETRIEVAL_API_KEY|RETRIEVAL_API_KEY" };
  }
  const url = `${baseUrl}/property-nodes/${encodeURIComponent(parcelNodeId)}/atom-chain`;
  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
    });
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
  if (!upstream.ok) {
    return { ok: false, reason: `atom-chain HTTP ${upstream.status}` };
  }
  let body: unknown;
  try {
    body = await upstream.json();
  } catch {
    return { ok: false, reason: "atom-chain invalid JSON" };
  }
  const chain = body as PropertyAtomChain;
  if (!atomChainIsUsable(chain)) {
    // Definitive empty — not a cold-start. Caller may serve honest absence.
    return { ok: false, reason: "atom-chain empty" };
  }
  return { ok: true, chain };
}

/**
 * Retry-until-resolved for cold-start / transient retrieval failures.
 * Definitive outcomes (empty chain, missing key, 4xx other than 429) stop early.
 */
export async function fetchAtomChain(
  parcelNodeId: string,
): Promise<{ ok: true; chain: PropertyAtomChain } | { ok: false; reason: string }> {
  let last: { ok: false; reason: string } = { ok: false, reason: "atom-chain unset" };
  for (let i = 0; i < ATOM_CHAIN_ATTEMPTS; i++) {
    const result = await fetchAtomChainOnce(parcelNodeId);
    if (result.ok) return result;
    last = result;
    if (!isTransientAtomChainReason(result.reason)) return result;
    const wait = ATOM_CHAIN_BACKOFF_MS[i] ?? 3_000;
    await sleep(wait);
  }
  return last;
}

/**
 * Lookup alias: requested key first; if definitive-empty, try the other grammar.
 * Does not alias 401 or transients. Caller echoes REQUESTED parcelNodeId.
 */
export async function fetchAtomChainWithAlias(
  parcelNodeId: string,
): Promise<{ ok: true; chain: PropertyAtomChain } | { ok: false; reason: string }> {
  const primary = await fetchAtomChain(parcelNodeId);
  if (primary.ok) return primary;
  if (
    isTransientAtomChainReason(primary.reason) ||
    isRetrievalAuthFailure(primary.reason)
  ) {
    return primary;
  }
  const alias = parcelGrammarAlias(parcelNodeId);
  if (!alias) return primary;
  const aliased = await fetchAtomChain(alias);
  if (aliased.ok) return aliased;
  return primary;
}

/** Strip cortex envelope / tier2.envelope so zombie multiply cannot be product truth. */
export function stripCortexEnvelopeProductTruth(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const root = body as Record<string, unknown>;
  const facets =
    root.facets && typeof root.facets === "object"
      ? {
          ...(root.facets as Record<string, unknown>),
          envelope: {
            status: "declined",
            declineReason: "atom_path_pending",
            approximate: true,
            provisional: true,
            disclosure:
              "Envelope product path is the property atom chain. Cortex multiply path retired (anti-zombie).",
          },
          facetCoverage: {
            ...((root.facets as Record<string, unknown>).facetCoverage as
              | Record<string, unknown>
              | undefined),
            envelope: false,
          },
        }
      : root.facets;
  const tier2 =
    root.tier2 && typeof root.tier2 === "object"
      ? { ...(root.tier2 as Record<string, unknown>), envelope: null }
      : root.tier2;
  return { ...root, facets, tier2, cortexEnvelopeRetired: true };
}

function honestAtomPendingResponse(parcelNodeId: string): PeBakedFacetsResponse {
  const fips = parcelNodeId.split(":")[0];
  const apn = parcelNodeId.split(":")[1];
  return {
    parcelNodeId,
    adapterKey: "property-atom-chain",
    source: "atom-chain",
    snapshotAt: null,
    readPath: "atom-chain",
    facets: {
      parcelNodeId,
      countyFips: fips && /^\d{5}$/.test(fips) ? fips : undefined,
      baseFacts: apn
        ? { apn, landUse: null, acreage: null, situsAddress: null }
        : undefined,
      zoning: null,
      envelope: {
        status: "declined",
        declineReason: "atom_path_pending",
        approximate: true,
        provisional: true,
        disclosure:
          "No property atom chain for this parcel yet — honest decline (not invented).",
      },
      facetCoverage: {
        baseFacts: !!apn,
        landUse: false,
        acreage: false,
        zoning: false,
        envelope: false,
      },
      provenance: {
        parcelSource: "property-atom-chain",
        parcelVintage: null,
        landUseSource: null,
        landUseGateBlocked: false,
      },
    },
  };
}

export async function handlePropertyAtomsFacets(
  req: VercelRequest,
  res: VercelResponse,
  path: string[],
): Promise<void> {
  const method = req.method || "GET";
  if (method !== "GET" && method !== "HEAD") {
    res.status(403).json({ error: "method not allowed" });
    return;
  }

  const parsed = parsePropertyAtomsPath(path);
  if (!parsed) {
    res.status(400).json({ error: "invalid path" });
    return;
  }
  const { parcelNodeId } = parsed;

  const atomEnabled = isPropertyAtomPathEnabled();

  if (!atomEnabled) {
    try {
      const cortex = await fetchCortexFacetsWithAlias(parcelNodeId);
      res.setHeader("X-PE-Read-Path", "cortex" satisfies PeReadPathHeader);
      if (cortex.contentType) res.setHeader("Content-Type", cortex.contentType);
      else res.setHeader("Content-Type", "application/json");
      if (cortex.status >= 200 && cortex.status < 300 && !cortexEnvelopeRollbackEnabled()) {
        let parsedBody: unknown = cortex.body;
        try {
          parsedBody = JSON.parse(cortex.body);
        } catch {
          parsedBody = cortex.body;
        }
        const stripped = stripCortexEnvelopeProductTruth(parsedBody);
        res.status(cortex.status).json(
          parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody)
            ? echoRequestedParcelNodeId(
                stripped as Record<string, unknown>,
                parcelNodeId,
              )
            : stripped,
        );
        return;
      }
      res.status(cortex.status).send(cortex.body);
    } catch (err) {
      res.status(502).json({
        error: "upstream error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  // Flag ON: atom-chain is the envelope product path. No cortex envelope fallback.
  //
  // The cortex baked-facets read is kicked off IN PARALLEL: on the atom path
  // its BASE FACTS (land-use / acreage / situs / county name) are merged onto
  // the atom-chain response (map UX cluster item 6 — the card previously said
  // "not verified here" for facts cortex serves for ~100% of Bastrop); on the
  // definitive-empty path it remains the stripped-envelope fallback body. One
  // upstream cortex fetch either way — the client still makes ONE request.
  const cortexPromise: Promise<{
    status: number;
    body: string;
    contentType: string | null;
  }> = fetchCortexFacetsWithAlias(parcelNodeId).catch((err) => ({
    status: 0,
    body: err instanceof Error ? err.message : String(err),
    contentType: null,
  }));
  const atom = await fetchAtomChainWithAlias(parcelNodeId);
  if (atom.ok) {
    const adapted = adaptAtomChainToBakedFacets(atom.chain);
    if (adapted) {
      // Merge baked base facts (never zoning/envelope — those stay atom-owned).
      // A failed/unusable cortex read serves the atom response unmerged: base
      // facts then stay honestly absent, never fabricated.
      let payload: PeBakedFacetsResponse = adapted;
      const cortex = await cortexPromise;
      if (cortex.status >= 200 && cortex.status < 300) {
        let parsedBody: unknown = null;
        try {
          parsedBody = JSON.parse(cortex.body);
        } catch {
          parsedBody = null;
        }
        if (parsedBody && typeof parsedBody === "object") {
          payload = mergeBakedBaseFacts(adapted, parsedBody);
        }
      }
      payload = echoRequestedParcelNodeId(payload, parcelNodeId);
      const readHeader: PeReadPathHeader =
        adapted.readPath === "atom-chain-warm" ? "atom-chain-warm" : "atom-chain";
      res.setHeader("X-PE-Read-Path", readHeader);
      if (shouldSkipColdDerive(atom.chain)) {
        res.setHeader("X-PE-Cold-Derive", "skipped");
      }
      res.setHeader("Content-Type", "application/json");
      res.status(200).json(payload);
      return;
    }
  }

  // BLOCKING: auth failure is a deploy/config defect — never serve cortex snapshot lies.
  if (!atom.ok && isRetrievalAuthFailure(atom.reason)) {
    res.setHeader("X-PE-Read-Path", "atom-pending" satisfies PeReadPathHeader);
    res.setHeader("Content-Type", "application/json");
    res.status(503).json({
      error: "retrieval_auth_failed",
      retryable: false,
      message:
        "Property atom chain retrieval returned HTTP 401 — HAUSKA_RETRIEVAL_API_KEY must match retrieval-api RETRIEVAL_API_KEY.",
      atomPathReason: atom.reason,
      parcelNodeId,
    });
    return;
  }

  // BLOCKING: a transient retrieval failure must NOT become "not verified"
  // (honest-absence is a DATA state). Tell the client to keep loading / retry.
  if (!atom.ok && isTransientAtomChainReason(atom.reason)) {
    res.setHeader("X-PE-Read-Path", "atom-pending" satisfies PeReadPathHeader);
    res.setHeader("Retry-After", "2");
    res.setHeader("Content-Type", "application/json");
    res.status(503).json({
      error: "upstream_transient",
      retryable: true,
      message: "Property atom chain temporarily unreachable — retrying.",
      atomPathReason: atom.reason,
      parcelNodeId,
    });
    return;
  }

  // Definitive empty / adapt-failed: merge cortex baseFacts only (never envelope).
  try {
    const cortex = await cortexPromise;
    if (cortex.status >= 200 && cortex.status < 300) {
      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(cortex.body);
      } catch {
        parsedBody = null;
      }
      if (parsedBody && typeof parsedBody === "object") {
        const stripped = stripCortexEnvelopeProductTruth(parsedBody) as Record<
          string,
          unknown
        >;
        res.setHeader("X-PE-Read-Path", "atom-pending" satisfies PeReadPathHeader);
        res.setHeader("Content-Type", "application/json");
        res.status(200).json({
          ...echoRequestedParcelNodeId(
            stripped,
            parcelNodeId,
          ),
          atomPathReason: atom.ok ? "adapt-failed" : atom.reason,
        });
        return;
      }
    }
  } catch {
    // fall through to honest atom-pending shell
  }

  res.setHeader("X-PE-Read-Path", "atom-pending" satisfies PeReadPathHeader);
  res.setHeader("Content-Type", "application/json");
  res.status(200).json({
    ...honestAtomPendingResponse(parcelNodeId),
    atomPathReason: atom.ok ? "adapt-failed" : atom.reason,
  });
}
