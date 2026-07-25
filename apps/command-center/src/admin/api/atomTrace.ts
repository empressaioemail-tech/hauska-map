// Shared retrieval-api atom-trace client (WDLL 3 / F1b).
//
// Parcel Trace and Node & Graph BOTH use this — do not invent a second tracer.
// Upstream: GET {retrieval}/atoms/trace/:did (unprefixed; Bearer attached by
// the /api/spine/retrieval proxy).

import { getJson, type SpineConfig } from './spineClient'

export interface AtomTraceResult {
  ok: boolean
  status: number
  json: unknown | null
  error?: string
}

/**
 * Trace an atom DID through retrieval-api. Cycle-safe BFS, uncapped.
 */
export async function fetchAtomTrace(
  atomDid: string,
  config: SpineConfig,
  timeoutMs = 15_000,
): Promise<AtomTraceResult> {
  const retrievalUrl = config.retrievalApiUrl?.replace(/\/$/, '') || ''
  if (!retrievalUrl) {
    return { ok: false, status: 0, json: null, error: 'No retrieval API URL configured' }
  }
  const did = atomDid.trim()
  if (!did) {
    return { ok: false, status: 0, json: null, error: 'atomDid is required' }
  }
  return getJson<unknown>(
    `${retrievalUrl}/atoms/trace/${encodeURIComponent(did)}`,
    config,
    timeoutMs,
  )
}

/** Canonical property-chain DIDs for a parcel node (same shape as MCP/engine). */
export function propertyChainDids(parcelNodeId: string): {
  zoningFact: string
  setbackRule: string
  buildableEnvelope: string
  parcelNode: string
} {
  const id = parcelNodeId.trim()
  return {
    parcelNode: `did:hauska:parcel-node:${id}`,
    zoningFact: `did:hauska:zoning-fact:${id}`,
    setbackRule: `did:hauska:setback-rule:${id}`,
    buildableEnvelope: `did:hauska:buildable-envelope:${id}`,
  }
}
