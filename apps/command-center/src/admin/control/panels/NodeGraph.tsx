// apps/command-center/src/admin/control/panels/NodeGraph.tsx
//
// Command Center · Node & Graph (panel id: node-graph). LIVE (F1b / WDLL 3).
//
// Balance-sheet ledger of the physical-world node graph:
//   - County tally in the Gate A live-SELECT shape (G1)
//   - Node inspect by canonical parcelNodeId → property atom-chain
//     (same retrieval path as PE / Gate C — NOT /atoms/trace, which 404s for
//     property atoms that exist without a composition graph)
//   - Bidirectional binding via hash `node=` (WDLL 4)

import React, { useEffect, useMemo, useState } from 'react'
import { loadConfig, type SpineConfig } from '../../api/spineClient'
import {
  fetchPropertyAtomChain,
  propertyChainSlotStatuses,
  type PropertyAtomChainBody,
} from '../../api/atomTrace'
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
    setSlotStatus({
      'zoning-fact': 'loading',
      'setback-rule': 'loading',
      'buildable-envelope': 'loading',
    })

    const result = await fetchPropertyAtomChain(nodeId, config)
    if (!result.ok) {
      setSlotStatus({
        'zoning-fact': 'error',
        'setback-rule': 'error',
        'buildable-envelope': 'error',
      })
      setTraceJson('—')
      setNodeError(result.error || `atom-chain HTTP ${result.status}`)
      setLoadingNode(false)
      return
    }

    const chain = result.json as PropertyAtomChainBody
    const next = propertyChainSlotStatuses(chain)
    setSlotStatus(next)
    setTraceJson(JSON.stringify(chain, null, 2))
    setLoadingNode(false)
  }

  // Map → ledger: when LiveMapTile locks `node=`, re-inspect that id (WDLL 4).
  useEffect(() => {
    if (parcelNodeId) void inspectNode(parcelNodeId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parcelNodeId])

  const counties = tally?.centralTx?.counties ?? []

  return (
    <Panel
      title="Node & Graph"
      subtitle="Live ledger · Gate A SELECT shape + retrieval property atom-chain"
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
            Locks hash <code>node=</code> (WDLL 4 binding). Slot pills from the
            shared <code>fetchPropertyAtomChain</code> client — same retrieval
            path as PE facets / Gate C.
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
              {loadingNode ? 'Loading…' : 'Inspect'}
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
            <span style={sectionHeader}>Atom chain (shared client)</span>
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
