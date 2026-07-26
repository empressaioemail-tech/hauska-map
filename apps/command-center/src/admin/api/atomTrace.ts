// Shared retrieval-api clients for Parcel Trace + Node & Graph (WDLL 3 / F1b).
//
// ONE module — do not invent a second tracer or a second chain client.
//   - Parcel Trace edges: GET {retrieval}/atoms/trace/:did
//   - Property ledger slots: GET {retrieval}/property-nodes/:id/atom-chain
//     (same path PE / Gate C use; /atoms/trace 404s for property atoms that
//     exist as StoragePort rows but have no composition graph)
//   - Node & Graph tally: GET {retrieval}/stats/central-tx-node-graph
// Bearer attached by the /api/spine/retrieval proxy.

import { getJson, type SpineConfig } from './spineClient'

export interface AtomTraceResult {
  ok: boolean
  status: number
  json: unknown | null
  error?: string
}

/** Per-county row from GET /stats/central-tx-node-graph (G1 / FIX 3 depth columns). */
export interface CentralTxCountyTallyRow {
  fips: string
  county: string
  nodes: number
  zoning_present: number
  zoning_honest_absent_or_empty: number
  zoning_slot_missing: number
  setback_present: number
  envelope_present: number
  full_chain_nodes: number
  references: number
  depth_warm_promoted: number
  zoning_place_type: number
  depth_ratio_place_type: number
  zoning_present_pct: number
  full_chain_pct?: number
}

/** Live Central-TX node-graph tally (G1 / WDLL 9 / FIX 3). */
export interface CentralTxNodeGraphTally {
  generatedAt?: string
  source?: string
  servingRevisionNote?: string
  totals?: Record<string, unknown>
  roadRollup?: {
    road_nodes?: number
    named_roads?: number
    byCounty?: Array<{ fips: string; county: string; road_nodes: number; named_roads: number }>
    sampleNamed?: Array<{ roadNodeId: string; displayName: string | null }>
  }
  centralTx?: { counties?: CentralTxCountyTallyRow[] }
}

/**
 * Live Central-TX ledger tally — same retrieval path as atom-chain (proxy Bearer).
 * Prefer this over raw fetch so /api/spine/retrieval attaches RETRIEVAL_API_KEY.
 */
export async function fetchCentralTxNodeGraphTally(
  config: SpineConfig,
  timeoutMs = 30_000,
): Promise<AtomTraceResult & { json: CentralTxNodeGraphTally | null }> {
  const retrievalUrl = config.retrievalApiUrl?.replace(/\/$/, '') || ''
  if (!retrievalUrl) {
    return { ok: false, status: 0, json: null, error: 'No retrieval API URL configured' }
  }
  return getJson<CentralTxNodeGraphTally>(
    `${retrievalUrl}/stats/central-tx-node-graph`,
    config,
    timeoutMs,
  )
}

/** Minimal road-node chain body (retrieval GET /road-nodes/:id/atom-chain). */
export interface RoadAtomChainBody {
  roadNodeId?: string
  roadNode?: Record<string, unknown> | null
  atoms?: unknown[] | null
}

export type PropertyChainSlotKey = 'zoning-fact' | 'setback-rule' | 'buildable-envelope'

/** Minimal atom-chain body (retrieval GET /property-nodes/:id/atom-chain). */
export interface PropertyAtomChainBody {
  parcelNodeId?: string
  zoningFact?: Record<string, unknown> | null
  setbackRule?: Record<string, unknown> | null
  buildableEnvelope?: Record<string, unknown> | null
  atoms?: unknown[] | null
  status?: string
  pendingSlots?: string[]
}

export type ChainSlotStatus = 'present' | 'honest-empty' | 'missing'

/**
 * Trace an atom DID through retrieval-api. Cycle-safe BFS, uncapped.
 * Used by Parcel Trace for code/catalog graph edges — not the property
 * ledger's present/absent source of truth.
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

const COLD_START_RETRY_MS = 1_200
const COLD_START_RETRYABLE = /unreachable|timed out|ECONNRESET|ETIMEDOUT|fetch failed|HTTP 502|HTTP 503|HTTP 504|proxy returned HTML/i

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Property reasoning chain for a parcel node — the ONE read path for ledger
 * slot present / honest-absent (WDLL 3 + WDLL 6). Same upstream as PE facets.
 * Retries once on cold-start / transient upstream failures.
 */
export async function fetchPropertyAtomChain(
  parcelNodeId: string,
  config: SpineConfig,
  timeoutMs = 20_000,
): Promise<AtomTraceResult> {
  const retrievalUrl = config.retrievalApiUrl?.replace(/\/$/, '') || ''
  if (!retrievalUrl) {
    return { ok: false, status: 0, json: null, error: 'No retrieval API URL configured' }
  }
  const id = parcelNodeId.trim()
  if (!id) {
    return { ok: false, status: 0, json: null, error: 'parcelNodeId is required' }
  }
  const url = `${retrievalUrl}/property-nodes/${encodeURIComponent(id)}/atom-chain`
  const first = await getJson<unknown>(url, config, timeoutMs)
  if (first.ok) return first
  const reason = first.error || `HTTP ${first.status}`
  if (!COLD_START_RETRYABLE.test(reason)) return first
  await sleep(COLD_START_RETRY_MS)
  return getJson<unknown>(url, config, timeoutMs)
}

/** G6 road id — {fips}:road:{osm_way_id} (27c WDLL 3 / R1). */
const ROAD_NODE_ID_RE = /^\d{5}:road:\d+$/

export function isCanonicalRoadNodeId(value: unknown): value is string {
  return typeof value === 'string' && ROAD_NODE_ID_RE.test(value.trim())
}

/**
 * Road spine node chain — same retrieval substrate as property ledger (R1).
 */
export async function fetchRoadAtomChain(
  roadNodeId: string,
  config: SpineConfig,
  timeoutMs = 20_000,
): Promise<AtomTraceResult> {
  const retrievalUrl = config.retrievalApiUrl?.replace(/\/$/, '') || ''
  if (!retrievalUrl) {
    return { ok: false, status: 0, json: null, error: 'No retrieval API URL configured' }
  }
  const id = roadNodeId.trim()
  if (!id) {
    return { ok: false, status: 0, json: null, error: 'roadNodeId is required' }
  }
  const url = `${retrievalUrl}/road-nodes/${encodeURIComponent(id)}/atom-chain`
  return getJson<unknown>(url, config, timeoutMs)
}

/** Map one atom-chain slot to ledger vocabulary. */
export function chainSlotStatus(slot: unknown): ChainSlotStatus {
  if (slot == null) return 'missing'
  if (typeof slot !== 'object') return 'missing'
  const rec = slot as Record<string, unknown>
  const absence = rec.absence
  if (absence && typeof absence === 'object') return 'honest-empty'
  if (rec.status === 'declined' || rec.status === 'absent' || rec.status === 'empty') {
    return 'honest-empty'
  }
  if (typeof rec.atomDid === 'string' && rec.atomDid.length > 0) return 'present'
  if (rec.status === 'active' || rec.status === 'partial') return 'present'
  return 'missing'
}

/** Derive the three property-ledger slot pills from an atom-chain body. */
export function propertyChainSlotStatuses(
  chain: PropertyAtomChainBody | null | undefined,
): Record<PropertyChainSlotKey, ChainSlotStatus> {
  return {
    'zoning-fact': chainSlotStatus(chain?.zoningFact),
    'setback-rule': chainSlotStatus(chain?.setbackRule),
    'buildable-envelope': chainSlotStatus(chain?.buildableEnvelope),
  }
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
