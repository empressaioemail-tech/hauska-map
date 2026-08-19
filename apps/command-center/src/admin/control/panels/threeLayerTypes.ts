// threeLayerTypes.ts — WRITTEN, SCORED and SERVED as three separate instruments,
// joined per county per rail, with the divergences between them named.
//
// THE REFRAME. There are three layers, not two, and all three disagree independently:
//
//   WRITTEN   atoms actually in the store          GET /stats/central-tx-node-graph
//   SCORED    county_facet_coverage cells          GET /api/county-ledger
//   SERVED    what Smart Site shows a human        the statewide serving sweep
//
// A rail can be written, unscored and unserved in three different amounts. The
// divergences ARE the defect list, so this module joins the three and classifies the
// disagreement rather than reducing them to one number.
//
// FOUR RULES ARE STRUCTURAL HERE, NOT STYLISTIC:
//
//   1. NOTHING IS AVERAGED AND NOTHING IS SUBTRACTED ACROSS UNITS. The written layer
//      counts ATOMS; the scored and served layers are PERCENTAGES OF PARCELS. The only
//      arithmetic allowed across layers is scored-minus-served in points, because those
//      two share a unit. Written is compared as PRESENCE against ZERO and never
//      differenced. A written count and a scored percentage put in a subtraction would
//      be a number with no meaning that reads like a finding.
//   2. A LAYER WITH NO INSTRUMENT FOR A CELL IS `not-measured`, NEVER ZERO. Every
//      instrument's coverage set is part of its contract, so a cell outside it renders
//      as a named absence of measurement (DEV_PROCESS 1.3, 3.3).
//   3. EVERY LAYER CARRIES ITS OWN TIMESTAMP. No layer in this console is "now": as
//      probed 2026-08-19 the written tally was generated 2026-08-04, the ledger was
//      materialized 2026-08-14 and no sweep endpoint existed at all. A figure is a
//      claim about its timestamp.
//   4. DIVERGENCE CLASSES ARE MEASURED OVER THE WHOLE JOIN, so a zero in any class is
//      a real zero rather than an unexamined one.

import type { CentralTxCountyTallyRow, CentralTxNodeGraphTally } from '../../api/atomTrace'
import { cellVisualState, type ManifestCell, type ManifestDisplayState } from './countyManifestTypes'
import { RAIL_FIELD_PAIRS } from './railFieldMap'
import { servedRate, type FieldKey, type RateWithDenominator, type StatewideServingSweep } from './servingSweepTypes'

export type LayerId = 'written' | 'scored' | 'served'

export const LAYER_LABELS: Readonly<Record<LayerId, string>> = Object.freeze({
  written: 'WRITTEN',
  scored: 'SCORED',
  served: 'SERVED',
})

export const LAYER_QUESTIONS: Readonly<Record<LayerId, string>> = Object.freeze({
  written: 'what is actually in the store',
  scored: 'what county_facet_coverage says about it',
  served: 'what Smart Site shows a human',
})

// ── The written instrument's signal map ───────────────────────────────────────

/**
 * Which column of the node-graph tally speaks for which rail, and why.
 *
 * This is a JUDGEMENT, so it is written down with a basis per row rather than buried
 * in a lookup, exactly as railFieldMap.ts does for the rail-to-field pairing. A rail
 * with no signal here is NOT unwritten — it is UNMEASURED BY THIS INSTRUMENT, which is
 * a different statement and is rendered as such.
 *
 * One rail may carry more than one signal (zoning carries both the zoning-fact count
 * and the setback-rule count, because the rail is "Zoning + setback"). Signals are
 * listed separately and are never summed: two counts of different atom families added
 * together would be a number of nothing.
 */
export interface WrittenSignalDef {
  railKey: string
  /** Column on the per-county tally row, or the road rollup. */
  column: keyof CentralTxCountyTallyRow | 'road_nodes'
  label: string
  basis: string
}

export const WRITTEN_SIGNALS: readonly WrittenSignalDef[] = Object.freeze([
  {
    railKey: 'geometry',
    column: 'nodes',
    label: 'parcel nodes',
    basis: 'a parcel node exists in the store for this county — the geometry rail scores parcel geometry',
  },
  {
    railKey: 'zoning',
    column: 'zoning_present',
    label: 'zoning-fact atoms',
    basis: 'zoning-fact atoms written against parcel nodes in this county',
  },
  {
    railKey: 'zoning',
    column: 'setback_present',
    label: 'setback-rule atoms',
    basis: 'setback-rule atoms; the rail is labelled "Zoning + setback" so both families speak for it',
  },
  {
    railKey: 'envelope',
    column: 'envelope_present',
    label: 'buildable-envelope atoms',
    basis: 'buildable-envelope atoms written against parcel nodes in this county',
  },
  {
    railKey: 'roads',
    column: 'road_nodes',
    label: 'road nodes',
    basis: 'road nodes in the store for this county, from the tally roadRollup',
  },
])

