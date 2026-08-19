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
  cellLabel,
  cellSev,
  cellVisualState,
  countySatisfiedCount,
  groupCellsByCounty,
  indexCells,
  isSatisfiedCell,
  partialControlDivergence,
  rawCellsCompletenessPct,
  type ManifestCell,
  type RailDef,
  type ManifestCountyRow,
  type ManifestLedgerResponse,
} from './countyManifestTypes'
import {
  MANIFEST_CONTRADICTION_LABELS,
  REMOVED_CONTROLS,
  RE_READ_VERDICT_COPY,
  absentDisplayStates,
  auditProvenance,
  deadIndicators,
  groupContradictions,
  humanAge,
  manifestContradictions,
  materializationState,
  railDenominators,
  railScoringEvidence,
  reReadVerdict,
  type ReReadVerdict,
} from './manifestDerivation'
import {
  humanDuration,
  normalizeStamp,
  stalenessAlarms,
  type Observation,
  type StalenessAlarm,
} from './ledgerStaleness'
import { ThreeLayerPanel } from './ThreeLayerPanel'
import { fetchWrittenLayer, type WrittenSourceState } from './writtenLayerSource'
import { readPanelHashParam, withPanelHashParam } from '../center/panelHash'
import { resolveCountyName, TEXAS_COUNTY_NAME_SOURCE, type CountyNameOrigin } from './texasCountyNames'
import { ServingSweepPanel } from './ServingSweepPanel'
import { fetchServingSweep, loadSweepArtifact, type SweepSourceState } from './servingSweepSource'

/** How often the live feed re-reads the ledger. A floor, not a target: the read is a
 *  2MB payload and the manifest is recomputed by engine runs, not by reading it. */
export const LIVE_FEED_INTERVAL_MS = 60_000

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

export type Subtab = 'manifest' | 'three-layer' | 'sweep'

/** The subtab is addressable: #panel=county-manifest&view=three-layer opens it directly. */
export const SUBTAB_HASH_KEY = 'view'

const SUBTABS: Array<{ id: Subtab; label: string; hint: string }> = [
  { id: 'manifest', label: 'Rail manifest', hint: 'SCORED — did a writer run for this county' },
  { id: 'three-layer', label: 'Three layers', hint: 'WRITTEN vs SCORED vs SERVED, and where they disagree' },
  { id: 'sweep', label: 'Serving sweep', hint: 'SERVED — what Smart Site serves, every parcel' },
]

export function parseSubtab(raw: string | null): Subtab | null {
  return SUBTABS.some((t) => t.id === raw) ? (raw as Subtab) : null
}

/**
 * The subtab strip.
 *
 * It used to be three words on a flat background with a 2px underline on the active
 * one. The operator looked directly at it and reported seeing nothing, which makes it
 * not a styling preference but a defect: a view that cannot be found does not exist.
 * So the strip is now a labelled, bordered segmented control with a raised active
 * segment, a per-tab status badge, real tab semantics for keyboard and screen readers,
 * and a URL that names the open view.
 */
