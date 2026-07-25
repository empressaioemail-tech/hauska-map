// apps/command-center/src/admin/control/panels/NodeGraph.tsx
//
// Command Center · Node & Graph (panel id: node-graph). LIVE (F1b / WDLL 3).
//
// Balance-sheet ledger of the physical-world node graph:
//   - County tally in the Gate A live-SELECT shape (G1)
//   - Node inspect by canonical parcelNodeId → property-chain DIDs + shared
//     retrieval /atoms/trace/:did client (SAME as Parcel Trace — no second tracer)
//   - Bidirectional binding via hash `node=` (WDLL 4)

import React, { useEffect, useMemo, useState } from 'react'
import { loadConfig, type SpineConfig } from '../../api/spineClient'
import { fetchAtomTrace, propertyChainDids } from '../../api/atomTrace'
import { Panel, Pill, Loading, sectionHeader, mono } from '../primitives'
import { useParcelNodeBinding, isCanonicalParcelNodeId } from '../center/parcelNodeBinding'

interface CountyTallyRow {
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
  zoning_present_pct: number
}

interface GateATally {
  generatedAt?: string
  source?: string
  servingRevisionNote?: string
  totals?: Record<string, unknown>
  centralTx?: { counties?: CountyTallyRow[] }
}

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

type SlotStatus = 'present' | 'honest-empty' | 'missing' | 'error' | 'loading'

