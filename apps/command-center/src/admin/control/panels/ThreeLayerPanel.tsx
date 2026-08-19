// ThreeLayerPanel.tsx — WRITTEN, SCORED and SERVED side by side, per county, per rail.
//
// The operator's framing: there are three layers, not two, and all three disagree
// independently. A rail can be written, unscored and unserved in three different
// amounts, and until this panel no view showed that.
//
// WHAT THIS PANEL WILL NOT DO:
//   - It will not average the three, or roll them into a score. There is no combined
//     number anywhere in this file.
//   - It will not subtract a written ATOM COUNT from a scored PERCENTAGE. Those are
//     different units; the only subtraction is scored-minus-served in points, where
//     both sides are percentages of parcels.
//   - It will not render an unmeasured cell as zero. Each layer states, per cell,
//     whether it measured and why not when it did not.
//   - It will not let an artifact render as live: origin and locator are on screen for
//     every layer, always.

import React, { useCallback, useMemo, useRef, useState } from 'react'
import { Button, Card, Pill, mono, sectionHeader, sevColors, typeCaption } from '../primitives'
import type { ManifestCell } from './countyManifestTypes'
import {
  DIVERGENCE_LABELS,
  LAYER_LABELS,
  LAYER_QUESTIONS,
  buildThreeLayerRows,
  railsWithoutWrittenSignal,
  summarizeLayerCoverage,
  tallyDivergences,
  type LayerTimestamps,
  type ThreeLayerRow,
} from './threeLayerTypes'
import { describeWrittenCoverage, type WrittenSourceState } from './writtenLayerSource'
import { ORIGIN_COPY, type SweepSourceState } from './servingSweepSource'
import { resolveCountyName } from './texasCountyNames'
import { railDef } from './countyManifestTypes'

const ROW_LIMIT = 240

const NOT_MEASURED_COPY: Readonly<Record<string, string>> = Object.freeze({
  'no-instrument': 'no instrument read',
  'county-outside-coverage': 'county outside instrument coverage',
  'rail-has-no-signal': 'rail has no written signal',
  'no-cell': 'no ledger cell',
  'no-sweep': 'no sweep read',
  'county-not-swept': 'county not swept',
  'rail-has-no-field': 'rail has no served field',
})

