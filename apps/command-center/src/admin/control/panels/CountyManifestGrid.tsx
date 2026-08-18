// County Manifest Grid — the operator's primary statewide console.
//
// Grid dimensions and the column set are DERIVED from GET /api/county-ledger
// (`railCapabilities` / `manifestCells` / `summary`). Nothing about the rail set is
// asserted in this file: no rail names, no column count, no grid dimension label.
//
// Reads GET /api/county-ledger `manifestCells` (County Manifest Sprint 1).
// Sibling to CountyLedger (registry-row gate/cert view); not a tab inside it —
// the grid's scale and daily-use posture match other single-purpose Engine panels.
//
// Degrades honestly when `manifestCells` is absent on the deployment.
//
// TWO SUBTABS (operator ruling 2026-08-18). The rail manifest answers "did a writer
// run for this county". The serving sweep answers "what does Smart Site actually SERVE
// a human, for every parcel". They live on one panel because they will disagree, and
// the console surfaces the disagreement rather than averaging it away.
//
// THE MANIFEST IS A SNAPSHOT AND THIS CONSOLE CANNOT RECOMPUTE IT. `county_facet_coverage`
// is written as a side effect of engine block and scorer runs; no recompute route exists
// on cortex-api (probed 2026-08-18: /api/county-ledger/recompute and .../refresh both
// return the SPA fallthrough). So the refresh affordance here is an explicit RE-READ that
// reports whether computedAt moved — a re-read that does not move it is displayed as
// evidence of upstream staleness, never as a successful refresh.
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { loadConfig, apiBase, getJson, type SpineConfig } from '../../api/spineClient'
import {
  Panel,
  Pill,
  Loading,
  ErrorState,
  Card,
  sectionHeader,
  mono,
  typeCaption,
  sevColors,
  Button,
} from '../primitives'
import {
  deriveRails,
  atomTag,
  writerTag,
  cellLabel,
  cellSev,
  cellVisualState,
  countySatisfiedCount,
  groupCellsByCounty,
  indexCells,
  isSatisfiedCell,
  rawCellsCompletenessPct,
  isLedgerMaterializationStale,
  type ManifestCell,
  type RailDef,
  type ManifestCountyRow,
  type ManifestLedgerResponse,
} from './countyManifestTypes'
import {
  MANIFEST_CONTRADICTION_LABELS,
  RE_READ_VERDICT_COPY,
  absentDisplayStates,
  auditProvenance,
  deadIndicators,
  groupContradictions,
  humanAge,
  manifestContradictions,
  materializationState,
  railDenominators,
  reReadVerdict,
  type ReReadVerdict,
} from './manifestDerivation'
import { resolveCountyName, TEXAS_COUNTY_NAME_SOURCE, type CountyNameOrigin } from './texasCountyNames'
import { ServingSweepPanel } from './ServingSweepPanel'
import { fetchServingSweep, loadSweepArtifact, type SweepSourceState } from './servingSweepSource'

const COUNTY_COL_W = 200
const SCORE_COL_W = 64

const stickyCounty: React.CSSProperties = {
  position: 'sticky',
  left: 0,
  zIndex: 20,
  background: 'var(--color-background-secondary)',
  minWidth: COUNTY_COL_W,
  maxWidth: COUNTY_COL_W,
  borderRight: '0.5px solid var(--color-border-secondary)',
}

const stickyScore: React.CSSProperties = {
  position: 'sticky',
  left: COUNTY_COL_W,
  zIndex: 20,
  background: 'var(--color-background-secondary)',
  minWidth: SCORE_COL_W,
  maxWidth: SCORE_COL_W,
  textAlign: 'center',
  borderRight: '0.5px solid var(--color-border-secondary)',
}

