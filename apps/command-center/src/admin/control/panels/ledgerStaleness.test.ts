// ledgerStaleness.test.ts — every staleness check is proven able to FIRE and to STAY
// QUIET, and each one is pinned on what it PROVES rather than on its wording.
//
// The incident: a ledger materialized 2026-08-14 was read as world-truth on 2026-08-18
// and reported footprints as not ingested, when the work had landed 2026-08-17. The
// checks below are the three ways a console can catch that, ordered by how much each
// actually proves.

import { describe, it, expect } from 'vitest'
import type { ManifestCell } from './countyManifestTypes'
import {
  DECLARED_WORK,
  LEDGER_AGE_DANGER_MS,
  ageAlarm,
  evidenceHorizon,
  evidenceHorizonAlarm,
  humanDuration,
  internalObservations,
  normalizeStamp,
  stalenessAlarms,
  workHorizonAlarm,
  workHorizonFindings,
  type Observation,
} from './ledgerStaleness'

const COMPUTED_AT = '2026-08-14T17:41:22.500Z'

function mkCell(railKey: string, o: Partial<ManifestCell> = {}): ManifestCell {
  return {
    countyFips: '48021',
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

describe('check 1 — age', () => {
  it('FIRES at danger on the live 4-day-old snapshot and names the consequence', () => {
    const a = ageAlarm(COMPUTED_AT, '2026-08-19T13:53:28.783Z', 3556)
    expect(a.severity).toBe('danger')
    expect(a.provenance).toBe('derived')
    expect(a.headline).toContain('4d 20h 12m')
    expect(a.headline).toContain('3,556 cell states')
    expect(a.headline).toContain(COMPUTED_AT)
    // It must not over-claim: age alone says nothing about whether the world moved.
    expect(a.proves).toMatch(/only that the snapshot is old/)
  })

  it('STAYS QUIET on a fresh snapshot, and still says it is a snapshot', () => {
    const now = new Date()
    const a = ageAlarm(new Date(now.getTime() - 1000).toISOString(), now.toISOString(), 10)
    expect(a.severity).toBe('ok')
    expect(a.proves).toMatch(/it is still a snapshot/)
  })

  it('fails CLOSED when the ledger serves no computedAt', () => {
    const a = ageAlarm(null, new Date().toISOString(), 10)
    expect(a.severity).toBe('danger')
    expect(a.headline).toMatch(/no computedAt/)
  })

  it('humanDuration carries days, hours and minutes rather than a bare number', () => {
    expect(humanDuration(418326283)).toBe('4d 20h 12m')
    expect(humanDuration(null)).toBe('unknown')
  })

  it('the danger threshold is a day, so a working day of staleness is loud', () => {
    expect(LEDGER_AGE_DANGER_MS).toBe(24 * 60 * 60 * 1000)
  })
})

describe('check 2 — evidence horizon', () => {
  const ahead: Observation = {
    instrument: 'serving sweep',
    observedAt: '2026-08-18T09:00:00.000Z',
    saw: '254 counties swept',
  }
  const behind: Observation = {
    instrument: 'node-graph tally',
    observedAt: '2026-08-04T13:02:36.327Z',
    saw: '10 counties of store contents',
  }
  const undated: Observation = { instrument: 'mystery', observedAt: null, saw: 'something' }

  it('partitions observations into ahead, behind and undated — none discarded', () => {
    const h = evidenceHorizon(COMPUTED_AT, [ahead, behind, undated])
    expect(h.ahead).toEqual([ahead])
    expect(h.behind).toEqual([behind])
    expect(h.undated).toEqual([undated])
    expect(h.ahead.length + h.behind.length + h.undated.length).toBe(3)
  })

  it('FIRES when an observation postdates computedAt, and states exactly what that proves', () => {
    const a = evidenceHorizonAlarm(COMPUTED_AT, [ahead, behind])!
    expect(a).toBeTruthy()
    expect(a.severity).toBe('danger')
    expect(a.provenance).toBe('derived')
    expect(a.headline).toContain('1 of 2 observations')
    expect(a.proves).toContain('serving sweep observed 254 counties swept at 2026-08-18T09:00:00.000Z')
    // The claim is bounded: it proves the ledger is behind, not that a given cell is wrong.
    expect(a.proves).toMatch(/does not prove any particular cell is wrong/)
  })

  it('STAYS QUIET when every observation predates the snapshot — the live case today', () => {
    expect(evidenceHorizonAlarm(COMPUTED_AT, [behind])).toBeNull()
  })

  it('reads the ledger own newest lastVerifiedAt as an observation, normalizing the Postgres stamp', () => {
    const obs = internalObservations([
      mkCell('geometry', { lastVerifiedAt: '2026-08-12 18:40:18.206435+00' }),
      mkCell('cad', { lastVerifiedAt: '2026-08-14 06:36:42.306217+00' }),
      mkCell('flood'),
    ])
    expect(obs.length).toBe(1)
    expect(obs[0].observedAt).toBe('2026-08-14T06:36:42.306217Z')
    expect(obs[0].saw).toContain('2 carrying one')
  })

  it('normalizeStamp leaves an ISO string alone and converts a Postgres one', () => {
    expect(normalizeStamp('2026-08-14T17:41:22.500Z')).toBe('2026-08-14T17:41:22.500Z')
    expect(normalizeStamp('2026-08-14 06:36:42.306217+00')).toBe('2026-08-14T06:36:42.306217Z')
  })
})

describe('check 3 — declared work horizon', () => {
  const footprintCells = Array.from({ length: 254 }, (_, i) => ({
    ...mkCell('footprint'),
    countyFips: String(48000 + i).padStart(5, '0'),
  }))

  it('FIRES on the worked example: the ledger predates the footprint work it reports on', () => {
    const a = workHorizonAlarm(footprintCells, COMPUTED_AT)!
    expect(a).toBeTruthy()
    expect(a.severity).toBe('danger')
    // It is DECLARED, and it says so — this one rots and must never pass for measured.
    expect(a.provenance).toBe('declared')
    expect(a.proves).toContain('254 of 254 cells')
    expect(a.proves).toMatch(/cannot have seen that work/)
    expect(a.basis).toContain('_inbox/2026-08-17_l26_backfill_and_gtm_stand.md')
  })

  it('STAYS QUIET once the snapshot postdates the declared work', () => {
    expect(workHorizonAlarm(footprintCells, '2026-08-18T00:00:00.000Z')).toBeNull()
  })

  it('STAYS QUIET when the rail is no longer reported unacquired', () => {
    const satisfied = footprintCells.map((c) => ({ ...c, displayState: 'satisfied-present' as const }))
    expect(workHorizonAlarm(satisfied, COMPUTED_AT)).toBeNull()
  })

  it('reports the finding with its denominator, not as a bare count', () => {
    const findings = workHorizonFindings(footprintCells.slice(0, 10), COMPUTED_AT)
    expect(findings.length).toBe(1)
    expect(findings[0].notYetCells).toBe(10)
    expect(findings[0].railCells).toBe(10)
  })

  it('declares only what its source supports — the contested wells claim is NOT declared', () => {
    expect(DECLARED_WORK.map((w) => w.railKey)).toEqual(['footprint'])
    expect(DECLARED_WORK.every((w) => w.artifact.startsWith('_inbox/'))).toBe(true)
    expect(DECLARED_WORK.every((w) => Boolean(w.declaredAt))).toBe(true)
  })
})

describe('the alarm set', () => {
  it('raises all three on the live shape and reports the worst', () => {
    const cells = [mkCell('footprint'), mkCell('geometry', { lastVerifiedAt: '2026-08-14 06:36:42.306217+00' })]
    const set = stalenessAlarms({
      computedAt: COMPUTED_AT,
      nowIso: '2026-08-19T13:53:28.783Z',
      cells,
      observations: [
        { instrument: 'serving sweep', observedAt: '2026-08-18T09:00:00.000Z', saw: 'a sweep' },
      ],
    })
    expect(set.worst).toBe('danger')
    expect(set.alarms.map((a) => a.id).sort()).toEqual(['age', 'evidence-horizon', 'work-horizon'])
  })

  it('raises only the age check, at ok, when nothing else can fire', () => {
    const now = new Date()
    const set = stalenessAlarms({
      computedAt: new Date(now.getTime() - 1000).toISOString(),
      nowIso: now.toISOString(),
      cells: [mkCell('geometry')],
      observations: [],
    })
    expect(set.worst).toBe('ok')
    expect(set.alarms.map((a) => a.id)).toEqual(['age'])
  })

  it('every alarm carries a basis and a proves clause — no bare severity anywhere', () => {
    const set = stalenessAlarms({
      computedAt: COMPUTED_AT,
      nowIso: '2026-08-19T13:53:28.783Z',
      cells: [mkCell('footprint')],
      observations: [],
    })
    for (const a of set.alarms) {
      expect(a.basis.length).toBeGreaterThan(10)
      expect(a.proves.length).toBeGreaterThan(10)
      expect(['derived', 'declared']).toContain(a.provenance)
    }
  })
})
