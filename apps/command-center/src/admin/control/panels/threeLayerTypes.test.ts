// threeLayerTypes.test.ts — the three-layer join and its divergence classes.
//
// Every divergence class is proven able to FIRE and able to STAY QUIET (DEV_PROCESS
// 2.2). The two structural rules are pinned by value, not by comment: a layer that did
// not measure never becomes a zero, and a written ATOM COUNT is never differenced
// against a scored PERCENTAGE.

import { describe, it, expect } from 'vitest'
import type { CentralTxNodeGraphTally } from '../../api/atomTrace'
import type { ManifestCell } from './countyManifestTypes'
import type { StatewideServingSweep, CountyServingSweep, FieldTally } from './servingSweepTypes'
import { FIELD_KEYS } from './servingSweepTypes'
import {
  DIVERGENCE_LABELS,
  buildThreeLayerRows,
  classifyDivergences,
  railsWithoutWrittenSignal,
  readServedLayer,
  readScoredLayer,
  readWrittenLayer,
  summarizeLayerCoverage,
  tallyDivergences,
  writtenCoverageSet,
  writtenSignalsForRail,
  type LayerTimestamps,
} from './threeLayerTypes'

const TIMES: LayerTimestamps = {
  writtenObservedAt: '2026-08-04T13:02:36.327Z',
  scoredComputedAt: '2026-08-14T17:41:22.500Z',
  servedSweptAt: '2026-08-18T00:00:00.000Z',
}

function mkCell(countyFips: string, railKey: string, o: Partial<ManifestCell> = {}): ManifestCell {
  return {
    countyFips,
    railKey,
    displayState: 'not-yet',
    isPartial: false,
    honestCoveragePct: null,
    thresholdPct: 90,
    atomFamilyState: 'present',
    hasWriter: true,
    absenceBasis: null,
    source: null,
    sourceVintage: null,
    lastVerifiedAt: null,
    verifiedByInstrument: null,
    verificationMethod: null,
    artifactPath: null,
    ...o,
  }
}

function mkTally(counties: Array<Partial<{ fips: string; zoning: number; setback: number; envelope: number; nodes: number }>>): CentralTxNodeGraphTally {
  return {
    generatedAt: TIMES.writtenObservedAt!,
    centralTx: {
      counties: counties.map((c) => ({
        fips: c.fips ?? '48453',
        county: 'Travis',
        nodes: c.nodes ?? 0,
        zoning_present: c.zoning ?? 0,
        zoning_honest_absent_or_empty: 0,
        zoning_slot_missing: 0,
        setback_present: c.setback ?? 0,
        envelope_present: c.envelope ?? 0,
        full_chain_nodes: 0,
        references: 0,
        depth_warm_promoted: 0,
        zoning_place_type: 0,
        depth_ratio_place_type: 0,
        zoning_present_pct: 0,
      })),
    },
  }
}

function tally(present: number, denom: number): FieldTally {
  return { present, absentCovered: denom - present, absentUncovered: 0, unresolved: 0 }
}

function mkSweep(countyFips: string, zoningPresent: number, parcels: number): StatewideServingSweep {
  const fields = {} as CountyServingSweep['fields']
  // The zoning rail pairs to TWO served fields (zoning, setbacks), so both carry the
  // same value here — a test that asks for a quiet cell must get a quiet cell.
  for (const k of FIELD_KEYS)
    fields[k] = tally(k === 'zoning' || k === 'setbacks' ? zoningPresent : 0, parcels)
  const county: CountyServingSweep = {
    countyFips,
    countyName: 'Travis',
    sweptAt: TIMES.servedSweptAt!,
    resolverVersion: 'v1',
    parcelsTotal: parcels,
    parcelsUnresolvable: 0,
    fields,
    singleFamily: { parcelsTotal: parcels, fields },
    contradictions: [],
    multiZoneFloodParcels: 0,
    absenceClusters: [],
    sourcesByField: {},
  }
  return {
    sweptAt: TIMES.servedSweptAt!,
    resolverVersion: 'v1',
    countiesTotal: 254,
    countiesSwept: 1,
    parcelsTotal: parcels,
    counties: [county],
  }
}

