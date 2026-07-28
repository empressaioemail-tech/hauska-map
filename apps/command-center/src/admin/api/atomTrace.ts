// Shared retrieval-api clients for Parcel Trace + Node & Graph (WDLL 3 / F1b).
//
// ONE module — do not invent a second tracer or a second chain client.
//   - Parcel Trace edges: GET {retrieval}/atoms/trace/:did
//   - Property ledger slots: GET {retrieval}/property-nodes/:id/atom-chain
//     (same path PE / Gate C use; /atoms/trace 404s for property atoms that
//     exist as StoragePort rows but have no composition graph)
//   - Node & Graph tally: GET {retrieval}/stats/central-tx-node-graph
// Bearer attached by the /api/spine/retrieval proxy.

import { getJson, DEFAULT_SPINE_TIMEOUT_MS, type SpineConfig } from './spineClient'

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

/** COMPLETE-BASTROP B1 — spine source+engine health board row. */
export interface SpineHealthProbeRow {
  probeId: string
  kind: 'source' | 'engine'
  pack: string
  status: 'firing' | 'degraded' | 'dead' | 'dead-expected'
  alert: boolean
  signal?: Record<string, unknown>
  baselineValue?: number | null
  currentValue?: number | null
  error?: string | null
  lastSuccessAt?: string | null
  probedAt?: string
}

export interface SpineHealthSummary {
  generatedAt?: string
  pack?: string
  source?: string
  alertCount?: number
  rows?: SpineHealthProbeRow[]
  notes?: string[]
}

/**
 * Latest persisted Bastrop spine health board (WDLL 6–7).
 * GET {retrieval}/health/spine — Bearer via BFF.
 */
export async function fetchSpineHealthSummary(
  config: SpineConfig,
  timeoutMs = 30_000,
): Promise<AtomTraceResult & { json: SpineHealthSummary | null }> {
  const retrievalUrl = config.retrievalApiUrl?.replace(/\/$/, '') || ''
  if (!retrievalUrl) {
    return { ok: false, status: 0, json: null, error: 'No retrieval API URL configured' }
  }
  return getJson<SpineHealthSummary>(`${retrievalUrl}/health/spine`, config, timeoutMs)
}

/**
 * Run Bastrop probe pack (persist + return). GET {retrieval}/health/spine/run.
 */
