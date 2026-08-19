// ThreeLayerPanel.test.tsx — the three layers render side by side, and the things the
// panel must never do are asserted by value.
//
// The worked example throughout is the one verified at source on 2026-08-19: Travis
// County carrying 233,249 zoning-fact atoms in the store (observed 2026-08-04) while
// the ledger (computed 2026-08-14) scores the zoning rail not-yet at 0.00%.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { ThreeLayerPanel } from './ThreeLayerPanel'
import type { ManifestCell } from './countyManifestTypes'
import type { WrittenSourceState } from './writtenLayerSource'
import type { SweepSourceState } from './servingSweepSource'
import { FIELD_KEYS, type CountyServingSweep, type StatewideServingSweep } from './servingSweepTypes'

const COMPUTED_AT = '2026-08-14T17:41:22.500Z'
const OBSERVED_AT = '2026-08-04T13:02:36.327Z'
const SWEPT_AT = '2026-08-18T00:00:00.000Z'

const RAILS = ['geometry', 'zoning', 'envelope', 'footprint']

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

const CELLS: ManifestCell[] = [
  mkCell('48453', 'zoning', { displayState: 'not-yet', honestCoveragePct: 0 }),
  mkCell('48453', 'geometry', { displayState: 'satisfied-present', honestCoveragePct: 100 }),
  mkCell('48453', 'envelope', { displayState: 'not-yet', honestCoveragePct: 0 }),
  mkCell('48453', 'footprint', { displayState: 'not-yet' }),
  mkCell('48001', 'zoning', { displayState: 'not-yet' }),
  mkCell('48001', 'geometry', { displayState: 'not-yet' }),
  mkCell('48001', 'envelope', { displayState: 'not-yet' }),
  mkCell('48001', 'footprint', { displayState: 'not-yet' }),
]

const WRITTEN: WrittenSourceState = {
  origin: 'live-endpoint',
  tally: {
    generatedAt: OBSERVED_AT,
    centralTx: {
      counties: [
        {
          fips: '48453',
          county: 'Travis',
          nodes: 380920,
          zoning_present: 233249,
          zoning_honest_absent_or_empty: 0,
          zoning_slot_missing: 0,
          setback_present: 172713,
          envelope_present: 172713,
          full_chain_nodes: 172713,
          references: 0,
          depth_warm_promoted: 0,
          zoning_place_type: 0,
          depth_ratio_place_type: 0,
          zoning_present_pct: 61.2,
        },
      ],
    },
  },
  coverage: {
    observedAt: OBSERVED_AT,
    instrument: 'retrieval-api node-graph tally',
    countyFips: ['48453'],
    roadCountyFips: [],
    railKeys: ['geometry', 'zoning', 'envelope', 'roads'],
  },
  locator: '/api/spine/retrieval/stats/central-tx-node-graph',
  httpStatus: 200,
  notServedReason: null,
  readAt: '2026-08-19T14:00:00.000Z',
}

function mkSweep(present: number, parcels: number, fipsList: string[] = ['48453']): StatewideServingSweep {
  const fields = {} as CountyServingSweep['fields']
  for (const k of FIELD_KEYS) {
    fields[k] = { present, absentCovered: parcels - present, absentUncovered: 0, unresolved: 0 }
  }
  return {
    sweptAt: SWEPT_AT,
    resolverVersion: 'v1',
    countiesTotal: 254,
    countiesSwept: fipsList.length,
    parcelsTotal: parcels * fipsList.length,
    counties: fipsList.map((countyFips) => ({
      countyFips,
      countyName: countyFips === '48453' ? 'Travis' : 'Anderson',
      sweptAt: SWEPT_AT,
      resolverVersion: 'v1',
      parcelsTotal: parcels,
      parcelsUnresolvable: 0,
      fields,
      singleFamily: { parcelsTotal: parcels, fields },
      contradictions: [],
      multiZoneFloodParcels: 0,
      absenceClusters: [],
      sourcesByField: {},
    })),
  }
}

function renderPanel(over: Partial<React.ComponentProps<typeof ThreeLayerPanel>> = {}) {
  const props: React.ComponentProps<typeof ThreeLayerPanel> = {
    cells: CELLS,
    railKeys: RAILS,
    counties: [
      { countyFips: '48453', countyName: 'Travis' },
      { countyFips: '48001', countyName: null },
    ],
    computedAt: COMPUTED_AT,
    written: WRITTEN,
    writtenProbing: false,
    onProbeWritten: vi.fn(),
    sweep: null,
    sweepProbing: false,
    onProbeSweep: vi.fn(),
    onLoadSweepArtifact: vi.fn(),
    ...over,
  }
  return { ...render(<ThreeLayerPanel {...props} />), props }
}

