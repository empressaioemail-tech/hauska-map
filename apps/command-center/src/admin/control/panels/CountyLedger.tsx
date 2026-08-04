// County Ledger — the Command Center factory-floor headline (R-FND-6, OPS-6).
//
// The operator's view of the rewarmable factory: per jurisdiction, what has
// been through the line, at what recipe version, certified or not, which stamps
// have rotted (staleness), and which are rewarm-unsafe. Reads the county-ledger
// endpoint (GET /api/county-ledger) served from county_facet_coverage, extended
// additively (OPS-9 S1) with a per-registry-row onboarding-ledger view (gate,
// cert, open defect classes, focused-fix count) joined from
// jurisdiction_registry_row_mirror / county_gate_cert_state /
// onboarding_ledger_event.
//
// This is where the operator WATCHES Bastrop come online (the first subject) and
// where staleness (the retirement rung) surfaces before it poisons the surface.
import React, { useEffect, useState } from 'react'
import { loadConfig, apiBase, getJson } from '../../api/spineClient'
import { Panel, Pill, Loading, ErrorState, sectionHeader, mono, type Severity } from '../primitives'

interface FacetRow {
  facet: string
  honestCoveragePct: number | null
  integrityVerdict: string
  /** @deprecated OPS-9 S1 — superseded by a jurisdiction row's `cert` (county_gate_cert_state). Still rendered for facets that predate the ledger. */
  certState: string | null
  recipeVersion: string | null
  stalenessFlag: boolean
  rewarmUnsafe: boolean
  sourceVintage: string | null
  /** @deprecated OPS-9 S1 — superseded by a jurisdiction row's `gate` (county_gate_cert_state). Still rendered for facets that predate the ledger. */
  onboarded: boolean
}

interface GateCheck {
  id: string
  outcome: string
  reason?: string
}

interface RowGate {
  passCount: number | null
  declineCount: number | null
  checks: GateCheck[] | null
}

interface RowCert {
  label: string | null
  blockPass: boolean | null
  scopeAnnotations: unknown
  gradedAt: string | null
}

interface OpenDefectClass {
  defectClass: string
  count: number
}

/** OPS-9 S1 — one jurisdiction_registry_row_mirror row's onboarding-ledger state. */
interface RegistryRowLedgerView {
  rowId: string
  countyName: string | null
  gate: RowGate | null
  cert: RowCert | null
  openDefectClasses: OpenDefectClass[]
  focusedFixCount: number
}

interface CountyRow {
  countyFips: string
  /** OPS-9 S1 — set when a registry mirror row carries a countyName for this fips. */
  countyName?: string | null
  onboarded: boolean
  hasStale: boolean
  rewarmUnsafe: boolean
  recipeVersions: string[]
  certStates: string[]
  facets: FacetRow[]
  /** OPS-9 S1 — per-registry-row onboarding-ledger state for this fips. Absent on a legacy (pre-v2) payload. */
  rows?: RegistryRowLedgerView[]
}

interface LedgerResponse {
  counties: CountyRow[]
  summary: {
    onboardedCount: number
    totalCounties: number
    staleCount: number
    rewarmUnsafeCount: number
  }
}

const certSev = (s: string | null): Severity => {
  if (s === 'certified' || s === 'r6-pass') return 'ok'
  if (s === 'mechanical-pass') return 'warn'
  if (s === 'uncerted' || s === null) return 'info'
  return 'info'
}

const gateCheckSev = (outcome: string): Severity => {
  const o = outcome.toUpperCase()
  if (o === 'PASS') return 'ok'
  if (o === 'DECLINE') return 'danger'
  return 'info'
}

/** Count of certified jurisdiction rows across every county (cert.blockPass === true), the v2 replacement for the deprecated facet-scorecard `onboardedCount`. */
function countCertifiedRows(counties: CountyRow[]): { certified: number; totalRows: number } {
  let certified = 0
  let totalRows = 0
  for (const c of counties) {
    for (const r of c.rows ?? []) {
      totalRows += 1
      if (r.cert?.blockPass === true) certified += 1
    }
  }
  return { certified, totalRows }
}

