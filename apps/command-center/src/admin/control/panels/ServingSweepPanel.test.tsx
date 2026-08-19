// ServingSweepPanel.test.tsx — the disagreement stays visible, unresolved stays its own
// class, absences open to their parcels, and a loaded artifact can never read as live.
//
// The headline case below is the one the operator ruling names: a rail reading satisfied
// at 100% next to a serving sweep reading that a large share of parcels serve no
// setback. The test asserts BOTH numbers survive to the screen and that the gap is shown
// as a gap — an averaged 56% would pass a naive render test and destroy the finding.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { ServingSweepPanel, buildReconciliation, openParcelInTrace } from './ServingSweepPanel'
import { loadSweepArtifact, ORIGIN_COPY, type SweepSourceState } from './servingSweepSource'
import { FIELD_KEYS, type CountyServingSweep, type FieldKey, type FieldTally, type StatewideServingSweep } from './servingSweepTypes'
import type { ManifestCell } from './countyManifestTypes'

function tally(p: number, ac: number, au: number, u: number): FieldTally {
  return { present: p, absentCovered: ac, absentUncovered: au, unresolved: u }
}

function allFields(t: FieldTally, overrides: Partial<Record<FieldKey, FieldTally>> = {}) {
  const out = {} as Record<FieldKey, FieldTally>
  for (const k of FIELD_KEYS) out[k] = { ...t }
  return { ...out, ...overrides }
}