export function writtenSignalsForRail(railKey: string): WrittenSignalDef[] {
  return WRITTEN_SIGNALS.filter((s) => s.railKey === railKey)
}

/** Rails the written instrument does not speak for at all, measured against a rail set. */
export function railsWithoutWrittenSignal(railKeys: string[]): string[] {
  return railKeys.filter((k) => writtenSignalsForRail(k).length === 0)
}

// ── The written layer as the console holds it ─────────────────────────────────

export interface WrittenSignalReading {
  label: string
  column: string
  count: number
  basis: string
}

export interface WrittenLayerReading {
  /** 'measured' | 'county-outside-coverage' | 'rail-has-no-signal' | 'no-instrument' */
  state: 'measured' | 'county-outside-coverage' | 'rail-has-no-signal' | 'no-instrument'
  signals: WrittenSignalReading[]
  /** Sum is deliberately absent. `anyPresent` is the only cross-signal fact taken. */
  anyPresent: boolean
  /** Why nothing was measured, when nothing was. Never null on a non-measured state. */
  notMeasuredReason: string | null
}

/**
 * The written instrument's coverage set: which counties it reports at all, and which
 * of its columns carry a per-county value. Naming the set is what keeps a county
 * outside it from reading as an empty store.
 */
export interface WrittenCoverageSet {
  observedAt: string | null
  instrument: string
  countyFips: string[]
  /** Counties for which the road rollup carries a row — a SMALLER set than the above. */
  roadCountyFips: string[]
  railKeys: string[]
}

export function writtenCoverageSet(
  tally: CentralTxNodeGraphTally | null,
  instrument: string,
): WrittenCoverageSet {
  const counties = (tally?.centralTx?.counties ?? []).map((c) => c.fips)
  const roads = (tally?.roadRollup?.byCounty ?? []).map((c) => c.fips)
  return {
    observedAt: tally?.generatedAt ?? null,
    instrument,
    countyFips: counties,
    roadCountyFips: roads,
    railKeys: [...new Set(WRITTEN_SIGNALS.map((s) => s.railKey))],
  }
}

/**
 * Read the written layer for one county and rail.
 *
 * Every non-measured outcome is a NAMED class carrying its reason. A zero count is
 * only ever returned when the instrument actually reported zero for a county it
 * covers — that is a measurement, and it is a different fact from not looking.
 */
export function readWrittenLayer(
  tally: CentralTxNodeGraphTally | null,
  countyFips: string,
  railKey: string,
): WrittenLayerReading {
  const defs = writtenSignalsForRail(railKey)
  if (!tally) {
    return {
      state: 'no-instrument',
      signals: [],
      anyPresent: false,
      notMeasuredReason: 'no written instrument has been read in this session',
    }
  }
  if (defs.length === 0) {
    return {
      state: 'rail-has-no-signal',
      signals: [],
      anyPresent: false,
      notMeasuredReason: `the node-graph tally carries no column that speaks for the ${railKey} rail`,
    }
  }
  const row = (tally.centralTx?.counties ?? []).find((c) => c.fips === countyFips)
  const roadRow = (tally.roadRollup?.byCounty ?? []).find((c) => c.fips === countyFips)
  if (!row && !roadRow) {
    return {
      state: 'county-outside-coverage',
      signals: [],
      anyPresent: false,
      notMeasuredReason: `this county is outside the tally's coverage set (${(tally.centralTx?.counties ?? []).length} counties reported)`,
    }
  }
  const signals: WrittenSignalReading[] = []
  for (const def of defs) {
    if (def.column === 'road_nodes') {
      if (!roadRow) continue
      signals.push({ label: def.label, column: def.column, count: roadRow.road_nodes, basis: def.basis })
      continue
    }
    if (!row) continue
    const raw = row[def.column as keyof CentralTxCountyTallyRow]
    if (typeof raw !== 'number') continue
    signals.push({ label: def.label, column: String(def.column), count: raw, basis: def.basis })
  }
  if (signals.length === 0) {
    return {
      state: 'county-outside-coverage',
      signals: [],
      anyPresent: false,
      notMeasuredReason: `the tally reports this county but carries no ${railKey} column value for it`,
    }
  }
  return {
    state: 'measured',
    signals,
    anyPresent: signals.some((s) => s.count > 0),
    notMeasuredReason: null,
  }
}

