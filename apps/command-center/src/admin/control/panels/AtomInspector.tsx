// apps/command-center/src/admin/control/panels/AtomInspector.tsx
//
// Command Center · Atom Inspector (panel id: atom-inspector).
//
// Two paths (CC-A U2 / WDLL 3+4+5 — do not invent a second organism):
//   1. Code-catalog search via MCP search_atoms (unchanged).
//   2. Property-scoped detail when hash carries return=node-graph + id=DID —
//      PORT of trading Control Tower AtomInspector detail (claim, ConfidenceBlock
//      {n,width,basis}, provenance/citation, bitemporal, lineage/supersession,
//      LIVE/AS-OF when backend supports, accessPolicy ∩ license). Boundary-edge
//      atoms also render role / adjacency / setback / interior; property-line-tags
//      only if present and labeled "not a survey".
//
// closeDetail PORT: restore node-graph with node + atoms (+ return_*).

import React, { useEffect, useMemo, useState } from 'react'
import { useActivePanel } from '../center/useActivePanel'
import { loadConfig, HauskaMcpClient, type SpineConfig } from '../../api/spineClient'
import { SEARCH_ATOMS_ENTITY_TYPES, normalizeJurisdiction } from '../../api/searchAtomsContract'
import { fetchAtomByDid } from '../../api/atomTrace'
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

function isHauskaDid(id: string | undefined | null): boolean {
  return typeof id === 'string' && id.startsWith('did:hauska:')
}

// Map our atom → a never-bare confidence figure. Defensive: atoms may carry the
// read-contract calibratedConfidence {estimate, n, intervalWidth, provenance},
// assertedConfidence, a top-level confidence object, or nothing.
function toConfidenceFigure(atom: RawAtom): ConfidenceFigure {
  const axes = (atom.readContract as { axes?: Record<string, unknown> } | undefined)?.axes
  const cal = (axes?.calibratedConfidence ||
    axes?.assertedConfidence ||
    atom.confidence ||
    {}) as Record<string, unknown>
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
    worker: str(atom.worker ?? atom.author ?? atom.sourceAdapter ?? atom.source, '—'),
    family,
    jurisdiction: str(
      atom.jurisdiction ?? atom.jurisdictionTenant ?? (atom as { jurisdiction_tenant?: unknown }).jurisdiction_tenant,
      '—',
    ),
    accessPolicy: str(atom.accessPolicy ?? atom.policy ?? (atom as { access_policy?: unknown }).access_policy, '—'),
    knowledgeTime: (atom.knowledgeTime ??
      (atom as { knowledge_time?: unknown }).knowledge_time ??
      atom.extractedAt ??
      atom.updatedAt ??
      null) as string | null,
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
const labelVal: React.CSSProperties = {
  ...mono,
  fontSize: 11,
  color: 'var(--color-text-primary)',
  wordBreak: 'break-all',
}
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

/** Catalog-path detail (search_atoms hit already in hand). */
const CatalogAtomDetailView: React.FC<{ atom: AtomRowModel; onClose: () => void; backLabel: string }> = ({
  atom,
  onClose,
  backLabel,
}) => {
  const claimValue =
    atom.raw.claimValue ?? (atom.raw as { claim_value?: unknown }).claim_value ?? atom.raw.text ?? atom.raw.body ?? atom.raw
  const provenance = (atom.raw.provenance as { source?: string; method?: string } | undefined) ?? null
  const citation = (atom.raw.citation as { ref?: string; url?: string } | undefined) ?? null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} data-testid="atom-detail-catalog">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-ui)' }}>
            {atom.claimType}
          </span>
          <Pill sev="info">{atom.family}</Pill>
          <Pill sev={atom.accessPolicy.includes('public') ? 'ok' : 'warn'}>{atom.accessPolicy}</Pill>
        </div>
        <button type="button" onClick={onClose} style={{ ...btnStyle, background: 'var(--color-background-secondary)' }}>
          {backLabel}
        </button>
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

/**
 * Property-rich AtomDetailView — PORT of CT AtomInspector detail (WDLL 4).
 * Fetches GET /atoms/:did. Lineage / LIVE-AS-OF honest-empty when substrate lacks them.
 */
