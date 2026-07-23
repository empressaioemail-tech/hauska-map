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
  isPropertyAtomPathEnabled,
  parsePropertyAtomsPath,
  type PeBakedFacetsResponse,
  type PropertyAtomChain,
} from "./atom-chain-to-facets.js";

export { parsePropertyAtomsPath, isPropertyAtomPathEnabled };

const DEFAULT_RETRIEVAL =
  "https://hauska-retrieval-api-h7gvu7rgcq-uc.a.run.app";
const DEFAULT_CORTEX = "https://cortex-api-tds7av26va-uc.a.run.app";

export type PeReadPathHeader =
  | "atom-chain"
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

async function fetchAtomChain(
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
    return { ok: false, reason: "atom-chain empty" };
  }
  return { ok: true, chain };
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
      const cortex = await fetchCortexFacets(parcelNodeId);
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
        res.status(cortex.status).json(stripCortexEnvelopeProductTruth(parsedBody));
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
  const atom = await fetchAtomChain(parcelNodeId);
  if (atom.ok) {
    const adapted = adaptAtomChainToBakedFacets(atom.chain);
    if (adapted) {
      res.setHeader("X-PE-Read-Path", "atom-chain" satisfies PeReadPathHeader);
      res.setHeader("Content-Type", "application/json");
      res.status(200).json(adapted);
      return;
    }
  }

  // Merge cortex baseFacts/landUse/flood when available, but never cortex envelope.
  try {
    const cortex = await fetchCortexFacets(parcelNodeId);
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
          ...stripped,
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