describe('the written signal map', () => {
  it('pairs a rail to one or more named columns, each carrying a basis', () => {
    const zoning = writtenSignalsForRail('zoning')
    expect(zoning.length).toBe(2)
    expect(zoning.map((s) => s.column).sort()).toEqual(['setback_present', 'zoning_present'])
    for (const s of zoning) expect(s.basis.length).toBeGreaterThan(10)
  })

  it('names the rails it does NOT speak for rather than reporting them as empty', () => {
    const rails = ['geometry', 'zoning', 'footprint', 'mud', 'rrc-wells']
    expect(railsWithoutWrittenSignal(rails)).toEqual(['footprint', 'mud', 'rrc-wells'])
  })

  it('reports the coverage set as counties, road counties and rails', () => {
    const cov = writtenCoverageSet(mkTally([{ fips: '48453' }, { fips: '48021' }]), 'tally')
    expect(cov.countyFips).toEqual(['48453', '48021'])
    expect(cov.roadCountyFips).toEqual([])
    expect(cov.observedAt).toBe(TIMES.writtenObservedAt)
  })
})

describe('a layer that did not measure NEVER becomes a zero', () => {
  it('written: a county outside the coverage set is named, not zeroed', () => {
    const r = readWrittenLayer(mkTally([{ fips: '48453', zoning: 10 }]), '48001', 'zoning')
    expect(r.state).toBe('county-outside-coverage')
    expect(r.signals).toEqual([])
    expect(r.anyPresent).toBe(false)
    expect(r.notMeasuredReason).toMatch(/outside the tally's coverage set \(1 counties reported\)/)
  })

  it('written: a rail with no signal is named, not zeroed', () => {
    const r = readWrittenLayer(mkTally([{ fips: '48453' }]), '48453', 'footprint')
    expect(r.state).toBe('rail-has-no-signal')
    expect(r.notMeasuredReason).toMatch(/no column that speaks for the footprint rail/)
  })

  it('written: an unread instrument is named, not zeroed', () => {
    expect(readWrittenLayer(null, '48453', 'zoning').state).toBe('no-instrument')
  })

  it('written: a measured ZERO is a measurement and is distinct from all of the above', () => {
    const r = readWrittenLayer(mkTally([{ fips: '48453', zoning: 0, setback: 0 }]), '48453', 'zoning')
    expect(r.state).toBe('measured')
    expect(r.anyPresent).toBe(false)
    expect(r.signals.map((s) => s.count)).toEqual([0, 0])
  })

  it('scored: a missing cell is named, not zeroed', () => {
    const r = readScoredLayer(undefined)
    expect(r.state).toBe('no-cell')
    expect(r.coveragePct).toBeNull()
  })

  it('served: an unswept county and an unpaired rail are different named states', () => {
    const sweep = mkSweep('48453', 10, 100)
    expect(readServedLayer(sweep, '48001', 'zoning').state).toBe('county-not-swept')
    expect(readServedLayer(sweep, '48453', 'footprint').state).toBe('rail-has-no-field')
    expect(readServedLayer(null, '48453', 'zoning').state).toBe('no-sweep')
  })
})

describe('divergence classes fire and stay quiet', () => {
  it('written-present-scored-absent FIRES on atoms in the store against a not-yet cell', () => {
    const written = readWrittenLayer(mkTally([{ fips: '48453', zoning: 233249 }]), '48453', 'zoning')
    const scored = readScoredLayer(mkCell('48453', 'zoning', { displayState: 'not-yet', honestCoveragePct: 0 }))
    const d = classifyDivergences(written, scored, readServedLayer(null, '48453', 'zoning'), TIMES)
    const hit = d.find((x) => x.kind === 'written-present-scored-absent')
    expect(hit).toBeTruthy()
    expect(hit!.severity).toBe('danger')
    // Both timestamps travel with the finding, so the reader knows which claim is older.
    expect(hit!.detail).toContain(TIMES.writtenObservedAt!)
    expect(hit!.detail).toContain(TIMES.scoredComputedAt!)
    expect(hit!.detail).toContain('233,249')
  })

  it('written-present-scored-absent STAYS QUIET when the ledger agrees something is there', () => {
    const written = readWrittenLayer(mkTally([{ fips: '48453', zoning: 233249 }]), '48453', 'zoning')
    const scored = readScoredLayer(
      mkCell('48453', 'zoning', { displayState: 'satisfied-present', honestCoveragePct: 99 }),
    )
    const d = classifyDivergences(written, scored, readServedLayer(null, '48453', 'zoning'), TIMES)
    expect(d.some((x) => x.kind === 'written-present-scored-absent')).toBe(false)
  })

  it('NEVER differences a written count against a scored percentage', () => {
    const written = readWrittenLayer(mkTally([{ fips: '48453', zoning: 233249 }]), '48453', 'zoning')
    const scored = readScoredLayer(mkCell('48453', 'zoning', { displayState: 'not-yet', honestCoveragePct: 0 }))
    const d = classifyDivergences(written, scored, readServedLayer(null, '48453', 'zoning'), TIMES)
    const text = d.map((x) => x.detail).join(' ')
    // 233249 - 0 = 233249 would be the meaningless number; it must not appear as a gap,
    // and the reading must say why the two are not differenced.
    expect(text).toContain('different units')
    expect(text).not.toMatch(/233,?249 points/)
  })

  it('scored-satisfied-written-zero FIRES when the ledger claims what the store does not hold', () => {
    const written = readWrittenLayer(mkTally([{ fips: '48453', zoning: 0, setback: 0 }]), '48453', 'zoning')
    const scored = readScoredLayer(
      mkCell('48453', 'zoning', { displayState: 'satisfied-present', honestCoveragePct: 99 }),
    )
    const d = classifyDivergences(written, scored, readServedLayer(null, '48453', 'zoning'), TIMES)
    expect(d.some((x) => x.kind === 'scored-satisfied-written-zero')).toBe(true)
  })

  it('scored-satisfied-served-zero FIRES on the 100%-scored, 0%-served shape', () => {
    const scored = readScoredLayer(
      mkCell('48453', 'zoning', { displayState: 'satisfied-present', honestCoveragePct: 100 }),
    )
    const served = readServedLayer(mkSweep('48453', 0, 400_000), '48453', 'zoning')
    const d = classifyDivergences(readWrittenLayer(null, '48453', 'zoning'), scored, served, TIMES)
    const hit = d.find((x) => x.kind === 'scored-satisfied-served-zero')
    expect(hit).toBeTruthy()
    expect(hit!.detail).toContain('0 of 400,000 parcels')
  })

  it('scored-served-gap carries the gap in POINTS with both denominators, and both are percentages', () => {
    const scored = readScoredLayer(
      mkCell('48453', 'zoning', { displayState: 'satisfied-present', honestCoveragePct: 100 }),
    )
    const served = readServedLayer(mkSweep('48453', 12, 100), '48453', 'zoning')
    const d = classifyDivergences(readWrittenLayer(null, '48453', 'zoning'), scored, served, TIMES)
    const gap = d.find((x) => x.kind === 'scored-served-gap')
    expect(gap).toBeTruthy()
    expect(gap!.detail).toContain('+88.0 points')
    expect(gap!.detail).toContain('12/100')
    expect(gap!.detail).toContain('both percentages of parcels')
  })

  it('scored-served-gap STAYS QUIET when the two instruments agree', () => {
    const scored = readScoredLayer(
      mkCell('48453', 'zoning', { displayState: 'satisfied-present', honestCoveragePct: 90 }),
    )
    const served = readServedLayer(mkSweep('48453', 89, 100), '48453', 'zoning')
    const d = classifyDivergences(readWrittenLayer(null, '48453', 'zoning'), scored, served, TIMES)
    expect(d.some((x) => x.kind === 'scored-served-gap')).toBe(false)
  })

  it('no divergence at all is possible — a quiet cell is quiet', () => {
    const written = readWrittenLayer(mkTally([{ fips: '48453', zoning: 100, setback: 100 }]), '48453', 'zoning')
    const scored = readScoredLayer(
      mkCell('48453', 'zoning', { displayState: 'satisfied-present', honestCoveragePct: 95 }),
    )
    const served = readServedLayer(mkSweep('48453', 95, 100), '48453', 'zoning')
    expect(classifyDivergences(written, scored, served, TIMES)).toEqual([])
  })
})

describe('the join', () => {
  const rails = ['zoning', 'footprint']
  const cells = [
    mkCell('48453', 'zoning', { displayState: 'not-yet', honestCoveragePct: 0 }),
    mkCell('48453', 'footprint', { displayState: 'not-yet' }),
    mkCell('48001', 'zoning', { displayState: 'not-yet' }),
    mkCell('48001', 'footprint', { displayState: 'not-yet' }),
  ]

  it('drops no row for lack of a counterpart', () => {
    const rows = buildThreeLayerRows({
      cells,
      railKeys: rails,
      countyNames: new Map(),
      tally: mkTally([{ fips: '48453', zoning: 233249 }]),
      sweep: null,
      times: TIMES,
    })
    expect(rows.length).toBe(4)
    const fp = rows.find((r) => r.countyFips === '48453' && r.railKey === 'footprint')!
    expect(fp.written.state).toBe('rail-has-no-signal')
    expect(fp.divergences).toEqual([])
  })

  it('ranks divergent rows first without computing a blended score', () => {
    const rows = buildThreeLayerRows({
      cells,
      railKeys: rails,
      countyNames: new Map(),
      tally: mkTally([{ fips: '48453', zoning: 233249 }]),
      sweep: null,
      times: TIMES,
    })
    expect(rows[0].countyFips).toBe('48453')
    expect(rows[0].railKey).toBe('zoning')
    expect(rows[0].divergences.length).toBeGreaterThan(0)
  })

  it('restricting to instrumented counties keeps the denominator visible', () => {
    const rows = buildThreeLayerRows({
      cells,
      railKeys: rails,
      countyNames: new Map(),
      tally: mkTally([{ fips: '48453', zoning: 1 }]),
      sweep: null,
      times: TIMES,
      onlyInstrumentedCounties: true,
    })
    expect([...new Set(rows.map((r) => r.countyFips))]).toEqual(['48453'])
    expect(rows.length).toBe(2)
  })

  it('tallies every class over the same denominator, so a zero is a measured zero', () => {
    const rows = buildThreeLayerRows({
      cells,
      railKeys: rails,
      countyNames: new Map(),
      tally: mkTally([{ fips: '48453', zoning: 233249 }]),
      sweep: null,
      times: TIMES,
    })
    const tallies = tallyDivergences(rows)
    expect(tallies.length).toBe(Object.keys(DIVERGENCE_LABELS).length)
    for (const t of tallies) expect(t.rowsExamined).toBe(rows.length)
    expect(tallies.find((t) => t.kind === 'written-present-scored-absent')!.count).toBe(1)
    expect(tallies.find((t) => t.kind === 'scored-satisfied-served-zero')!.count).toBe(0)
  })

  it('summarizes what each layer actually measured, with its named non-measurements', () => {
    const rows = buildThreeLayerRows({
      cells,
      railKeys: rails,
      countyNames: new Map(),
      tally: mkTally([{ fips: '48453', zoning: 1 }]),
      sweep: null,
      times: TIMES,
    })
    const summary = summarizeLayerCoverage(rows, TIMES)
    const written = summary.find((s) => s.layer === 'written')!
    expect(written.measured).toBe(1)
    expect(written.rowsExamined).toBe(4)
    expect(written.notMeasured.map((n) => n.reason).sort()).toEqual([
      'county-outside-coverage',
      'rail-has-no-signal',
    ])
    const served = summary.find((s) => s.layer === 'served')!
    expect(served.measured).toBe(0)
    expect(served.notMeasured[0].count).toBe(4)
    expect(summary.find((s) => s.layer === 'scored')!.measured).toBe(4)
  })
})