export async function runSpineHealthPack(
  config: SpineConfig,
  timeoutMs = 120_000,
): Promise<AtomTraceResult & { json: SpineHealthSummary | null }> {
  const retrievalUrl = config.retrievalApiUrl?.replace(/\/$/, '') || ''
  if (!retrievalUrl) {
    return { ok: false, status: 0, json: null, error: 'No retrieval API URL configured' }
  }
  return getJson<SpineHealthSummary>(`${retrievalUrl}/health/spine/run`, config, timeoutMs)
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
  timeoutMs = DEFAULT_SPINE_TIMEOUT_MS,
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
  timeoutMs = DEFAULT_SPINE_TIMEOUT_MS,
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
  timeoutMs = DEFAULT_SPINE_TIMEOUT_MS,
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

// ── CC-A U1 / WDLL 1+2+6 — Control-Tower node detail + boundary edges ──

export const BOUNDARY_EDGE_ID_RE = /^\d{5}:[A-Za-z0-9._-]+:boundary:\d+$/
export const PARCEL_NODE_ID_STRICT_RE = /^\d{5}:[A-Za-z0-9._-]+$/

export function isCanonicalBoundaryEdgeNodeId(value: unknown): value is string {
  return typeof value === 'string' && BOUNDARY_EDGE_ID_RE.test(value.trim())
}

/** Parcel only — excludes road + boundary-edge ids. */
export function isStrictParcelNodeId(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const id = value.trim()
  if (isCanonicalRoadNodeId(id) || isCanonicalBoundaryEdgeNodeId(id)) return false
  return PARCEL_NODE_ID_STRICT_RE.test(id)
}

export interface PropertyGraphEdge {
  id: string
  from_node: string
  type: string
  to_node: string
  label?: string | null
  provenance?: unknown
}

export interface PropertyNodeDetailBody {
  available: boolean
  reason?: string | null
  requested_node_id: string
  canonical_node_id: string
  node: {
    node_id: string
    node_type: 'parcel' | 'road' | 'property-boundary-edge'
    resolution_status: string
    status: string
    name?: string | null
    summary?: Record<string, unknown> | null
  } | null
  identifiers: Array<{
    identifier_type: string
    identifier_value: string
    node_id: string
  }>
  edges_out: PropertyGraphEdge[]
  edges_in: PropertyGraphEdge[]
  atom_counts_by_family: Record<string, number>
  boundary_edge?: Record<string, unknown> | null
}

export interface BoundaryEdgesListBody {
  available: boolean
  reason?: string
  parcelNodeId: string
  edges: unknown[]
  count: number
}

/**
 * Control-Tower-shaped node detail (parcel / road / boundary-edge).
 * GET {retrieval}/nodes/:id — WDLL 1+2+6.
 *
 * Retries once on cold-start / transient upstream failures (Cloud Run
 * scale-to-zero: a first-hit node-detail assembly can exceed a tight abort).
 * Previously this had NO retry while fetchPropertyAtomChain did — so a cold
 * node-inspect on a gold parcel hit a hard 20s timeout wall. (Timeout fix.)
 */
export async function fetchPropertyNodeDetail(
  nodeId: string,
  config: SpineConfig,
  timeoutMs = DEFAULT_SPINE_TIMEOUT_MS,
): Promise<AtomTraceResult & { json: PropertyNodeDetailBody | null }> {
  const retrievalUrl = config.retrievalApiUrl?.replace(/\/$/, '') || ''
  if (!retrievalUrl) {
    return { ok: false, status: 0, json: null, error: 'No retrieval API URL configured' }
  }
  const id = nodeId.trim()
  if (!id) {
    return { ok: false, status: 0, json: null, error: 'nodeId is required' }
  }
  const url = `${retrievalUrl}/nodes/${encodeURIComponent(id)}`
  const first = await getJson<PropertyNodeDetailBody>(url, config, timeoutMs)
  if (first.ok) return first
  const reason = first.error || `HTTP ${first.status}`
  if (!COLD_START_RETRYABLE.test(reason)) return first
  await sleep(COLD_START_RETRY_MS)
  return getJson<PropertyNodeDetailBody>(url, config, timeoutMs)
}

/**
 * Stranded StoragePort boundary edges over HTTP (WDLL 6).
 * GET {retrieval}/property-nodes/:id/boundary-edges
 */
export async function fetchBoundaryEdges(
  parcelNodeId: string,
  config: SpineConfig,
  timeoutMs = DEFAULT_SPINE_TIMEOUT_MS,
): Promise<AtomTraceResult & { json: BoundaryEdgesListBody | null }> {
  const retrievalUrl = config.retrievalApiUrl?.replace(/\/$/, '') || ''
  if (!retrievalUrl) {
    return { ok: false, status: 0, json: null, error: 'No retrieval API URL configured' }
  }
  const id = parcelNodeId.trim()
  if (!id) {
    return { ok: false, status: 0, json: null, error: 'parcelNodeId is required' }
  }
  return getJson<BoundaryEdgesListBody>(
    `${retrievalUrl}/property-nodes/${encodeURIComponent(id)}/boundary-edges`,
    config,
    timeoutMs,
  )
}

// ── CC-NAV — county node LIST (pinned spine contract; may 404 until live) ──
//
// GET {retrieval}/nodes?county=<5-digit fips>&nodeType=parcel|road&q=<search>
//     &limit=50&offset=0
// 200 → { available, county, nodeType, nodes:[{node_id, node_type, display_name,
//         identifiers:{propId?,address?,apn?,roadName?}, atom_families?}],
//         total, limit, offset }
//
// The endpoint is being built in parallel: 404 means NOT LIVE YET, and the
// browser falls back to the county-roster proxy + honest-empty note. Do not
// treat 404 as an error state — feature-detect.

export const NODE_LIST_PAGE = 50

export interface NodeListIdentifiers {
  propId?: string
  address?: string
  apn?: string
  roadName?: string
}

export interface NodeListItem {
  node_id: string
  node_type: 'parcel' | 'road' | string
  display_name: string | null
  identifiers?: NodeListIdentifiers
  /** Contract leaves shape open — render defensively (array or counts map). */
  atom_families?: string[] | Record<string, number>
}

export interface NodeListBody {
  available: boolean
  reason?: string | null
  county: string
  nodeType: string
  nodes: NodeListItem[]
  total: number
  limit: number
  offset: number
}

/**
 * County-scoped node list with server-side multi-identifier search (q matches
 * propId / address / apn / roadName upstream). Faithful port of the Trading
 * Control Tower GET /admin/nodes list read.
 */
export async function fetchNodeList(
  args: { county: string; nodeType: 'parcel' | 'road'; q?: string; limit?: number; offset?: number },
  config: SpineConfig,
  timeoutMs = DEFAULT_SPINE_TIMEOUT_MS,
): Promise<AtomTraceResult & { json: NodeListBody | null }> {
  const retrievalUrl = config.retrievalApiUrl?.replace(/\/$/, '') || ''
  if (!retrievalUrl) {
    return { ok: false, status: 0, json: null, error: 'No retrieval API URL configured' }
  }
  const county = args.county.trim()
  if (!/^\d{5}$/.test(county)) {
    return { ok: false, status: 0, json: null, error: 'county must be a 5-digit fips' }
  }
  const sp = new URLSearchParams()
  sp.set('county', county)
  sp.set('nodeType', args.nodeType)
  if (args.q?.trim()) sp.set('q', args.q.trim())
  sp.set('limit', String(args.limit ?? NODE_LIST_PAGE))
  sp.set('offset', String(args.offset ?? 0))
  return getJson<NodeListBody>(`${retrievalUrl}/nodes?${sp.toString()}`, config, timeoutMs)
}

// ── CC-A U2 / WDLL 3+4+5 — node atoms list + atom-by-did inspector ──

export interface NodeAtomSummary {
  atom_id: string
  entity_type: string
  entity_id: string
  claim_key: string
  claim_type: string
  family: string
  worker: string
  access_policy: string
  knowledge_time?: string | null
  /** Compact preview fields for list rows (boundary role etc.). */
  preview?: string | null
}

export interface NodeAtomsListBody {
  available: boolean
  reason?: string | null
  node_id: string
  family: string
  total: number
  atoms: NodeAtomSummary[]
}

export interface AtomByDidBody {
  atom: Record<string, unknown> | null
  composition?: unknown
}

function asRec(v: unknown): Record<string, unknown> | null {
  return v != null && typeof v === 'object' ? (v as Record<string, unknown>) : null
}

function strField(v: unknown, fallback = ''): string {
  return v == null ? fallback : String(v)
}

/** Build DID when payload omits atomDid (mirrors engine buildAtomDid). */
export function propertyAtomDid(entityType: string, localId: string): string {
  return `did:hauska:${entityType}:${localId}`
}

function summaryFromPayload(payload: Record<string, unknown>, fallbackFamily: string): NodeAtomSummary {
  const entityType = strField(payload.entityType ?? payload.family ?? fallbackFamily, fallbackFamily)
  const entityId = strField(
    payload.entityId ?? payload.parcelNodeId ?? payload.boundaryEdgeId ?? payload.roadNodeId ?? '',
  )
  const atomId = strField(
    payload.atomDid ?? payload.atom_id,
    entityId ? propertyAtomDid(entityType, entityId) : '',
  )
  const role = payload.role != null ? `role=${payload.role}` : null
  const adj = payload.adjacencyKind != null ? `adj=${payload.adjacencyKind}` : null
  const preview = [role, adj].filter(Boolean).join(' · ') || null
  return {
    atom_id: atomId,
    entity_type: entityType,
    entity_id: entityId || atomId,
    claim_key: strField(payload.claimKey ?? payload.sectionNumber ?? entityId, entityId || '—'),
    claim_type: strField(payload.claimType ?? payload.title ?? entityType, entityType),
    family: entityType,
    worker: strField(payload.worker ?? payload.sourceAdapter ?? payload.author, '—'),
    access_policy: strField(payload.accessPolicy ?? payload.access_policy, '—'),
    knowledge_time: (payload.knowledgeTime ??
      payload.extractedAt ??
      payload.fetchedAt ??
      payload.effectiveDate ??
      null) as string | null,
    preview,
  }
}

/**
 * GET {retrieval}/atoms/:did — full atom body for inspector (WDLL 4).
 */
export async function fetchAtomByDid(
  atomDid: string,
  config: SpineConfig,
  timeoutMs = DEFAULT_SPINE_TIMEOUT_MS,
): Promise<AtomTraceResult & { json: AtomByDidBody | null }> {
  const retrievalUrl = config.retrievalApiUrl?.replace(/\/$/, '') || ''
  if (!retrievalUrl) {
    return { ok: false, status: 0, json: null, error: 'No retrieval API URL configured' }
  }
  const did = atomDid.trim()
  if (!did) {
    return { ok: false, status: 0, json: null, error: 'atomDid is required' }
  }
  return getJson<AtomByDidBody>(
    `${retrievalUrl}/atoms/${encodeURIComponent(did)}`,
    config,
    timeoutMs,
  )
}

/**
 * Assemble per-node atom list from existing U1/U2 read paths (no second store).
 * Ports CT GET /admin/nodes/:id/atoms shape for the property substrate.
 * family '' or 'all' → unfiltered.
 */
export async function fetchNodeAtoms(
  nodeId: string,
  family: string,
  config: SpineConfig,
  timeoutMs = DEFAULT_SPINE_TIMEOUT_MS,
): Promise<AtomTraceResult & { json: NodeAtomsListBody | null }> {
  const id = nodeId.trim()
  if (!id) {
    return { ok: false, status: 0, json: null, error: 'nodeId is required' }
  }
  const famFilter = !family || family === 'all' ? '' : family.trim()
  const rows: NodeAtomSummary[] = []

  if (isCanonicalBoundaryEdgeNodeId(id)) {
    const detail = await fetchPropertyNodeDetail(id, config, timeoutMs)
    if (!detail.ok || !detail.json?.available) {
      return {
        ok: detail.ok,
        status: detail.status,
        json: null,
        error: detail.error || detail.json?.reason || 'boundary-edge not found',
      }
    }
    const edge = asRec(detail.json.boundary_edge)
    if (edge) {
      rows.push(summaryFromPayload({ ...edge, entityType: 'property-boundary-edge' }, 'property-boundary-edge'))
    }
  } else if (isCanonicalRoadNodeId(id)) {
    const chain = await fetchRoadAtomChain(id, config, timeoutMs)
    if (!chain.ok) {
      return { ok: false, status: chain.status, json: null, error: chain.error }
    }
    const body = asRec(chain.json)
    const road = asRec(body?.roadNode)
    if (road) {
      rows.push(summaryFromPayload({ ...road, entityType: 'road-node', roadNodeId: id }, 'road-node'))
    }
    const atoms = Array.isArray(body?.atoms) ? body!.atoms : []
    for (const a of atoms) {
      const rec = asRec(a)
      if (!rec) continue
      const payload = asRec(rec.payload) ?? rec
      rows.push(
        summaryFromPayload(
          {
            ...payload,
            atomDid: rec.did ?? payload.atomDid,
            entityType: strField(rec.type ?? rec.kind ?? payload.entityType, 'road-node'),
          },
          'road-node',
        ),
      )
    }
  } else if (isStrictParcelNodeId(id)) {
    const [chain, edges] = await Promise.all([
      fetchPropertyAtomChain(id, config, timeoutMs),
      fetchBoundaryEdges(id, config, timeoutMs),
    ])
    if (!chain.ok) {
      return { ok: false, status: chain.status, json: null, error: chain.error }
    }
    const body = asRec(chain.json)
    const atoms = Array.isArray(body?.atoms) ? body!.atoms : []
    if (atoms.length > 0) {
      for (const a of atoms) {
        const rec = asRec(a)
        if (!rec) continue
        const payload = asRec(rec.payload) ?? rec
        rows.push(
          summaryFromPayload(
            {
              ...payload,
              atomDid: rec.did ?? payload.atomDid,
              entityType: strField(rec.type ?? rec.kind ?? payload.entityType, 'unknown'),
              accessPolicy: rec.accessPolicy ?? payload.accessPolicy,
            },
            'unknown',
          ),
        )
      }
    } else {
      // Slot fallback when wire omits atoms[] (older chain shape).
      for (const [slotKey, slot] of [
        ['zoning-fact', body?.zoningFact],
        ['setback-rule', body?.setbackRule],
        ['buildable-envelope', body?.buildableEnvelope],
      ] as const) {
        const rec = asRec(slot)
        if (!rec || chainSlotStatus(rec) !== 'present') continue
        rows.push(
          summaryFromPayload(
            {
              ...rec,
              entityType: slotKey,
              entityId: id,
              atomDid: strField(rec.atomDid, propertyAtomDid(slotKey, id)),
            },
            slotKey,
          ),
        )
      }
    }
    if (edges.ok && edges.json?.edges) {
      for (const e of edges.json.edges) {
        const rec = asRec(e)
        if (!rec) continue
        rows.push(summaryFromPayload({ ...rec, entityType: 'property-boundary-edge' }, 'property-boundary-edge'))
      }
    }
  } else {
    return { ok: false, status: 400, json: null, error: 'invalid node id' }
  }

  // Dedupe by atom_id (road chain can double-count).
  const seen = new Set<string>()
  const deduped = rows.filter((r) => {
    if (!r.atom_id || seen.has(r.atom_id)) return false
    seen.add(r.atom_id)
    return true
  })
  const filtered = famFilter ? deduped.filter((r) => r.family === famFilter) : deduped

  return {
    ok: true,
    status: 200,
    json: {
      available: true,
      reason: filtered.length === 0 ? 'No atoms for this node/family.' : null,
      node_id: id,
      family: famFilter || 'all',
      total: filtered.length,
      atoms: filtered,
    },
  }
}
