// apps/property-explorer/src/lib/parcel-lookup.ts
//
// QUERY -> PARCEL NODE ID. That is all this module does now.
//
// It used to build a whole inspect card here: it read the baked facets, shaped
// them into a ParcelCardData, resolved a buildable envelope, and geocoded the
// situs ADDRESS to decide where to fly. That made it one of the five paths that
// each answered the same parcel questions separately, and its own comment
// admitted the consequence — "the inspect card opens but the map does not
// move" whenever no centre resolved.
//
// Facts now come from ONE place, `fact-sheet-resolver.ts`, keyed on the parcel
// node id this module produces. Navigation comes from the sheet's geometry
// centroid, never from an address (invariant I5).

import { fetchBuildableEnvelope } from "./buildable-envelope.js";
import { CORTEX_PROXY_BASE } from "./config";
import { isValidParcelNodeId, normalizeParcelNodeId } from "./parcel-node-id";

export type LookupKind = "parcel-node-id" | "address";

export function classifyLookupQuery(raw: string): { kind: LookupKind; value: string } | null {
  const value = raw.trim();
  if (!value) return null;
  // G6 — same contract as BFF/MCP (F1b).
  const nodeId = normalizeParcelNodeId(value);
  if (nodeId && isValidParcelNodeId(nodeId)) {
    return { kind: "parcel-node-id", value: nodeId };
  }
  return { kind: "address", value };
}

export function isParcelNodeIdQuery(raw: string): boolean {
  return classifyLookupQuery(raw)?.kind === "parcel-node-id";
}

export type LookupResult =
  | { ok: true; parcelNodeId: string; source: LookupKind }
  | { ok: false; reason: string };

/**
 * Resolve a query to a PARCEL NODE ID and nothing else.
 *
 * A parcel id is already the answer. An address is put to the backend's
 * situs-matching resolve, which pins it to exactly one parcel — that is the one
 * thing this path is authoritative for, and the only thing it is asked for now.
 */
export async function resolveLookupToParcelNodeId(
  raw: string,
  opts?: { cortexBase?: string; fetchImpl?: typeof fetch },
): Promise<LookupResult> {
  const classified = classifyLookupQuery(raw);
  if (!classified) {
    return { ok: false, reason: "Enter a parcel id (48209:156346) or a street address." };
  }
  if (classified.kind === "parcel-node-id") {
    return { ok: true, parcelNodeId: classified.value, source: "parcel-node-id" };
  }

  const env = await fetchBuildableEnvelope(
    { address: classified.value },
    opts?.cortexBase ?? CORTEX_PROXY_BASE,
    opts?.fetchImpl ?? fetch,
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
  return { ok: true, parcelNodeId, source: "address" };
}

/** Read deep-link query from a URLSearchParams (parcelNodeId | parcel | address). */
export function deepLinkLookupQuery(params: URLSearchParams): string | null {
  const id =
    params.get("parcelNodeId")?.trim() || params.get("parcel")?.trim() || null;
  if (id) return id;
  const address = params.get("address")?.trim();
  return address || null;
}
