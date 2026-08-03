// apps/property-explorer/src/shared/atom-chip/atom-fetch.ts
//
// Shared atom fetch-on-tap primitive. Extracted MECHANICALLY (no behavior
// change) from workbench/tools/chat-atom-card.ts so both the chat citation
// chips (workbench/tools/ChatTool.tsx) and the inspect-card provenance chips
// (browse/InspectCard.tsx) can open the same atom detail without a
// browse/ -> workbench/tools/ import in either direction. chat-atom-card.ts
// re-exports these names unchanged; its own tests + ChatTool's tests keep
// passing against the same cache instance and the same semantics.
//
//   - FETCH-ON-TAP: GET {retrieval proxy}/atoms/:did (anonymous-allowlisted;
//     the proxy attaches the Bearer key server-side). Cached per did. ANY
//     non-200 is treated identically: the caller degrades to local content
//     with an honest "full record unavailable" line, and the outcome is
//     cached so a dead did is never re-fetched. Network throws are NOT
//     cached (transient — retry allowed).

import { PE_RETRIEVAL_PROXY_BASE } from "../../lib/config";

export type AtomFetchOutcome =
  | { kind: "ok"; atom: Record<string, unknown> }
  | { kind: "unavailable" };

export type AtomFetcher = (did: string) => Promise<Response>;

function rec(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

const defaultAtomFetcher: AtomFetcher = (did) =>
  fetch(`${PE_RETRIEVAL_PROXY_BASE}/atoms/${encodeURIComponent(did)}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

const atomCache = new Map<string, Promise<AtomFetchOutcome>>();

/**
 * Fetch an atom by did through the spine proxy. One in-flight/settled promise
 * per did; ANY non-200 resolves (and stays cached) as "unavailable" — the
 * caller degrades to local content, the chip never breaks. A thrown network
 * error also resolves "unavailable" but is EVICTED so a later tap can retry
 * (transient failure is not a dead record).
 */
export function fetchAtomByDid(
  did: string,
  fetcher: AtomFetcher = defaultAtomFetcher,
): Promise<AtomFetchOutcome> {
  const cached = atomCache.get(did);
  if (cached) return cached;
  const inFlight: Promise<AtomFetchOutcome> = (async () => {
    let res: Response;
    try {
      res = await fetcher(did);
    } catch {
      atomCache.delete(did);
      return { kind: "unavailable" as const };
    }
    if (!res.ok) return { kind: "unavailable" as const };
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { kind: "unavailable" as const };
    }
    const atom = rec(rec(body)?.atom);
    if (!atom) return { kind: "unavailable" as const };
    return { kind: "ok" as const, atom };
  })();
  atomCache.set(did, inFlight);
  return inFlight;
}

/** Test seam. */
export function resetAtomFetchCache(): void {
  atomCache.clear();
}
