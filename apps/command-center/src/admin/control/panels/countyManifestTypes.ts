// countyManifestTypes.ts — shared types and rail derivation for the County Manifest grid.
//
// THE RAIL SET IS DERIVED FROM THE API, NEVER DECLARED HERE. GET /api/county-ledger
// serves `railCapabilities` (ordered, authoritative) and `manifestCells`; the grid's
// columns, column count, and grid dimension label all come from that response.
// RAIL_LABELS below is a presentation-only lookup for short headers and long names;
// a rail absent from it still renders, using a derived fallback label. That keeps the
// console from ever showing a rail set that differs from the one the API serves — the
// defect that let the console print 13 columns (with a stale `join` and a collapsed
// `rrc`) while the API served 14 after the 2026-08-09 R1 rail split.

import type { Severity } from '../primitives'

export type ManifestDisplayState =
  | 'derivation-indeterminate'
  | 'no-atom'
  | 'no-writer'
  | 'not-yet'
  | 'satisfied-present'
  | 'satisfied-absent'

/**
 * The six states cortex-api can serve, enumerated so the console can measure which of
 * them a payload actually contains.
 *
 * `derivation-indeterminate` was added upstream (routes/countyLedger.ts) and was NOT
 * declared here until SS-W8. A state the console does not know falls through to the
 * default treatment, which is the same dot as `not-yet` — so an indeterminate
 * derivation read to an operator as an unacquired rail. Zero such cells were on the
 * payload probed 2026-08-19, which made it a latent mis-render rather than an active
 * one; it is declared now so it can never become active unseen.
 */
export const MANIFEST_DISPLAY_STATES: readonly ManifestDisplayState[] = [
  'derivation-indeterminate',
  'no-atom',
  'no-writer',
  'not-yet',
  'satisfied-present',
  'satisfied-absent',
] as const

export interface ManifestCell {
  countyFips: string
  railKey: string
  displayState: ManifestDisplayState
  isPartial: boolean
  honestCoveragePct: number | null
  thresholdPct: number | null
  atomFamilyState: string
  hasWriter: boolean
  absenceBasis: string | null
  source: string | null
  sourceVintage: string | null
  lastVerifiedAt: string | null
  verifiedByInstrument: string | null
  verificationMethod: string | null
  artifactPath: string | null
}

export interface ManifestSummary {
  onboardedCount: number
  totalCounties: number
  staleCount: number
  rewarmUnsafeCount: number
  totalRails?: number
  totalCells?: number
  satisfiedCells?: number
  /** Present + partial breakdown — served by the API; previously missing from these types. */
  satisfiedPresentCells?: number
  satisfiedPresentPartialCells?: number
  satisfiedAbsentCells?: number
  texasCompletenessPct?: number
  /** L18: when the snapshot was written. Always shown on the grid. */
  computedAt?: string
  /** L18: when this GET was served. */
  servedAt?: string
  /** L18: servedAt - computedAt in ms. */
  materializationAgeMs?: number
}

/** Materialization older than this is STALE on the County Manifest page (L18 addendum). */
export const LEDGER_STALE_AFTER_MS = 15 * 60 * 1000

export function isLedgerMaterializationStale(
  summary: ManifestSummary,
  nowMs = Date.now(),
): boolean {
  if (!summary.computedAt) return true
  const parsed = Date.parse(summary.computedAt)
  if (!Number.isFinite(parsed)) return true
  const age =
    typeof summary.materializationAgeMs === 'number' && Number.isFinite(summary.materializationAgeMs)
      ? summary.materializationAgeMs
      : nowMs - parsed
  return age > LEDGER_STALE_AFTER_MS
}

/** Ordered, authoritative rail list served by GET /api/county-ledger.
 *
 *  `maxCountiesReachable` is the rail's own REACHABLE CEILING and it is not always
 *  254: as served 2026-08-18 rrc-wells is 1 (its source is a single-county mirror),
 *  owner 15, mud 186, rail-corridor 253, footprint 254, and 9 of 14 rails carry null
 *  with sourceBasis "no capability probe defined for this rail". Scoring every rail
 *  against 254 manufactures statewide holes that are really source ceilings, so the
 *  grid renders both denominators and says plainly where no probe defines one. */
export interface RailCapability {
  railKey: string
  maxCountiesReachable: number | null
  reachPct: number | null
  sourceBasis: string | null
  /** Served for some rails; names why the theoretical ceiling is not the practical one. */
  limitation?: string | null
}

