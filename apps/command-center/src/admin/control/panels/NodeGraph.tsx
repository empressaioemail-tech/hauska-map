// apps/command-center/src/admin/control/panels/NodeGraph.tsx
//
// Command Center · Node & Graph (panel id: node-graph).
//
// CC-A U1 / WDLL 1+2+6: PORT Control Tower NodeInspect organism — structured
// card (node_id, type, resolution, identifiers, clickable edges OUT/IN,
// atoms-by-family counts). Raw JSON demoted to optional debug.
// Reference: Empressa Trading NodeGraphBrowser.tsx NodeInspect.
//
// Walkable done-line (Amendment 1): 48021:28286 parcel → boundary-edge →
// road → neighbor through this UI. Builder does not grade MET.

import React, { useEffect, useMemo, useState } from 'react'
import { loadConfig, type SpineConfig } from '../../api/spineClient'
import {
  fetchPropertyAtomChain,
  fetchPropertyNodeDetail,
  fetchCentralTxNodeGraphTally,
  propertyChainSlotStatuses,
  type PropertyAtomChainBody,
  type PropertyNodeDetailBody,
  type PropertyGraphEdge,
  type CentralTxNodeGraphTally,
  type CentralTxCountyTallyRow,
} from '../../api/atomTrace'
import { Panel, Pill, Loading, Empty, sectionHeader, mono } from '../primitives'
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
  fontSize: 11,
  padding: '6px 10px',
  borderRadius: 6,
  color: 'var(--color-text-primary)',
  background: 'var(--color-background-secondary)',
  border: '0.5px solid var(--color-border-tertiary)',
  minWidth: 0,
  flex: 1,
}

const btnStyle: React.CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 11,
  fontWeight: 600,
  padding: '6px 14px',
  borderRadius: 6,
  cursor: 'pointer',
  color: 'var(--color-text-primary)',
  background: 'var(--color-background-accent)',
  border: '0.5px solid var(--color-border-secondary)',
}

const labelVal: React.CSSProperties = {
  ...mono,
  fontSize: 11,
  color: 'var(--color-text-primary)',
  wordBreak: 'break-all',
}

const preStyle: React.CSSProperties = {
  ...mono,
  fontSize: 10.5,
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

const FamilyCounts: React.FC<{ counts: Record<string, number> }> = ({ counts }) => {
  const entries = Object.entries(counts || {}).sort((a, b) => b[1] - a[1])
  if (entries.length === 0) return <Empty>No atoms recorded for this node.</Empty>
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {entries.map(([fam, n]) => (
        <span
          key={fam}
          style={{
            ...btnStyle,
            background: 'var(--color-background-secondary)',
            display: 'flex',
            gap: 8,
            cursor: 'default',
          }}
          title="Family count (U2 opens inspector)"
        >
          <span style={{ fontFamily: 'var(--font-ui)' }}>{fam}</span>
          <span style={{ ...mono, fontWeight: 700 }}>{n}</span>
        </span>
      ))}
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
    <button
      type="button"
      onClick={() => onWalk(target)}
      title={`Walk to ${target}`}
      data-testid={`edge-${direction}-${edge.id}`}
      style={{
        textAlign: 'left',
        ...mono,
        fontSize: 10.5,
        color: 'var(--color-text-secondary)',
        padding: '6px 10px',
        borderRadius: 6,
        background: 'var(--color-background-secondary)',
        border: '0.5px solid var(--color-border-tertiary)',
        cursor: 'pointer',
        font: 'inherit',
        width: '100%',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--color-background-accent)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--color-background-secondary)'
      }}
    >
      <span style={{ color: 'var(--color-text-tertiary)' }}>
        {direction === 'out' ? 'out →' : 'in ←'}
      </span>{' '}
      <span style={{ color: 'var(--color-text-primary)', fontWeight: 700 }}>{edge.type}</span>
      {' · '}
      <span style={{ color: 'var(--color-text-primary)' }}>{target}</span>
      {edge.label ? (
        <span style={{ color: 'var(--color-text-tertiary)' }}> — {edge.label}</span>
      ) : null}
    </button>
  )
}

