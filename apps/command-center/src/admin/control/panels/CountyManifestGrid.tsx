// County Manifest Grid — the operator's primary statewide console (254 x 13).
//
// Reads GET /api/county-ledger `manifestCells` (County Manifest Sprint 1).
// Sibling to CountyLedger (registry-row gate/cert view); not a tab inside it —
// the grid's scale and daily-use posture match other single-purpose Engine panels.
//
// Degrades honestly when `manifestCells` is absent on the deployment.
import React, { useEffect, useMemo, useState } from 'react'
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
  MANIFEST_RAILS,
  RAIL_COUNT,
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
  type ManifestCell,
  type ManifestCountyRow,
  type ManifestLedgerResponse,
} from './countyManifestTypes'

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

const RollupStrip: React.FC<{
  weightedPct: number | null
  rawPct: number | null
  satisfiedCells: number
  totalCells: number
  totalCounties: number
}> = ({ weightedPct, rawPct, satisfiedCells, totalCells, totalCounties }) => (
  <div
    style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: 0,
      borderBottom: '0.5px solid var(--color-border-tertiary)',
      margin: '-14px -14px 12px',
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
      <div style={{ ...mono, fontSize: 20, fontWeight: 600 }}>{totalCounties}×{RAIL_COUNT}</div>
      <div style={{ ...typeCaption }}>{totalCells.toLocaleString()} cells</div>
    </div>
  </div>
)

const Legend: React.FC = () => (
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
      return (
        <span key={label} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
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
  return (
    <div style={{ padding: '10px 12px', fontSize: 'var(--type-caption)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {county?.countyName ?? cell.countyFips} · {cell.railKey}
          </div>
          <div style={{ ...mono, color: 'var(--color-text-tertiary)' }}>{cell.countyFips}</div>
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

const IntakeSection: React.FC<{ counties: ManifestCountyRow[]; cellsByCounty: Map<string, ManifestCell[]> }> = ({
  counties,
  cellsByCounty,
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
                {county.countyName ?? county.countyFips}
                <span style={{ ...mono, color: 'var(--color-text-tertiary)', marginLeft: 6 }}>{county.countyFips}</span>
              </td>
              <td style={{ ...mono, textAlign: 'right', padding: '4px 8px' }}>
                {sat}/{RAIL_COUNT}
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
                <td style={{ padding: '4px 8px' }}>{row.county.countyName ?? row.county.countyFips}</td>
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

export const CountyManifestGrid: React.FC = () => {
  const [data, setData] = useState<ManifestLedgerResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [onlyGap, setOnlyGap] = useState(false)
  const [selectedCell, setSelectedCell] = useState<ManifestCell | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const cfg = await loadConfig()
        const api = apiBase(cfg)
        if (!api) {
          if (!cancelled) {
            setError('No cortex-api base configured for the county manifest.')
            setLoading(false)
          }
          return
        }
        const res = await getJson<ManifestLedgerResponse>(`${api}/api/county-ledger`, cfg, 20_000)
        if (!cancelled) {
          if (res.ok && res.json) setData(res.json)
          else setError(res.error ?? `county-ledger read failed (HTTP ${res.status})`)
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

  const manifestCells = data?.manifestCells
  const cellsByCounty = useMemo(
    () => (manifestCells ? groupCellsByCounty(manifestCells) : new Map()),
    [manifestCells],
  )
  const countyByFips = useMemo(() => {
    const m = new Map<string, ManifestCountyRow>()
    for (const c of data?.counties ?? []) m.set(c.countyFips, c)
    return m
  }, [data?.counties])

  const railStats = useMemo(() => {
    const stats = new Map<string, { satisfied: number; sample: ManifestCell | undefined }>()
    if (!manifestCells) return stats
    for (const rail of MANIFEST_RAILS) {
      const railCells = manifestCells.filter((c) => c.railKey === rail.key)
      stats.set(rail.key, {
        satisfied: railCells.filter(isSatisfiedCell).length,
        sample: railCells[0],
      })
    }
    return stats
  }, [manifestCells])

  const filteredFips = useMemo(() => {
    const fipsList = [...cellsByCounty.keys()].sort()
    const q = filter.trim().toLowerCase()
    return fipsList.filter((fips) => {
      const county = countyByFips.get(fips)
      const name = county?.countyName?.toLowerCase() ?? ''
      if (q && !fips.includes(q) && !name.includes(q)) return false
      if (onlyGap) {
        const sat = countySatisfiedCount(cellsByCounty.get(fips) ?? [])
        if (sat >= 3) return false
      }
      return true
    })
  }, [cellsByCounty, countyByFips, filter, onlyGap])

  if (loading) return <Loading />
  if (error) return <ErrorState msg={error} />
  if (!data) return <ErrorState msg="No manifest data." />

  if (!manifestCells || manifestCells.length === 0) {
    return (
      <Panel title="County Manifest" subtitle="254 counties × 13 rails — statewide completeness grid">
        <ErrorState msg="manifest not served by this deployment — GET /api/county-ledger returned no manifestCells array" />
      </Panel>
    )
  }

  const { summary } = data
  const satisfiedCells = summary.satisfiedCells ?? manifestCells.filter(isSatisfiedCell).length
  const totalCells = summary.totalCells ?? manifestCells.length
  const weightedPct = summary.texasCompletenessPct ?? null
  const rawPct = rawCellsCompletenessPct(satisfiedCells, totalCells)

  return (
    <Panel
      title="County Manifest"
      subtitle="254 counties × 13 rails — see everything, where it is, and what is broken"
      right={
        <Pill sev="ok">
          {satisfiedCells}/{totalCells} satisfied
        </Pill>
      }
    >
      <RollupStrip
        weightedPct={weightedPct}
        rawPct={rawPct}
        satisfiedCells={satisfiedCells}
        totalCells={totalCells}
        totalCounties={summary.totalCounties}
      />
      <Legend />
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
          below 3/13
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
                {MANIFEST_RAILS.map((rail) => {
                  const st = railStats.get(rail.key)
                  const sample = st?.sample
                  return (
                    <th
                      key={rail.key}
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
                        {st ? `${st.satisfied}/254` : '—'}
                      </div>
                      <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', marginTop: 2 }}>
                        {sample && atomTag(sample.atomFamilyState) ? (
                          <Pill sev="danger">{atomTag(sample.atomFamilyState)}</Pill>
                        ) : null}
                        {sample && writerTag(sample.hasWriter) ? (
                          <Pill sev="warn">{writerTag(sample.hasWriter)}</Pill>
                        ) : null}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {filteredFips.map((fips) => {
                const cells = cellsByCounty.get(fips) ?? []
                const county = countyByFips.get(fips)
                const sat = countySatisfiedCount(cells)
                const cellIndex = indexCells(cells)
                return (
                  <tr key={fips} data-testid={`manifest-row-${fips}`}>
                    <td style={{ ...stickyCounty, padding: '4px 8px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {county?.countyName ?? fips}
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
                            width: `${(100 * sat) / RAIL_COUNT}%`,
                            background: 'var(--color-text-success)',
                          }}
                        />
                      </div>
                    </td>
                    {MANIFEST_RAILS.map((rail) => {
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

      <IntakeSection counties={data.counties} cellsByCounty={cellsByCounty} />
      <MaintenanceSection counties={data.counties} />
    </Panel>
  )
}

export default CountyManifestGrid