// ── The scored layer ──────────────────────────────────────────────────────────

export interface ScoredLayerReading {
  state: 'measured' | 'no-cell'
  displayState: ManifestDisplayState | null
  visualState: ManifestDisplayState | 'partial' | null
  coveragePct: number | null
  thresholdPct: number | null
  /** True when the ledger positively asserts the rail is not acquired here. */
  assertsAbsent: boolean
  notMeasuredReason: string | null
}

export function readScoredLayer(cell: ManifestCell | undefined): ScoredLayerReading {
  if (!cell) {
    return {
      state: 'no-cell',
      displayState: null,
      visualState: null,
      coveragePct: null,
      thresholdPct: null,
      assertsAbsent: false,
      notMeasuredReason: 'the ledger carries no cell for this county and rail',
    }
  }
  const cov = cell.honestCoveragePct
  return {
    state: 'measured',
    displayState: cell.displayState,
    visualState: cellVisualState(cell),
    coveragePct: cov,
    thresholdPct: cell.thresholdPct,
    // not-yet, or a coverage of exactly zero, is the ledger SAYING there is nothing here.
    assertsAbsent: cell.displayState === 'not-yet' || cov === 0,
    notMeasuredReason: null,
  }
}

// ── The served layer ──────────────────────────────────────────────────────────

export interface ServedFieldReading {
  field: FieldKey
  rate: RateWithDenominator
  basis: string
}

export interface ServedLayerReading {
  state: 'measured' | 'county-not-swept' | 'rail-has-no-field' | 'no-sweep'
  fields: ServedFieldReading[]
  notMeasuredReason: string | null
}

export function readServedLayer(
  sweep: StatewideServingSweep | null,
  countyFips: string,
  railKey: string,
): ServedLayerReading {
  const pairs = RAIL_FIELD_PAIRS.filter((p) => p.railKey === railKey)
  if (!sweep) {
    return {
      state: 'no-sweep',
      fields: [],
      notMeasuredReason: 'no serving sweep has been read in this session',
    }
  }
  if (pairs.length === 0) {
    return {
      state: 'rail-has-no-field',
      fields: [],
      notMeasuredReason: `no ParcelFactSheet field corresponds to the ${railKey} rail`,
    }
  }
  const county = sweep.counties.find((c) => c.countyFips === countyFips)
  if (!county) {
    return {
      state: 'county-not-swept',
      fields: [],
      notMeasuredReason: `this county is not among the ${sweep.countiesSwept} counties in this sweep`,
    }
  }
  const fields: ServedFieldReading[] = []
  for (const pair of pairs) {
    const tally = county.fields?.[pair.field]
    if (!tally) continue
    fields.push({ field: pair.field, rate: servedRate(tally), basis: pair.basis })
  }
  if (fields.length === 0) {
    return {
      state: 'county-not-swept',
      fields: [],
      notMeasuredReason: 'the sweep covers this county but carries no tally for the paired field',
    }
  }
  return { state: 'measured', fields, notMeasuredReason: null }
}

// ── The join and its divergence classes ───────────────────────────────────────

export type DivergenceKind =
  /** The store was observed carrying atoms; the ledger says the rail is not acquired. */
  | 'written-present-scored-absent'
  /** The ledger counts the rail satisfied; the store was observed carrying nothing. */
  | 'scored-satisfied-written-zero'
  /** The ledger counts the rail satisfied; the sweep serves it to nobody. */
  | 'scored-satisfied-served-zero'
  /** Both scored and served produced a percentage and they are far apart. */
  | 'scored-served-gap'
  /** The store was observed carrying atoms; the sweep serves the field to nobody. */
  | 'written-present-served-zero'

export const DIVERGENCE_LABELS: Readonly<Record<DivergenceKind, string>> = Object.freeze({
  'written-present-scored-absent': 'written into the store, scored as not acquired',
  'scored-satisfied-written-zero': 'scored satisfied, nothing observed in the store',
  'scored-satisfied-served-zero': 'scored satisfied, served to nobody',
  'scored-served-gap': 'scored and served disagree by a wide margin',
  'written-present-served-zero': 'written into the store, served to nobody',
})