describe('ThreeLayerPanel', () => {
  it('renders three layer cards, each with its OWN origin and its OWN timestamp', () => {
    renderPanel()
    expect(screen.getByTestId('layer-card-written')).toHaveTextContent(OBSERVED_AT)
    expect(screen.getByTestId('layer-card-scored')).toHaveTextContent(COMPUTED_AT)
    // No sweep read yet — the served card says so rather than showing a time.
    expect(screen.getByTestId('layer-card-served')).toHaveTextContent('not probed yet')
    // Three different instants on screen at once: no layer is "now".
    expect(screen.getByTestId('layer-card-written')).not.toHaveTextContent(COMPUTED_AT)
  })

  it('puts the written count and the scored percentage in ADJACENT columns for the same cell', () => {
    renderPanel()
    const row = screen.getByTestId('three-layer-row-48453-zoning')
    expect(within(row).getByTestId('written-48453-zoning')).toHaveTextContent('233,249 zoning-fact atoms')
    expect(within(row).getByTestId('scored-48453-zoning')).toHaveTextContent('0.00%')
    expect(within(row).getByTestId('served-48453-zoning')).toHaveTextContent('no sweep read')
  })

  it('never renders a combined score, and never differences a count against a percentage', () => {
    const { container } = renderPanel()
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/combined score|blended score|overall score|composite score/i)
    // 233,249 minus 0.00 is the meaningless number; it must never appear as a gap.
    expect(text).not.toMatch(/233,?249 (points|pt)/)
    expect(text).toContain('never averaged')
  })

  it('shows a NOT MEASURED reason instead of a zero for every layer that did not measure', () => {
    // 48001 is swept but is NOT in the written instrument's coverage set — the exact
    // shape where an instrument's exclusion set could be mistaken for an empty store.
    const sweep: SweepSourceState = {
      origin: 'loaded-artifact',
      sweep: mkSweep(10, 100, ['48453', '48001']),
      problems: [],
      locator: 'sweep.json',
      httpStatus: null,
      notServedReason: null,
    }
    renderPanel({ sweep })
    // Show every joined row, not only the disagreeing ones: a non-measurement is not a
    // divergence, and it still has to render as a named absence rather than a zero.
    fireEvent.click(screen.getByTestId('three-layer-only-divergent'))
    const outside = screen.getByTestId('three-layer-row-48001-zoning')
    expect(within(outside).getByTestId('written-48001-zoning')).toHaveTextContent(
      'county outside instrument coverage',
    )
    expect(within(outside).getByTestId('written-48001-zoning')).not.toHaveTextContent('0')
    // A rail the instrument has no signal for at all.
    const noSignal = screen.getByTestId('three-layer-row-48453-footprint')
    expect(within(noSignal).getByTestId('written-48453-footprint')).toHaveTextContent(
      'rail has no written signal',
    )
  })

  it('surfaces the written-present / scored-absent divergence with both timestamps', () => {
    renderPanel()
    const row = screen.getByTestId('three-layer-row-48453-zoning')
    expect(row).toHaveTextContent('written into the store, scored as not acquired')
    expect(row).toHaveTextContent(OBSERVED_AT)
    expect(row).toHaveTextContent(COMPUTED_AT)
  })

  it('tallies every divergence class against the same denominator, including the zeros', () => {
    renderPanel()
    const strip = screen.getByTestId('three-layer-divergences')
    // Only the instrumented county is joined: 1 county x 4 rails.
    expect(screen.getByTestId('divergence-written-present-scored-absent')).toHaveTextContent('2 of 4')
    expect(screen.getByTestId('divergence-scored-satisfied-served-zero')).toHaveTextContent('0 of 4')
    expect(strip).toHaveTextContent('a zero here is a measured zero')
  })

  it('names the rails the written instrument cannot speak for at all', () => {
    renderPanel()
    expect(screen.getByTestId('three-layer-divergences')).toHaveTextContent(
      '1 of 4 rails have no written signal at all',
    )
    expect(screen.getByTestId('three-layer-divergences')).toHaveTextContent('footprint')
  })

  it('labels a loaded artifact as an ARTIFACT and never as live', () => {
    const sweep: SweepSourceState = {
      origin: 'loaded-artifact',
      sweep: mkSweep(0, 400_000),
      problems: [],
      locator: 'statewide-sweep-2026-08-18.json',
      httpStatus: null,
      notServedReason: null,
    }
    renderPanel({ sweep })
    const card = screen.getByTestId('layer-card-served')
    expect(card).toHaveTextContent('ARTIFACT')
    expect(card).toHaveTextContent('statewide-sweep-2026-08-18.json')
    expect(card.textContent).not.toMatch(/LIVE/)
  })

  it('shows the scored-satisfied / served-zero divergence when a sweep is present', () => {
    const sweep: SweepSourceState = {
      origin: 'loaded-artifact',
      sweep: mkSweep(0, 400_000),
      problems: [],
      locator: 'sweep.json',
      httpStatus: null,
      notServedReason: null,
    }
    renderPanel({ sweep })
    const row = screen.getByTestId('three-layer-row-48453-geometry')
    expect(row).toHaveTextContent('scored satisfied, served to nobody')
    expect(row).toHaveTextContent('0 of 400,000 parcels')
  })

  it('reports the written layer NOT SERVED with its reason rather than an empty table', () => {
    const written: WrittenSourceState = {
      ...WRITTEN,
      tally: null,
      coverage: { observedAt: null, instrument: 'x', countyFips: [], roadCountyFips: [], railKeys: [] },
      httpStatus: 0,
      notServedReason: 'timed out after 120000ms',
    }
    renderPanel({ written })
    expect(screen.getByTestId('layer-card-written')).toHaveTextContent('NOT SERVED')
    expect(screen.getByTestId('layer-card-written')).toHaveTextContent('timed out after 120000ms')
    // With no instrument covering any county, the join is honestly empty and says why.
    expect(screen.queryByTestId('three-layer-table')).toBeNull()
    expect(screen.getByText(/an unread instrument is an unmeasured layer, not an empty one/)).toBeInTheDocument()
  })

  it('reports how much of the join each layer actually measured', () => {
    renderPanel()
    expect(screen.getByTestId('layer-measured-written')).toHaveTextContent('measured 3 of 4 rows')
    expect(screen.getByTestId('layer-measured-scored')).toHaveTextContent('measured 4 of 4 rows')
    expect(screen.getByTestId('layer-measured-served')).toHaveTextContent('measured 0 of 4 rows')
  })

  it('the probe controls are wired and do not auto-fire from a render', () => {
    const { props } = renderPanel()
    expect(props.onProbeWritten).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /read the store/i }))
    expect(props.onProbeWritten).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: /probe sweep/i }))
    expect(props.onProbeSweep).toHaveBeenCalledTimes(1)
  })
})