const SubtabNav: React.FC<{
  active: Subtab
  onSelect: (t: Subtab) => void
  badges: Partial<Record<Subtab, { text: string; sev: 'ok' | 'warn' | 'danger' | 'info' }>>
}> = ({ active, onSelect, badges }) => {
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const i = SUBTABS.findIndex((t) => t.id === active)
    const next = e.key === 'ArrowRight' ? (i + 1) % SUBTABS.length : (i - 1 + SUBTABS.length) % SUBTABS.length
    onSelect(SUBTABS[next].id)
  }
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        gap: 8,
        margin: '-14px -14px 12px',
        padding: '8px 12px',
        borderBottom: '0.5px solid var(--color-border-secondary)',
        background: 'var(--color-background-secondary)',
        flexWrap: 'wrap',
      }}
    >
      <span
        style={{
          ...sectionHeader,
          alignSelf: 'center',
          color: 'var(--color-text-tertiary)',
          whiteSpace: 'nowrap',
        }}
      >
        {SUBTABS.length} views
      </span>
      <div
        data-testid="manifest-subtabs"
        role="tablist"
        aria-label="County Manifest views"
        onKeyDown={onKeyDown}
        style={{
          display: 'flex',
          gap: 0,
          border: '0.5px solid var(--color-border-secondary)',
          borderRadius: 6,
          overflow: 'hidden',
          flexWrap: 'wrap',
        }}
      >
        {SUBTABS.map((t) => {
          const on = t.id === active
          const badge = badges[t.id]
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`manifest-subtab-${t.id}`}
              data-testid={`manifest-subtab-${t.id}`}
              aria-selected={on}
              aria-pressed={on}
              tabIndex={on ? 0 : -1}
              onClick={() => onSelect(t.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                padding: '7px 14px',
                border: 'none',
                borderRight: '0.5px solid var(--color-border-secondary)',
                borderBottom: on ? '3px solid var(--color-text-accent)' : '3px solid transparent',
                background: on ? 'var(--color-background-primary)' : 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
                color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              }}
            >
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: on ? 700 : 500 }}>{t.label}</span>
                {badge ? <Pill sev={badge.sev}>{badge.text}</Pill> : null}
              </span>
              <span style={{ ...typeCaption, color: 'var(--color-text-tertiary)' }}>{t.hint}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Staleness as an ALARM, not a banner.
 *
 * A banner reading STALE gets read past within a day. Each alarm here names what it
 * PROVES and what it does not, carries its basis, and says whether it was derived or
 * declared — because the failure this replaces was not a missing warning. It was a
 * warning nobody could act on: the ledger read as world-truth while it predated the
 * work it was being quoted about.
 */