/** How wide a scored-vs-served gap has to be, in points, before it is called out. */
export const SCORED_SERVED_GAP_POINTS = 20

export interface Divergence {
  kind: DivergenceKind
  /** Stated so the reader knows which claim is older. */
  detail: string
  severity: 'danger' | 'warn'
}

export interface ThreeLayerRow {
  countyFips: string
  countyName: string | null
  railKey: string
  written: WrittenLayerReading
  scored: ScoredLayerReading
  served: ServedLayerReading
  divergences: Divergence[]
  /** Ranks worst-first. Derived from divergence severity, never from a blended score. */
  rank: number
}

export interface LayerTimestamps {
  writtenObservedAt: string | null
  scoredComputedAt: string | null
  servedSweptAt: string | null
}

/**
 * Classify the disagreement between the three readings of ONE cell.
 *
 * Every comparison here is presence-versus-zero except the scored-vs-served gap, which
 * is a subtraction of two percentages of parcels — the one place where the units match.
 */
export function classifyDivergences(
  written: WrittenLayerReading,
  scored: ScoredLayerReading,
  served: ServedLayerReading,
  times: LayerTimestamps,
): Divergence[] {
  const out: Divergence[] = []
  const writtenStamp = times.writtenObservedAt ?? 'an unstated time'
  const scoredStamp = times.scoredComputedAt ?? 'an unstated time'
  const servedStamp = times.servedSweptAt ?? 'an unstated time'

  if (written.state === 'measured' && written.anyPresent && scored.state === 'measured' && scored.assertsAbsent) {
    const counts = written.signals.map((s) => `${s.count.toLocaleString()} ${s.label}`).join(', ')
    out.push({
      kind: 'written-present-scored-absent',
      severity: 'danger',
      detail: `the store was observed carrying ${counts} at ${writtenStamp}; the ledger computed at ${scoredStamp} reads ${scored.displayState}${scored.coveragePct != null ? ` at ${scored.coveragePct.toFixed(2)}%` : ''}. Counts and percentages are different units and are not differenced — this is presence against an asserted absence.`,
    })
  }

  const scoredSatisfied =
    scored.state === 'measured' &&
    (scored.visualState === 'satisfied-present' || scored.visualState === 'satisfied-absent')

  if (scoredSatisfied && written.state === 'measured' && !written.anyPresent) {
    out.push({
      kind: 'scored-satisfied-written-zero',
      severity: 'danger',
      detail: `the ledger computed at ${scoredStamp} counts this rail satisfied; the store was observed carrying zero on every written signal at ${writtenStamp}`,
    })
  }

  if (scoredSatisfied && served.state === 'measured') {
    const zeroFields = served.fields.filter((f) => f.rate.pct === 0)
    if (zeroFields.length > 0) {
      out.push({
        kind: 'scored-satisfied-served-zero',
        severity: 'danger',
        detail: `the ledger computed at ${scoredStamp} counts this rail satisfied; the sweep of ${servedStamp} serves ${zeroFields
          .map((f) => `${f.field} to 0 of ${f.rate.denominator.toLocaleString()} parcels`)
          .join(', ')}`,
      })
    }
  }

  if (written.state === 'measured' && written.anyPresent && served.state === 'measured') {
    const zeroFields = served.fields.filter((f) => f.rate.pct === 0)
    if (zeroFields.length > 0) {
      out.push({
        kind: 'written-present-served-zero',
        severity: 'warn',
        detail: `atoms observed in the store at ${writtenStamp}; the sweep of ${servedStamp} serves ${zeroFields
          .map((f) => f.field)
          .join(', ')} to 0 parcels`,
      })
    }
  }

  if (scored.state === 'measured' && scored.coveragePct != null && served.state === 'measured') {
    for (const f of served.fields) {
      if (f.rate.pct == null) continue
      const gap = scored.coveragePct - f.rate.pct
      if (Math.abs(gap) >= SCORED_SERVED_GAP_POINTS) {
        out.push({
          kind: 'scored-served-gap',
          severity: 'warn',
          detail: `scored ${scored.coveragePct.toFixed(1)}% at ${scoredStamp} against served ${f.rate.pct.toFixed(1)}% (${f.rate.numerator.toLocaleString()}/${f.rate.denominator.toLocaleString()}) for ${f.field} at ${servedStamp} — ${gap > 0 ? '+' : ''}${gap.toFixed(1)} points, both percentages of parcels`,
        })
      }
    }
  }

  return out
}

