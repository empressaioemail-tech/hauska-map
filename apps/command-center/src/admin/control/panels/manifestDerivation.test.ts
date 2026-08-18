// manifestDerivation.test.ts — the two checks that catch the manifest lying to itself
// are proven able to fire AND proven able to stay quiet. A detector that always fires is
// as useless as one that never does; both directions are asserted here.
//
// The live payload (GET /api/county-ledger, 2026-08-18) is the reference for the shapes
// below: hasWriter true on 3556 of 3556 cells, atomFamilyState 'present' on all of them,
// and exactly one self-contradicting cell — 48021 envelope at 99.77% against a 90%
// threshold while its displayState reads not-yet.

import { describe, it, expect } from 'vitest'
import type { ManifestCell, RailCapability } from './countyManifestTypes'
import {
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
} from './manifestDerivation'

function cell(overrides: Partial<ManifestCell> = {}): ManifestCell {
  return {
    countyFips: '48021',
    railKey: 'geometry',
    displayState: 'not-yet',
    isPartial: false,
    honestCoveragePct: null,
    thresholdPct: 95,
    atomFamilyState: 'present',
    hasWriter: true,
    absenceBasis: null,
    source: null,
    sourceVintage: null,
    lastVerifiedAt: null,
    verifiedByInstrument: null,
    verificationMethod: null,
    artifactPath: null,
    ...overrides,
  }
}

describe('auditProvenance', () => {
  it('classifies every row into exactly one provenance class', () => {
    const a = auditProvenance()
    expect(a.derivedCount + a.declaredUpstreamCount + a.declaredClientCount).toBe(a.rows.length)
    expect(a.declaredUpstreamCount).toBeGreaterThan(0)
    expect(a.rows.every((r) => r.basis.length > 0 && r.refreshedBy.length > 0)).toBe(true)
  })

  it('names hasWriter and atomFamilyState as hand-declared upstream, which is the boundary that bites', () => {
    const upstream = auditProvenance()
      .rows.filter((r) => r.provenance === 'declared-upstream')
      .map((r) => r.subject)
      .join(' ')
    expect(upstream).toContain('hasWriter')
    expect(upstream).toContain('atomFamilyState')
  })
})

describe('deadIndicators — proven able to fire and to stay quiet', () => {
  it('FIRES on the live shape: hasWriter and atomFamilyState constant across every cell', () => {
    const cells = Array.from({ length: 3556 }, () => cell())
    const dead = deadIndicators(cells)
    const names = dead.map((d) => d.indicator)
    expect(names).toContain('hasWriter')
    expect(names).toContain('atomFamilyState')
    const writer = dead.find((d) => d.indicator === 'hasWriter')!
    expect(writer.constantValue).toBe('true')
    expect(writer.cellsExamined).toBe(3556)
    expect(writer.consequence).toContain('NO WRITER')
  })

  it('STAYS QUIET when the indicator actually varies', () => {
    const cells = [
      cell({ hasWriter: true, atomFamilyState: 'present', isPartial: true }),
      cell({ hasWriter: false, atomFamilyState: 'missing', isPartial: false }),
    ]
    expect(deadIndicators(cells)).toEqual([])
  })

  it('examines nothing and claims nothing on an empty payload', () => {
    expect(deadIndicators([])).toEqual([])
  })
})

describe('absentDisplayStates', () => {
  it('names the legend entries a payload cannot produce', () => {
    const cells = [cell({ displayState: 'not-yet' }), cell({ displayState: 'satisfied-present' })]
    expect(absentDisplayStates(cells, ['satisfied-present', 'not-yet', 'no-atom', 'no-writer'])).toEqual([
      'no-atom',
      'no-writer',
    ])
  })

  it('returns nothing when every advertised state is present', () => {
    const cells = [cell({ displayState: 'no-atom' }), cell({ displayState: 'not-yet' })]
    expect(absentDisplayStates(cells, ['no-atom', 'not-yet'])).toEqual([])
  })
})

describe('manifestContradictions — proven able to fire and to stay quiet', () => {
  it('catches the live 48021 envelope cell: coverage clears threshold while the state says unacquired', () => {
    const cells = [
      cell({
        countyFips: '48021',
        railKey: 'envelope',
        displayState: 'not-yet',
        honestCoveragePct: 99.77,
        thresholdPct: 90,
      }),
    ]
    const found = manifestContradictions(cells)
    expect(found.length).toBe(1)
    expect(found[0].kind).toBe('coverage-clears-threshold-but-unacquired')
    expect(found[0].countyFips).toBe('48021')
    expect(found[0].railKey).toBe('envelope')
    expect(found[0].detail).toContain('99.77')
    expect(found[0].detail).toContain('90')
  })

  it('catches a cell counted satisfied below its own threshold', () => {
    const found = manifestContradictions([
      cell({
        railKey: 'zoning',
        displayState: 'satisfied-present',
        isPartial: false,
        honestCoveragePct: 33.9,
        thresholdPct: 95,
        verifiedByInstrument: 'x',
      }),
    ])
    expect(found.map((f) => f.kind)).toEqual(['satisfied-present-below-threshold'])
  })

  it('catches an established absence carrying no basis', () => {
    const found = manifestContradictions([
      cell({ railKey: 'mud', displayState: 'satisfied-absent', absenceBasis: null }),
    ])
    expect(found.map((f) => f.kind)).toEqual(['satisfied-absent-with-no-basis'])
  })

  it('catches a satisfied cell with no verifying instrument on record', () => {
    const found = manifestContradictions([
      cell({
        railKey: 'zoning',
        displayState: 'satisfied-present',
        honestCoveragePct: 99.77,
        thresholdPct: 95,
        verifiedByInstrument: null,
      }),
    ])
    expect(found.map((f) => f.kind)).toEqual(['satisfied-present-never-verified'])
  })

  it('STAYS QUIET on a clean payload', () => {
    const clean = [
      cell({
        railKey: 'geometry',
        displayState: 'satisfied-present',
        honestCoveragePct: 100,
        thresholdPct: 95,
        verifiedByInstrument: 'B2_cp2_geometry_scorer_apply.mjs',
      }),
      cell({ railKey: 'roads', displayState: 'not-yet', honestCoveragePct: null }),
      cell({
        railKey: 'mud',
        displayState: 'satisfied-absent',
        absenceBasis: 'no special district intersects this county',
      }),
    ]
    expect(manifestContradictions(clean)).toEqual([])
  })

  it('groups by kind with counts and bounded examples', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      cell({
        countyFips: `480${String(i).padStart(2, '0')}`,
        railKey: 'envelope',
        displayState: 'not-yet',
        honestCoveragePct: 99,
        thresholdPct: 90,
      }),
    )
    const grouped = groupContradictions(manifestContradictions(many))
    expect(grouped.length).toBe(1)
    expect(grouped[0].count).toBe(20)
    expect(grouped[0].examples.length).toBe(12)
  })
})

