// api/_lib/pe-property-atoms.ts
//
// Dual-serve BFF for Property Explorer inspect-card facets:
//   GET /api/spine/property-atoms/:parcelNodeId/facets
//
// PROPERTY_ATOM_PATH=1 → prefer retrieval atom-chain (adapted); on empty/error
// fall back to cortex facets with X-PE-Read-Path: cortex-fallback.
// Flag unset/0 → cortex-only (instant rollback) with X-PE-Read-Path: cortex.
//
// Bearer key stays server-side (never exposed to the browser).

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  adaptAtomChainToBakedFacets,
  atomChainIsUsable,
  isPropertyAtomPathEnabled,
  parsePropertyAtomsPath,
  type PropertyAtomChain,
} from "./atom-chain-to-facets";

export { parsePropertyAtomsPath, isPropertyAtomPathEnabled };

const DEFAULT_RETRIEVAL =
  "https://hauska-retrieval-api-h7gvu7rgcq-uc.a.run.app";
const DEFAULT_CORTEX = "https://cortex-api-tds7av26va-uc.a.run.app";

export type PeReadPathHeader =
  | "atom-chain"
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
      res.status(cortex.status).send(cortex.body);
    } catch (err) {
      res.status(502).json({
        error: "upstream error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  // Flag ON: prefer atom-chain; fall back to cortex on failure/empty.
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

  try {
    const cortex = await fetchCortexFacets(parcelNodeId);
    res.setHeader("X-PE-Read-Path", "cortex-fallback" satisfies PeReadPathHeader);
    if (cortex.contentType) res.setHeader("Content-Type", cortex.contentType);
    else res.setHeader("Content-Type", "application/json");
    res.status(cortex.status).send(cortex.body);
  } catch (err) {
    res.status(502).json({
      error: "upstream error",
      message: err instanceof Error ? err.message : String(err),
      atomPathReason: atom.ok ? "adapt-failed" : atom.reason,
    });
  }
}
