/**
 * Retrieval parcel-bind alias (WDLL 5). Lookup only: when the requested
 * property-nodes/:id/{atom-chain|attaching-roads} upstream is empty, rewrite
 * the path to the other grammar. near-bbox is viewport bind — do not rewrite.
 */

import { atomChainIsUsable, type PropertyAtomChain } from "./atom-chain-to-facets.js";
import { parcelGrammarAlias } from "./parcel-node-id.js";

const BIND_PATH_RE =
  /^property-nodes\/([^/]+)\/(atom-chain|attaching-roads)$/;

export function retrievalBindParcelNodeId(upstreamPath: string): string | null {
  const m = BIND_PATH_RE.exec(upstreamPath);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

/** Other-grammar path, or null when the route is not a parcel bind (near-bbox). */
export function rewriteRetrievalBindPath(upstreamPath: string): string | null {
  const m = BIND_PATH_RE.exec(upstreamPath);
  if (!m) return null;
  const requested = retrievalBindParcelNodeId(upstreamPath);
  if (!requested) return null;
  const alias = parcelGrammarAlias(requested);
  if (!alias) return null;
  return `property-nodes/${alias}/${m[2]}`;
}

export function attachingRoadsResponseIsEmpty(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return true;
  const roads = (body as { attachingRoads?: unknown }).attachingRoads;
  return !Array.isArray(roads) || roads.length === 0;
}

/**
 * If the first upstream response is empty/unusable on a parcel-bind route,
 * return the aliased path. 404 is empty-equivalent. 5xx is not. near-bbox
 * never aliases.
 */
export function aliasedRetrievalPathIfEmpty(
  upstreamPath: string,
  status: number,
  bodyText: string,
): string | null {
  const aliasPath = rewriteRetrievalBindPath(upstreamPath);
  if (!aliasPath || aliasPath === upstreamPath) return null;
  if (status === 404) return aliasPath;
  if (status < 200 || status >= 300) return null;
  try {
    const parsed: unknown = JSON.parse(bodyText);
    if (upstreamPath.endsWith("/attaching-roads")) {
      return attachingRoadsResponseIsEmpty(parsed) ? aliasPath : null;
    }
    if (upstreamPath.endsWith("/atom-chain")) {
      return atomChainIsUsable(parsed as PropertyAtomChain) ? null : aliasPath;
    }
  } catch {
    return null;
  }
  return null;
}
