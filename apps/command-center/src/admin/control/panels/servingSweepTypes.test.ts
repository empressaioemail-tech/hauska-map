// servingSweepTypes.test.ts — the frozen-record parser is PROVEN ABLE TO FAIL, and the
// tally math is pinned to two rules that a renderer must never be free to reinterpret:
// the denominator is the measured sum of four classes, and `unresolved` is never folded
// into an absence.
//
// DEV_PROCESS 2.2: a gating indicator is tested for its ability to fire before it is
// trusted. A validator that cannot reject is not a validator, so every negative case
// below asserts a SPECIFIC problem string, not merely `ok === false`.

import { describe, it, expect } from 'vitest'
import {
  FIELD_KEYS,
  absenceRate,
  addTally,
  emptyTally,
  parseStatewideSweep,
  rollUpContradictions,
  rollUpFields,
  rollUpSingleFamily,
  servedRate,
  tallyDenominator,
  tallyReconciliation,
  unresolvedRate,
  type CountyServingSweep,
  type FieldKey,
  type FieldTally,
  type StatewideServingSweep,
} from './servingSweepTypes'

function tally(p: number, ac: number, au: number, u: number): FieldTally {
  return { present: p, absentCovered: ac, absentUncovered: au, unresolved: u }
}

function allFields(t: FieldTally): Record<FieldKey, FieldTally> {
  const out = {} as Record<FieldKey, FieldTally>
  for (const k of FIELD_KEYS) out[k] = { ...t }
  return out
}

function mkCounty(overrides: Partial<CountyServingSweep> = {}): CountyServingSweep {
  return {
    countyFips: '48021',
    countyName: 'Bastrop',
    sweptAt: '2026-08-18T12:00:00.000Z',
    resolverVersion: 'fact-sheet-1.0.0',
    parcelsTotal: 100,
    parcelsUnresolvable: 0,
    fields: allFields(tally(80, 10, 8, 2)),
    singleFamily: { parcelsTotal: 60, fields: allFields(tally(40, 10, 8, 2)) },
    contradictions: [],
    multiZoneFloodParcels: 0,
    absenceClusters: [],
    sourcesByField: {},
    ...overrides,
  }
}

function mkSweep(counties: CountyServingSweep[]): StatewideServingSweep {
  return {
    sweptAt: '2026-08-18T12:00:00.000Z',
    resolverVersion: 'fact-sheet-1.0.0',
    countiesTotal: 254,
    countiesSwept: counties.length,
    parcelsTotal: counties.reduce((n, c) => n + c.parcelsTotal, 0),
    counties,
  }
}

describe('tally math', () => {
  it('measures the denominator as the sum of four classes, never borrowing parcelsTotal', () => {
    const t = tally(80, 10, 8, 2)
    expect(tallyDenominator(t)).toBe(100)
    const served = servedRate(t)
    expect(served.numerator).toBe(80)
    expect(served.denominator).toBe(100)
    expect(served.pct).toBeCloseTo(80)
    expect(served.rule).toContain('present + absentCovered + absentUncovered + unresolved')
  })

  it('excludes unresolved from the absence rate — failure is not an absence', () => {
    const t = tally(80, 10, 8, 2)
    const absent = absenceRate(t)
    // 18, not 20: the two unresolved parcels are an outage and belong to no absence.
    expect(absent.numerator).toBe(18)
    expect(absent.denominator).toBe(100)
    expect(absent.rule).toContain('unresolved excluded')

    const outage = unresolvedRate(t)
    expect(outage.numerator).toBe(2)
    expect(outage.pct).toBeCloseTo(2)
    // The two classes must not overlap and must not sum to the merged figure by accident.
    expect(absent.numerator + outage.numerator).toBe(20)
    expect(absent.numerator).not.toBe(20)
  })

  it('returns a null pct rather than 0 or NaN when the denominator is zero', () => {
    const empty = emptyTally()
    expect(servedRate(empty).pct).toBeNull()
    expect(absenceRate(empty).pct).toBeNull()
    expect(unresolvedRate(empty).pct).toBeNull()
    expect(servedRate(empty).denominator).toBe(0)
  })

  it('reports the shortfall when the measured tally does not account for every claimed parcel', () => {
    const t = tally(50, 10, 5, 1) // 66 measured
    const recon = tallyReconciliation(t, 100)
    expect(recon.measured).toBe(66)
    expect(recon.claimed).toBe(100)
    expect(recon.unaccounted).toBe(34)
    expect(recon.agrees).toBe(false)
    expect(tallyReconciliation(tally(80, 10, 8, 2), 100).agrees).toBe(true)
  })

  it('rolls up per-county tallies without averaging', () => {
    const a = mkCounty({ countyFips: '48021', fields: allFields(tally(10, 1, 1, 1)) })
    const b = mkCounty({ countyFips: '48453', fields: allFields(tally(20, 2, 2, 2)) })
    const rolled = rollUpFields([a, b])
    expect(rolled.geometry).toEqual(tally(30, 3, 3, 3))
    const sf = rollUpSingleFamily([a, b])
    expect(sf.geometry).toEqual(tally(80, 20, 16, 4))
    expect(addTally(tally(1, 2, 3, 4), tally(1, 1, 1, 1))).toEqual(tally(2, 3, 4, 5))
  })

  it('rolls contradictions up by kind and caps examples at 20', () => {
    const ids = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => `${prefix}${i}`)
    const rolled = rollUpContradictions([
      mkCounty({
        contradictions: [
          { kind: 'flood-zone-disagreement', count: 5, exampleParcelNodeIds: ids(12, '48021:a') },
          { kind: 'address-absent-but-on-cad-roll', count: 2, exampleParcelNodeIds: ['48021:x'] },
        ],
      }),
      mkCounty({
        countyFips: '48453',
        contradictions: [
          { kind: 'flood-zone-disagreement', count: 7, exampleParcelNodeIds: ids(15, '48453:b') },
        ],
      }),
    ])
    expect(rolled[0].kind).toBe('flood-zone-disagreement')
    expect(rolled[0].count).toBe(12)
    expect(rolled[0].exampleParcelNodeIds.length).toBe(20)
    expect(rolled[1].count).toBe(2)
  })
})