function mkCounty(overrides: Partial<CountyServingSweep> = {}): CountyServingSweep {
  return {
    countyFips: '48021',
    countyName: 'Bastrop',
    sweptAt: '2026-08-18T12:00:00.000Z',
    resolverVersion: 'fact-sheet-1.0.0',
    parcelsTotal: 1000,
    parcelsUnresolvable: 0,
    fields: allFields(tally(900, 50, 40, 10)),
    singleFamily: { parcelsTotal: 600, fields: allFields(tally(500, 50, 40, 10)) },
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

function mkCell(countyFips: string, railKey: string, overrides: Partial<ManifestCell> = {}): ManifestCell {
  return {
    countyFips,
    railKey,
    displayState: 'satisfied-present',
    isPartial: false,
    honestCoveragePct: 100,
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

const LIVE_RAILS = [
  'geometry',
  'cad',
  'zoning',
  'roads',
  'flood',
  'envelope',
  'landuse',
  'footprint',
  'easement',
  'owner',
  'rrc-wells',
  'rrc-pipelines',
  'rail-corridor',
  'mud',
]

function liveSource(sweep: StatewideServingSweep): SweepSourceState {
  return {
    origin: 'live-endpoint',
    sweep,
    problems: [],
    locator: '/api/spine/cortex/api/serving-sweep',
    httpStatus: 200,
    notServedReason: null,
  }
}

const noop = () => {}

describe('buildReconciliation — the disagreement is preserved, never averaged', () => {
  it('puts a 100% rail beside a 12% served reading and reports the gap in points', () => {
    // Zoning rail reads satisfied at 100%; the sweep serves setbacks on 120 of 1000.
    const county = mkCounty({
      fields: allFields(tally(900, 50, 40, 10), { setbacks: tally(120, 500, 300, 80) }),
    })
    const cells = [mkCell('48021', 'zoning', { honestCoveragePct: 100 })]
    const rows = buildReconciliation(mkSweep([county]), cells)

    const setbackRow = rows.find((r) => r.field === 'setbacks')!
    expect(setbackRow.railPct).toBe(100)
    expect(setbackRow.served.pct).toBeCloseTo(12)
    expect(setbackRow.served.denominator).toBe(1000)
    expect(setbackRow.gapPoints).toBeCloseTo(88)
    // The worst gap sorts first, so the finding is the top row rather than buried.
    expect(rows[0].field).toBe('setbacks')
    // No averaged figure exists anywhere on the row.
    expect(Object.values(setbackRow)).not.toContain(56)
  })

  it('renders a missing manifest cell as no counterpart, never as zero', () => {
    const rows = buildReconciliation(mkSweep([mkCounty()]), [])
    expect(rows.every((r) => r.railState === null)).toBe(true)
    expect(rows.every((r) => r.railPct === null)).toBe(true)
    expect(rows.every((r) => r.gapPoints === null)).toBe(true)
    // A missing counterpart must not manufacture a 100-point gap.
    expect(rows.some((r) => r.gapPoints === 100)).toBe(false)
  })

  it('produces one row per paired field, with cad and zoning each contributing two', () => {
    const rows = buildReconciliation(mkSweep([mkCounty()]), [])
    expect(rows.length).toBe(9)
    expect(rows.filter((r) => r.railKey === 'cad').map((r) => r.field).sort()).toEqual([
      'apn',
      'situsAddress',
    ])
    expect(rows.filter((r) => r.railKey === 'zoning').map((r) => r.field).sort()).toEqual([
      'setbacks',
      'zoning',
    ])
  })
})

describe('ServingSweepPanel', () => {
  beforeEach(() => {
    window.location.hash = ''
  })

  it('shows a NAMED not-served state carrying the probed URL and status, not an empty panel', () => {
    render(
      <ServingSweepPanel
        cells={[]}
        railKeys={LIVE_RAILS}
        source={{
          origin: 'live-endpoint',
          sweep: null,
          problems: [],
          locator: '/api/spine/cortex/api/serving-sweep',
          httpStatus: 200,
          notServedReason: 'proxy returned HTML (spine rewrite missing /api/spine → serverless)',
        }}
        probing={false}
        onProbe={noop}
        onLoadArtifact={noop}
      />,
    )
    const banner = screen.getByTestId('sweep-not-served')
    expect(banner.textContent).toContain('/api/spine/cortex/api/serving-sweep')
    expect(banner.textContent).toContain('HTTP 200')
    expect(banner.textContent).toContain('proxy returned HTML')
    expect(screen.getByTestId('sweep-locator').textContent).toContain('HTTP 200')
  })

  it('labels a loaded artifact as an ARTIFACT and never as live', () => {
    const artifact = loadSweepArtifact(JSON.stringify(mkSweep([mkCounty()])), '2026-08-18_statewide_sweep.json')
    render(
      <ServingSweepPanel
        cells={[]}
        railKeys={LIVE_RAILS}
        source={artifact}
        probing={false}
        onProbe={noop}
        onLoadArtifact={noop}
      />,
    )
    expect(screen.getByText(ORIGIN_COPY['loaded-artifact'])).toBeInTheDocument()
    expect(screen.getByTestId('sweep-locator').textContent).toContain('2026-08-18_statewide_sweep.json')
    expect(screen.queryByText(ORIGIN_COPY['live-endpoint'])).toBeNull()
  })

  it('shows unresolved as its own outage figure, distinct from the absence figure', () => {
    const county = mkCounty({ fields: allFields(tally(900, 50, 40, 10)) })
    render(
      <ServingSweepPanel
        cells={[]}
        railKeys={LIVE_RAILS}
        source={liveSource(mkSweep([county]))}
        probing={false}
        onProbe={noop}
        onLoadArtifact={noop}
      />,
    )
    const statewide = screen.getByTestId('sweep-statewide-all')
    const geometryRow = within(statewide).getByTestId('sweep-tally-geometry')
    // absence is 90 of 1000 = 9.0%, NOT 100 of 1000 = 10.0% — unresolved is excluded.
    expect(within(geometryRow).getByTestId('sweep-open-absence-geometry').textContent).toContain('9.0% absent')
    const outage = within(geometryRow).getByTestId('sweep-unresolved-geometry')
    expect(outage.textContent).toContain('10')
    expect(outage.textContent).toContain('OUTAGE')
  })

  it('carries the denominator next to every served rate', () => {
    render(
      <ServingSweepPanel
        cells={[]}
        railKeys={LIVE_RAILS}
        source={liveSource(mkSweep([mkCounty()]))}
        probing={false}
        onProbe={noop}
        onLoadArtifact={noop}
      />,
    )
    const statewide = screen.getByTestId('sweep-statewide-all')
    const row = within(statewide).getByTestId('sweep-tally-geometry')
    expect(within(row).getByTestId('sweep-served-pct-geometry').textContent).toBe('90.0%')
    expect(row.textContent).toContain('900/1,000')
  })

  it('reports the shortfall when the measured tally does not account for every claimed parcel', () => {
    const county = mkCounty({ parcelsTotal: 2000, fields: allFields(tally(900, 50, 40, 10)) })
    render(
      <ServingSweepPanel
        cells={[]}
        railKeys={LIVE_RAILS}
        source={liveSource(mkSweep([county]))}
        probing={false}
        onProbe={noop}
        onLoadArtifact={noop}
      />,
    )
    const row = within(screen.getByTestId('sweep-statewide-all')).getByTestId('sweep-tally-geometry')
    expect(row.textContent).toContain('1,000 measured vs 2,000 claimed')
    expect(row.textContent).toContain('1,000 unaccounted')
  })

  it('opens the parcels behind an absence, and the ids lock on the shared node bus', () => {
    const county = mkCounty({
      fields: allFields(tally(900, 50, 40, 10), { situsAddress: tally(100, 400, 480, 20) }),
      contradictions: [
        {
          kind: 'address-absent-but-on-cad-roll',
          count: 480,
          exampleParcelNodeIds: ['48021:36521', '48021:36522'],
        },
      ],
    })
    render(
      <ServingSweepPanel
        cells={[]}
        railKeys={LIVE_RAILS}
        source={liveSource(mkSweep([county]))}
        probing={false}
        onProbe={noop}
        onLoadArtifact={noop}
      />,
    )
    const countyBlock = screen.getByTestId('sweep-county-48021')
    const allTable = within(countyBlock).getByTestId('sweep-tallies-all-48021')
    fireEvent.click(within(allTable).getByTestId('sweep-open-absence-situsAddress'))

    // Scoped to the opened absence card: the same ids also render in the county and
    // statewide contradiction sections, which is intended — one id, three routes in.
    const absenceCard = screen.getByTestId('sweep-absence-ids-address-absent-but-on-cad-roll')
    const idButton = within(absenceCard).getByTestId('sweep-open-parcel-48021:36521')
    expect(idButton).toBeInTheDocument()
    expect(document.querySelectorAll('[data-testid="sweep-open-parcel-48021:36521"]').length).toBe(3)
    fireEvent.click(idButton)
    expect(window.location.hash).toBe('#panel=parcel-trace&node=48021%3A36521')
  })

  it('lists rails with no served counterpart rather than dropping them', () => {
    render(
      <ServingSweepPanel
        cells={[]}
        railKeys={LIVE_RAILS}
        source={liveSource(mkSweep([mkCounty()]))}
        probing={false}
        onProbe={noop}
        onLoadArtifact={noop}
      />,
    )
    const note = screen.getByTestId('sweep-pairing-note')
    expect(note.textContent).toContain('7 of 14 rails pair')
    expect(note.textContent).toContain('rrc-wells')
    expect(note.textContent).toContain('0 are unclassified')
  })

  it('flags a rail the pairing map has never been told about', () => {
    render(
      <ServingSweepPanel
        cells={[]}
        railKeys={[...LIVE_RAILS, 'a-brand-new-rail']}
        source={liveSource(mkSweep([mkCounty()]))}
        probing={false}
        onProbe={noop}
        onLoadArtifact={noop}
      />,
    )
    const note = screen.getByTestId('sweep-pairing-note')
    expect(note.textContent).toContain('1 are unclassified')
    expect(note.textContent).toContain('UNCLASSIFIED')
  })

  it('renders the reconciliation with both readings and the gap, side by side', () => {
    const county = mkCounty({
      fields: allFields(tally(900, 50, 40, 10), { setbacks: tally(120, 500, 300, 80) }),
    })
    render(
      <ServingSweepPanel
        cells={[mkCell('48021', 'zoning', { honestCoveragePct: 100 })]}
        railKeys={LIVE_RAILS}
        source={liveSource(mkSweep([county]))}
        probing={false}
        onProbe={noop}
        onLoadArtifact={noop}
      />,
    )
    const row = screen.getByTestId('recon-row-48021-setbacks')
    expect(row.textContent).toContain('100.0%')
    expect(row.textContent).toContain('12.0%')
    expect(screen.getByTestId('recon-gap-48021-setbacks').textContent).toBe('+88.0 pt')
  })

  it('lists payload problems instead of rejecting a partially-valid sweep whole', () => {
    const broken = JSON.parse(JSON.stringify(mkSweep([mkCounty()]))) as Record<string, unknown>
    delete ((broken.counties as Array<Record<string, unknown>>)[0].fields as Record<string, unknown>).zoning
    const source = loadSweepArtifact(JSON.stringify(broken), 'broken.json')
    render(
      <ServingSweepPanel
        cells={[]}
        railKeys={LIVE_RAILS}
        source={source}
        probing={false}
        onProbe={noop}
        onLoadArtifact={noop}
      />,
    )
    expect(screen.getByTestId('sweep-parse-problems').textContent).toContain('counties[0].fields.zoning')
    // Still renders what parsed.
    expect(screen.getByTestId('sweep-statewide-all')).toBeInTheDocument()
  })
})

describe('openParcelInTrace', () => {
  beforeEach(() => {
    window.location.hash = ''
  })

  it('refuses a non-canonical parcel node id rather than navigating somewhere wrong', () => {
    expect(openParcelInTrace('not a parcel')).toBe(false)
    expect(openParcelInTrace('48021:road:12')).toBe(false)
    expect(window.location.hash).toBe('')
  })

  it('locks a canonical id on the shared bus', () => {
    expect(openParcelInTrace('48021:36521')).toBe(true)
    expect(window.location.hash).toBe('#panel=parcel-trace&node=48021%3A36521')
  })
})

describe('loadSweepArtifact', () => {
  it('names invalid JSON as such rather than showing an empty sweep', () => {
    const s = loadSweepArtifact('{not json', 'x.json')
    expect(s.sweep).toBeNull()
    expect(s.origin).toBe('loaded-artifact')
    expect(s.notServedReason).toContain('not valid JSON')
  })

  it('names a well-formed JSON file that is not a sweep', () => {
    const s = loadSweepArtifact('{"hello":"world"}', 'x.json')
    expect(s.sweep).toBeNull()
    expect(s.notServedReason).toContain('not a StatewideServingSweep')
  })

  it('carries the filename so the panel can say which file it is reading', () => {
    const s = loadSweepArtifact(JSON.stringify(mkSweep([mkCounty()])), '2026-08-18_sweep.json')
    expect(s.locator).toBe('2026-08-18_sweep.json')
    expect(s.origin).toBe('loaded-artifact')
    expect(s.sweep?.counties.length).toBe(1)
  })
})

describe('fetchServingSweep', () => {
  it('returns a named not-served reason when no cortex base is configured', async () => {
    vi.resetModules()
    vi.doMock('../../api/spineClient', () => ({
      apiBase: () => '',
      getJson: vi.fn(),
      loadConfig: vi.fn(),
      DEFAULT_SPINE_TIMEOUT_MS: 25_000,
    }))
    const mod = await import('./servingSweepSource')
    const state = await mod.fetchServingSweep({} as never)
    expect(state.sweep).toBeNull()
    expect(state.notServedReason).toContain('no cortex-api base')
    vi.doUnmock('../../api/spineClient')
    vi.resetModules()
  })
})