describe('railDenominators', () => {
  const caps: RailCapability[] = [
    {
      railKey: 'rrc-wells',
      maxCountiesReachable: 1,
      reachPct: 0.003937007874015748,
      sourceBasis: 'RRC public GIS Harris County mirror',
      limitation: 'Point layer mirrored from Harris endpoint; not per-county ingest',
    },
    {
      railKey: 'geometry',
      maxCountiesReachable: null,
      reachPct: null,
      sourceBasis: 'no capability probe defined for this rail',
    },
  ]

  it('carries the rail reachable ceiling alongside the grid denominator', () => {
    const cells = [
      cell({ railKey: 'rrc-wells', displayState: 'not-yet' }),
      cell({ railKey: 'geometry', displayState: 'satisfied-present', honestCoveragePct: 100 }),
    ]
    const d = railDenominators(cells, caps, ['rrc-wells', 'geometry'], 254)
    const wells = d.find((x) => x.railKey === 'rrc-wells')!
    expect(wells.satisfied).toBe(0)
    expect(wells.countiesInPayload).toBe(254)
    // 0 of 254 and 0 of 1 are different findings; the console must be able to say which.
    expect(wells.maxCountiesReachable).toBe(1)
    expect(wells.limitation).toContain('Harris')
  })

  it('reports a null ceiling rather than defaulting to the county count', () => {
    const d = railDenominators([cell({ railKey: 'geometry' })], caps, ['geometry'], 254)
    expect(d[0].maxCountiesReachable).toBeNull()
    expect(d[0].sourceBasis).toBe('no capability probe defined for this rail')
  })

  it('reports a null basis when the deployment serves no capabilities at all', () => {
    const d = railDenominators([cell({ railKey: 'geometry' })], undefined, ['geometry'], 254)
    expect(d[0].maxCountiesReachable).toBeNull()
    expect(d[0].sourceBasis).toBeNull()
  })
})

describe('materialization and re-read verdict', () => {
  it('prefers the served materializationAgeMs and falls back to computedAt vs servedAt', () => {
    const withAge = materializationState({
      counties: [],
      summary: {
        onboardedCount: 0,
        totalCounties: 0,
        staleCount: 0,
        rewarmUnsafeCount: 0,
        computedAt: '2026-08-14T17:41:22.500Z',
        servedAt: '2026-08-18T22:54:58.818Z',
        materializationAgeMs: 364416318,
      },
    })
    expect(withAge.ageMs).toBe(364416318)
    expect(withAge.ageHuman).toBe('4d 5h 13m')

    const derived = materializationState({
      counties: [],
      summary: {
        onboardedCount: 0,
        totalCounties: 0,
        staleCount: 0,
        rewarmUnsafeCount: 0,
        computedAt: '2026-08-18T00:00:00.000Z',
        servedAt: '2026-08-18T02:30:00.000Z',
      },
    })
    expect(derived.ageMs).toBe(9_000_000)
    expect(derived.ageHuman).toBe('2h 30m')
  })

  it('says unknown rather than zero when nothing is served', () => {
    expect(materializationState(null).ageHuman).toBe('unknown')
    expect(humanAge(null)).toBe('unknown')
    expect(humanAge(90_000)).toBe('1m')
  })

  it('a re-read that does not move computedAt is reported as upstream staleness, not a refresh', () => {
    const same = reReadVerdict('2026-08-14T17:41:22.500Z', '2026-08-14T17:41:22.500Z')
    expect(same).toBe('materialization-unchanged')
    expect(RE_READ_VERDICT_COPY[same]).toContain('did NOT move')
    expect(RE_READ_VERDICT_COPY[same]).toContain('cannot recompute')
  })

  it('reports a moved materialization and a first read distinctly', () => {
    expect(reReadVerdict('2026-08-14T17:41:22.500Z', '2026-08-18T09:00:00.000Z')).toBe(
      'materialization-moved',
    )
    expect(reReadVerdict(null, '2026-08-18T09:00:00.000Z')).toBe('first-read')
  })
})