function fmtPct(n: number | undefined | null, digits = 2): string {
  if (n == null || Number.isNaN(n)) return '—'
  return `${n.toFixed(digits)}%`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

type Subtab = 'manifest' | 'sweep'

const SUBTABS: Array<{ id: Subtab; label: string; hint: string }> = [
  { id: 'manifest', label: 'Rail manifest', hint: 'did a writer run for this county' },
  { id: 'sweep', label: 'Serving sweep', hint: 'what Smart Site actually serves, every parcel' },
]

const SubtabNav: React.FC<{ active: Subtab; onSelect: (t: Subtab) => void }> = ({ active, onSelect }) => (
  <div
    data-testid="manifest-subtabs"
    style={{
      display: 'flex',
      gap: 0,
      margin: '-14px -14px 12px',
      borderBottom: '0.5px solid var(--color-border-secondary)',
      background: 'var(--color-background-secondary)',
    }}
  >
    {SUBTABS.map((t) => {
      const on = t.id === active
      return (
        <button
          key={t.id}
          type="button"
          data-testid={`manifest-subtab-${t.id}`}
          aria-pressed={on}
          onClick={() => onSelect(t.id)}
          style={{
            padding: '8px 16px',
            border: 'none',
            borderBottom: on ? '2px solid var(--color-text-accent)' : '2px solid transparent',
            background: 'transparent',
            cursor: 'pointer',
            textAlign: 'left',
            color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
            fontWeight: on ? 700 : 500,
          }}
        >
          <div style={{ fontSize: 12 }}>{t.label}</div>
          <div style={{ ...typeCaption, color: 'var(--color-text-tertiary)' }}>{t.hint}</div>
        </button>
      )
    })}
  </div>
)

const RollupStrip: React.FC<{
  weightedPct: number | null
  rawPct: number | null
  satisfiedCells: number
  totalCells: number
  totalCounties: number
  totalRails: number
  computedAt: string | null
}> = ({ weightedPct, rawPct, satisfiedCells, totalCells, totalCounties, totalRails, computedAt }) => (
  <div
    style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: 0,
      borderBottom: '0.5px solid var(--color-border-tertiary)',
      margin: '0 -14px 12px',
      background: 'var(--color-background-secondary)',
    }}
  >
    <div style={{ padding: '10px 16px', borderRight: '0.5px solid var(--color-border-tertiary)', minWidth: 160 }}>
      <div style={{ ...typeCaption, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Texas weighted completeness</div>
      <div style={{ ...mono, fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)' }}>{fmtPct(weightedPct)}</div>
      <div style={{ ...typeCaption }}>parcel-weighted · headline</div>
    </div>
    <div style={{ padding: '10px 16px', borderRight: '0.5px solid var(--color-border-tertiary)', minWidth: 140 }}>
      <div style={{ ...typeCaption, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Cells satisfied</div>
      <div style={{ ...mono, fontSize: 20, fontWeight: 600, color: 'var(--color-text-secondary)' }}>{fmtPct(rawPct)}</div>
      <div style={{ ...typeCaption }}>
        {satisfiedCells}/{totalCells} · secondary
      </div>
    </div>
    <div style={{ padding: '10px 16px', borderRight: '0.5px solid var(--color-border-tertiary)', minWidth: 120 }}>
      <div style={{ ...typeCaption, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Grid</div>
      <div style={{ ...mono, fontSize: 20, fontWeight: 600 }}>{totalCounties}×{totalRails}</div>
      <div style={{ ...typeCaption }}>{totalCells.toLocaleString()} cells</div>
    </div>
    <div style={{ padding: '10px 16px', minWidth: 180 }}>
      <div style={{ ...typeCaption, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Materialized</div>
      <div data-testid="manifest-computed-at" style={{ ...mono, fontSize: 14, fontWeight: 600 }}>
        {computedAt ?? 'no computedAt'}
      </div>
      <div style={{ ...typeCaption }}>computedAt · never silent</div>
    </div>
  </div>
)

/**
 * The re-read control and its verdict. The console can only re-read; the manifest is
 * recomputed by engine block and scorer runs. Saying so on screen is the point: a
 * refresh button that quietly re-renders the same snapshot is how a stale instrument
 * passes for a live one.
 */
const ReadStrip: React.FC<{
  computedAt: string | null
  servedAt: string | null
  ageMs: number | null
  verdict: ReReadVerdict
  lastReadAt: string | null
  reReading: boolean
  onReRead: () => void
}> = ({ computedAt, servedAt, ageMs, verdict, lastReadAt, reReading, onReRead }) => (
  <div
    data-testid="manifest-read-strip"
    style={{
      display: 'flex',
      gap: 14,
      alignItems: 'center',
      flexWrap: 'wrap',
      padding: '8px 10px',
      border: '0.5px solid var(--color-border-tertiary)',
      marginBottom: 12,
    }}
  >
    <Button variant="secondary" onClick={onReRead} disabled={reReading}>
      {reReading ? 're-reading…' : 're-read manifest'}
    </Button>
    <span style={{ ...typeCaption, ...mono }} data-testid="manifest-age">
      snapshot age {humanAge(ageMs)}
    </span>
    <span style={{ ...typeCaption, ...mono, color: 'var(--color-text-tertiary)' }}>
      served {servedAt ?? '—'}
    </span>
    <span style={{ ...typeCaption, ...mono, color: 'var(--color-text-tertiary)' }}>
      last read {lastReadAt ?? '—'}
    </span>
    <span
      data-testid="manifest-reread-verdict"
      style={{
        ...typeCaption,
        flex: '1 1 320px',
        color: verdict === 'materialization-unchanged' ? 'var(--color-text-warning)' : 'var(--color-text-secondary)',
        lineHeight: 1.45,
      }}
    >
      {RE_READ_VERDICT_COPY[verdict]}
      {verdict === 'materialization-unchanged' && computedAt ? ` (still ${computedAt})` : ''}
    </span>
  </div>
)

/**
 * Which parts of what the operator is reading are measured and which are asserted.
 * This lived in prose for months and rotted there; here it is computed against the
 * payload on screen, so the boundary is visible at the moment of use.
 */
const DerivationStrip: React.FC<{
  cells: ManifestCell[]
  counties: ManifestCountyRow[]
  nameOrigins: Record<CountyNameOrigin, number>
}> = ({ cells, counties, nameOrigins }) => {
  const [open, setOpen] = useState(false)
  const audit = useMemo(() => auditProvenance(), [])
  const dead = useMemo(() => deadIndicators(cells), [cells])
  const missingStates = useMemo(
    () =>
      absentDisplayStates(cells, [
        'satisfied-present',
        'satisfied-absent',
        'not-yet',
        'no-writer',
        'no-atom',
      ]),
    [cells],
  )
  const contradictions = useMemo(() => groupContradictions(manifestContradictions(cells)), [cells])
  const contradictionTotal = contradictions.reduce((n, c) => n + c.count, 0)

  return (
    <div
      data-testid="manifest-derivation"
      style={{ border: '0.5px solid var(--color-border-tertiary)', marginBottom: 12 }}
    >
      <button
        type="button"
        data-testid="manifest-derivation-toggle"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          width: '100%',
          gap: 10,
          alignItems: 'center',
          flexWrap: 'wrap',
          padding: '8px 10px',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          textAlign: 'left',
          color: 'var(--color-text-primary)',
        }}
      >
        <span style={{ ...sectionHeader }}>Derived vs declared</span>
        <Pill sev="ok">{audit.derivedCount} derived from the API</Pill>
        <Pill sev="warn">{audit.declaredUpstreamCount} hand-declared upstream</Pill>
        <Pill sev="info">{audit.declaredClientCount} presentation-only in this repo</Pill>
        {dead.length > 0 ? (
          <Pill sev="danger" title="an indicator whose value never varies cannot fire">
            {dead.length} indicators cannot fire
          </Pill>
        ) : null}
        {contradictionTotal > 0 ? (
          <Pill sev="danger">{contradictionTotal} self-contradicting cells</Pill>
        ) : null}
        <span style={{ ...typeCaption, marginLeft: 'auto', color: 'var(--color-text-tertiary)' }}>
          {open ? 'hide' : 'show'}
        </span>
      </button>
      {open ? (
        <div style={{ padding: '0 10px 10px', fontSize: 'var(--type-caption)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--type-caption)' }}>
            <thead>
              <tr style={sectionHeader as React.CSSProperties}>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>What you are reading</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Provenance</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Basis</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Refreshed by</th>
              </tr>
            </thead>
            <tbody>
              {audit.rows.map((r) => (
                <tr key={r.subject} style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                  <td style={{ padding: '4px 8px', fontWeight: 600 }}>{r.subject}</td>
                  <td style={{ padding: '4px 8px' }}>
                    <Pill
                      sev={
                        r.provenance === 'derived-api' ? 'ok' : r.provenance === 'declared-upstream' ? 'warn' : 'info'
                      }
                    >
                      {r.provenance}
                    </Pill>
                  </td>
                  <td style={{ ...mono, padding: '4px 8px', color: 'var(--color-text-secondary)' }}>{r.basis}</td>
                  <td style={{ padding: '4px 8px', color: 'var(--color-text-tertiary)' }}>{r.refreshedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ ...sectionHeader, marginTop: 12, marginBottom: 4 }}>Indicators that cannot fire</div>
          {dead.length === 0 ? (
            <div style={{ ...typeCaption }}>
              every indicator varies across the {cells.length.toLocaleString()} cells examined
            </div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {dead.map((d) => (
                <li key={d.indicator} style={{ marginBottom: 3 }}>
                  <span style={mono}>{d.indicator}</span> is <span style={mono}>{d.constantValue}</span> on all{' '}
                  {d.cellsExamined.toLocaleString()} cells, so {d.consequence}. A gating indicator is only
                  trustworthy once it has been shown able to fire.
                </li>
              ))}
            </ul>
          )}
          {missingStates.length > 0 ? (
            <div style={{ ...typeCaption, marginTop: 4, color: 'var(--color-text-tertiary)' }}>
              display states the legend advertises but this payload does not contain:{' '}
              <span style={mono}>{missingStates.join(', ')}</span>
            </div>
          ) : null}

          <div style={{ ...sectionHeader, marginTop: 12, marginBottom: 4 }}>Cells that disagree with themselves</div>
          {contradictions.length === 0 ? (
            <div style={{ ...typeCaption }}>
              none across {cells.length.toLocaleString()} cells — measured, not assumed
            </div>
          ) : (
            contradictions.map((c) => (
              <div key={c.kind} style={{ marginBottom: 6 }}>
                <div style={{ fontWeight: 600 }}>
                  {MANIFEST_CONTRADICTION_LABELS[c.kind]} — {c.count.toLocaleString()} of{' '}
                  {cells.length.toLocaleString()} cells
                </div>
                <div style={{ ...mono, color: 'var(--color-text-tertiary)' }}>
                  {c.examples.map((e) => `${e.countyFips}:${e.railKey}`).join(', ')}
                  {c.count > c.examples.length ? ` …and ${c.count - c.examples.length} more` : ''}
                </div>
                <div style={{ ...typeCaption, color: 'var(--color-text-tertiary)' }}>{c.examples[0]?.detail}</div>
              </div>
            ))
          )}

          <div style={{ ...sectionHeader, marginTop: 12, marginBottom: 4 }}>County names</div>
          <div style={{ ...typeCaption, lineHeight: 1.5 }}>
            {nameOrigins.api} served by the API, {nameOrigins.roster} filled from the local roster,{' '}
            {nameOrigins.none} unresolved — denominator {counties.length.toLocaleString()} counties in this
            payload. The roster is <span style={mono}>{TEXAS_COUNTY_NAME_SOURCE.artifact}</span> (
            {TEXAS_COUNTY_NAME_SOURCE.schemaVersion} @ {TEXAS_COUNTY_NAME_SOURCE.vintage},{' '}
            {TEXAS_COUNTY_NAME_SOURCE.countyCount} counties). It is presentation only and enters no
            measurement; the API name always wins where the API serves one.
          </div>
        </div>
      ) : null}
    </div>
  )
}

const Legend: React.FC<{ cannotFire: string[] }> = ({ cannotFire }) => (
  <div
    style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: 12,
      padding: '8px 0',
      borderBottom: '0.5px solid var(--color-border-tertiary)',
      marginBottom: 10,
      fontSize: 'var(--type-caption)',
      color: 'var(--color-text-secondary)',
    }}
  >
    {(
      [
        ['satisfied-present', 'ok', 'acquired, at/above threshold'],
        ['satisfied-absent', 'info', 'established absence — counts'],
        ['not-yet', 'info', 'unacquired — reduces completeness'],
        ['no-atom', 'danger', 'no atom family — cannot record'],
        ['partial', 'warn', 'below threshold — zero credit'],
      ] as const
    ).map(([label, sev, hint]) => {
      const c = sevColors(sev)
      const dead = cannotFire.includes(label)
      return (
        <span key={label} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', opacity: dead ? 0.55 : 1 }}>
          <span
            style={{
              width: 13,
              height: 13,
              borderRadius: 2,
              background: c.bg,
              border: `0.5px solid ${c.border}`,
            }}
          />
          <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{label}</span>
          <span style={{ color: 'var(--color-text-tertiary)' }}>{hint}</span>
          {dead ? (
            <span
              data-testid={`legend-cannot-fire-${label}`}
              style={{ ...typeCaption, color: 'var(--color-text-warning)' }}
            >
              (absent from this payload)
            </span>
          ) : null}
        </span>
      )
    })}
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      <Pill sev="warn">NO WRITER</Pill>
      <span style={{ color: 'var(--color-text-tertiary)' }}>column header tag — atom exists, nothing populates</span>
    </span>
  </div>
)

const ManifestCellButton: React.FC<{
  cell: ManifestCell
  onSelect: (cell: ManifestCell) => void
}> = ({ cell, onSelect }) => {
  const visual = cellVisualState(cell)
  const sev = cellSev(visual)
  const colors = sevColors(sev)
  const partial = visual === 'partial'
  return (
    <button
      type="button"
      data-testid={`manifest-cell-${cell.countyFips}-${cell.railKey}`}
      data-display-state={cell.displayState}
      data-visual-state={visual}
      onClick={() => onSelect(cell)}
      title={`${cell.railKey}: ${cell.displayState}${partial ? ' (partial)' : ''}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: 26,
        padding: 0,
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        color: colors.fg,
        background: colors.bg,
        boxShadow: partial ? 'inset 0 -2px 0 var(--color-text-warning)' : undefined,
        backgroundImage:
          cell.displayState === 'no-atom'
            ? 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.06) 4px, rgba(255,255,255,0.06) 7px)'
            : undefined,
      }}
    >
      {cellLabel(cell)}
    </button>
  )
}

const CellDrawer: React.FC<{
  cell: ManifestCell | null
  county: ManifestCountyRow | undefined
  onClose: () => void
}> = ({ cell, county, onClose }) => {
  if (!cell) {
    return (
      <div style={{ ...typeCaption, padding: 12, lineHeight: 1.55 }}>
        Click any cell to inspect state, coverage against threshold, source, vintage, open defect classes, last run, and
        the artifact path behind the claim.
      </div>
    )
  }
  const visual = cellVisualState(cell)
  const facet = county?.facets?.find((f) => f.facet === cell.railKey || f.facet === cell.railKey.replace('-', ''))
  const openDefects =
    county?.rows?.flatMap((r) => r.openDefectClasses.map((d) => ({ ...d, rowId: r.rowId }))) ?? []
  const resolved = resolveCountyName(cell.countyFips, county?.countyName)
  return (
    <div style={{ padding: '10px 12px', fontSize: 'var(--type-caption)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {resolved.name} · {cell.railKey}
          </div>
          <div style={{ ...mono, color: 'var(--color-text-tertiary)' }}>
            {cell.countyFips}
            {resolved.origin === 'roster' ? ' · name from local roster, not the API' : ''}
          </div>
        </div>
        <Button variant="ghost" onClick={onClose}>
          close
        </Button>
      </div>
      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: '104px 1fr',
          gap: '4px 8px',
          margin: '8px 0',
        }}
      >
        <dt style={{ ...typeCaption, textTransform: 'uppercase' }}>State</dt>
        <dd style={mono}>
          <Pill sev={cellSev(visual)}>{visual}</Pill>
          {cell.displayState === 'no-writer' ? <Pill sev="warn">no-writer</Pill> : null}
        </dd>
        <dt style={{ ...typeCaption, textTransform: 'uppercase' }}>Coverage</dt>
        <dd style={mono}>{cell.honestCoveragePct == null ? '—' : `${cell.honestCoveragePct.toFixed(2)}%`}</dd>
        <dt style={{ ...typeCaption, textTransform: 'uppercase' }}>Threshold</dt>
        <dd style={mono}>{cell.thresholdPct == null ? '—' : `${cell.thresholdPct}%`}</dd>
        <dt style={{ ...typeCaption, textTransform: 'uppercase' }}>Absence basis</dt>
        <dd style={cell.absenceBasis ? mono : { ...mono, color: 'var(--color-text-warning)' }}>
          {cell.absenceBasis ?? 'no basis recorded'}
        </dd>
        <dt style={{ ...typeCaption, textTransform: 'uppercase' }}>Source</dt>
        <dd style={mono}>{cell.source ?? '—'}</dd>
        <dt style={{ ...typeCaption, textTransform: 'uppercase' }}>Vintage</dt>
        <dd style={mono}>{cell.sourceVintage ?? '—'}</dd>
        <dt style={{ ...typeCaption, textTransform: 'uppercase' }}>Last run</dt>
        <dd style={mono}>{fmtDate(facet?.lastRewarmAt ?? cell.lastVerifiedAt)}</dd>
        <dt style={{ ...typeCaption, textTransform: 'uppercase' }}>Verified</dt>
        <dd style={mono}>
          {cell.lastVerifiedAt ? fmtDate(cell.lastVerifiedAt) : '—'}
          {cell.verifiedByInstrument ? ` · ${cell.verifiedByInstrument}` : ''}
        </dd>
        <dt style={{ ...typeCaption, textTransform: 'uppercase' }}>Writer / atom</dt>
        <dd style={{ ...mono, color: 'var(--color-text-tertiary)' }}>
          hasWriter {String(cell.hasWriter)} · atomFamilyState {cell.atomFamilyState} — both HAND-DECLARED
          upstream; a registered writer is not the same as one that can produce coverage
        </dd>
      </dl>
      <div style={{ ...sectionHeader, marginTop: 12, marginBottom: 4 }}>Open defect classes (county)</div>
      {openDefects.length === 0 ? (
        <div style={{ ...typeCaption }}>none open on registry rows for this county</div>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {openDefects.map((d) => (
            <li key={`${d.rowId}-${d.defectClass}`} style={{ ...mono, padding: '2px 0' }}>
              {d.defectClass} ×{d.count}
              <span style={{ color: 'var(--color-text-tertiary)' }}> ({d.rowId})</span>
            </li>
          ))}
        </ul>
      )}
      <div style={{ ...sectionHeader, marginTop: 12, marginBottom: 4 }}>Artifact path</div>
      {cell.artifactPath ? (
        <pre
          style={{
            ...mono,
            margin: 0,
            padding: 8,
            background: 'var(--color-background-tertiary)',
            borderRadius: 4,
            wordBreak: 'break-all',
            whiteSpace: 'pre-wrap',
            fontSize: 10,
          }}
        >
          {cell.artifactPath}
        </pre>
      ) : (
        <div style={{ ...typeCaption, color: 'var(--color-text-warning)' }}>no artifact path recorded</div>
      )}
    </div>
  )
}

const IntakeSection: React.FC<{
  counties: ManifestCountyRow[]
  cellsByCounty: Map<string, ManifestCell[]>
  railCount: number
}> = ({
  counties,
  cellsByCounty,
  railCount,
}) => {
  const ranked = useMemo(() => {
    return counties
      .map((c) => {
        const cells = cellsByCounty.get(c.countyFips) ?? []
        const sat = countySatisfiedCount(cells)
        const blockers = c.rows?.flatMap((r) => r.openDefectClasses.map((d) => d.defectClass)) ?? []
        return { county: c, sat, blockers: [...new Set(blockers)] }
      })
      .sort((a, b) => b.sat - a.sat || a.county.countyFips.localeCompare(b.county.countyFips))
      .slice(0, 12)
  }, [counties, cellsByCounty])

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ ...sectionHeader, marginBottom: 8 }}>Intake — next best counties</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--type-caption)' }}>
        <thead>
          <tr style={sectionHeader as React.CSSProperties}>
            <th style={{ textAlign: 'left', padding: '4px 8px' }}>County</th>
            <th style={{ textAlign: 'right', padding: '4px 8px' }}>Satisfied</th>
            <th style={{ textAlign: 'left', padding: '4px 8px' }}>Blockers</th>
            <th style={{ textAlign: 'left', padding: '4px 8px' }}>Cost</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map(({ county, sat, blockers }) => (
            <tr key={county.countyFips} style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}>
              <td style={{ padding: '4px 8px' }}>
                {resolveCountyName(county.countyFips, county.countyName).name}
                <span style={{ ...mono, color: 'var(--color-text-tertiary)', marginLeft: 6 }}>{county.countyFips}</span>
              </td>
              <td style={{ ...mono, textAlign: 'right', padding: '4px 8px' }}>
                {sat}/{railCount}
              </td>
              <td style={{ padding: '4px 8px' }}>
                {blockers.length === 0 ? (
                  <span style={{ color: 'var(--color-text-tertiary)' }}>none named</span>
                ) : (
                  blockers.slice(0, 3).map((b) => (
                    <Pill key={b} sev="warn">
                      {b}
                    </Pill>
                  ))
                )}
              </td>
              <td style={{ padding: '4px 8px' }}>
                <Pill sev="warn">UNVERIFIED</Pill>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const MaintenanceSection: React.FC<{ counties: ManifestCountyRow[] }> = ({ counties }) => {
  const rows = useMemo(() => {
    const out: Array<{
      county: ManifestCountyRow
      kind: string
      detail: string
      sev: 'danger' | 'warn' | 'info'
    }> = []
    for (const c of counties) {
      if (c.rewarmUnsafe) out.push({ county: c, kind: 'rewarm-unsafe', detail: 'unfrozen decision', sev: 'danger' })
      if (c.hasStale) out.push({ county: c, kind: 'stale', detail: 'stamp rotted', sev: 'warn' })
      for (const r of c.rows ?? []) {
        for (const d of r.openDefectClasses) {
          out.push({
            county: c,
            kind: d.defectClass,
            detail: `${d.count} open on ${r.rowId}`,
            sev: 'warn',
          })
        }
      }
    }
    out.sort((a, b) => {
      const rank = (s: string) => (s === 'danger' ? 0 : s === 'warn' ? 1 : 2)
      return rank(a.sev) - rank(b.sev)
    })
    return out.slice(0, 40)
  }, [counties])

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ ...sectionHeader, marginBottom: 8 }}>Maintenance — drifting or broken</div>
      {rows.length === 0 ? (
        <div style={{ ...typeCaption }}>no stale, rewarm-unsafe, or open defect classes on this payload</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--type-caption)' }}>
          <thead>
            <tr style={sectionHeader as React.CSSProperties}>
              <th style={{ textAlign: 'left', padding: '4px 8px' }}>County</th>
              <th style={{ textAlign: 'left', padding: '4px 8px' }}>Issue</th>
              <th style={{ textAlign: 'left', padding: '4px 8px' }}>Detail</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={`${row.county.countyFips}-${row.kind}-${i}`} style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                <td style={{ padding: '4px 8px' }}>
                  {resolveCountyName(row.county.countyFips, row.county.countyName).name}
                </td>
                <td style={{ padding: '4px 8px' }}>
                  <Pill sev={row.sev}>{row.kind}</Pill>
                </td>
                <td style={{ ...mono, padding: '4px 8px', color: 'var(--color-text-secondary)' }}>{row.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div style={{ ...typeCaption, marginTop: 8 }}>Heavy-scan slot status: not served by this deployment</div>
    </div>
  )
}

const GAP_FILTER_THRESHOLD = 3

export const CountyManifestGrid: React.FC = () => {
  const [data, setData] = useState<ManifestLedgerResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [onlyGap, setOnlyGap] = useState(false)
  const [selectedCell, setSelectedCell] = useState<ManifestCell | null>(null)
  const [subtab, setSubtab] = useState<Subtab>('manifest')

  const [reReading, setReReading] = useState(false)
  const [verdict, setVerdict] = useState<ReReadVerdict>('first-read')
  const [lastReadAt, setLastReadAt] = useState<string | null>(null)

  const [sweepSource, setSweepSource] = useState<SweepSourceState | null>(null)
  const [sweepProbing, setSweepProbing] = useState(false)

  /**
   * One read path, used by mount and by the re-read control, so a refresh can never
   * take a different route than the first load and quietly disagree with it.
   */
  const readLedger = useCallback(async (): Promise<{ res: ManifestLedgerResponse | null; err: string | null }> => {
    const cfg: SpineConfig = await loadConfig()
    const api = apiBase(cfg)
    if (!api) return { res: null, err: 'No cortex-api base configured for the county manifest.' }
    const res = await getJson<ManifestLedgerResponse>(`${api}/api/county-ledger`, cfg, 20_000)
    if (res.ok && res.json) return { res: res.json, err: null }
    return { res: null, err: res.error ?? `county-ledger read failed (HTTP ${res.status})` }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { res, err } = await readLedger()
        if (cancelled) return
        if (res) {
          setData(res)
          setLastReadAt(new Date().toISOString())
        } else setError(err)
        setLoading(false)
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
  }, [readLedger])

  const onReRead = useCallback(async () => {
    setReReading(true)
    const previousComputedAt = data?.summary.computedAt ?? null
    try {
      const { res, err } = await readLedger()
      if (res) {
        setVerdict(reReadVerdict(previousComputedAt, res.summary.computedAt ?? null))
        setData(res)
        setLastReadAt(new Date().toISOString())
        setError(null)
      } else {
        setError(err)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setReReading(false)
    }
  }, [data?.summary.computedAt, readLedger])

  const onProbeSweep = useCallback(async () => {
    setSweepProbing(true)
    try {
      const cfg: SpineConfig = await loadConfig()
      setSweepSource(await fetchServingSweep(cfg))
    } catch (e) {
      setSweepSource({
        origin: 'live-endpoint',
        sweep: null,
        problems: [],
        locator: 'probe',
        httpStatus: null,
        notServedReason: e instanceof Error ? e.message : String(e),
      })
    } finally {
      setSweepProbing(false)
    }
  }, [])

  const onLoadSweepArtifact = useCallback((text: string, filename: string) => {
    setSweepSource(loadSweepArtifact(text, filename))
  }, [])

  const manifestCells = data?.manifestCells
  // Column set derived from the API — never a hardcoded list. If a rail splits or is
  // added server-side, the grid picks it up with no frontend change.
  const rails = useMemo<RailDef[]>(
    () => deriveRails(data?.railCapabilities, manifestCells),
    [data?.railCapabilities, manifestCells],
  )
  const railCount = rails.length
  const cellsByCounty = useMemo(
    () => (manifestCells ? groupCellsByCounty(manifestCells, rails) : new Map()),
    [manifestCells, rails],
  )
  const countyByFips = useMemo(() => {
    const m = new Map<string, ManifestCountyRow>()
    for (const c of data?.counties ?? []) m.set(c.countyFips, c)
    return m
  }, [data?.counties])

  const nameOrigins = useMemo(() => {
    const out: Record<CountyNameOrigin, number> = { api: 0, roster: 0, none: 0 }
    for (const c of data?.counties ?? []) out[resolveCountyName(c.countyFips, c.countyName).origin] += 1
    return out
  }, [data?.counties])

  const railStats = useMemo(
    () =>
      manifestCells
        ? railDenominators(
            manifestCells,
            data?.railCapabilities,
            rails.map((r) => r.key),
            data?.summary.totalCounties ?? cellsByCounty.size,
          )
        : [],
    [manifestCells, data?.railCapabilities, data?.summary.totalCounties, rails, cellsByCounty.size],
  )
  const railStatByKey = useMemo(() => new Map(railStats.map((s) => [s.railKey, s])), [railStats])

  /**
   * Column header tags are computed over the WHOLE column, not sampled from the first
   * county. The previous implementation read railCells[0], so one county decided the
   * tag for all 254 — and the count is now shown so a mixed column reads as mixed.
   */
  const railTags = useMemo(() => {
    const out = new Map<string, { noWriter: number; atomStates: Map<string, number>; total: number }>()
    for (const rail of rails) {
      const railCells = (manifestCells ?? []).filter((c) => c.railKey === rail.key)
      const atomStates = new Map<string, number>()
      for (const c of railCells) atomStates.set(c.atomFamilyState, (atomStates.get(c.atomFamilyState) ?? 0) + 1)
      out.set(rail.key, {
        noWriter: railCells.filter((c) => !c.hasWriter).length,
        atomStates,
        total: railCells.length,
      })
    }
    return out
  }, [manifestCells, rails])

  const legendCannotFire = useMemo(
    () =>
      manifestCells
        ? absentDisplayStates(manifestCells, ['satisfied-present', 'satisfied-absent', 'not-yet', 'no-atom'])
        : [],
    [manifestCells],
  )

  const filteredFips = useMemo(() => {
    const fipsList = [...cellsByCounty.keys()].sort()
    const q = filter.trim().toLowerCase()
    return fipsList.filter((fips) => {
      const county = countyByFips.get(fips)
      const name = resolveCountyName(fips, county?.countyName).name.toLowerCase()
      if (q && !fips.includes(q) && !name.includes(q)) return false
      if (onlyGap) {
        const sat = countySatisfiedCount(cellsByCounty.get(fips) ?? [])
        if (sat >= GAP_FILTER_THRESHOLD) return false
      }
      return true
    })
  }, [cellsByCounty, countyByFips, filter, onlyGap])

  if (loading) return <Loading />
  if (error) return <ErrorState msg={error} />
  if (!data) return <ErrorState msg="No manifest data." />

  const { summary } = data
  const mat = materializationState(data)
  const cells = manifestCells ?? []
  const satisfiedCells = summary.satisfiedCells ?? cells.filter(isSatisfiedCell).length
  const totalCells = summary.totalCells ?? cells.length
  const weightedPct = summary.texasCompletenessPct ?? null
  const rawPct = rawCellsCompletenessPct(satisfiedCells, totalCells)
  const stale = isLedgerMaterializationStale(summary)
  const computedAt = summary.computedAt ?? null
  const served = !manifestCells || manifestCells.length === 0

  return (
    <Panel
      title="County Manifest"
      subtitle={`${summary.totalCounties} counties × ${railCount} rails — see everything, where it is, and what is broken`}
      right={
        <Pill sev={stale ? 'warn' : 'ok'}>
          {stale ? 'manifest stale' : `${satisfiedCells}/${totalCells} satisfied`}
        </Pill>
      }
    >
      <SubtabNav active={subtab} onSelect={setSubtab} />

      {subtab === 'sweep' ? (
        <ServingSweepPanel
          cells={cells}
          railKeys={rails.map((r) => r.key)}
          source={sweepSource}
          probing={sweepProbing}
          onProbe={onProbeSweep}
          onLoadArtifact={onLoadSweepArtifact}
        />
      ) : served ? (
        <ErrorState msg="manifest not served by this deployment — GET /api/county-ledger returned no manifestCells array" />
      ) : (
        <>
          {stale ? (
            <div
              data-testid="manifest-stale-banner"
              style={{
                ...typeCaption,
                color: 'var(--color-text-warning)',
                background: 'var(--color-background-warning)',
                border: '0.5px solid var(--color-border-warning)',
                padding: '8px 12px',
                marginBottom: 12,
              }}
            >
              STALE — materialized at {computedAt ?? 'unknown'} (showing snapshot, not a live recompute).
            </div>
          ) : null}
          <RollupStrip
            weightedPct={weightedPct}
            rawPct={rawPct}
            satisfiedCells={satisfiedCells}
            totalCells={totalCells}
            totalCounties={summary.totalCounties}
            totalRails={railCount}
            computedAt={computedAt}
          />
          <ReadStrip
            computedAt={computedAt}
            servedAt={mat.servedAt}
            ageMs={mat.ageMs}
            verdict={verdict}
            lastReadAt={lastReadAt}
            reReading={reReading}
            onReRead={onReRead}
          />
          <DerivationStrip cells={cells} counties={data.counties} nameOrigins={nameOrigins} />
          <Legend cannotFire={legendCannotFire} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
            <label style={{ ...typeCaption }}>
              filter{' '}
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="county or fips"
                style={{
                  ...mono,
                  marginLeft: 4,
                  padding: '3px 6px',
                  background: 'var(--color-background-tertiary)',
                  border: '0.5px solid var(--color-border-tertiary)',
                  color: 'var(--color-text-primary)',
                  borderRadius: 4,
                }}
              />
            </label>
            <label style={{ ...typeCaption, display: 'flex', gap: 4, alignItems: 'center' }}>
              <input type="checkbox" checked={onlyGap} onChange={(e) => setOnlyGap(e.target.checked)} />
              <span data-testid="manifest-gap-filter-label">
                below {GAP_FILTER_THRESHOLD} of {railCount} rails satisfied
              </span>
            </label>
            <span style={{ ...mono, ...typeCaption, marginLeft: 'auto' }}>
              {filteredFips.length} counties shown
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, minHeight: 0 }}>
            <div style={{ flex: 1, overflow: 'auto', maxHeight: 'calc(100vh - 320px)' }}>
              <table
                data-testid="manifest-grid-table"
                style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', minWidth: 1180, fontSize: 11 }}
              >
                <thead>
                  <tr>
                    <th style={{ ...stickyCounty, ...sectionHeader, top: 0, zIndex: 40, padding: '6px 8px', textAlign: 'left' }}>
                      County
                    </th>
                    <th style={{ ...stickyScore, ...sectionHeader, top: 0, zIndex: 40, padding: '6px 4px' }}>
                      Sat
                    </th>
                    {rails.map((rail) => {
                      const st = railStatByKey.get(rail.key)
                      const tags = railTags.get(rail.key)
                      const ceiling = st?.maxCountiesReachable ?? null
                      const ceilingDiffers = ceiling != null && ceiling !== st?.countiesInPayload
                      const atomStates = [...(tags?.atomStates ?? new Map()).entries()].filter(
                        ([state]) => atomTag(state) != null,
                      )
                      return (
                        <th
                          key={rail.key}
                          title={
                            st?.sourceBasis
                              ? `${rail.label} — reach basis: ${st.sourceBasis}${st.limitation ? ` (${st.limitation})` : ''}`
                              : `${rail.label} — no capability probe defines a reachable ceiling for this rail`
                          }
                          style={{
                            ...sectionHeader,
                            position: 'sticky',
                            top: 0,
                            zIndex: 30,
                            background: 'var(--color-background-secondary)',
                            padding: '4px 6px',
                            minWidth: 52,
                            verticalAlign: 'bottom',
                          }}
                        >
                          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-primary)' }}>{rail.short}</div>
                          <div style={{ ...mono, fontSize: 9, color: 'var(--color-text-tertiary)' }}>
                            {st ? `${st.satisfied}/${st.countiesInPayload}` : '—'}
                          </div>
                          {ceilingDiffers ? (
                            <div
                              data-testid={`rail-ceiling-${rail.key}`}
                              style={{ ...mono, fontSize: 9, color: 'var(--color-text-warning)' }}
                              title={`this rail can reach at most ${ceiling} counties: ${st?.sourceBasis ?? 'basis not served'}`}
                            >
                              ceil {ceiling}
                            </div>
                          ) : null}
                          <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', marginTop: 2 }}>
                            {atomStates.map(([state, n]) => (
                              <Pill key={state} sev="danger" title={`${n} of ${tags?.total ?? 0} counties`}>
                                {atomTag(state)} {n}
                              </Pill>
                            ))}
                            {tags && tags.noWriter > 0 ? (
                              <Pill sev="warn" title={`${tags.noWriter} of ${tags.total} counties`}>
                                {writerTag(false)} {tags.noWriter}
                              </Pill>
                            ) : null}
                          </div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {filteredFips.map((fips) => {
                    const rowCells = cellsByCounty.get(fips) ?? []
                    const county = countyByFips.get(fips)
                    const sat = countySatisfiedCount(rowCells)
                    const cellIndex = indexCells(rowCells)
                    const resolved = resolveCountyName(fips, county?.countyName)
                    return (
                      <tr key={fips} data-testid={`manifest-row-${fips}`}>
                        <td style={{ ...stickyCounty, padding: '4px 8px' }}>
                          <div
                            style={{ fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis' }}
                            title={
                              resolved.origin === 'roster'
                                ? 'name filled from the local Texas roster — the API served none for this county'
                                : undefined
                            }
                          >
                            {resolved.name}
                            {resolved.origin === 'roster' ? (
                              <span style={{ color: 'var(--color-text-tertiary)' }}> ·</span>
                            ) : null}
                          </div>
                          <div style={{ ...mono, fontSize: 9, color: 'var(--color-text-tertiary)' }}>{fips}</div>
                        </td>
                        <td style={{ ...stickyScore, padding: '4px 2px' }}>
                          <div style={{ ...mono, fontWeight: 600 }}>{sat}</div>
                          <div
                            style={{
                              height: 3,
                              background: 'var(--color-background-tertiary)',
                              margin: '2px 6px',
                              borderRadius: 2,
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                height: '100%',
                                width: `${railCount > 0 ? (100 * sat) / railCount : 0}%`,
                                background: 'var(--color-text-success)',
                              }}
                            />
                          </div>
                        </td>
                        {rails.map((rail) => {
                          const cell = cellIndex.get(`${fips}:${rail.key}`)
                          if (!cell) {
                            return (
                              <td key={rail.key} style={{ padding: 0, height: 26 }}>
                                <span data-testid={`manifest-cell-${fips}-${rail.key}`} data-display-state="missing" />
                              </td>
                            )
                          }
                          return (
                            <td key={rail.key} style={{ padding: 0, height: 26, borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
                              <ManifestCellButton cell={cell} onSelect={setSelectedCell} />
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Card
              style={{
                flex: '0 0 360px',
                maxHeight: 'calc(100vh - 320px)',
                overflow: 'auto',
                borderRadius: 0,
                borderLeft: '0.5px solid var(--color-border-secondary)',
              }}
            >
              <CellDrawer cell={selectedCell} county={selectedCell ? countyByFips.get(selectedCell.countyFips) : undefined} onClose={() => setSelectedCell(null)} />
            </Card>
          </div>

          <IntakeSection counties={data.counties} cellsByCounty={cellsByCounty} railCount={railCount} />
          <MaintenanceSection counties={data.counties} />
        </>
      )}
    </Panel>
  )
}

export default CountyManifestGrid