describe('parseStatewideSweep — the happy path', () => {
  it('accepts a well-formed sweep with no problems', () => {
    const parsed = parseStatewideSweep(mkSweep([mkCounty()]))
    expect(parsed.problems).toEqual([])
    expect(parsed.ok).toBe(true)
    expect(parsed.sweep?.counties[0].countyFips).toBe('48021')
    expect(Object.keys(parsed.sweep!.counties[0].fields).sort()).toEqual([...FIELD_KEYS].sort())
  })
})

describe('parseStatewideSweep — proven able to reject', () => {
  it('rejects a non-object root', () => {
    for (const bad of [null, 42, 'sweep', []]) {
      const parsed = parseStatewideSweep(bad)
      expect(parsed.ok).toBe(false)
      expect(parsed.sweep).toBeNull()
      expect(parsed.problems.length).toBeGreaterThan(0)
    }
  })

  it('rejects a root with no counties array', () => {
    const parsed = parseStatewideSweep({ sweptAt: 'x', counties: 'nope' })
    expect(parsed.ok).toBe(false)
    expect(parsed.problems).toContain('root.counties: expected an array of CountyServingSweep')
  })

  it('names every missing FieldKey by path rather than throwing on the first', () => {
    const county = mkCounty()
    delete (county.fields as Record<string, unknown>).zoning
    delete (county.fields as Record<string, unknown>).setbacks
    const parsed = parseStatewideSweep(mkSweep([county]))
    expect(parsed.ok).toBe(false)
    expect(parsed.problems).toContain(
      'counties[0].fields.zoning: missing — the frozen record requires every FieldKey',
    )
    expect(parsed.problems).toContain(
      'counties[0].fields.setbacks: missing — the frozen record requires every FieldKey',
    )
    // Partial parse: what did survive is still rendered.
    expect(parsed.sweep?.counties[0].fields.geometry.present).toBe(80)
  })

  it('rejects a field key the frozen record does not carry', () => {
    const county = mkCounty()
    ;(county.fields as Record<string, unknown>).easements = tally(1, 0, 0, 0)
    const parsed = parseStatewideSweep(mkSweep([county]))
    expect(parsed.problems).toContain('counties[0].fields.easements: not a FieldKey in the frozen record')
  })

  it('rejects a negative or non-numeric tally member', () => {
    const county = mkCounty()
    county.fields.flood = { present: -1, absentCovered: 0, absentUncovered: 0, unresolved: 'two' as unknown as number }
    const parsed = parseStatewideSweep(mkSweep([county]))
    expect(parsed.problems).toContain('counties[0].fields.flood.present: expected a non-negative number, got -1')
    expect(parsed.problems).toContain('counties[0].fields.flood.unresolved: expected a non-negative number, got "two"')
  })

  it('rejects a contradiction kind outside the frozen union', () => {
    const county = mkCounty({
      contradictions: [
        { kind: 'zoning-looks-weird' as never, count: 3, exampleParcelNodeIds: [] },
      ],
    })
    const parsed = parseStatewideSweep(mkSweep([county]))
    expect(parsed.problems).toContain(
      'counties[0].contradictions[0].kind: not a ContradictionKind ("zoning-looks-weird")',
    )
  })

  it('flags a contradiction carrying more than the 20 example ids the record allows', () => {
    const county = mkCounty({
      contradictions: [
        {
          kind: 'flood-zone-disagreement',
          count: 30,
          exampleParcelNodeIds: Array.from({ length: 25 }, (_, i) => `48021:${i}`),
        },
      ],
    })
    const parsed = parseStatewideSweep(mkSweep([county]))
    expect(parsed.problems).toContain(
      'counties[0].contradictions[0].exampleParcelNodeIds: 25 ids, the record caps at 20',
    )
  })

  it('rejects a malformed bbox on an absence cluster', () => {
    const county = mkCounty({
      absenceClusters: [
        { field: 'setbacks', label: 'east county', parcelCount: 400, bbox: [1, 2, 3] as never },
      ],
    })
    const parsed = parseStatewideSweep(mkSweep([county]))
    expect(parsed.problems.some((p) => p.includes('absenceClusters[0].bbox: expected 4 numbers'))).toBe(true)
  })

  it('flags the missing single-family break-out the frozen record requires', () => {
    const county = mkCounty()
    delete (county as Partial<CountyServingSweep>).singleFamily
    const parsed = parseStatewideSweep(mkSweep([county]))
    expect(parsed.problems).toContain(
      'counties[0].singleFamily: missing — the frozen record requires the single-family break-out',
    )
  })

  it('reconciles countiesSwept against the counties actually carried', () => {
    const sweep = mkSweep([mkCounty()])
    sweep.countiesSwept = 42
    const parsed = parseStatewideSweep(sweep)
    expect(parsed.problems).toContain(
      'root.countiesSwept: says 42 but counties[] carries 1 — two numbers that should agree and do not',
    )
  })
})