const PropertyAtomDetailView: React.FC<{
  atomId: string
  config: SpineConfig
  onClose: () => void
  backLabel: string
}> = ({ atomId, config, onClose, backLabel }) => {
  const [atom, setAtom] = useState<RawAtom | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void fetchAtomByDid(atomId, config).then((res) => {
      if (cancelled) return
      if (!res.ok || !res.json?.atom) {
        setAtom(null)
        setErr(res.error || (res.status === 404 ? 'Atom not found.' : `HTTP ${res.status}`))
      } else {
        setAtom(res.json.atom as RawAtom)
        setErr(null)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [atomId, config])

  if (loading) return <Loading />
  if (err) return <ErrorState msg={err} />
  if (!atom) return <Empty>Atom not found.</Empty>

  const row = toRow(atom)
  const claimValue =
    atom.claimValue ??
    (atom as { claim_value?: unknown }).claim_value ??
    atom.district ??
    atom.setbackTable ??
    atom.buildableAreaSqFt ??
    atom
  const provenance =
    (atom.provenance as { source?: string; method?: string } | undefined) ??
    (atom.sourceAdapter || atom.sourceUrl
      ? { source: str(atom.sourceAdapter || atom.sourceUrl), method: str(atom.sourceCitation ?? 'storage') }
      : null)
  const citation =
    (atom.citation as { ref?: string; url?: string } | undefined) ??
    (atom.sourceCitation ? { ref: str(atom.sourceCitation), url: null } : null)
  const license = (atom.license as Record<string, unknown> | undefined) ?? null
  const reasoningChain = atom.reasoningChain ?? null
  const isBoundary = row.family === 'property-boundary-edge'
  const lineTags =
    atom.propertyLineTags ??
    atom.property_line_tags ??
    (atom as { 'property-line-tags'?: unknown })['property-line-tags'] ??
    null
  const depthWarmKeys = Object.keys(atom).filter((k) => k.toLowerCase().startsWith('depthwarm'))

  const validFrom = atom.validFrom ?? atom.valid_from ?? atom.effectiveDate ?? null
  const validTo = atom.validTo ?? atom.valid_to ?? null
  const knowledgeTime = atom.knowledgeTime ?? atom.knowledge_time ?? atom.extractedAt ?? null
  const capturedAt = atom.capturedAt ?? atom.captured_at ?? atom.fetchedAt ?? null
  const supersedes = atom.supersedesEntityId ?? atom.supersedes_entity_id ?? null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} data-testid="atom-detail-property">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-ui)' }}>
            {row.claimType}
          </span>
          <Pill sev="info">{row.family}</Pill>
          <Pill sev={row.accessPolicy.includes('public') ? 'ok' : 'warn'}>access: {row.accessPolicy}</Pill>
          {atom.status != null ? <Pill sev="info">{str(atom.status)}</Pill> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{ ...btnStyle, background: 'var(--color-background-secondary)' }}
          data-testid="atom-detail-back"
        >
          {backLabel}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={sectionHeader}>Claim</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', alignItems: 'baseline' }}>
          {(
            [
              ['entity', `${row.family} · ${str(atom.entityId ?? atom.parcelNodeId ?? atom.boundaryEdgeId ?? '—')}`],
              ['claim_key', row.claimKey],
              ['worker', row.worker],
              ['atom_id', row.id],
            ] as [string, string][]
          ).map(([k, v]) => (
            <React.Fragment key={k}>
              <span style={sectionHeader}>{k}</span>
              <span style={labelVal}>{v}</span>
            </React.Fragment>
          ))}
        </div>
        <pre style={pre}>{typeof claimValue === 'string' ? claimValue : JSON.stringify(claimValue, null, 2)}</pre>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={sectionHeader}>Confidence (object — never bare)</span>
        <ConfidenceBlock fig={row.confidence} showValue={false} />
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
            {citation?.ref || str(atom.sourceCitation) || '—'}
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={sectionHeader}>Bitemporal</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', alignItems: 'baseline' }}>
          {(
            [
              ['valid_from', fmtTime(validFrom as string | null)],
              ['valid_to', validTo ? fmtTime(validTo as string) : '∞ (open)'],
              ['knowledge_time', fmtTime(knowledgeTime as string | null)],
              ['captured_at', fmtTime(capturedAt as string | null)],
            ] as [string, string][]
          ).map(([k, v]) => (
            <React.Fragment key={k}>
              <span style={sectionHeader}>{k}</span>
              <span style={labelVal}>{v}</span>
            </React.Fragment>
          ))}
        </div>
      </div>

      {isBoundary && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} data-testid="boundary-atom-fields">
          <span style={sectionHeader}>Boundary primitive (property-rich)</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', alignItems: 'baseline' }}>
            {(
              [
                ['role', str(atom.role, '—')],
                ['adjacency', str(atom.adjacencyKind, '—')],
                ['setback', atom.setback != null ? JSON.stringify(atom.setback) : '—'],
                ['interior', atom.interior != null ? JSON.stringify(atom.interior) : '—'],
                ['neighbor', str(atom.parcelNeighborPropId, '—')],
                [
                  'facing_road',
                  atom.facingRoad != null
                    ? str((atom.facingRoad as { roadNodeId?: string }).roadNodeId, JSON.stringify(atom.facingRoad))
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
          {lineTags != null ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={sectionHeader}>property-line-tags</span>
              <Pill sev="warn">not a survey (GIS-approx)</Pill>
              <pre style={pre}>{JSON.stringify(lineTags, null, 2)}</pre>
            </div>
          ) : (
            <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-ui)' }}>
              No property-line-tags on this edge (optional — Amendment 2). GIS-approx — not a survey.
            </span>
          )}
        </div>
      )}

      {reasoningChain != null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={sectionHeader}>Reasoning chain</span>
          <pre style={pre}>{JSON.stringify(reasoningChain, null, 2)}</pre>
        </div>
      )}

      {depthWarmKeys.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={sectionHeader}>Depth-warm fields</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', alignItems: 'baseline' }}>
            {depthWarmKeys.map((k) => (
              <React.Fragment key={k}>
                <span style={sectionHeader}>{k}</span>
                <span style={labelVal}>
                  {typeof atom[k] === 'string' ? str(atom[k]) : JSON.stringify(atom[k])}
                </span>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={sectionHeader}>Access &amp; license</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Pill sev={row.accessPolicy.includes('public') ? 'ok' : 'warn'}>access: {row.accessPolicy}</Pill>
          {license && Object.keys(license).length > 0 ? (
            <Pill sev="info">license present</Pill>
          ) : (
            <Pill sev="info">no license terms</Pill>
          )}
        </div>
        {license && Object.keys(license).length > 0 ? (
          <pre style={pre}>{JSON.stringify(license, null, 2)}</pre>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-ui)' }}>
            No license terms recorded.
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={sectionHeader}>Time travel — LIVE / AS-OF</span>
        <Empty>
          Property substrate does not expose LIVE/AS-OF projection endpoints yet — showing the
          fetched atom as current. (CT TimeTravel ports when retrieval adds as-of.)
        </Empty>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={sectionHeader}>Lineage / supersession chain</span>
        {supersedes ? (
          <div
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              background: 'var(--color-background-secondary)',
              border: '0.5px solid var(--color-border-tertiary)',
            }}
          >
            <span style={labelVal}>supersedes: {str(supersedes)}</span>
          </div>
        ) : (
          <Empty>No supersession chain indexed for this property atom.</Empty>
        )}
      </div>
    </div>
  )
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

  const selectedId = hashParams.id ?? null
  const fromNodeGraph = hashParams.return === 'node-graph'
  const propertyDetailMode = Boolean(selectedId && (fromNodeGraph || isHauskaDid(selectedId)))
  const catalogSelected =
    selectedId && !propertyDetailMode ? rows?.find((r) => r.id === selectedId) ?? null : null
  const normalizedJurisdiction = normalizeJurisdiction(jurisdiction)

  useEffect(() => {
    // Skip catalog query when deep-linked into a property atom detail.
    if (propertyDetailMode) {
      setLoading(false)
      return
    }
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
          jurisdiction: normalizeJurisdiction(jurisdiction) || undefined,
          entity_type: entityType || undefined,
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
  }, [applied, propertyDetailMode])

  /** PORT of CT AtomInspector.closeDetail (WDLL 5). */
  const closeDetail = (): void => {
    if (hashParams.return === 'node-graph' && hashParams.node) {
      const nodeParams: Record<string, string> = { node: hashParams.node }
      if (hashParams.atoms) nodeParams.atoms = hashParams.atoms
      for (const [k, v] of Object.entries(hashParams)) {
        if (k.startsWith('return_') && v) nodeParams[k.slice('return_'.length)] = v
      }
      selectPanel('node-graph', nodeParams)
      return
    }
    selectPanel('atom-inspector')
  }

  const openAtom = (id: string): void => selectPanel('atom-inspector', { id })
  const backLabel =
    hashParams.return === 'node-graph' && hashParams.node ? '← back to node' : '← back to results'

  return (
    <Panel
      title="Atom Inspector"
      subtitle={
        propertyDetailMode
          ? 'Property atom detail · Control-Tower port · confidence never bare'
          : 'Live · MCP search_atoms (public catalog) · confidence never bare'
      }
      right={
        <Pill sev={config.hauskaKey ? 'ok' : 'info'}>{config.hauskaKey ? 'keyed' : 'anonymous'}</Pill>
      }
    >
      {propertyDetailMode && selectedId ? (
        <PropertyAtomDetailView
          atomId={selectedId}
          config={config}
          onClose={closeDetail}
          backLabel={backLabel}
        />
      ) : catalogSelected ? (
        <CatalogAtomDetailView atom={catalogSelected} onClose={closeDetail} backLabel={backLabel} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              style={{ ...inputStyle, flex: 1 }}
              placeholder="query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <input
              style={inputStyle}
              placeholder="jurisdiction (e.g. Bastrop, TX)"
              value={jurisdiction}
              onChange={(e) => setJurisdiction(e.target.value)}
            />
            <select
              style={inputStyle}
              aria-label="entity_type"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
            >
              <option value="">all entity types</option>
              {SEARCH_ATOMS_ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button style={btnStyle} onClick={() => setApplied((a) => a + 1)}>
              Query
            </button>
          </div>
          {normalizedJurisdiction ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <Pill sev="info">jurisdiction sent: {normalizedJurisdiction}</Pill>
              {normalizedJurisdiction !== jurisdiction.trim() ? (
                <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-ui)' }}>
                  normalized from “{jurisdiction.trim()}” — search_atoms matches exact underscored tenant ids only
                </span>
              ) : null}
            </div>
          ) : null}

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
