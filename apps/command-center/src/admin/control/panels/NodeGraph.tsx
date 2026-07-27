// apps/command-center/src/admin/control/panels/NodeGraph.tsx
//
// Command Center · Node & Graph (panel id: node-graph).
//
// CC-A U1 / WDLL 1+2+6: PORT Control Tower NodeInspect organism — structured
// card (node_id, type, resolution, identifiers, clickable edges OUT/IN,
// atoms-by-family counts). Raw JSON demoted to optional debug.
// CC-A U2 / WDLL 3+4+5: family pills open NodeAtoms; atom click → AtomInspector
// with return=node-graph&node=…&atoms=… (closeDetail restores this card).
// Reference: Empressa Trading NodeGraphBrowser.tsx + AtomInspector.tsx.
//
// Walkable done-line (Amendment 1): 48021:28286 parcel → boundary-edge →
// road → neighbor through this UI. Builder does not grade MET.

import React, { useEffect, useMemo, useState } from 'react'
import { loadConfig, type SpineConfig } from '../../api/spineClient'
import {
  fetchPropertyAtomChain,
  fetchPropertyNodeDetail,
  fetchCentralTxNodeGraphTally,
  fetchNodeAtoms,
  propertyChainSlotStatuses,
  type PropertyAtomChainBody,
  type PropertyNodeDetailBody,
  type PropertyGraphEdge,
  type NodeAtomSummary,
  type CentralTxNodeGraphTally,
  type CentralTxCountyTallyRow,
} from '../../api/atomTrace'
import {
  Panel,
  Pill,
  Loading,
  Empty,
  sectionHeader,
  mono,
  fmtNum,
  Button,
  Card,
  CollapsibleSection,
  AtomListRow,
  WalkBreadcrumb,
  typeCaption,
  typeTitle,
  summarizeValue,
} from '../primitives'
import { useActivePanel } from '../center/useActivePanel'
import {
  useParcelNodeBinding,
  isCanonicalParcelNodeId,
  isCanonicalRoadNodeId,
  isCanonicalBoundaryEdgeNodeId,
  isCanonicalSpineNodeId,
} from '../center/parcelNodeBinding'

interface CountyTallyRow extends CentralTxCountyTallyRow {}

interface GateATally extends CentralTxNodeGraphTally {}

type SlotStatus = 'present' | 'honest-empty' | 'missing' | 'error' | 'loading'

const inputStyle: React.CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--type-caption)',
  padding: '6px 10px',
  borderRadius: 6,
  color: 'var(--color-text-primary)',
  background: 'var(--color-background-secondary)',
  border: '0.5px solid var(--color-border-tertiary)',
  minWidth: 0,
  flex: 1,
}

const labelVal: React.CSSProperties = {
  ...mono,
  fontSize: 'var(--type-caption)',
  color: 'var(--color-text-primary)',
  wordBreak: 'break-all',
}

const preStyle: React.CSSProperties = {
  ...mono,
  fontSize: 'var(--type-caption)',
  color: 'var(--color-text-primary)',
  background: 'var(--color-background-secondary)',
  border: '0.5px solid var(--color-border-tertiary)',
  borderRadius: 6,
  padding: 10,
  margin: 0,
  overflowX: 'auto',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  maxHeight: 280,
  overflowY: 'auto',
}

/** PORT of CT FamilyCounts — click opens NodeAtoms for that family (WDLL 3). */
const FamilyCounts: React.FC<{
  counts: Record<string, number>
  onPick: (family: string) => void
}> = ({ counts, onPick }) => {
  const entries = Object.entries(counts || {}).sort((a, b) => b[1] - a[1])
  if (entries.length === 0) return <Empty>No atoms recorded for this node.</Empty>
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {entries.map(([fam, n]) => (
        <Button
          key={fam}
          variant="secondary"
          onClick={() => onPick(fam)}
          testId={`family-count-${fam}`}
          title="Filter this node's atoms to this family"
          style={{ display: 'flex', gap: 8 }}
        >
          <span style={{ fontFamily: 'var(--font-ui)' }}>{fam}</span>
          <span style={{ ...mono, fontWeight: 700 }}>{fmtNum(n)}</span>
        </Button>
      ))}
    </div>
  )
}