const cellStyle: React.CSSProperties = { padding: '4px 8px', verticalAlign: 'top' }

/** Compact GATE cell: n/8 summary + expandable per-check detail. */
const GateCell: React.FC<{ gate: RowGate | null }> = ({ gate }) => {
  if (!gate) {
    return (
      <span style={{ ...mono, fontSize: 'var(--type-caption)', color: 'var(--color-text-tertiary)' }}>
        no gate run recorded
      </span>
    )
  }
  const pass = gate.passCount ?? 0
  const decline = gate.declineCount ?? 0
  const total = pass + decline
  const checks = gate.checks ?? []
  const sev: Severity = decline > 0 ? (pass > 0 ? 'warn' : 'danger') : 'ok'
  return (
    <details>
      <summary style={{ cursor: 'pointer', listStyle: 'none' }}>
        <Pill sev={sev} title={`${pass} pass / ${decline} decline`}>
          {pass}/{total || 8}
        </Pill>
      </summary>
      {checks.length > 0 ? (
        <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {checks.map((c) => (
            <li key={c.id} style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <Pill sev={gateCheckSev(c.outcome)}>{c.outcome}</Pill>
              <span style={{ ...mono, fontSize: 'var(--type-caption)' }}>{c.id}</span>
              {c.reason ? (
                <span style={{ fontSize: 'var(--type-caption)', color: 'var(--color-text-tertiary)' }}>
                  {c.reason}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div style={{ marginTop: 6, fontSize: 'var(--type-caption)', color: 'var(--color-text-tertiary)' }}>
          no per-check detail on this payload
        </div>
      )}
    </details>
  )
}

/** Compact CERT cell: label + blockPass state + gradedAt, expandable scope-annotation detail. */
const CertCell: React.FC<{ cert: RowCert | null }> = ({ cert }) => {
  if (!cert) {
    return (
      <span style={{ ...mono, fontSize: 'var(--type-caption)', color: 'var(--color-text-tertiary)' }}>
        no cert run recorded
      </span>
    )
  }
  const annotations = Array.isArray(cert.scopeAnnotations) ? cert.scopeAnnotations : null
  const sev: Severity = cert.blockPass === true ? 'ok' : cert.blockPass === false ? 'danger' : 'info'
  return (
    <details>
      <summary style={{ cursor: 'pointer', listStyle: 'none' }}>
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <Pill sev={sev}>{cert.label ?? 'ungraded'}</Pill>
          {annotations && annotations.length > 0 ? (
            <Pill sev="info" title="scope annotations">
              {annotations.length} scope
            </Pill>
          ) : null}
        </span>
      </summary>
      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ ...mono, fontSize: 'var(--type-caption)', color: 'var(--color-text-tertiary)' }}>
          graded {cert.gradedAt ? fmtDate(cert.gradedAt) : '—'}
        </span>
        {annotations && annotations.length > 0 ? (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {annotations.map((a, i) => (
              <li key={i} style={{ fontSize: 'var(--type-caption)', color: 'var(--color-text-secondary)' }}>
                {summarizeAnnotation(a)}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </details>
  )
}

function summarizeAnnotation(a: unknown): string {
  if (a == null) return '—'
  if (typeof a === 'string') return a
  if (typeof a === 'object') {
    const obj = a as Record<string, unknown>
    const parts = Object.entries(obj)
      .slice(0, 4)
      .map(([k, v]) => `${k}=${String(v)}`)
    return parts.join(' · ')
  }
  return String(a)
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

/** OPEN DEFECT CLASSES cell: count chips per class. */
const DefectClassesCell: React.FC<{ classes: OpenDefectClass[] }> = ({ classes }) => {
  if (classes.length === 0) {
    return <span style={{ fontSize: 'var(--type-caption)', color: 'var(--color-text-tertiary)' }}>none open</span>
  }
  return (
    <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
      {classes.map((d) => (
        <Pill key={d.defectClass} sev="warn" title={`${d.count} open`}>
          {d.defectClass} ×{d.count}
        </Pill>
      ))}
    </span>
  )
}

/**
 * FOCUSED-FIX cell: the wire contract only carries a count
 * (`focusedFixCount`), not a per-parcel/per-finding list — the
 * onboarding_ledger_event rows behind that count are not in the
 * GET /api/county-ledger response. Render what the payload provides and
 * say so on expand rather than fabricate a list.
 */
const FocusedFixCell: React.FC<{ count: number }> = ({ count }) => {
  if (count === 0) {
    return <span style={{ fontSize: 'var(--type-caption)', color: 'var(--color-text-tertiary)' }}>0</span>
  }
  return (
    <details>
      <summary style={{ cursor: 'pointer', listStyle: 'none' }}>
        <Pill sev="warn">{count}</Pill>
      </summary>
      <div style={{ marginTop: 6, fontSize: 'var(--type-caption)', color: 'var(--color-text-tertiary)', maxWidth: 220 }}>
        {count} open finding{count === 1 ? '' : 's'} for this row. The per-finding list (onboarding_ledger_event rows)
        is not yet in the county-ledger payload — this is a count only, pending a future wire extension.
      </div>
    </details>
  )
}

/** One jurisdiction row (from `rows`), nested under its county. */
const JurisdictionRow: React.FC<{ row: RegistryRowLedgerView }> = ({ row }) => (
  <tr style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
    <td style={{ ...cellStyle, ...mono, paddingLeft: 20 }}>{row.rowId}</td>
    <td style={cellStyle}>
      <GateCell gate={row.gate} />
    </td>
    <td style={cellStyle}>
      <CertCell cert={row.cert} />
    </td>
    <td style={cellStyle}>
      <DefectClassesCell classes={row.openDefectClasses} />
    </td>
    <td style={cellStyle}>
      <FocusedFixCell count={row.focusedFixCount} />
    </td>
  </tr>
)

/** Legacy facet-coverage row, unchanged rendering — grouped under its county alongside the v2 jurisdiction rows. */
const FacetCoverageRow: React.FC<{ facet: FacetRow }> = ({ facet: f }) => (
  <tr style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
    <td style={{ ...cellStyle, paddingLeft: 20 }}>
      <span style={{ fontSize: 'var(--type-caption)', color: 'var(--color-text-tertiary)' }}>facet:</span> {f.facet}
    </td>
    <td style={cellStyle} colSpan={2}>
      <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ ...mono }}>
          {/* honest_coverage_pct (numeric(5,2)) is ALREADY a 0..100 percent
              value, not a 0..1 fraction — do not multiply by 100 here (that
              produced a 9801.0% render bug on a 98.01 value). */}
          {f.honestCoveragePct === null ? '—' : `${f.honestCoveragePct.toFixed(1)}%`}
        </span>
        <Pill sev={certSev(f.certState)}>{f.certState ?? 'uncerted'}</Pill>
        {f.recipeVersion ? <span style={{ ...mono, fontSize: 'var(--type-caption)' }}>{f.recipeVersion}</span> : null}
        {f.sourceVintage ? <span style={{ ...mono, fontSize: 'var(--type-caption)' }}>{f.sourceVintage}</span> : null}
      </span>
    </td>
    <td style={cellStyle} colSpan={2}>
      {f.stalenessFlag ? (
        <Pill sev="warn" title="stamp rotted — unverified">
          stale
        </Pill>
      ) : null}
      {f.rewarmUnsafe ? (
        <Pill sev="danger" title="unfrozen decision">
          unsafe
        </Pill>
      ) : null}
      {!f.stalenessFlag && !f.rewarmUnsafe && f.onboarded ? <Pill sev="ok">fresh</Pill> : null}
    </td>
  </tr>
)

/** One county block: header row + nested jurisdiction rows + nested legacy facet rows. */
const CountyBlock: React.FC<{ county: CountyRow }> = ({ county: c }) => {
  const rows = c.rows ?? []
  const hasAnyChildren = rows.length > 0 || c.facets.length > 0
  return (
    <>
      <tr style={{ borderTop: '1px solid rgba(255,255,255,0.12)', background: 'var(--color-background-secondary)' }}>
        <td colSpan={5} style={{ padding: '6px 8px' }}>
          <span style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span style={{ ...sectionHeader, fontSize: 'var(--type-caption)' }}>
              {c.countyName ?? c.countyFips}
            </span>
            <span style={{ ...mono, fontSize: 'var(--type-caption)', color: 'var(--color-text-tertiary)' }}>
              {c.countyFips}
            </span>
            {c.hasStale ? <Pill sev="warn">stale</Pill> : null}
            {c.rewarmUnsafe ? <Pill sev="danger">rewarm-unsafe</Pill> : null}
          </span>
        </td>
      </tr>
      {!hasAnyChildren ? (
        <tr style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <td colSpan={5} style={{ ...cellStyle, paddingLeft: 20, color: 'var(--color-text-tertiary)' }}>
            no coverage or ledger data for this county yet
          </td>
        </tr>
      ) : null}
      {rows.map((r) => (
        <JurisdictionRow key={r.rowId} row={r} />
      ))}
      {c.facets.map((f) => (
        <FacetCoverageRow key={f.facet} facet={f} />
      ))}
    </>
  )
}

export const CountyLedger: React.FC = () => {
  const [data, setData] = useState<LedgerResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const config = await loadConfig()
        const api = apiBase(config)
        if (!api) {
          if (!cancelled) {
            setError('No cortex-api base configured for the county ledger.')
            setLoading(false)
          }
          return
        }
        const res = await getJson<LedgerResponse>(
          `${api}/api/county-ledger`,
          config,
          12_000,
        )
        if (!cancelled) {
          if (res.ok && res.json) {
            setData(res.json)
          } else {
            setError(res.error ?? `county-ledger read failed (HTTP ${res.status})`)
          }
          setLoading(false)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return <Loading />
  if (error) return <ErrorState msg={error} />
  if (!data) return <ErrorState msg="No ledger data." />

  const { summary, counties } = data
  const { certified, totalRows } = countCertifiedRows(counties)

  return (
    <Panel
      title="County Ledger"
      subtitle="the rewarmable-factory performance layer — what's onboarded, certified, stale"
      right={
        <span style={{ display: 'flex', gap: 6 }}>
          <Pill sev="ok">
            {totalRows > 0 ? `${certified}/${totalRows} certified` : `${summary.onboardedCount}/${summary.totalCounties} onboarded`}
          </Pill>
          {summary.staleCount > 0 ? (
            <Pill sev="warn" title="stamps rotted — refresh needed">
              {summary.staleCount} stale
            </Pill>
          ) : null}
          {summary.rewarmUnsafeCount > 0 ? (
            <Pill sev="danger" title="unfrozen decision — blocks a safe rewarm">
              {summary.rewarmUnsafeCount} rewarm-unsafe
            </Pill>
          ) : null}
        </span>
      }
    >
      {counties.length === 0 ? (
        <div style={{ opacity: 0.6, padding: 12 }}>
          No county has been through the factory line yet. Onboard a county
          (OPS-2) and its row appears here.
        </div>
      ) : (
        <div style={{ overflow: 'auto', minHeight: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={sectionHeader as React.CSSProperties}>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>County / jurisdiction row</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Gate</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Cert</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Open defect classes</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Focused-fix</th>
              </tr>
            </thead>
            <tbody>
              {counties.map((c) => (
                <CountyBlock key={c.countyFips} county={c} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

export default CountyLedger