export const NodeGraph: React.FC = () => {
  const config = useMemo<SpineConfig>(() => loadConfig(), [])
  const { parcelNodeId, lockParcelNode } = useParcelNodeBinding()
  const [inputId, setInputId] = useState(parcelNodeId ?? '48209:156346')
  const [tally, setTally] = useState<GateATally | null>(null)
  const [tallyError, setTallyError] = useState<string | null>(null)
  const [slotStatus, setSlotStatus] = useState<Record<string, SlotStatus>>({})
  const [traceJson, setTraceJson] = useState<string>('—')
  const [loadingNode, setLoadingNode] = useState(false)
  const [nodeError, setNodeError] = useState<string | null>(null)

  useEffect(() => {
    if (parcelNodeId) setInputId(parcelNodeId)
  }, [parcelNodeId])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/central_tx_node_graph_tally.json', {
          headers: { Accept: 'application/json' },
        })
        if (!res.ok) {
          if (!cancelled) setTallyError(`Tally artifact HTTP ${res.status}`)
          return
        }
        // Gate C: artifact must be UTF-8 JSON. Strip a leading BOM if a bad
        // encoding ever ships again (UTF-16 BOM made res.json() throw).
        const raw = await res.text()
        const text = raw.replace(/^\uFEFF/, '')
        const json = JSON.parse(text) as GateATally
        if (!cancelled) {
          setTally(json)
          setTallyError(null)
        }
      } catch (err) {
        if (!cancelled) setTallyError((err as Error).message)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const inspectNode = async (id: string) => {
    const nodeId = id.trim()
    if (!isCanonicalParcelNodeId(nodeId)) {
      setNodeError('parcelNodeId must match {fips}:{propId} (G6)')
      return
    }
    setLoadingNode(true)
    setNodeError(null)
    lockParcelNode(nodeId)
    const dids = propertyChainDids(nodeId)
    const slots: Array<{ key: string; did: string }> = [
      { key: 'zoning-fact', did: dids.zoningFact },
      { key: 'setback-rule', did: dids.setbackRule },
      { key: 'buildable-envelope', did: dids.buildableEnvelope },
    ]
    setSlotStatus(Object.fromEntries(slots.map((s) => [s.key, 'loading' as SlotStatus])))

    const next: Record<string, SlotStatus> = {}
    let firstTrace: unknown = null
    for (const slot of slots) {
      const result = await fetchAtomTrace(slot.did, config)
      if (!result.ok) {
        // 404 / not found → honest empty for that slot (G1), not a panel error.
        if (result.status === 404) next[slot.key] = 'honest-empty'
        else next[slot.key] = 'error'
        continue
      }
      const body = result.json as { nodes?: unknown[]; atoms?: unknown[]; trace?: unknown } | null
      const hasGraph =
        (Array.isArray(body?.nodes) && body!.nodes!.length > 0) ||
        (Array.isArray(body?.atoms) && body!.atoms!.length > 0) ||
        body?.trace != null ||
        (body != null && Object.keys(body).length > 0)
      next[slot.key] = hasGraph ? 'present' : 'honest-empty'
      if (hasGraph && firstTrace == null) firstTrace = result.json
    }
    setSlotStatus(next)
    setTraceJson(firstTrace ? JSON.stringify(firstTrace, null, 2) : 'Honest empty — no graph edges for this node.')
    setLoadingNode(false)
  }

  useEffect(() => {
    if (parcelNodeId) void inspectNode(parcelNodeId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const counties = tally?.centralTx?.counties ?? []

  return (
    <Panel
      title="Node & Graph"
      subtitle="Live ledger · Gate A SELECT shape + retrieval /atoms/trace/:did"
      right={<Pill sev="ok">live</Pill>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <span style={sectionHeader}>Central-TX tally (G1 shape)</span>
          <p
            style={{
              fontSize: 11,
              color: 'var(--color-text-tertiary)',
              fontFamily: 'var(--font-ui)',
              marginTop: 4,
              marginBottom: 8,
            }}
          >
            Same columns as the Gate A live SELECT ({tally?.generatedAt ?? '…'}). Provenance:{' '}
            {tally?.source ?? 'loading…'}. Coverage numbers shown here must match this ledger — never a
            second prose figure (WDLL 9).
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
                    <th style={{ padding: '4px 6px' }}>Envelope</th>
                    <th style={{ padding: '4px 6px' }}>Full chain</th>
                    <th style={{ padding: '4px 6px' }}>Refs</th>
                    <th style={{ padding: '4px 6px' }}>%</th>
                  </tr>
                </thead>
                <tbody>
                  {counties.map((c) => (
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
                      <td style={{ padding: '4px 6px', ...mono }}>{c.references}</td>
                      <td style={{ padding: '4px 6px', ...mono }}>{c.zoning_present_pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <span style={sectionHeader}>Node inspect (canonical id)</span>
          <p
            style={{
              fontSize: 11,
              color: 'var(--color-text-tertiary)',
              fontFamily: 'var(--font-ui)',
              marginTop: 4,
              marginBottom: 8,
            }}
          >
            Locks hash <code>node=</code> (WDLL 4 binding). Traces via the shared{' '}
            <code>fetchAtomTrace</code> client — same path as Parcel Trace.
          </p>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              style={inputStyle}
              value={inputId}
              onChange={(e) => setInputId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void inspectNode(inputId)
              }}
              placeholder="48209:156346"
              data-testid="node-graph-input"
            />
            <button
              style={btnStyle}
              onClick={() => void inspectNode(inputId)}
              disabled={loadingNode}
              data-testid="node-graph-inspect"
            >
              {loadingNode ? 'Tracing…' : 'Inspect'}
            </button>
            <button
              style={btnStyle}
              onClick={() => lockParcelNode(inputId.trim(), { panelId: 'site-analysis' })}
              disabled={!isCanonicalParcelNodeId(inputId)}
              title="Lock node and open map workspace (ledger → map)"
            >
              Lock on map
            </button>
          </div>
          {parcelNodeId && (
            <div style={{ marginTop: 8, fontSize: 11, fontFamily: 'var(--font-ui)' }}>
              Locked: <code data-testid="node-graph-locked">{parcelNodeId}</code>
            </div>
          )}
          {nodeError && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--color-text-danger)' }}>{nodeError}</div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
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
          <div style={{ marginTop: 10 }}>
            <span style={sectionHeader}>Trace (shared client)</span>
            <pre style={preStyle} data-testid="node-graph-trace">
              {traceJson}
            </pre>
          </div>
        </div>
      </div>
    </Panel>
  )
}

export default NodeGraph