/**
 * NodeInspect — PORT from trading Control Tower NodeGraphBrowser.tsx.
 * Property-native: boundary role / adjacency / setback / interior on card.
 */
const NodeInspect: React.FC<{
  nodeId: string
  detail: PropertyNodeDetailBody
  slotStatus: Record<string, SlotStatus>
  chainJson: string | null
  onWalk: (nodeId: string) => void
  onClose: () => void
}> = ({ nodeId, detail, slotStatus, chainJson, onWalk, onClose }) => {
  const [showDebug, setShowDebug] = useState(false)
  const n = detail.node
  if (!n) return <Empty>{detail.reason || 'Node not found.'}</Empty>

  const summary = n.summary ?? {}
  const boundary = detail.boundary_edge

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} data-testid="node-inspect">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-ui)',
            }}
          >
            {n.name || n.node_id}
          </span>
          <Pill sev={n.resolution_status}>{n.resolution_status}</Pill>
          <Pill sev={n.status}>{n.status}</Pill>
          <Pill sev="info">{n.node_type}</Pill>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{ ...btnStyle, background: 'var(--color-background-secondary)' }}
        >
          ← clear inspect
        </button>
      </div>

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
                    ? JSON.stringify(summary.setback)
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
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-ui)' }}>
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
        <span style={sectionHeader}>Atoms by family</span>
        <FamilyCounts counts={detail.atom_counts_by_family} />
      </div>

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
        <button
          type="button"
          style={{ ...btnStyle, background: 'var(--color-background-secondary)', marginBottom: 8 }}
          onClick={() => setShowDebug((v) => !v)}
          data-testid="node-inspect-debug-toggle"
        >
          {showDebug ? 'Hide raw JSON' : 'Show raw JSON (debug)'}
        </button>
        {showDebug && (
          <pre style={preStyle} data-testid="node-graph-trace">
            {JSON.stringify({ nodeId, detail, chain: chainJson ? JSON.parse(chainJson) : null }, null, 2)}
          </pre>
        )}
      </div>
    </div>
  )
}

