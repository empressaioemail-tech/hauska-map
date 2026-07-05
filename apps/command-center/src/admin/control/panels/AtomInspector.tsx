// apps/command-center/src/admin/control/panels/AtomInspector.tsx
//
// Command Center · Atom Inspector (panel id: atom-inspector).  LIVE.
//
// Queries OUR spine atoms via the Empressa MCP server's `search_atoms` tool
// (public catalog — anonymous works; a key widens scope). Selecting an atom
// opens a detail view. The CONFIDENCE DISPLAY RULE from the trading Control
// Tower is preserved verbatim in spirit: a confidence figure is NEVER shown as a
// bare number — value, n, width and basis are always rendered together, so a
// thin/asserted figure cannot masquerade as an earned one (doc-repo commitments
// #1 sell reasoning not data, #2 confidence earned not asserted).
//
// Our atom shape differs from the trading admin's admin_spine.py models, so
// toConfidenceFigure maps our read-contract calibratedConfidence
// {estimate, n, intervalWidth, provenance} → {value, n, width, basis, scope}.
// This panel renders REAL MCP results, or an honest empty/error when MCP is
// unreachable — never mock data.

import React, { useEffect, useMemo, useState } from 'react'
import { useActivePanel } from '../center/useActivePanel'
import { loadConfig, HauskaMcpClient, type SpineConfig } from '../../api/spineClient'
import { Panel, Pill, Loading, ErrorState, Empty, sectionHeader, mono, fmtTime, fmtNum } from '../primitives'

interface ConfidenceFigure {
  value: number
  n: number
  width: number
  basis: string
  scope: string
}

interface RawAtom {
  [key: string]: unknown
}

interface AtomRowModel {
  id: string
  claimType: string
  claimKey: string
  worker: string
  family: string
  jurisdiction: string
  accessPolicy: string
  knowledgeTime: string | null
  confidence: ConfidenceFigure
  raw: RawAtom
}

function str(v: unknown, fallback = ''): string {
  return v == null ? fallback : String(v)
}

// Map our atom → a never-bare confidence figure. Defensive: atoms may carry the
// read-contract calibratedConfidence {estimate, n, intervalWidth, provenance},
// a top-level confidence object, or nothing (then value 0 / basis asserted).
function toConfidenceFigure(atom: RawAtom): ConfidenceFigure {
  const rc = (atom.readContract as { axes?: { calibratedConfidence?: Record<string, unknown> } } | undefined)?.axes
    ?.calibratedConfidence
  const cal = (rc || (atom.confidence as Record<string, unknown> | undefined) || {}) as Record<string, unknown>
  const value = Number(cal.estimate ?? cal.value ?? 0) || 0
  const n = Number(cal.n ?? cal.sampleSize ?? 0) || 0
  const width = Number(cal.intervalWidth ?? cal.width ?? 0) || 0
  const basis = str(cal.provenance ?? cal.basis, 'asserted')
  const scope = str(
    atom.accessPolicy ?? atom.policy ?? (atom as { access_policy?: unknown }).access_policy ?? cal.scope,
    '—',
  )
  return { value, n, width, basis, scope }
}

function toRow(atom: RawAtom): AtomRowModel {
  const id = str(
    atom.atomDid ?? atom.atomId ?? atom.id ?? atom.did ?? (atom as { atom_id?: unknown }).atom_id,
    Math.random().toString(36).slice(2),
  )
  const family = str(
    atom.family ?? atom.entityType ?? atom.type ?? (atom as { entity_type?: unknown }).entity_type,
    'unknown',
  )
  return {
    id,
    claimType: str(atom.claimType ?? (atom as { claim_type?: unknown }).claim_type ?? atom.title ?? family, family),
    claimKey: str(atom.claimKey ?? (atom as { claim_key?: unknown }).claim_key ?? atom.sectionNumber ?? atom.key, '—'),
    worker: str(atom.worker ?? atom.author ?? atom.source, '—'),
    family,
    jurisdiction: str(
      atom.jurisdiction ?? atom.jurisdictionTenant ?? (atom as { jurisdiction_tenant?: unknown }).jurisdiction_tenant,
      '—',
    ),
    accessPolicy: str(atom.accessPolicy ?? atom.policy ?? (atom as { access_policy?: unknown }).access_policy, '—'),
    knowledgeTime: (atom.knowledgeTime ?? (atom as { knowledge_time?: unknown }).knowledge_time ?? atom.updatedAt ?? null) as
      | string
      | null,
    confidence: toConfidenceFigure(atom),
    raw: atom,
  }
}