export interface ManifestCountyRow {
  countyFips: string
  countyName: string | null
  hasStale: boolean
  rewarmUnsafe: boolean
  rows?: Array<{
    rowId: string
    openDefectClasses: Array<{ defectClass: string; count: number }>
    focusedFixCount: number
  }>
  facets?: Array<{
    facet: string
    lastRewarmAt: string | null
    stalenessFlag: boolean
    sourceVintage: string | null
  }>
}

export interface ManifestLedgerResponse {
  counties: ManifestCountyRow[]
  manifestCells?: ManifestCell[]
  railCapabilities?: RailCapability[]
  summary: ManifestSummary
}

export interface RailDef {
  key: string
  label: string
  short: string
  kind: 'spine' | 'derived'
}

/**
 * Presentation-only labels. NOT the column set — the column set is derived from the
 * API response by `deriveRails`. Adding a rail server-side needs no change here; the
 * column simply renders with a derived label until a nicer one is added.
 */
const RAIL_LABELS: Record<string, { label: string; short: string; kind: 'spine' | 'derived' }> = {
  geometry: { label: 'Parcel geometry', short: 'GEOM', kind: 'spine' },
  cad: { label: 'CAD attributes', short: 'CAD', kind: 'spine' },
  zoning: { label: 'Zoning + setback', short: 'ZON', kind: 'spine' },
  roads: { label: 'Roads / frontage', short: 'ROAD', kind: 'spine' },
  flood: { label: 'Flood / terrain', short: 'FLD', kind: 'spine' },
  envelope: { label: 'Buildable envelope', short: 'ENV', kind: 'derived' },
  landuse: { label: 'Land use', short: 'LU', kind: 'derived' },
  footprint: { label: 'Building footprints', short: 'BFP', kind: 'derived' },
  easement: { label: 'Utility easements', short: 'ESMT', kind: 'derived' },
  owner: { label: 'Owner facet', short: 'OWN', kind: 'derived' },
  'rrc-wells': { label: 'RRC wells', short: 'WELL', kind: 'derived' },
  'rrc-pipelines': { label: 'RRC pipelines', short: 'PIPE', kind: 'derived' },
  'rail-corridor': { label: 'Rail corridors', short: 'RAIL', kind: 'derived' },
  mud: { label: 'MUD / districts', short: 'MUD', kind: 'derived' },
}

/** Derive a short header for a rail key with no declared label. */
function fallbackShort(railKey: string): string {
  const tail = railKey.split(/[-_]/).pop() ?? railKey
  return tail.slice(0, 4).toUpperCase()
}

export function railDef(railKey: string): RailDef {
  const known = RAIL_LABELS[railKey]
  if (known) return { key: railKey, ...known }
  return { key: railKey, label: railKey, short: fallbackShort(railKey), kind: 'derived' }
}

/**
 * The single source of the column set. Prefers the API's ordered `railCapabilities`;
 * falls back to first-appearance order of `manifestCells` when the deployment does not
 * serve capabilities. Returns [] when neither is present — the caller must degrade
 * honestly rather than substitute a hardcoded list.
 */
export function deriveRails(
  railCapabilities: RailCapability[] | undefined,
  manifestCells: ManifestCell[] | undefined,
): RailDef[] {
  const keys: string[] = []
  const push = (k: string) => {
    if (k && !keys.includes(k)) keys.push(k)
  }
  if (railCapabilities && railCapabilities.length > 0) {
    for (const rc of railCapabilities) push(rc.railKey)
  }
  for (const cell of manifestCells ?? []) push(cell.railKey)
  return keys.map(railDef)
}

export function isSatisfiedCell(cell: ManifestCell): boolean {
  return (
    (cell.displayState === 'satisfied-present' && !cell.isPartial) ||
    cell.displayState === 'satisfied-absent'
  )
}

export function countySatisfiedCount(cells: ManifestCell[]): number {
  return cells.filter(isSatisfiedCell).length
}

export function rawCellsCompletenessPct(satisfiedCells: number, totalCells: number): number {
  if (totalCells <= 0) return 0
  return (100 * satisfiedCells) / totalCells
}

