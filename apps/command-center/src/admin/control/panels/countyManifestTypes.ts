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
  | 'no-atom'
  | 'no-writer'
  | 'not-yet'
  | 'satisfied-present'
  | 'satisfied-absent'

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

/** Ordered, authoritative rail list served by GET /api/county-ledger. */
export interface RailCapability {
  railKey: string
  maxCountiesReachable: number | null
  reachPct: number | null
  sourceBasis: string | null
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

export function cellVisualState(cell: ManifestCell): ManifestDisplayState | 'partial' {
  if (cell.displayState === 'satisfied-present' && cell.isPartial) return 'partial'
  if (cell.displayState === 'no-writer') return 'not-yet'
  return cell.displayState
}

export function cellSev(state: ManifestDisplayState | 'partial'): Severity {
  if (state === 'satisfied-present') return 'ok'
  if (state === 'satisfied-absent') return 'info'
  if (state === 'partial') return 'warn'
  if (state === 'no-atom') return 'danger'
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
