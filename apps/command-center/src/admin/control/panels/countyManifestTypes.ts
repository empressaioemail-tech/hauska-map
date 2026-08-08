// countyManifestTypes.ts — shared types and rail dimension for the County Manifest grid.
//
// Rail metadata mirrors the 13 ruled rails (doc_repo
// `_decisions/2026-08-08_county_shape_thirteen_rails_and_geometry_first.md`).
// Display names and short headers are stable UI labels; cell state comes from
// GET /api/county-ledger `manifestCells`, not from this table.

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
  texasCompletenessPct?: number
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
  summary: ManifestSummary
}

export interface RailDef {
  key: string
  label: string
  short: string
  kind: 'spine' | 'derived'
}

/** Ruled rail order — 13 columns left-to-right after the frozen county column. */
export const MANIFEST_RAILS: RailDef[] = [
  { key: 'geometry', label: 'Parcel geometry', short: 'GEOM', kind: 'spine' },
  { key: 'cad', label: 'CAD attributes', short: 'CAD', kind: 'spine' },
  { key: 'join', label: 'Join quality', short: 'JOIN', kind: 'spine' },
  { key: 'zoning', label: 'Zoning + setback', short: 'ZON', kind: 'spine' },
  { key: 'roads', label: 'Roads / frontage', short: 'ROAD', kind: 'spine' },
  { key: 'flood', label: 'Flood / terrain', short: 'FLD', kind: 'spine' },
  { key: 'envelope', label: 'Buildable envelope', short: 'ENV', kind: 'derived' },
  { key: 'landuse', label: 'Land use', short: 'LU', kind: 'derived' },
  { key: 'footprint', label: 'Building footprints', short: 'BFP', kind: 'derived' },
  { key: 'easement', label: 'Utility easements', short: 'ESMT', kind: 'derived' },
  { key: 'owner', label: 'Owner facet', short: 'OWN', kind: 'derived' },
  { key: 'rrc', label: 'RRC wells / pipe', short: 'RRC', kind: 'derived' },
  { key: 'mud', label: 'MUD / districts', short: 'MUD', kind: 'derived' },
]

export const RAIL_COUNT = MANIFEST_RAILS.length

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

export function groupCellsByCounty(cells: ManifestCell[]): Map<string, ManifestCell[]> {
  const map = new Map<string, ManifestCell[]>()
  for (const cell of cells) {
    const list = map.get(cell.countyFips) ?? []
    list.push(cell)
    map.set(cell.countyFips, list)
  }
  for (const list of map.values()) {
    list.sort((a, b) => {
      const ai = MANIFEST_RAILS.findIndex((r) => r.key === a.railKey)
      const bi = MANIFEST_RAILS.findIndex((r) => r.key === b.railKey)
      return ai - bi
    })
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