const AlarmBar: React.FC<{ alarms: StalenessAlarm[]; worst: 'ok' | 'warn' | 'danger' }> = ({ alarms, worst }) => {
  const [open, setOpen] = useState(worst === 'danger')
  const c = sevColors(worst)
  const firing = alarms.filter((a) => a.severity !== 'ok')
  return (
    <div
      data-testid="manifest-alarm-bar"
      data-worst={worst}
      style={{
        border: `1px solid ${c.border}`,
        borderLeft: `4px solid ${c.fg}`,
        background: worst === 'ok' ? undefined : c.bg,
        marginBottom: 12,
      }}
    >
      <button
        type="button"
        data-testid="manifest-alarm-toggle"
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
          color: c.fg,
        }}
      >
        <span style={{ ...mono, fontWeight: 700, letterSpacing: '0.08em' }}>
          {worst === 'ok' ? 'FRESH' : worst === 'warn' ? 'STALE' : 'STALE — READ THIS'}
        </span>
        <span style={{ ...typeCaption, color: c.fg, flex: '1 1 300px', lineHeight: 1.45 }}>
          {alarms[0]?.headline}
          {firing.length > 1 ? ` · and ${firing.length - 1} more` : ''}
        </span>
        <span style={{ ...typeCaption, color: 'var(--color-text-tertiary)' }}>{open ? 'hide' : 'show'}</span>
      </button>
      {open ? (
        <div style={{ padding: '0 10px 10px' }}>
          {alarms.map((a) => {
            const ac = sevColors(a.severity)
            return (
              <div
                key={a.id}
                data-testid={`manifest-alarm-${a.id}`}
                style={{ borderTop: '0.5px solid var(--color-border-tertiary)', padding: '6px 0' }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Pill sev={a.severity}>{a.severity}</Pill>
                  <Pill sev={a.provenance === 'derived' ? 'ok' : 'warn'}>{a.provenance}</Pill>
                  <span style={{ fontWeight: 600, color: ac.fg }}>{a.headline}</span>
                </div>
                <div style={{ ...typeCaption, marginTop: 2, lineHeight: 1.5 }}>
                  <strong>proves</strong> {a.proves}
                </div>
                <div style={{ ...typeCaption, ...mono, color: 'var(--color-text-tertiary)', wordBreak: 'break-word' }}>
                  {a.basis}
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

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
  liveFeed: boolean
  onToggleLiveFeed: (on: boolean) => void
}> = ({ computedAt, servedAt, ageMs, verdict, lastReadAt, reReading, onReRead, liveFeed, onToggleLiveFeed }) => (
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
    <label style={{ ...typeCaption, display: 'flex', gap: 4, alignItems: 'center' }}>
      <input
        type="checkbox"
        data-testid="manifest-live-feed"
        checked={liveFeed}
        onChange={(e) => onToggleLiveFeed(e.target.checked)}
      />
      <span>
        live feed · re-reads every {Math.round(LIVE_FEED_INTERVAL_MS / 1000)}s. It cannot recompute; a
        re-read that does not move computedAt is reported as staleness, never as a refresh
      </span>
    </label>
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
  railKeys: string[]
  nameOrigins: Record<CountyNameOrigin, number>
}> = ({ cells, counties, railKeys, nameOrigins }) => {
  const [open, setOpen] = useState(false)
  const audit = useMemo(() => auditProvenance(), [])
  const dead = useMemo(() => deadIndicators(cells), [cells])
  const partialDivergence = useMemo(() => partialControlDivergence(cells), [cells])
  const evidence = useMemo(() => railScoringEvidence(cells, railKeys), [cells, railKeys])
  const railsWithoutEvidence = useMemo(() => evidence.filter((e) => !e.hasAnyEvidence), [evidence])
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
            {dead.length} upstream indicators cannot fire
          </Pill>
        ) : null}
        <Pill
          sev={railsWithoutEvidence.length > 0 ? 'warn' : 'ok'}
          title="derived: no county in the payload carries a coverage number, source or verifying instrument for this rail"
        >
          {railsWithoutEvidence.length} of {evidence.length} rails with no scoring evidence
        </Pill>
        <Pill sev={partialDivergence.derivedPartial > 0 ? 'warn' : 'info'} title="derived: 0 < coverage < threshold">
          {partialDivergence.derivedPartial} partial derived vs {partialDivergence.upstreamPartial} served
        </Pill>
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

          <div style={{ ...sectionHeader, marginTop: 12, marginBottom: 4 }}>
            Controls removed because they could not fire
          </div>
          <div data-testid="manifest-removed-controls" style={{ ...typeCaption, lineHeight: 1.5 }}>
            A control that renders as live and cannot fire buys false confidence, so these were deleted
            rather than left switched off. The deletion is stated here because a control that vanishes
            silently leaves the state it named looking monitored.
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {REMOVED_CONTROLS.map((r) => (
                <li key={r.control} style={{ marginBottom: 3 }}>
                  <strong>{r.control}</strong> — driven by <span style={mono}>{r.drivenBy}</span>. {r.reason}.
                  Replaced by: {r.replacedBy}.
                </li>
              ))}
            </ul>
          </div>

          <div style={{ ...sectionHeader, marginTop: 12, marginBottom: 4 }}>Derived replacements, measured now</div>
          <div data-testid="manifest-derived-controls" style={{ ...typeCaption, lineHeight: 1.5 }}>
            <div>
              <strong>Scoring evidence</strong> — {railsWithoutEvidence.length} of {evidence.length} rails carry
              no coverage number, no source and no verifying instrument on ANY of the{' '}
              {cells.length.toLocaleString()} cells:{' '}
              <span style={mono}>
                {railsWithoutEvidence.length === 0
                  ? 'none'
                  : railsWithoutEvidence.map((e) => `${e.railKey} (0 of ${e.cells})`).join(', ')}
              </span>
              . This varies with the payload, unlike the hand-declared tag it replaced.
            </div>
            <div style={{ marginTop: 3 }}>
              <strong>Partial</strong> — derived as 0 &lt; coverage &lt; threshold on{' '}
              {partialDivergence.derivedPartial.toLocaleString()} of{' '}
              {partialDivergence.cellsExamined.toLocaleString()} cells, while the served isPartial field
              says {partialDivergence.upstreamPartial.toLocaleString()}. The two disagree on{' '}
              {partialDivergence.disagree.toLocaleString()} cells; the derivation is what the grid
              renders, and the divergence is shown rather than resolved silently.
            </div>
          </div>

          <div style={{ ...sectionHeader, marginTop: 12, marginBottom: 4 }}>
            Upstream indicators that cannot fire
          </div>
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
        ['derivation-indeterminate', 'warn', 'derivation could not decide — not an absence'],
        ['partial', 'warn', 'DERIVED: 0 < coverage < threshold, zero credit'],
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
      <Pill sev="warn">NO SCORING EVIDENCE</Pill>
      <span style={{ color: 'var(--color-text-tertiary)' }}>
        column tag, DERIVED — not one county carries a coverage number, a source or a verifying
        instrument for this rail
      </span>
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
  // The open view is read from the hash, so #panel=county-manifest&view=three-layer
  // lands on it directly and a reload does not silently reset to the first tab.
  const [subtab, setSubtab] = useState<Subtab>(() => parseSubtab(readPanelHashParam(SUBTAB_HASH_KEY)) ?? 'manifest')

  const [reReading, setReReading] = useState(false)
  const [verdict, setVerdict] = useState<ReReadVerdict>('first-read')
  const [lastReadAt, setLastReadAt] = useState<string | null>(null)
  const [liveFeed, setLiveFeed] = useState(true)
  const [nowIso, setNowIso] = useState(() => new Date().toISOString())

  const [sweepSource, setSweepSource] = useState<SweepSourceState | null>(null)
  const [sweepProbing, setSweepProbing] = useState(false)
  const [sweepAutoProbed, setSweepAutoProbed] = useState(false)
  const [writtenSource, setWrittenSource] = useState<WrittenSourceState | null>(null)
  const [writtenProbing, setWrittenProbing] = useState(false)

  const onSelectSubtab = useCallback((next: Subtab) => {
    setSubtab(next)
    if (typeof window !== 'undefined') {
      window.location.hash = withPanelHashParam(window.location.hash, SUBTAB_HASH_KEY, next)
    }
  }, [])

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

  /**
   * THE LIVE FEED.
   *
   * The console cannot recompute the manifest — county_facet_coverage moves only when
   * an engine block or scorer runs — so "live" here means the console RE-READS on a
   * fixed interval and reports whether computedAt moved. A feed that re-reads a frozen
   * snapshot and says so is honest; a feed that re-renders one and looks fresh is the
   * defect. The written-layer probe is deliberately NOT on this interval: it took over
   * 90 seconds on its good read and timed out at 240 on its bad one.
   */
  useEffect(() => {
    if (!liveFeed) return
    const timer = setInterval(() => {
      setNowIso(new Date().toISOString())
      void (async () => {
        try {
          const { res } = await readLedger()
          if (!res) return
          setData((prev) => {
            setVerdict(reReadVerdict(prev?.summary.computedAt ?? null, res.summary.computedAt ?? null))
            return res
          })
          setLastReadAt(new Date().toISOString())
        } catch {
          /* a failed poll leaves the last good read on screen; the read strip shows its age */
        }
      })()
    }, LIVE_FEED_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [liveFeed, readLedger])

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

  /** Probe the sweep once, the first time a view that needs the SERVED layer opens. */
  useEffect(() => {
    if (sweepAutoProbed) return
    if (subtab !== 'sweep' && subtab !== 'three-layer') return
    setSweepAutoProbed(true)
    void onProbeSweep()
  }, [subtab, sweepAutoProbed, onProbeSweep])

  const onProbeWritten = useCallback(async () => {
    setWrittenProbing(true)
    try {
      const cfg: SpineConfig = await loadConfig()
      setWrittenSource(await fetchWrittenLayer(cfg))
    } catch (e) {
      setWrittenSource({
        origin: 'live-endpoint',
        tally: null,
        coverage: { observedAt: null, instrument: 'retrieval-api node-graph tally', countyFips: [], roadCountyFips: [], railKeys: [] },
        locator: 'probe',
        httpStatus: null,
        notServedReason: e instanceof Error ? e.message : String(e),
        readAt: new Date().toISOString(),
      })
    } finally {
      setWrittenProbing(false)
    }
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
   * Column header tags are DERIVED over the whole column. The two tags this replaced
   * (NO WRITER, NO ATOM) read hand-declared fields that are constant across every cell
   * the API serves, so neither could ever appear. This one measures whether the ledger
   * holds ANY scoring evidence for the rail, which varies: on the payload probed
   * 2026-08-19 it fires for 6 of 14 rails and stays quiet for 8.
   */
  const railEvidenceByKey = useMemo(() => {
    const list = railScoringEvidence(manifestCells ?? [], rails.map((r) => r.key))
    return new Map(list.map((e) => [e.railKey, e]))
  }, [manifestCells, rails])

  const legendCannotFire = useMemo(
    () =>
      manifestCells
        ? absentDisplayStates(manifestCells, [
            'satisfied-present',
            'satisfied-absent',
            'not-yet',
            'no-atom',
            'derivation-indeterminate',
          ])
        : [],
    [manifestCells],
  )

  /**
   * Observations from every other instrument on screen, each with its own timestamp,
   * fed to the evidence-horizon check. An observation that POSTDATES computedAt is
   * proof the ledger is behind the world.
   */
  const layerObservations = useMemo<Observation[]>(() => {
    const out: Observation[] = []
    if (writtenSource?.tally?.generatedAt) {
      out.push({
        instrument: 'retrieval-api node-graph tally',
        observedAt: normalizeStamp(writtenSource.tally.generatedAt),
        saw: `${writtenSource.coverage.countyFips.length} counties of store contents`,
      })
    }
    if (sweepSource?.sweep?.sweptAt) {
      out.push({
        instrument: `serving sweep (${sweepSource.origin})`,
        observedAt: normalizeStamp(sweepSource.sweep.sweptAt),
        saw: `${sweepSource.sweep.countiesSwept} counties swept parcel by parcel`,
      })
    }
    return out
  }, [writtenSource, sweepSource])

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
  const computedAt = summary.computedAt ?? null
  const served = !manifestCells || manifestCells.length === 0

  const alarmSet = stalenessAlarms({
    computedAt,
    nowIso,
    cells,
    observations: layerObservations,
  })
  const stale = alarmSet.worst !== 'ok'
  const ageMs = mat.ageMs
  const subtabBadges: Partial<Record<Subtab, { text: string; sev: 'ok' | 'warn' | 'danger' | 'info' }>> = {
    manifest: {
      text: `${satisfiedCells}/${totalCells}`,
      sev: stale ? 'warn' : 'ok',
    },
    'three-layer': writtenSource?.tally
      ? { text: 'store read', sev: 'ok' }
      : { text: 'store unread', sev: 'info' },
    sweep: sweepSource?.sweep
      ? { text: sweepSource.origin === 'live-endpoint' ? 'live' : 'artifact', sev: sweepSource.origin === 'live-endpoint' ? 'ok' : 'warn' }
      : { text: 'not served', sev: 'info' },
  }

  return (
    <Panel
      title="County Manifest"
      subtitle={`${summary.totalCounties} counties × ${railCount} rails — see everything, where it is, and what is broken`}
      right={
        <Pill sev={alarmSet.worst === 'ok' ? 'ok' : alarmSet.worst}>
          {alarmSet.worst === 'ok'
            ? `${satisfiedCells}/${totalCells} satisfied · fresh`
            : `ledger ${humanDuration(ageMs)} old`}
        </Pill>
      }
    >
      <SubtabNav active={subtab} onSelect={onSelectSubtab} badges={subtabBadges} />

      {/* The alarm rides EVERY view. A staleness warning that only appears on one tab
          is a warning that can be walked past by changing tabs. */}
      <AlarmBar alarms={alarmSet.alarms} worst={alarmSet.worst} />

      {subtab === 'three-layer' ? (
        <ThreeLayerPanel
          cells={cells}
          railKeys={rails.map((r) => r.key)}
          counties={data.counties.map((c) => ({ countyFips: c.countyFips, countyName: c.countyName }))}
          computedAt={computedAt}
          written={writtenSource}
          writtenProbing={writtenProbing}
          onProbeWritten={onProbeWritten}
          sweep={sweepSource}
          sweepProbing={sweepProbing}
          onProbeSweep={onProbeSweep}
          onLoadSweepArtifact={onLoadSweepArtifact}
        />
      ) : subtab === 'sweep' ? (
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
            liveFeed={liveFeed}
            onToggleLiveFeed={setLiveFeed}
          />
          <DerivationStrip
            cells={cells}
            counties={data.counties}
            railKeys={rails.map((r) => r.key)}
            nameOrigins={nameOrigins}
          />
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
                      const ev = railEvidenceByKey.get(rail.key)
                      const ceiling = st?.maxCountiesReachable ?? null
                      const ceilingDiffers = ceiling != null && ceiling !== st?.countiesInPayload
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
                          {/* The rail's OWN reachable ceiling is the primary denominator wherever a
                              capability probe defines one. rrc-wells at 0/254 manufactures a
                              253-county hole; 0/1 is the honest reading of the same fact. */}
                          <div
                            data-testid={`rail-score-${rail.key}`}
                            style={{ ...mono, fontSize: 9, color: 'var(--color-text-tertiary)' }}
                            title={
                              ceiling != null
                                ? `${st?.satisfied ?? 0} of ${ceiling} counties this rail can reach: ${st?.sourceBasis ?? 'basis not served'}${st?.limitation ? ` (${st.limitation})` : ''}`
                                : 'no capability probe defines a reachable ceiling for this rail, so the payload county count is the only honest denominator'
                            }
                          >
                            {st ? `${st.satisfiedPresent}/${ceiling ?? st.countiesInPayload}` : '—'}
                            {st && st.presentExceedsCeiling ? (
                              <span
                                data-testid={`rail-over-ceiling-${rail.key}`}
                                style={{ color: 'var(--color-text-danger)' }}
                                title="acquisition exceeds the rail's own reachable ceiling — the capability probe and the coverage scorer cannot both be right"
                              >
                                {' '}
                                !
                              </span>
                            ) : null}
                          </div>
                          {/* Established absences are NOT bounded by how far an acquisition
                              source reaches, so they are counted beside acquisition and never
                              inside the reach fraction. Folding them in read mud 209/186. */}
                          <div style={{ ...mono, fontSize: 8, color: 'var(--color-text-tertiary)' }}>
                            {st && st.satisfiedAbsent > 0 ? `+${st.satisfiedAbsent} abs · ` : ''}
                            {ceiling != null
                              ? ceilingDiffers
                                ? `reach · ${st?.countiesInPayload ?? 0} in grid`
                                : 'reach = grid'
                              : 'no reach probe'}
                          </div>
                          <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', marginTop: 2 }}>
                            {ev && !ev.hasAnyEvidence ? (
                              <Pill
                                sev="warn"
                                testId={`rail-no-evidence-${rail.key}`}
                                title={`0 of ${ev.cells} cells carry a coverage number, a source or a verifying instrument`}
                              >
                                NO SCORING EVIDENCE
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