export interface BuildThreeLayerInput {
  cells: ManifestCell[]
  railKeys: string[]
  countyNames: Map<string, string | null>
  tally: CentralTxNodeGraphTally | null
  sweep: StatewideServingSweep | null
  times: LayerTimestamps
  /**
   * When true the join is restricted to counties at least one non-scored instrument
   * covers. The scored layer alone spans 254 counties, and 3,556 rows of "not measured,
   * not measured" is noise; the full grid remains one subtab away.
   */
  onlyInstrumentedCounties?: boolean
}

/**
 * Build the three-layer join.
 *
 * No row is dropped for lack of a counterpart: a cell no instrument covers still
 * renders, carrying three named non-measurements. That is the honest shape — dropping
 * it would quietly shrink the denominator.
 */
export function buildThreeLayerRows(input: BuildThreeLayerInput): ThreeLayerRow[] {
  const { cells, railKeys, countyNames, tally, sweep, times } = input
  const cellIndex = new Map(cells.map((c) => [`${c.countyFips}:${c.railKey}`, c]))
  const writtenCounties = new Set((tally?.centralTx?.counties ?? []).map((c) => c.fips))
  for (const c of tally?.roadRollup?.byCounty ?? []) writtenCounties.add(c.fips)
  const sweptCounties = new Set((sweep?.counties ?? []).map((c) => c.countyFips))

  const allCounties = [...new Set(cells.map((c) => c.countyFips))].sort()
  const counties = input.onlyInstrumentedCounties
    ? allCounties.filter((f) => writtenCounties.has(f) || sweptCounties.has(f))
    : allCounties

  const rows: ThreeLayerRow[] = []
  for (const countyFips of counties) {
    for (const railKey of railKeys) {
      const written = readWrittenLayer(tally, countyFips, railKey)
      const scored = readScoredLayer(cellIndex.get(`${countyFips}:${railKey}`))
      const served = readServedLayer(sweep, countyFips, railKey)
      const divergences = classifyDivergences(written, scored, served, times)
      rows.push({
        countyFips,
        countyName: countyNames.get(countyFips) ?? null,
        railKey,
        written,
        scored,
        served,
        divergences,
        rank: divergences.reduce((n, d) => n + (d.severity === 'danger' ? 10 : 1), 0),
      })
    }
  }
  return rows.sort(
    (a, b) => b.rank - a.rank || a.countyFips.localeCompare(b.countyFips) || a.railKey.localeCompare(b.railKey),
  )
}

export interface DivergenceTally {
  kind: DivergenceKind
  count: number
  /** Rows examined — a count never travels without the denominator it was taken over. */
  rowsExamined: number
  examples: ThreeLayerRow[]
}

/** Every class is tallied over the whole join, so a zero is a measured zero. */
export function tallyDivergences(rows: ThreeLayerRow[]): DivergenceTally[] {
  const kinds = Object.keys(DIVERGENCE_LABELS) as DivergenceKind[]
  return kinds
    .map((kind) => {
      const hits = rows.filter((r) => r.divergences.some((d) => d.kind === kind))
      return { kind, count: hits.length, rowsExamined: rows.length, examples: hits.slice(0, 12) }
    })
    .sort((a, b) => b.count - a.count)
}

export interface LayerCoverageSummary {
  layer: LayerId
  /** Rows where this layer produced a measurement. */
  measured: number
  rowsExamined: number
  /** Named reasons for the rows it did not measure, with counts. */
  notMeasured: Array<{ reason: string; count: number }>
  observedAt: string | null
}

/**
 * How much of the join each layer actually measured. Rendered above the table so the
 * reader never mistakes a thin instrument for an empty world.
 */
export function summarizeLayerCoverage(rows: ThreeLayerRow[], times: LayerTimestamps): LayerCoverageSummary[] {
  const build = (layer: LayerId, observedAt: string | null): LayerCoverageSummary => {
    const reasons = new Map<string, number>()
    let measured = 0
    for (const r of rows) {
      const reading = layer === 'written' ? r.written : layer === 'scored' ? r.scored : r.served
      if (reading.state === 'measured') measured += 1
      else {
        const key = reading.state
        reasons.set(key, (reasons.get(key) ?? 0) + 1)
      }
    }
    return {
      layer,
      measured,
      rowsExamined: rows.length,
      notMeasured: [...reasons.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count),
      observedAt,
    }
  }
  return [
    build('written', times.writtenObservedAt),
    build('scored', times.scoredComputedAt),
    build('served', times.servedSweptAt),
  ]
}