// ── ConfidenceBlock — the display-rule enforcer (never a bare number) ──
const ConfidenceBlock: React.FC<{ fig: ConfidenceFigure; showValue?: boolean }> = ({ fig, showValue = true }) => {
  const cells: { label: string; value: string; strong?: boolean }[] = []
  if (showValue) cells.push({ label: 'value', value: fmtNum(fig.value, 3), strong: true })
  cells.push({ label: 'n', value: fmtNum(fig.n) })
  cells.push({ label: 'width', value: fmtNum(fig.width, 3) })
  cells.push({ label: 'basis', value: fig.basis })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cells.length}, 1fr)`,
          gap: 1,
          background: 'var(--color-border-tertiary)',
          border: '0.5px solid var(--color-border-tertiary)',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        {cells.map((c) => (
          <div
            key={c.label}
            style={{ padding: '8px 10px', background: 'var(--color-background-secondary)', display: 'flex', flexDirection: 'column', gap: 3 }}
          >
            <span style={sectionHeader}>{c.label}</span>
            <span style={{ ...mono, fontSize: c.strong ? 14 : 12, fontWeight: 700, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {c.value}
            </span>
          </div>
        ))}
      </div>
      <span style={{ fontSize: 9.5, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-ui)' }}>
        scope={fig.scope} · a confidence figure always carries n + width + basis
      </span>
    </div>
  )
}

const ConfidenceInline: React.FC<{ fig: ConfidenceFigure }> = ({ fig }) => (
  <span style={{ ...mono, fontSize: 10, color: 'var(--color-text-secondary)' }}>
    n={fmtNum(fig.n)} · width={fmtNum(fig.width, 3)} · basis={fig.basis}
  </span>
)

const AtomRow: React.FC<{ a: AtomRowModel; onClick: () => void }> = ({ a, onClick }) => (
  <button
    onClick={onClick}
    style={{
      textAlign: 'left',
      display: 'flex',
      flexDirection: 'column',
      gap: 3,
      padding: '7px 10px',
      borderRadius: 6,
      cursor: 'pointer',
      background: 'var(--color-background-secondary)',
      border: '0.5px solid var(--color-border-tertiary)',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ ...mono, fontSize: 11, fontWeight: 700, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {a.claimType}
      </span>
      <span style={{ ...mono, fontSize: 10, color: 'var(--color-text-tertiary)' }}>{fmtTime(a.knowledgeTime)}</span>
    </div>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', ...mono, fontSize: 10, color: 'var(--color-text-secondary)' }}>
      <span>key: {a.claimKey}</span>
      <span>family: {a.family}</span>
      <span>juris: {a.jurisdiction}</span>
      <Pill sev={a.accessPolicy.includes('public') ? 'ok' : 'warn'}>{a.accessPolicy}</Pill>
    </div>
    <ConfidenceInline fig={a.confidence} />
  </button>
)

const AtomDetailView: React.FC<{ atom: AtomRowModel; onClose: () => void }> = ({ atom, onClose }) => {
  const claimValue = atom.raw.claimValue ?? (atom.raw as { claim_value?: unknown }).claim_value ?? atom.raw.text ?? atom.raw.body ?? atom.raw
  const provenance = (atom.raw.provenance as { source?: string; method?: string } | undefined) ?? null
  const citation = (atom.raw.citation as { ref?: string; url?: string } | undefined) ?? null
  const btnStyle: React.CSSProperties = {
    fontFamily: 'var(--font-ui)',
    fontSize: 11,
    fontWeight: 600,
    padding: '4px 10px',
    borderRadius: 6,
    cursor: 'pointer',
    color: 'var(--color-text-primary)',
    background: 'var(--color-background-secondary)',
    border: '0.5px solid var(--color-border-secondary)',
  }
  const labelVal: React.CSSProperties = { ...mono, fontSize: 11, color: 'var(--color-text-primary)', wordBreak: 'break-all' }
  const pre: React.CSSProperties = {
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
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-ui)' }}>{atom.claimType}</span>
          <Pill sev="info">{atom.family}</Pill>
          <Pill sev={atom.accessPolicy.includes('public') ? 'ok' : 'warn'}>{atom.accessPolicy}</Pill>
        </div>
        <button onClick={onClose} style={btnStyle}>← back to results</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={sectionHeader}>Claim</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', alignItems: 'baseline' }}>
          <span style={sectionHeader}>atom id</span>
          <span style={labelVal}>{atom.id}</span>
          <span style={sectionHeader}>claim_key</span>
          <span style={labelVal}>{atom.claimKey}</span>
          <span style={sectionHeader}>worker</span>
          <span style={labelVal}>{atom.worker}</span>
          <span style={sectionHeader}>jurisdiction</span>
          <span style={labelVal}>{atom.jurisdiction}</span>
        </div>
        <pre style={pre}>{typeof claimValue === 'string' ? claimValue : JSON.stringify(claimValue, null, 2)}</pre>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={sectionHeader}>Confidence (object — never bare)</span>
        <ConfidenceBlock fig={atom.confidence} showValue={false} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={sectionHeader}>Provenance &amp; citation</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', alignItems: 'baseline' }}>
          <span style={sectionHeader}>source</span>
          <span style={labelVal}>{provenance?.source || '—'}</span>
          <span style={sectionHeader}>method</span>
          <span style={labelVal}>{provenance?.method || '—'}</span>
          <span style={sectionHeader}>citation</span>
          <span style={labelVal}>
            {citation?.ref || '—'}
            {citation?.url ? (
              <>
                {' '}
                <a href={citation.url} target="_blank" rel="noreferrer" style={{ color: 'var(--color-text-info)' }}>
                  {citation.url}
                </a>
              </>
            ) : null}
          </span>
        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 11,
  padding: '4px 8px',
  borderRadius: 6,
  color: 'var(--color-text-primary)',
  background: 'var(--color-background-secondary)',
  border: '0.5px solid var(--color-border-tertiary)',
  minWidth: 0,
}
const btnStyle: React.CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 11,
  fontWeight: 600,
  padding: '4px 10px',
  borderRadius: 6,
  cursor: 'pointer',
  color: 'var(--color-text-primary)',
  background: 'var(--color-background-accent)',
  border: '0.5px solid var(--color-border-secondary)',
}

function extractHits(result: Record<string, unknown>): RawAtom[] {
  const r = result as {
    results?: RawAtom[]
    atoms?: RawAtom[]
    data?: { results?: RawAtom[]; atoms?: RawAtom[] }
    items?: RawAtom[]
  }
  return r.results || r.atoms || r.data?.results || r.data?.atoms || r.items || []
}

export const AtomInspector: React.FC = () => {
  const [, selectPanel, hashParams] = useActivePanel()
  const config = useMemo<SpineConfig>(() => loadConfig(), [])
  const [query, setQuery] = useState('building code')
  const [jurisdiction, setJurisdiction] = useState('')
  const [entityType, setEntityType] = useState('')
  const [applied, setApplied] = useState(0)
  const [rows, setRows] = useState<AtomRowModel[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const selected = hashParams.id ? rows?.find((r) => r.id === hashParams.id) ?? null : null

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setErr(null)
    ;(async () => {
      try {
        if (!config.mcpUrl) {
          if (!cancelled) {
            setRows([])
            setErr(null)
          }
          return
        }
        const mcp = new HauskaMcpClient(config.mcpUrl, config.hauskaKey, 'public')
        const result = await mcp.callTool('search_atoms', {
          query: query || 'building code',
          jurisdiction: jurisdiction || undefined,
          entity_type: entityType ? entityType.replace(/-/g, '_') : undefined,
          limit: 100,
        })
        if (cancelled) return
        const hits = extractHits(result).map(toRow)
        setRows(hits)
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied])

  const openAtom = (id: string): void => selectPanel('atom-inspector', { id })
  const closeDetail = (): void => selectPanel('atom-inspector')

  return (
    <Panel
      title="Atom Inspector"
      subtitle="Live · MCP search_atoms (public catalog) · confidence never bare"
      right={<Pill sev={config.hauskaKey ? 'ok' : 'info'}>{config.hauskaKey ? 'keyed' : 'anonymous'}</Pill>}
    >
      {selected ? (
        <AtomDetailView atom={selected} onClose={closeDetail} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <input style={{ ...inputStyle, flex: 1 }} placeholder="query" value={query} onChange={(e) => setQuery(e.target.value)} />
            <input style={inputStyle} placeholder="jurisdiction" value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} />
            <input style={inputStyle} placeholder="entity_type" value={entityType} onChange={(e) => setEntityType(e.target.value)} />
            <button style={btnStyle} onClick={() => setApplied((a) => a + 1)}>
              Query
            </button>
          </div>

          {loading ? (
            <Loading />
          ) : err ? (
            <ErrorState msg={`${err} — is the Empressa MCP server reachable at ${config.mcpUrl}?`} />
          ) : !rows || rows.length === 0 ? (
            <Empty>
              No atoms — start the local MCP server ({config.mcpUrl}) or set an Empressa key in Settings, then query.
            </Empty>
          ) : (
            <>
              <span style={sectionHeader}>Results · {fmtNum(rows.length)}</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {rows.map((a) => (
                  <AtomRow key={a.id} a={a} onClick={() => openAtom(a.id)} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </Panel>
  )
}

export default AtomInspector