const NotMeasured: React.FC<{ state: string; reason: string | null }> = ({ state, reason }) => (
  <span
    style={{ ...typeCaption, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}
    title={reason ?? undefined}
  >
    {NOT_MEASURED_COPY[state] ?? state}
  </span>
)

const LayerCard: React.FC<{
  layer: 'written' | 'scored' | 'served'
  origin: string
  locator: string
  observedAt: string | null
  measured: number
  rowsExamined: number
  note: string
  action?: React.ReactNode
  sev: 'ok' | 'warn' | 'danger' | 'info'
}> = ({ layer, origin, locator, observedAt, measured, rowsExamined, note, action, sev }) => (
  <div
    data-testid={`layer-card-${layer}`}
    style={{
      flex: '1 1 260px',
      minWidth: 240,
      padding: '8px 10px',
      border: '0.5px solid var(--color-border-tertiary)',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span style={{ ...mono, fontWeight: 700, letterSpacing: '0.08em' }}>{LAYER_LABELS[layer]}</span>
      <Pill sev={sev}>{origin}</Pill>
    </div>
    <div style={{ ...typeCaption }}>{LAYER_QUESTIONS[layer]}</div>
    <div style={{ ...mono, ...typeCaption, color: 'var(--color-text-secondary)', wordBreak: 'break-all' }}>
      {locator}
    </div>
    <div style={{ ...mono, ...typeCaption }}>
      observed {observedAt ?? <span style={{ color: 'var(--color-text-warning)' }}>no timestamp</span>}
    </div>
    <div style={{ ...mono, ...typeCaption }} data-testid={`layer-measured-${layer}`}>
      measured {measured.toLocaleString()} of {rowsExamined.toLocaleString()} rows
    </div>
    <div style={{ ...typeCaption, color: 'var(--color-text-tertiary)', lineHeight: 1.45 }}>{note}</div>
    {action}
  </div>
)

export interface ThreeLayerPanelProps {
  cells: ManifestCell[]
  railKeys: string[]
  counties: Array<{ countyFips: string; countyName: string | null }>
  computedAt: string | null
  written: WrittenSourceState | null
  writtenProbing: boolean
  onProbeWritten: () => void
  sweep: SweepSourceState | null
  sweepProbing: boolean
  onProbeSweep: () => void
  onLoadSweepArtifact: (text: string, filename: string) => void
}

export const ThreeLayerPanel: React.FC<ThreeLayerPanelProps> = ({
  cells,
  railKeys,
  counties,
  computedAt,
  written,
  writtenProbing,
  onProbeWritten,
  sweep,
  sweepProbing,
  onProbeSweep,
  onLoadSweepArtifact,
}) => {
  const [onlyDivergent, setOnlyDivergent] = useState(true)
  const [filter, setFilter] = useState('')
  const fileRef = useRef<HTMLInputElement | null>(null)

  const times: LayerTimestamps = useMemo(
    () => ({
      writtenObservedAt: written?.tally?.generatedAt ?? null,
      scoredComputedAt: computedAt,
      servedSweptAt: sweep?.sweep?.sweptAt ?? null,
    }),
    [written, computedAt, sweep],
  )

  const countyNames = useMemo(() => {
    const m = new Map<string, string | null>()
    for (const c of counties) m.set(c.countyFips, c.countyName)
    return m
  }, [counties])

  const rows = useMemo(
    () =>
      buildThreeLayerRows({
        cells,
        railKeys,
        countyNames,
        tally: written?.tally ?? null,
        sweep: sweep?.sweep ?? null,
        times,
        onlyInstrumentedCounties: true,
      }),
    [cells, railKeys, countyNames, written, sweep, times],
  )

  const divergences = useMemo(() => tallyDivergences(rows), [rows])
  const coverage = useMemo(() => summarizeLayerCoverage(rows, times), [rows, times])
  const railsUnwritten = useMemo(() => railsWithoutWrittenSignal(railKeys), [railKeys])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return rows.filter((r) => {
      if (onlyDivergent && r.divergences.length === 0) return false
      if (!q) return true
      const name = resolveCountyName(r.countyFips, r.countyName).name.toLowerCase()
      return r.countyFips.includes(q) || name.includes(q) || r.railKey.includes(q)
    })
  }, [rows, onlyDivergent, filter])

  const onFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => onLoadSweepArtifact(String(reader.result ?? ''), file.name)
      reader.readAsText(file)
    },
    [onLoadSweepArtifact],
  )

  const writtenCov = coverage.find((c) => c.layer === 'written')!
  const scoredCov = coverage.find((c) => c.layer === 'scored')!
  const servedCov = coverage.find((c) => c.layer === 'served')!

  return (
    <div data-testid="three-layer-panel">
      <div style={{ ...typeCaption, marginBottom: 10, lineHeight: 1.6 }}>
        Three instruments, three questions, three timestamps. They are shown side by side and are never
        averaged, never blended and never differenced across units: written counts ATOMS, scored and
        served are PERCENTAGES OF PARCELS, so the only subtraction taken anywhere here is scored minus
        served, in points. A layer that did not measure a cell says so and never renders a zero.
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <LayerCard
          layer="written"
          sev={written?.tally ? 'ok' : 'info'}
          origin={written ? (written.tally ? 'LIVE — read from retrieval-api' : 'NOT SERVED') : 'not probed yet'}
          locator={written?.locator ?? '/stats/central-tx-node-graph'}
          observedAt={written?.tally?.generatedAt ?? null}
          measured={writtenCov.measured}
          rowsExamined={writtenCov.rowsExamined}
          note={
            written?.notServedReason
              ? `not served: ${written.notServedReason}`
              : written
                ? describeWrittenCoverage(written.coverage)
                : 'slow endpoint (90s+ on a good read, one 240s timeout observed), so it is read on demand and never on the live-feed interval'
          }
          action={
            <Button variant="secondary" onClick={onProbeWritten} disabled={writtenProbing}>
              {writtenProbing ? 'reading the store…' : 'read the store'}
            </Button>
          }
        />
        <LayerCard
          layer="scored"
          sev="ok"
          origin="LIVE — read from cortex-api"
          locator="/api/county-ledger"
          observedAt={computedAt}
          measured={scoredCov.measured}
          rowsExamined={scoredCov.rowsExamined}
          note="a materialized snapshot, not a live recompute — the console can re-read it but nothing here can move computedAt"
        />
        <LayerCard
          layer="served"
          sev={sweep?.sweep ? (sweep.origin === 'live-endpoint' ? 'ok' : 'warn') : 'info'}
          origin={sweep ? ORIGIN_COPY[sweep.origin] : 'not probed yet'}
          locator={sweep?.locator ?? '/api/serving-sweep'}
          observedAt={sweep?.sweep?.sweptAt ?? null}
          measured={servedCov.measured}
          rowsExamined={servedCov.rowsExamined}
          note={
            sweep?.notServedReason
              ? `not served: ${sweep.notServedReason}`
              : 'what Smart Site resolves for every parcel — never sampled'
          }
          action={
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Button variant="secondary" onClick={onProbeSweep} disabled={sweepProbing}>
                {sweepProbing ? 'probing…' : 'probe sweep'}
              </Button>
              <Button variant="ghost" onClick={() => fileRef.current?.click()}>
                load artifact
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                data-testid="three-layer-artifact-input"
                onChange={onFile}
                style={{ display: 'none' }}
              />
            </div>
          }
        />
      </div>

      <div
        data-testid="three-layer-divergences"
        style={{ border: '0.5px solid var(--color-border-tertiary)', padding: '8px 10px', marginBottom: 12 }}
      >
        <div style={{ ...sectionHeader, marginBottom: 6 }}>Divergences between the layers</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {divergences.map((d) => (
            <span
              key={d.kind}
              data-testid={`divergence-${d.kind}`}
              title={DIVERGENCE_LABELS[d.kind]}
              style={{
                ...typeCaption,
                padding: '4px 8px',
                border: '0.5px solid var(--color-border-tertiary)',
                color: d.count > 0 ? 'var(--color-text-warning)' : 'var(--color-text-tertiary)',
              }}
            >
              <span style={{ ...mono, fontWeight: 700 }}>
                {d.count} of {d.rowsExamined.toLocaleString()}
              </span>{' '}
              {DIVERGENCE_LABELS[d.kind]}
            </span>
          ))}
        </div>
        <div style={{ ...typeCaption, marginTop: 6, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
          Every class is measured over the same {rows.length.toLocaleString()} joined rows, so a zero here
          is a measured zero and not an unexamined one. The join is restricted to counties at least one
          non-scored instrument covers; the full {cells.length.toLocaleString()}-cell grid is on the Rail
          manifest subtab.
          {railsUnwritten.length > 0 ? (
            <>
              {' '}
              {railsUnwritten.length} of {railKeys.length} rails have no written signal at all (
              <span style={mono}>{railsUnwritten.join(', ')}</span>) — unmeasured by the store instrument,
              which is not the same as unwritten.
            </>
          ) : null}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <label style={{ ...typeCaption, display: 'flex', gap: 4, alignItems: 'center' }}>
          <input
            type="checkbox"
            data-testid="three-layer-only-divergent"
            checked={onlyDivergent}
            onChange={(e) => setOnlyDivergent(e.target.checked)}
          />
          only rows where the layers disagree
        </label>
        <label style={{ ...typeCaption }}>
          filter{' '}
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="county, fips or rail"
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
        <span style={{ ...mono, ...typeCaption, marginLeft: 'auto' }} data-testid="three-layer-row-count">
          {filtered.length.toLocaleString()} of {rows.length.toLocaleString()} rows
        </span>
      </div>

      {rows.length === 0 ? (
        <Card>
          <div style={{ ...typeCaption, lineHeight: 1.6 }}>
            No county is covered by a non-scored instrument yet. Read the store, or load a sweep
            artifact, and the join appears here. Nothing is shown as zero in the meantime: an unread
            instrument is an unmeasured layer, not an empty one.
          </div>
        </Card>
      ) : (
        <table
          data-testid="three-layer-table"
          style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--type-caption)' }}
        >
          <thead>
            <tr style={sectionHeader as React.CSSProperties}>
              <th style={{ textAlign: 'left', padding: '4px 8px' }}>County</th>
              <th style={{ textAlign: 'left', padding: '4px 8px' }}>Rail</th>
              <th style={{ textAlign: 'left', padding: '4px 8px' }}>Written — in the store</th>
              <th style={{ textAlign: 'left', padding: '4px 8px' }}>Scored — the ledger</th>
              <th style={{ textAlign: 'left', padding: '4px 8px' }}>Served — Smart Site</th>
              <th style={{ textAlign: 'left', padding: '4px 8px' }}>Divergence</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, ROW_LIMIT).map((r: ThreeLayerRow) => {
              const worst = r.divergences.some((d) => d.severity === 'danger')
                ? 'danger'
                : r.divergences.length > 0
                  ? 'warn'
                  : 'info'
              const c = sevColors(worst)
              return (
                <tr
                  key={`${r.countyFips}-${r.railKey}`}
                  data-testid={`three-layer-row-${r.countyFips}-${r.railKey}`}
                  style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}
                >
                  <td style={{ padding: '4px 8px' }}>
                    {resolveCountyName(r.countyFips, r.countyName).name}
                    <span style={{ ...mono, color: 'var(--color-text-tertiary)', marginLeft: 6 }}>{r.countyFips}</span>
                  </td>
                  <td style={{ padding: '4px 8px' }} title={railDef(r.railKey).label}>
                    <span style={mono}>{r.railKey}</span>
                  </td>
                  <td style={{ padding: '4px 8px' }} data-testid={`written-${r.countyFips}-${r.railKey}`}>
                    {r.written.state === 'measured' ? (
                      r.written.signals.map((s) => (
                        <div key={s.column} style={mono} title={s.basis}>
                          {s.count.toLocaleString()}{' '}
                          <span style={{ color: 'var(--color-text-tertiary)' }}>{s.label}</span>
                        </div>
                      ))
                    ) : (
                      <NotMeasured state={r.written.state} reason={r.written.notMeasuredReason} />
                    )}
                  </td>
                  <td style={{ padding: '4px 8px' }} data-testid={`scored-${r.countyFips}-${r.railKey}`}>
                    {r.scored.state === 'measured' ? (
                      <>
                        <div style={mono}>
                          {r.scored.coveragePct == null ? 'no number' : `${r.scored.coveragePct.toFixed(2)}%`}
                        </div>
                        <div style={{ ...typeCaption, color: 'var(--color-text-tertiary)' }}>
                          {r.scored.visualState}
                          {r.scored.thresholdPct != null ? ` · thr ${r.scored.thresholdPct}%` : ''}
                        </div>
                      </>
                    ) : (
                      <NotMeasured state={r.scored.state} reason={r.scored.notMeasuredReason} />
                    )}
                  </td>
                  <td style={{ padding: '4px 8px' }} data-testid={`served-${r.countyFips}-${r.railKey}`}>
                    {r.served.state === 'measured' ? (
                      r.served.fields.map((f) => (
                        <div key={f.field} style={mono} title={f.basis}>
                          {f.rate.pct == null ? '—' : `${f.rate.pct.toFixed(1)}%`}{' '}
                          <span style={{ color: 'var(--color-text-tertiary)' }}>
                            {f.field} {f.rate.numerator.toLocaleString()}/{f.rate.denominator.toLocaleString()}
                          </span>
                        </div>
                      ))
                    ) : (
                      <NotMeasured state={r.served.state} reason={r.served.notMeasuredReason} />
                    )}
                  </td>
                  <td style={{ padding: '4px 8px', color: c.fg, background: r.divergences.length ? c.bg : undefined }}>
                    {r.divergences.length === 0 ? (
                      <span style={{ ...typeCaption, color: 'var(--color-text-tertiary)' }}>none</span>
                    ) : (
                      r.divergences.map((d) => (
                        <div key={d.kind} style={{ marginBottom: 2 }} title={d.detail}>
                          <strong>{DIVERGENCE_LABELS[d.kind]}</strong>
                          <div style={{ ...typeCaption, color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                            {d.detail}
                          </div>
                        </div>
                      ))
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {filtered.length > ROW_LIMIT ? (
        <div style={{ ...typeCaption, marginTop: 6, color: 'var(--color-text-tertiary)' }}>
          showing {ROW_LIMIT} of {filtered.length.toLocaleString()} matching rows
        </div>
      ) : null}
    </div>
  )
}

export default ThreeLayerPanel