/** PORT of CT NodeAtoms — family-scoped clickable atom rows (WDLL 3). */
const NodeAtoms: React.FC<{
  nodeId: string
  family: string
  config: SpineConfig
  onClear: () => void
  onOpenAtom: (atomId: string) => void
}> = ({ nodeId, family, config, onClear, onOpenAtom }) => {
  const [atoms, setAtoms] = useState<NodeAtomSummary[]>([])
  const [total, setTotal] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void fetchNodeAtoms(nodeId, family, config).then((res) => {
      if (cancelled) return
      if (!res.ok || !res.json) {
        setAtoms([])
        setTotal(0)
        setErr(res.error || `HTTP ${res.status}`)
      } else {
        setAtoms(res.json.atoms)
        setTotal(res.json.total)
        setErr(null)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [nodeId, family, config])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="node-atoms">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={sectionHeader}>
          Atoms{family ? ` · family=${family}` : ''}
          {total ? ` · ${fmtNum(total)}` : ''}
        </span>
        <Button variant="secondary" onClick={onClear} testId="node-atoms-close">
          ✕ close atoms
        </Button>
      </div>
      {loading ? (
        <Loading />
      ) : err ? (
        <div style={{ ...typeCaption, color: 'var(--color-text-danger)' }}>{err}</div>
      ) : atoms.length === 0 ? (
        <Empty>No atoms for this node/family.</Empty>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {atoms.map((a) => (
            <AtomListRow
              key={a.atom_id}
              claimType={a.claim_type}
              knowledgeTime={a.knowledge_time}
              atomId={a.atom_id}
              preview={a.preview}
              meta={[
                { label: 'key', value: a.claim_key },
                { label: 'family', value: a.family },
                { label: 'access', value: a.access_policy },
              ]}
              onClick={() => onOpenAtom(a.atom_id)}
              title="Open in Atom Inspector"
              testId={`node-atom-${a.family}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** Clickable edge row — PORT of CT edges_out/edges_in, made walkable (Amendment 1). */
const EdgeRow: React.FC<{
  edge: PropertyGraphEdge
  direction: 'out' | 'in'
  onWalk: (nodeId: string) => void
}> = ({ edge, direction, onWalk }) => {
  const target = direction === 'out' ? edge.to_node : edge.from_node
  return (
    <Card
      asButton
      onClick={() => onWalk(target)}
      title={`Walk to ${target}`}
      testId={`edge-${direction}-${edge.id}`}
      padding="6px 10px"
      style={{ ...mono, fontSize: 'var(--type-caption)', color: 'var(--color-text-secondary)', gap: 2 }}
    >
      <div>
        <span style={{ color: 'var(--color-text-tertiary)' }}>
          {direction === 'out' ? 'out →' : 'in ←'}
        </span>{' '}
        <span style={{ color: 'var(--color-text-primary)', fontWeight: 700 }}>{edge.type}</span>
        {' · '}
        <span style={{ color: 'var(--color-text-primary)' }}>{target}</span>
        {edge.label ? <span style={{ color: 'var(--color-text-tertiary)' }}> — {edge.label}</span> : null}
      </div>
    </Card>
  )
}

/**
 * NodeInspect — PORT from trading Control Tower NodeGraphBrowser.tsx.
 * Property-native: boundary role / adjacency / setback / interior on card.
 * U2: atoms-by-family → NodeAtoms → AtomInspector (WDLL 3/4/5).
 */
const NodeInspect: React.FC<{
  nodeId: string
  detail: PropertyNodeDetailBody
  slotStatus: Record<string, SlotStatus>
  chainJson: string | null
  config: SpineConfig
  atomFamily: string | null
  onPickFamily: (family: string) => void
  onClearAtoms: () => void
  onOpenAtom: (atomId: string) => void
  onWalk: (nodeId: string) => void
  onClose: () => void
}> = ({
  nodeId,
  detail,
  slotStatus,
  chainJson,
  config,
  atomFamily,
  onPickFamily,
  onClearAtoms,
  onOpenAtom,
  onWalk,
  onClose,
}) => {
  const [showDebug, setShowDebug] = useState(false)
  const n = detail.node
  if (!n) return <Empty>{detail.reason || 'Node not found.'}</Empty>

  const summary = n.summary ?? {}
  const boundary = detail.boundary_edge

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} data-testid="node-inspect">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={typeTitle}>{n.name || n.node_id}</span>
          <Pill sev={n.resolution_status}>{n.resolution_status}</Pill>
          <Pill sev={n.status}>{n.status}</Pill>
          <Pill sev="info">{n.node_type}</Pill>
        </div>
        <Button variant="secondary" onClick={onClose}>
          ← clear inspect
        </Button>
      </div>

      {atomFamily !== null ? (
        <WalkBreadcrumb
          crumbs={[
            { label: nodeId, onClick: onClearAtoms, title: 'Back to node card' },
            { label: atomFamily || 'all families' },
          ]}
        />
      ) : (
        <WalkBreadcrumb crumbs={[{ label: nodeId }]} />
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          gap: '4px 12px',
          alignItems: 'baseline',
        }}
      >
        {(
          [
            ['node_id', n.node_id],
            ['node_type', n.node_type],
            ['resolution_status', n.resolution_status],
            ['status', n.status],
          ] as [string, string][]
        ).map(([k, v]) => (
          <React.Fragment key={k}>
            <span style={sectionHeader}>{k}</span>
            <span style={labelVal}>{v}</span>
          </React.Fragment>
        ))}
      </div>

      {/* Boundary-edge property-rich fields (WDLL 2 walk: role/adjacency/setback) */}
      {n.node_type === 'property-boundary-edge' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={sectionHeader}>Boundary primitive</span>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: '4px 12px',
              alignItems: 'baseline',
            }}
          >
            {(
              [
                ['role', String(summary.role ?? boundary?.role ?? '—')],
                ['adjacency', String(summary.adjacencyKind ?? boundary?.adjacencyKind ?? '—')],
                [
                  'setback',
                  typeof summary.setback === 'object' && summary.setback != null
                    ? summarizeValue(summary.setback)
                    : String(summary.setback ?? '—'),
                ],
                [
                  'neighbor',
                  String(summary.parcelNeighborPropId ?? boundary?.parcelNeighborPropId ?? '—'),
                ],
                [
                  'facing_road',
                  summary.facingRoad && typeof summary.facingRoad === 'object'
                    ? String((summary.facingRoad as { roadNodeId?: string }).roadNodeId ?? '—')
                    : '—',
                ],
              ] as [string, string][]
            ).map(([k, v]) => (
              <React.Fragment key={k}>
                <span style={sectionHeader}>{k}</span>
                <span style={labelVal}>{v}</span>
              </React.Fragment>
            ))}
          </div>
          <span style={{ ...typeCaption }}>
            GIS-approx edge geometry — not a survey. Property-line-tags optional (Amendment 2).
          </span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={sectionHeader}>Identifiers · {detail.identifiers.length}</span>
        {detail.identifiers.length === 0 ? (
          <Empty>No identifiers indexed.</Empty>
        ) : (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {detail.identifiers.map((idr, i) => (
              <span
                key={i}
                style={{
                  ...mono,
                  fontSize: 10,
                  padding: '3px 8px',
                  borderRadius: 6,
                  background: 'var(--color-background-secondary)',
                  border: '0.5px solid var(--color-border-tertiary)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                <b style={{ color: 'var(--color-text-primary)' }}>{idr.identifier_type}</b>{' '}
                {idr.identifier_value}
              </span>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={sectionHeader}>
          Edges · out {detail.edges_out.length} · in {detail.edges_in.length}
        </span>
        {detail.edges_out.length === 0 && detail.edges_in.length === 0 ? (
          <Empty>
            {n.node_type === 'road'
              ? 'No reverse index on road — walk faces-road from a boundary-edge card.'
              : 'No edges.'}
          </Empty>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {detail.edges_out.map((e) => (
              <EdgeRow key={`o-${e.id}`} edge={e} direction="out" onWalk={onWalk} />
            ))}
            {detail.edges_in.map((e) => (
              <EdgeRow key={`i-${e.id}`} edge={e} direction="in" onWalk={onWalk} />
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={sectionHeader}>Atoms by family</span>
          <Button
            variant="secondary"
            style={{ padding: '4px 10px' }}
            onClick={() => onPickFamily('')}
            testId="view-all-atoms"
          >
            View all atoms →
          </Button>
        </div>
        <FamilyCounts counts={detail.atom_counts_by_family} onPick={onPickFamily} />
      </div>

      {atomFamily !== null && (
        <NodeAtoms
          nodeId={nodeId}
          family={atomFamily}
          config={config}
          onClear={onClearAtoms}
          onOpenAtom={onOpenAtom}
        />
      )}

      {n.node_type === 'parcel' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(['zoning-fact', 'setback-rule', 'buildable-envelope'] as const).map((key) => {
            const st = slotStatus[key] ?? 'missing'
            const sev =
              st === 'present' ? 'ok' : st === 'honest-empty' ? 'warn' : st === 'error' ? 'danger' : 'info'
            return (
              <Pill key={key} sev={sev as 'ok' | 'warn' | 'danger' | 'info'}>
                {key}: {st}
              </Pill>
            )
          })}
        </div>
      )}

      <div>
        <Button
          variant="secondary"
          style={{ marginBottom: 8 }}
          onClick={() => setShowDebug((v) => !v)}
          testId="node-inspect-debug-toggle"
        >
          {showDebug ? 'Hide raw JSON' : 'Show raw JSON (debug)'}
        </Button>
        {showDebug && (
          <pre style={preStyle} data-testid="node-graph-trace">
            {JSON.stringify({ nodeId, detail, chain: chainJson ? JSON.parse(chainJson) : null }, null, 2)}
          </pre>
        )}
      </div>
    </div>
  )
}

/**
 * NodeBrowser — PORT of the Control Tower NodeGraphBrowser LIST shell.
 *
 * The reference opens on a filterable, paginated node LIST served by the trading
 * backend's GET /admin/nodes. The property spine has NO parcel-list endpoint
 * (GET /nodes and /property-nodes without an id 404), so a faithful node list
 * cannot be served here. Instead of faking one, this renders the reference's
 * structured browse SHELL wired to what the spine DOES serve:
 *   - a filter/id-entry row (the entry affordance the spine can honor),
 *   - a COUNTY ROSTER from the live Central-TX tally (real node counts per
 *     county, filterable by name/fips) — the browsable substrate index,
 *   - NAMED-ROAD samples from the tally (clickable straight into inspect).
 * The parcel-node list itself is marked honest-empty with the reason, and the
 * operator browses by id / county / road sample. No fabricated rows.
 */
const NodeBrowser: React.FC<{
  counties: CountyTallyRow[]
  sampleRoads: Array<{ roadNodeId: string; displayName: string | null }>
  inputId: string
  loadingNode: boolean
  tallyLoading: boolean
  onInputChange: (v: string) => void
  onInspect: (id: string) => void
  onLockMap: (id: string) => void
  canLockMap: boolean
}> = ({
  counties,
  sampleRoads,
  inputId,
  loadingNode,
  tallyLoading,
  onInputChange,
  onInspect,
  onLockMap,
  canLockMap,
}) => {
  const [filter, setFilter] = useState('')
  const f = filter.trim().toLowerCase()
  const filteredCounties = f
    ? counties.filter((c) => `${c.county} ${c.fips}`.toLowerCase().includes(f))
    : counties
  const filteredRoads = f
    ? sampleRoads.filter((r) => `${r.roadNodeId} ${r.displayName ?? ''}`.toLowerCase().includes(f))
    : sampleRoads

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} data-testid="node-browser">
      {/* id-entry affordance — the browse the spine CAN honor */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={sectionHeader}>Browse the substrate — inspect by id</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            style={inputStyle}
            value={inputId}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onInspect(inputId)
            }}
            placeholder="48021:28286 or …:boundary:2 or …:road:…"
            data-testid="node-graph-input"
          />
          <Button onClick={() => onInspect(inputId)} disabled={loadingNode} testId="node-graph-inspect">
            {loadingNode ? 'Loading…' : 'Inspect'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => onLockMap(inputId.trim())}
            disabled={!canLockMap}
            title="Lock parcel and open map workspace (ledger → map)"
          >
            Lock on map
          </Button>
        </div>
        <span style={{ ...typeCaption }} data-testid="node-browse-honest-empty">
          Spine serves no parcel-list endpoint (GET /nodes, /property-nodes 404) — a filterable node
          list is honest-empty here. Browse by id, by county, or from a named-road sample below.
        </span>
      </div>

      {/* filter for the roster + road samples */}
      <input
        style={inputStyle}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="filter county / road…"
        data-testid="node-browse-filter"
      />

      {/* county roster — the browsable substrate index (from live tally) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={sectionHeader}>
          County roster{counties.length ? ` · ${counties.length}` : ''}
        </span>
        {tallyLoading && counties.length === 0 ? (
          <Loading />
        ) : filteredCounties.length === 0 ? (
          <Empty>No county matches the filter.</Empty>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {filteredCounties.map((c) => (
              <Card
                key={c.fips}
                asButton
                onClick={() => onInputChange(`${c.fips}:`)}
                title={`Seed ${c.county} (${c.fips}) into the id box — append a propId to inspect`}
                testId={`county-row-${c.fips}`}
                padding="8px 10px"
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <span style={{ ...typeTitle, fontSize: 'var(--type-body)' }}>
                    {c.county} <span style={{ ...mono, color: 'var(--color-text-tertiary)' }}>({c.fips})</span>
                  </span>
                  <Pill sev={c.zoning_present_pct > 0 ? 'ok' : 'info'}>{c.zoning_present_pct}% zoned</Pill>
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: 12,
                    flexWrap: 'wrap',
                    ...mono,
                    fontSize: 'var(--type-caption)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  <span>nodes: {fmtNum(c.nodes)}</span>
                  <span>full-chain: {fmtNum(c.full_chain_nodes)}</span>
                  <span>setback: {fmtNum(c.setback_present)}</span>
                  <span>envelope: {fmtNum(c.envelope_present)}</span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* named-road samples — clickable straight into inspect */}
      {sampleRoads.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={sectionHeader}>Named-road samples · {sampleRoads.length}</span>
          {filteredRoads.length === 0 ? (
            <Empty>No road matches the filter.</Empty>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {filteredRoads.map((r) => (
                <Card
                  key={r.roadNodeId}
                  asButton
                  onClick={() => onInspect(r.roadNodeId)}
                  title={`Inspect ${r.roadNodeId}`}
                  testId={`road-sample-${r.roadNodeId}`}
                  padding="7px 10px"
                  style={{ ...mono, fontSize: 'var(--type-caption)' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ color: 'var(--color-text-primary)', fontWeight: 700 }}>
                      {r.displayName || 'unnamed road'}
                    </span>
                    <span style={{ color: 'var(--color-text-tertiary)' }}>{r.roadNodeId}</span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export const NodeGraph: React.FC = () => {
  const config = useMemo<SpineConfig>(() => loadConfig(), [])
  const [, selectPanel, hashParams] = useActivePanel()
  const { parcelNodeId, inspectNodeId, lockParcelNode, lockInspectNode } = useParcelNodeBinding()
  const [inputId, setInputId] = useState(inspectNodeId ?? parcelNodeId ?? '48021:28286')
  const [tally, setTally] = useState<GateATally | null>(null)
  const [tallyError, setTallyError] = useState<string | null>(null)
  const [tallySource, setTallySource] = useState<'live' | 'artifact' | null>(null)
  const [slotStatus, setSlotStatus] = useState<Record<string, SlotStatus>>({})
  const [detail, setDetail] = useState<PropertyNodeDetailBody | null>(null)
  const [chainJson, setChainJson] = useState<string | null>(null)
  const [loadingNode, setLoadingNode] = useState(false)
  const [nodeError, setNodeError] = useState<string | null>(null)
  // Honest partial: node-detail resolved but atom-chain slow/failed (timeout fix).
  const [degraded, setDegraded] = useState<string | null>(null)

  // atomFamily === null → atoms panel closed; '' → all families; 'zoning-fact' etc → filtered.
  const [atomFamily, setAtomFamily] = useState<string | null>(() => {
    if (hashParams.atoms === undefined) return null
    return hashParams.atoms === 'all' ? '' : hashParams.atoms
  })

  useEffect(() => {
    if (hashParams.atoms === undefined) setAtomFamily(null)
    else setAtomFamily(hashParams.atoms === 'all' ? '' : hashParams.atoms)
  }, [hashParams.atoms])

  useEffect(() => {
    if (inspectNodeId) setInputId(inspectNodeId)
  }, [inspectNodeId])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const live = await fetchCentralTxNodeGraphTally(config)
        if (live.ok && live.json) {
          if (!cancelled) {
            setTally(live.json)
            setTallyError(null)
            setTallySource('live')
          }
          return
        }
        const res = await fetch('/central_tx_node_graph_tally.json', {
          headers: { Accept: 'application/json' },
        })
        if (!res.ok) {
          if (!cancelled) {
            setTallyError(`Live tally HTTP ${live.status}; artifact HTTP ${res.status}`)
          }
          return
        }
        const raw = await res.text()
        const text = raw.replace(/^\uFEFF/, '')
        const json = JSON.parse(text) as GateATally
        if (!cancelled) {
          setTally(json)
          setTallyError(
            `Live tally unavailable (${live.error || `HTTP ${live.status}`}) — showing committed artifact (STALE).`,
          )
          setTallySource('artifact')
        }
      } catch (err) {
        if (!cancelled) setTallyError((err as Error).message)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [config])

  const inspectNode = async (id: string) => {
    const nodeId = id.trim()
    if (!isCanonicalSpineNodeId(nodeId)) {
      setNodeError(
        'node id must match {fips}:{propId}, {fips}:road:{osm_way_id}, or {fips}:{propId}:boundary:{i}',
      )
      return
    }
    setLoadingNode(true)
    setNodeError(null)
    setDegraded(null)
    lockInspectNode(nodeId)

    const isParcel = isCanonicalParcelNodeId(nodeId)
    if (isParcel) {
      setSlotStatus({
        'zoning-fact': 'loading',
        'setback-rule': 'loading',
        'buildable-envelope': 'loading',
      })
    } else {
      setSlotStatus({})
    }

    // Timeout fix: fan node-detail and atom-chain IN PARALLEL, not sequentially.
    // They are independent reads; awaiting them one-after-another doubled the
    // wall time (each ~3-6s warm, each 20-30s+ on a cold Cloud Run start), which
    // is what tripped the 20s hard abort on gold-parcel inspect. The node card
    // is gated only on node-detail; a slow/failed atom-chain degrades the slot
    // pills to an honest partial instead of failing the whole inspect.
    const detailPromise = fetchPropertyNodeDetail(nodeId, config)
    const chainPromise = isParcel
      ? fetchPropertyAtomChain(nodeId, config)
      : Promise.resolve(null)

    const detailResult = await detailPromise
    if (!detailResult.ok || !detailResult.json) {
      setDetail(null)
      setChainJson(null)
      setSlotStatus({})
      setNodeError(detailResult.error || `node-detail HTTP ${detailResult.status}`)
      setLoadingNode(false)
      return
    }

    setDetail(detailResult.json)

    if (isParcel) {
      const chainResult = await chainPromise
      if (chainResult && chainResult.ok && chainResult.json) {
        const chain = chainResult.json as PropertyAtomChainBody
        setSlotStatus(propertyChainSlotStatuses(chain))
        setChainJson(JSON.stringify(chain, null, 2))
      } else {
        // Honest partial: the node resolved but its reasoning chain did not.
        // Do NOT throw the whole inspect away — show the node with degraded
        // slots and a re-run affordance (timeout fix: no hard 20s wall).
        setSlotStatus({
          'zoning-fact': 'error',
          'setback-rule': 'error',
          'buildable-envelope': 'error',
        })
        setChainJson(null)
        setDegraded(
          `Node resolved, but its atom-chain ${
            chainResult?.error || 'did not load'
          } — slot pills below are degraded (partial state, not a hard failure). Re-run to retry.`,
        )
      }
    } else {
      setSlotStatus({})
      setChainJson(JSON.stringify(detailResult.json, null, 2))
    }

    setLoadingNode(false)
  }

  // Hash → inspect: when node= changes (map lock or edge walk), re-inspect.
  useEffect(() => {
    if (inspectNodeId) void inspectNode(inspectNodeId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectNodeId])

  const pickAtomFamily = (fam: string): void => {
    const nodeId = inspectNodeId ?? inputId.trim()
    setAtomFamily(fam)
    const next: Record<string, string> = { ...hashParams, node: nodeId, atoms: fam || 'all' }
    selectPanel('node-graph', next)
  }

  const clearAtoms = (): void => {
    setAtomFamily(null)
    const nodeId = inspectNodeId ?? inputId.trim()
    const next: Record<string, string> = { ...hashParams, node: nodeId }
    delete next.atoms
    selectPanel('node-graph', next)
  }

  /** PORT of CT openAtomInspector — return=node-graph breadcrumb (WDLL 5). */
  const openAtomInspector = (atomId: string): void => {
    const nodeId = inspectNodeId ?? inputId.trim()
    selectPanel('atom-inspector', {
      id: atomId,
      return: 'node-graph',
      node: nodeId,
      atoms: atomFamily === '' ? 'all' : atomFamily ?? 'all',
    })
  }

  const counties = tally?.centralTx?.counties ?? []
  const roadRollup = tally?.roadRollup

  return (
    <Panel
      title="Node & Graph"
      subtitle="Live ledger · Control-Tower node organism (CC-A U1/U2) + Central-TX tally"
      right={
        <Pill sev={tallySource === 'live' ? 'ok' : tallySource === 'artifact' ? 'warn' : 'info'}>
          {tallySource === 'live' ? 'tally live' : tallySource === 'artifact' ? 'tally stale' : '…'}
        </Pill>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* List ↔ detail toggle — the reference opens on a browse LIST, then
            swaps the center for the node detail on selection. */}
        {!inspectNodeId && !detail ? (
          <NodeBrowser
            counties={counties}
            sampleRoads={roadRollup?.sampleNamed ?? []}
            inputId={inputId}
            loadingNode={loadingNode}
            tallyLoading={!tally && !tallyError}
            onInputChange={setInputId}
            onInspect={(id) => void inspectNode(id)}
            onLockMap={(id) => lockParcelNode(id, { panelId: 'site-analysis' })}
            canLockMap={isCanonicalParcelNodeId(inputId)}
          />
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={sectionHeader}>Node inspect (Control-Tower organism)</span>
              <Button
                variant="secondary"
                testId="node-graph-back-to-browse"
                onClick={() => {
                  setDetail(null)
                  setChainJson(null)
                  setAtomFamily(null)
                  setNodeError(null)
                  setDegraded(null)
                  lockInspectNode(null)
                }}
              >
                ← back to browse
              </Button>
            </div>
            <p style={{ ...typeCaption, marginTop: 4, marginBottom: 8 }}>
              Locks hash <code>node=</code>. Family pills open atoms; atom click opens inspector with{' '}
              <code>return=node-graph</code> trail (WDLL 3/4/5). Walk edges on gold <code>48021:28286</code>.
            </p>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                style={inputStyle}
                value={inputId}
                onChange={(e) => setInputId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void inspectNode(inputId)
                }}
                placeholder="48021:28286 or …:boundary:2 or …:road:…"
                data-testid="node-graph-input"
              />
              <Button
                onClick={() => void inspectNode(inputId)}
                disabled={loadingNode}
                testId="node-graph-inspect"
              >
                {loadingNode ? 'Loading…' : 'Inspect'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => lockParcelNode(inputId.trim(), { panelId: 'site-analysis' })}
                disabled={!isCanonicalParcelNodeId(inputId)}
                title="Lock parcel and open map workspace (ledger → map)"
              >
                Lock on map
              </Button>
            </div>
            {inspectNodeId && (
              <div style={{ marginTop: 8, ...typeCaption, color: 'var(--color-text-secondary)' }}>
                Locked: <code data-testid="node-graph-locked">{inspectNodeId}</code>
                {isCanonicalBoundaryEdgeNodeId(inspectNodeId) && ' (boundary-edge)'}
                {isCanonicalRoadNodeId(inspectNodeId) && ' (road)'}
              </div>
            )}
            {nodeError && (
              <div style={{ marginTop: 8, ...typeCaption, color: 'var(--color-text-danger)' }}>{nodeError}</div>
            )}
            {degraded && !nodeError && (
              <div
                data-testid="node-inspect-degraded"
                style={{
                  marginTop: 8,
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: 'var(--color-background-warning)',
                  border: '0.5px solid var(--color-border-warning)',
                  ...typeCaption,
                  color: 'var(--color-text-warning)',
                }}
              >
                {degraded}
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              {loadingNode && <Loading />}
              {!loadingNode && detail?.available && detail.node && (
                <NodeInspect
                  nodeId={inspectNodeId ?? inputId}
                  detail={detail}
                  slotStatus={slotStatus}
                  chainJson={chainJson}
                  config={config}
                  atomFamily={atomFamily}
                  onPickFamily={pickAtomFamily}
                  onClearAtoms={clearAtoms}
                  onOpenAtom={openAtomInspector}
                  onWalk={(nextId) => {
                    setInputId(nextId)
                    void inspectNode(nextId)
                  }}
                  onClose={() => {
                    setDetail(null)
                    setChainJson(null)
                    setAtomFamily(null)
                    setNodeError(null)
                    setDegraded(null)
                    lockInspectNode(null)
                  }}
                />
              )}
              {!loadingNode && detail && !detail.available && (
                <Empty>{detail.reason || 'Node not available.'}</Empty>
              )}
            </div>
          </div>
        )}

        {roadRollup != null && (
          <CollapsibleSection title="Road nodes (27c WDLL 3 / R1)" defaultOpen={false}>
            <div style={{ ...typeCaption, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
              Total road nodes: <code>{roadRollup.road_nodes ?? 0}</code> · Named:{' '}
              <code>{roadRollup.named_roads ?? 0}</code>
            </div>
            {(roadRollup.sampleNamed?.length ?? 0) > 0 && (
              <ul style={{ ...typeCaption, color: 'var(--color-text-secondary)', margin: 0, paddingLeft: 18 }}>
                {roadRollup.sampleNamed!.map((r) => (
                  <li key={r.roadNodeId}>
                    <Button
                      variant="secondary"
                      style={{ padding: '2px 8px' }}
                      onClick={() => {
                        setInputId(r.roadNodeId)
                        void inspectNode(r.roadNodeId)
                      }}
                    >
                      Inspect
                    </Button>{' '}
                    <code>{r.roadNodeId}</code>
                    {r.displayName ? ` — ${r.displayName}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </CollapsibleSection>
        )}

        <CollapsibleSection
          title="Central-TX tally (G1 / WDLL 9 — live re-SELECT)"
          defaultOpen={false}
          testId="central-tx-tally"
        >
          <p style={{ ...typeCaption, marginTop: 0, marginBottom: 8 }}>
            Source:{' '}
            {tallySource === 'live'
              ? `live GET /stats/central-tx-node-graph (${tally?.generatedAt ?? '…'})`
              : tally?.source ?? 'loading…'}
            . Envelope counts any buildable-envelope atom; depth-warm counts only{' '}
            <code>depthWarmPromotion=depth-warm-promoted-v1</code>.
          </p>
          {tallyError && (
            <div style={{ ...typeCaption, color: 'var(--color-text-danger)', marginBottom: 8 }}>{tallyError}</div>
          )}
          {!tally && !tallyError && <Loading />}
          {counties.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 'var(--type-caption)',
                  fontFamily: 'var(--font-ui)',
                }}
              >
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--color-text-tertiary)' }}>
                    <th style={{ padding: '4px 6px' }}>County</th>
                    <th style={{ padding: '4px 6px' }}>Nodes</th>
                    <th style={{ padding: '4px 6px' }}>Zoning+</th>
                    <th style={{ padding: '4px 6px' }}>Honest∅</th>
                    <th style={{ padding: '4px 6px' }}>Setback</th>
                    <th style={{ padding: '4px 6px' }}>Env (any)</th>
                    <th style={{ padding: '4px 6px' }}>Full chain</th>
                    <th style={{ padding: '4px 6px' }}>Depth warm</th>
                    <th style={{ padding: '4px 6px' }}>Place-type</th>
                    <th style={{ padding: '4px 6px' }}>Refs</th>
                    <th style={{ padding: '4px 6px' }}>Zoning breadth %</th>
                    <th style={{ padding: '4px 6px' }}>Depth place-type %</th>
                  </tr>
                </thead>
                <tbody>
                  {counties.map((c: CountyTallyRow) => (
                    <tr key={c.fips} style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                      <td style={{ padding: '4px 6px' }}>
                        {c.county} ({c.fips})
                      </td>
                      <td style={{ padding: '4px 6px', ...mono }}>{c.nodes}</td>
                      <td style={{ padding: '4px 6px', ...mono }}>{c.zoning_present}</td>
                      <td style={{ padding: '4px 6px', ...mono }}>{c.zoning_honest_absent_or_empty}</td>
                      <td style={{ padding: '4px 6px', ...mono }}>{c.setback_present}</td>
                      <td style={{ padding: '4px 6px', ...mono }}>{c.envelope_present}</td>
                      <td style={{ padding: '4px 6px', ...mono }}>{c.full_chain_nodes}</td>
                      <td style={{ padding: '4px 6px', ...mono }}>{c.depth_warm_promoted ?? '—'}</td>
                      <td style={{ padding: '4px 6px', ...mono }}>{c.zoning_place_type ?? '—'}</td>
                      <td style={{ padding: '4px 6px', ...mono }}>{c.references}</td>
                      <td style={{ padding: '4px 6px', ...mono }}>{c.zoning_present_pct}%</td>
                      <td style={{ padding: '4px 6px', ...mono }}>
                        {c.depth_ratio_place_type != null ? `${c.depth_ratio_place_type}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CollapsibleSection>
      </div>
    </Panel>
  )
}

export default NodeGraph