export const NodeGraph: React.FC = () => {
  const config = useMemo<SpineConfig>(() => loadConfig(), [])
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
    lockInspectNode(nodeId)

    const detailResult = await fetchPropertyNodeDetail(nodeId, config)
    if (!detailResult.ok || !detailResult.json) {
      setDetail(null)
      setChainJson(null)
      setSlotStatus({})
      setNodeError(detailResult.error || `node-detail HTTP ${detailResult.status}`)
      setLoadingNode(false)
      return
    }

    setDetail(detailResult.json)

    // Parcel: also load atom-chain for slot pills (F1b path preserved).
    if (isCanonicalParcelNodeId(nodeId)) {
      setSlotStatus({
        'zoning-fact': 'loading',
        'setback-rule': 'loading',
        'buildable-envelope': 'loading',
      })
      const chainResult = await fetchPropertyAtomChain(nodeId, config)
      if (chainResult.ok && chainResult.json) {
        const chain = chainResult.json as PropertyAtomChainBody
        setSlotStatus(propertyChainSlotStatuses(chain))
        setChainJson(JSON.stringify(chain, null, 2))
      } else {
        setSlotStatus({
          'zoning-fact': 'error',
          'setback-rule': 'error',
          'buildable-envelope': 'error',
        })
        setChainJson(null)
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

  const counties = tally?.centralTx?.counties ?? []
  const roadRollup = tally?.roadRollup

  return (
    <Panel
      title="Node & Graph"
      subtitle="Live ledger · Control-Tower node organism (CC-A U1) + Central-TX tally"
      right={
        <Pill sev={tallySource === 'live' ? 'ok' : tallySource === 'artifact' ? 'warn' : 'info'}>
          {tallySource === 'live' ? 'tally live' : tallySource === 'artifact' ? 'tally stale' : '…'}
        </Pill>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <span style={sectionHeader}>Central-TX tally (G1 / WDLL 9 — live re-SELECT)</span>
          <p
            style={{
              fontSize: 11,
              color: 'var(--color-text-tertiary)',
              fontFamily: 'var(--font-ui)',
              marginTop: 4,
              marginBottom: 8,
            }}
          >
            Source:{' '}
            {tallySource === 'live'
              ? `live GET /stats/central-tx-node-graph (${tally?.generatedAt ?? '…'})`
              : tally?.source ?? 'loading…'}
            . Envelope counts any buildable-envelope atom; depth-warm counts only{' '}
            <code>depthWarmPromotion=depth-warm-promoted-v1</code>.
          </p>
          {tallyError && (
            <div style={{ fontSize: 11, color: 'var(--color-text-danger)', marginBottom: 8 }}>
              {tallyError}
            </div>
          )}
          {!tally && !tallyError && <Loading />}
          {counties.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 11,
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
        </div>

        {roadRollup != null && (
          <div>
            <span style={sectionHeader}>Road nodes (27c WDLL 3 / R1)</span>
            <div style={{ fontSize: 11, fontFamily: 'var(--font-ui)', marginBottom: 8 }}>
              Total road nodes: <code>{roadRollup.road_nodes ?? 0}</code> · Named:{' '}
              <code>{roadRollup.named_roads ?? 0}</code>
            </div>
            {(roadRollup.sampleNamed?.length ?? 0) > 0 && (
              <ul style={{ fontSize: 11, fontFamily: 'var(--font-ui)', margin: 0, paddingLeft: 18 }}>
                {roadRollup.sampleNamed!.map((r) => (
                  <li key={r.roadNodeId}>
                    <button
                      type="button"
                      style={{ ...btnStyle, padding: '2px 8px', fontSize: 10 }}
                      onClick={() => {
                        setInputId(r.roadNodeId)
                        void inspectNode(r.roadNodeId)
                      }}
                    >
                      Inspect
                    </button>{' '}
                    <code>{r.roadNodeId}</code>
                    {r.displayName ? ` — ${r.displayName}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div>
          <span style={sectionHeader}>Node inspect (Control-Tower organism)</span>
          <p
            style={{
              fontSize: 11,
              color: 'var(--color-text-tertiary)',
              fontFamily: 'var(--font-ui)',
              marginTop: 4,
              marginBottom: 8,
            }}
          >
            Locks hash <code>node=</code>. Walk edges OUT/IN on gold{' '}
            <code>48021:28286</code> (parcel → boundary-edge → road / neighbor). Endpoint-200 alone
            is not the done-line (Amendment 1).
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
            <button
              style={btnStyle}
              onClick={() => void inspectNode(inputId)}
              disabled={loadingNode}
              data-testid="node-graph-inspect"
            >
              {loadingNode ? 'Loading…' : 'Inspect'}
            </button>
            <button
              style={btnStyle}
              onClick={() => lockParcelNode(inputId.trim(), { panelId: 'site-analysis' })}
              disabled={!isCanonicalParcelNodeId(inputId)}
              title="Lock parcel and open map workspace (ledger → map)"
            >
              Lock on map
            </button>
          </div>
          {inspectNodeId && (
            <div style={{ marginTop: 8, fontSize: 11, fontFamily: 'var(--font-ui)' }}>
              Locked: <code data-testid="node-graph-locked">{inspectNodeId}</code>
              {isCanonicalBoundaryEdgeNodeId(inspectNodeId) && ' (boundary-edge)'}
              {isCanonicalRoadNodeId(inspectNodeId) && ' (road)'}
            </div>
          )}
          {nodeError && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--color-text-danger)', fontFamily: 'var(--font-ui)' }}>
              {nodeError}
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
                onWalk={(nextId) => {
                  setInputId(nextId)
                  void inspectNode(nextId)
                }}
                onClose={() => {
                  setDetail(null)
                  setChainJson(null)
                  lockInspectNode(null)
                }}
              />
            )}
            {!loadingNode && detail && !detail.available && (
              <Empty>{detail.reason || 'Node not available.'}</Empty>
            )}
          </div>
        </div>
      </div>
    </Panel>
  )
}

export default NodeGraph