/**
 * PARTIAL, DERIVED — acquired, above zero, below its own threshold, therefore carrying
 * zero credit.
 *
 * The served `isPartial` field is false on every cell of the live payload (3,556 of
 * 3,556 probed 2026-08-19), so the control it drove could not fire and the partial
 * treatment was decoration. This derivation reads the two fields that DO vary,
 * `honestCoveragePct` and `thresholdPct`, and fires on 120 of those same 3,556 cells —
 * work that is acquired and short of threshold, which the grid was rendering as a bare
 * dot with no number because the upstream displayState is `not-yet`.
 *
 * `satisfied-absent` is excluded: an established absence carrying a basis is not a
 * partial acquisition, and colouring it as one would invert the finding.
 *
 * The upstream field is NOT deleted — it is measured against this derivation by
 * `partialControlDivergence`, because two implementations of one rule that disagree is
 * the bug (DEV_PROCESS 2.4).
 */
export function derivedIsPartial(cell: ManifestCell): boolean {
  const cov = cell.honestCoveragePct
  const thr = cell.thresholdPct
  if (cov == null || thr == null) return false
  if (cell.displayState === 'satisfied-absent') return false
  return cov > 0 && cov < thr
}

export interface PartialControlDivergence {
  upstreamPartial: number
  derivedPartial: number
  /** Cells where the served field and the derivation disagree. */
  disagree: number
  cellsExamined: number
}

/** Paired controls need a divergence test; this is it, measured over every cell. */
export function partialControlDivergence(cells: ManifestCell[]): PartialControlDivergence {
  let upstream = 0
  let derived = 0
  let disagree = 0
  for (const c of cells) {
    const d = derivedIsPartial(c)
    if (c.isPartial) upstream += 1
    if (d) derived += 1
    if (c.isPartial !== d) disagree += 1
  }
  return { upstreamPartial: upstream, derivedPartial: derived, disagree, cellsExamined: cells.length }
}

export function cellVisualState(cell: ManifestCell): ManifestDisplayState | 'partial' {
  if (cell.displayState === 'no-atom') return 'no-atom'
  if (cell.displayState === 'derivation-indeterminate') return 'derivation-indeterminate'
  if (derivedIsPartial(cell)) return 'partial'
  if (cell.displayState === 'no-writer') return 'not-yet'
  return cell.displayState
}

export function cellSev(state: ManifestDisplayState | 'partial'): Severity {
  if (state === 'satisfied-present') return 'ok'
  if (state === 'satisfied-absent') return 'info'
  if (state === 'partial') return 'warn'
  if (state === 'no-atom') return 'danger'
  if (state === 'derivation-indeterminate') return 'warn'
  return 'info'
}

export function cellLabel(cell: ManifestCell): string {
  const visual = cellVisualState(cell)
  if (visual === 'partial') {
    const pct = cell.honestCoveragePct
    return pct == null ? 'PART' : `${pct.toFixed(0)}%`
  }
  if (visual === 'satisfied-present') {
    const pct = cell.honestCoveragePct
    return pct == null ? 'OK' : `${pct.toFixed(0)}%`
  }
  if (visual === 'satisfied-absent') return 'ABS'
  if (visual === 'derivation-indeterminate') return '?'
  if (cell.displayState === 'no-atom') return '—'
  if (cell.displayState === 'no-writer') return '·'
  return '·'
}

export function atomTag(atomFamilyState: string): string | null {
  if (atomFamilyState === 'present') return null
  if (atomFamilyState === 'missing') return 'NO ATOM'
  if (atomFamilyState === 'unpublished') return 'UNPUB'
  if (atomFamilyState === 'partial') return 'HALF'
  return atomFamilyState.toUpperCase()
}

export function writerTag(hasWriter: boolean): string | null {
  return hasWriter ? null : 'NO WRITER'
}

export function groupCellsByCounty(
  cells: ManifestCell[],
  rails: RailDef[],
): Map<string, ManifestCell[]> {
  const map = new Map<string, ManifestCell[]>()
  for (const cell of cells) {
    const list = map.get(cell.countyFips) ?? []
    list.push(cell)
    map.set(cell.countyFips, list)
  }
  const order = new Map(rails.map((r, i) => [r.key, i]))
  for (const list of map.values()) {
    list.sort((a, b) => (order.get(a.railKey) ?? 999) - (order.get(b.railKey) ?? 999))
  }
  return map
}

export function indexCells(cells: ManifestCell[]): Map<string, ManifestCell> {
  const map = new Map<string, ManifestCell>()
  for (const cell of cells) {
    map.set(`${cell.countyFips}:${cell.railKey}`, cell)
  }
  return map
}
