// CountyManifestGrid.test.tsx — pins the manifest grid against manifestCells.
//
// The rail set here is a TEST FIXTURE mirroring the live API's 14 rails, NOT a
// declaration the component reads. The component derives its columns from the API
// response; the derivation tests below prove the grid follows a payload whose rail
// set differs from this fixture.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import { CountyManifestGrid } from './CountyManifestGrid'
import {
  type ManifestCell,
  type ManifestLedgerResponse,
  type RailCapability,
  isLedgerMaterializationStale,
  LEDGER_STALE_AFTER_MS,
} from './countyManifestTypes'

/** Fixture mirroring GET /api/county-ledger railCapabilities as served 2026-08-12. */
const FIXTURE_RAILS: Array<{ key: string; kind: 'spine' | 'derived' }> = [
  { key: 'geometry', kind: 'spine' },
  { key: 'cad', kind: 'spine' },
  { key: 'zoning', kind: 'spine' },
  { key: 'roads', kind: 'spine' },
  { key: 'flood', kind: 'spine' },
  { key: 'envelope', kind: 'derived' },
  { key: 'landuse', kind: 'derived' },
  { key: 'footprint', kind: 'derived' },
  { key: 'easement', kind: 'derived' },
  { key: 'owner', kind: 'derived' },
  { key: 'rrc-wells', kind: 'derived' },
  { key: 'rrc-pipelines', kind: 'derived' },
  { key: 'rail-corridor', kind: 'derived' },
  { key: 'mud', kind: 'derived' },
]
const FIXTURE_RAIL_COUNT = FIXTURE_RAILS.length

function mkCaps(keys: string[]): RailCapability[] {
  return keys.map((railKey) => ({
    railKey,
    maxCountiesReachable: null,
    reachPct: null,
    sourceBasis: null,
  }))
}

vi.mock('../../api/spineClient')

import * as spineClientModule from '../../api/spineClient'

function fipsForIndex(i: number): string {
  return String(48000 + i + 1).padStart(5, '0')
}

function mkCell(countyFips: string, railKey: string, overrides: Partial<ManifestCell> = {}): ManifestCell {
  const rail = FIXTURE_RAILS.find((r) => r.key === railKey) ?? { key: railKey, kind: 'derived' as const }
  const isNoAtom = rail.key === 'geometry'
  const isNoWriter = rail.key === 'roads'
  return {
    countyFips,
    railKey,
    displayState: isNoAtom ? 'no-atom' : isNoWriter ? 'no-writer' : 'not-yet',
    isPartial: false,
    honestCoveragePct: null,
    thresholdPct: rail.kind === 'spine' ? 95 : 90,
    atomFamilyState: isNoAtom ? 'missing' : 'present',
    hasWriter: !isNoWriter,
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

function mkFullGrid(countyCount = 254): ManifestCell[] {
  const cells: ManifestCell[] = []
  for (let i = 0; i < countyCount; i++) {
    const fips = fipsForIndex(i)
    for (const rail of FIXTURE_RAILS) {
      cells.push(mkCell(fips, rail.key))
    }
  }
  return cells
}

function mkPayload(cells: ManifestCell[], summaryOverrides: Partial<ManifestLedgerResponse['summary']> = {}): ManifestLedgerResponse {
  const counties = [...new Set(cells.map((c) => c.countyFips))].map((fips) => ({
    countyFips: fips,
    countyName: fips === '48021' ? 'Bastrop' : null,
    hasStale: false,
    rewarmUnsafe: false,
    rows: [],
    facets: [],
  }))
  const satisfiedCells = cells.filter(
    (c) => (c.displayState === 'satisfied-present' && !c.isPartial) || c.displayState === 'satisfied-absent',
  ).length
  return {
    counties,
    manifestCells: cells,
    railCapabilities: mkCaps(FIXTURE_RAILS.map((r) => r.key)),
    summary: {
      onboardedCount: 0,
      totalCounties: counties.length,
      staleCount: 0,
      rewarmUnsafeCount: 0,
      totalRails: FIXTURE_RAIL_COUNT,
      totalCells: cells.length,
      satisfiedCells,
      texasCompletenessPct: 4.72,
      computedAt: new Date().toISOString(),
      servedAt: new Date().toISOString(),
      materializationAgeMs: 0,
      ...summaryOverrides,
    },
  }
}

describe('CountyManifestGrid', () => {
  const mockLoadConfig = vi.mocked(spineClientModule.loadConfig)
  const mockApiBase = vi.mocked(spineClientModule.apiBase)
  const mockGetJson = vi.mocked(spineClientModule.getJson)

  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadConfig.mockReturnValue({
      cortexApiUrl: '/api/spine/cortex',
      mcpUrl: '/api/spine/mcp',
      retrievalApiUrl: '/api/spine/retrieval',
      hauskaKey: '',
      installId: 'test',
    })
    mockApiBase.mockReturnValue('/api/spine/cortex')
  })

  it(
    'renders every county-by-rail cell for a full manifestCells payload',
    async () => {
      const cells = mkFullGrid(254)
      mockGetJson.mockResolvedValue({ ok: true, status: 200, json: mkPayload(cells) })

      render(<CountyManifestGrid />)

      await waitFor(() => {
        expect(screen.getByText('County Manifest')).toBeInTheDocument()
      })

      const rendered = document.querySelectorAll('[data-testid^="manifest-cell-"]')
      expect(rendered.length).toBe(254 * FIXTURE_RAIL_COUNT)
    },
    30_000,
  )

  it('resolves the four primary cell visual states correctly', async () => {
    const fips = '48021'
    const cells: ManifestCell[] = [
      mkCell(fips, 'geometry', { displayState: 'no-atom', atomFamilyState: 'missing' }),
      mkCell(fips, 'zoning', { displayState: 'satisfied-absent', absenceBasis: 'unincorporated unzoned' }),
      mkCell(fips, 'envelope', { displayState: 'not-yet' }),
      mkCell(fips, 'landuse', {
        displayState: 'satisfied-present',
        honestCoveragePct: 98.01,
        isPartial: false,
      }),
      mkCell(fips, 'roads', { displayState: 'no-writer', hasWriter: false }),
    ]
    // Fill remaining rails for the one county so the row is complete
    for (const rail of FIXTURE_RAILS) {
      if (!cells.some((c) => c.railKey === rail.key)) {
        cells.push(mkCell(fips, rail.key))
      }
    }

    mockGetJson.mockResolvedValue({ ok: true, status: 200, json: mkPayload(cells) })

    render(<CountyManifestGrid />)

    await waitFor(() => expect(screen.getByTestId('manifest-row-48021')).toBeInTheDocument())

    expect(document.querySelector('[data-testid="manifest-cell-48021-geometry"]')).toHaveAttribute(
      'data-display-state',
      'no-atom',
    )
    expect(document.querySelector('[data-testid="manifest-cell-48021-zoning"]')).toHaveAttribute(
      'data-visual-state',
      'satisfied-absent',
    )
    expect(document.querySelector('[data-testid="manifest-cell-48021-envelope"]')).toHaveAttribute(
      'data-visual-state',
      'not-yet',
    )
    expect(document.querySelector('[data-testid="manifest-cell-48021-landuse"]')).toHaveAttribute(
      'data-visual-state',
      'satisfied-present',
    )
  })

  it('renders PARTIAL with coverage number and zero credit (visual partial state)', async () => {
    const fips = '48491'
    const cells = FIXTURE_RAILS.map((rail) =>
      mkCell(fips, rail.key, {
        displayState: rail.key === 'zoning' ? 'satisfied-present' : 'no-atom',
        atomFamilyState: rail.key === 'zoning' ? 'present' : 'missing',
        hasWriter: rail.key === 'zoning',
        honestCoveragePct: rail.key === 'zoning' ? 33.98 : null,
        isPartial: rail.key === 'zoning',
      }),
    )

    mockGetJson.mockResolvedValue({
      ok: true,
      status: 200,
      json: mkPayload(cells, { totalCounties: 1, satisfiedCells: 0 }),
    })

    render(<CountyManifestGrid />)

    await waitFor(() => expect(screen.getByText('County Manifest')).toBeInTheDocument())

    const partialCell = document.querySelector('[data-testid="manifest-cell-48491-zoning"]')
    expect(partialCell).toHaveAttribute('data-visual-state', 'partial')
    expect(within(partialCell as HTMLElement).getByText('34%')).toBeInTheDocument()
  })

  it('shows one cell per API rail for a county with zero legacy facet coverage rows', async () => {
    const fips = '48129'
    const cells = FIXTURE_RAILS.map((rail) => mkCell(fips, rail.key, { displayState: 'not-yet' }))

    mockGetJson.mockResolvedValue({
      ok: true,
      status: 200,
      json: {
        counties: [
          {
            countyFips: fips,
            countyName: null,
            hasStale: false,
            rewarmUnsafe: false,
            facets: [],
            rows: [],
          },
        ],
        manifestCells: cells,
        railCapabilities: mkCaps(FIXTURE_RAILS.map((r) => r.key)),
        summary: {
          onboardedCount: 0,
          totalCounties: 1,
          staleCount: 0,
          rewarmUnsafeCount: 0,
          totalRails: FIXTURE_RAIL_COUNT,
          totalCells: FIXTURE_RAIL_COUNT,
          satisfiedCells: 0,
          texasCompletenessPct: 0,
        },
      },
    })

    render(<CountyManifestGrid />)

    await waitFor(() => expect(screen.getByTestId(`manifest-row-${fips}`)).toBeInTheDocument())

    const rowCells = document.querySelectorAll(`[data-testid^="manifest-cell-${fips}-"]`)
    expect(rowCells.length).toBe(FIXTURE_RAIL_COUNT)
  })

  it('renders explicit degraded state when manifestCells is absent', async () => {
    mockGetJson.mockResolvedValue({
      ok: true,
      status: 200,
      json: {
        counties: [],
        summary: {
          onboardedCount: 0,
          totalCounties: 0,
          staleCount: 0,
          rewarmUnsafeCount: 0,
        },
      },
    })

    render(<CountyManifestGrid />)

    await waitFor(() => {
      expect(screen.getByText(/manifest not served by this deployment/i)).toBeInTheDocument()
    })
    expect(screen.queryByTestId('manifest-grid-table')).not.toBeInTheDocument()
  })

  it('shows weighted headline and raw cells-satisfied secondary figures distinctly', async () => {
    const cells = mkFullGrid(2)
    mockGetJson.mockResolvedValue({
      ok: true,
      status: 200,
      json: mkPayload(cells, {
        totalCounties: 2,
        totalCells: 2 * FIXTURE_RAIL_COUNT,
        satisfiedCells: 2,
        texasCompletenessPct: 4.72,
      }),
    })

    render(<CountyManifestGrid />)

    await waitFor(() => expect(screen.getByText('Texas weighted completeness')).toBeInTheDocument())
    expect(screen.getByText('4.72%')).toBeInTheDocument()
    expect(screen.getByText('parcel-weighted · headline')).toBeInTheDocument()
    expect(screen.getByText('Cells satisfied')).toBeInTheDocument()
    expect(screen.getByText(`2/${2 * FIXTURE_RAIL_COUNT} · secondary`)).toBeInTheDocument()
  })

  it('cell drawer shows artifact path absence honestly', async () => {
    const fips = '48021'
    const cells = FIXTURE_RAILS.map((rail) => mkCell(fips, rail.key))
    mockGetJson.mockResolvedValue({ ok: true, status: 200, json: mkPayload(cells) })

    render(<CountyManifestGrid />)

    await waitFor(() => expect(screen.getByTestId('manifest-row-48021')).toBeInTheDocument())

    const cellBtn = document.querySelector('[data-testid="manifest-cell-48021-zoning"]') as HTMLElement
    fireEvent.click(cellBtn)

    await waitFor(() => {
      expect(screen.getByText('no artifact path recorded')).toBeInTheDocument()
    })
  })

  it('cell drawer renders absenceBasis when the API supplies scope-qualified doctrine text', async () => {
    const fips = '48201'
    const basis =
      "SCOPE-LIMITED — roster doctrine 'PASS — county unincorporated = honest absence' establishes..."
    const cells = FIXTURE_RAILS.map((rail) =>
      mkCell(fips, rail.key, rail.key === 'zoning' ? { displayState: 'satisfied-absent', absenceBasis: basis } : {}),
    )
    mockGetJson.mockResolvedValue({ ok: true, status: 200, json: mkPayload(cells) })

    render(<CountyManifestGrid />)

    await waitFor(() => expect(screen.getByTestId('manifest-row-48201')).toBeInTheDocument())

    const cellBtn = document.querySelector('[data-testid="manifest-cell-48201-zoning"]') as HTMLElement
    fireEvent.click(cellBtn)

    await waitFor(() => {
      expect(screen.getByText(basis)).toBeInTheDocument()
    })
  })

  it('cell drawer shows absence basis honestly as "no basis recorded" when null', async () => {
    const fips = '48021'
    const cells = FIXTURE_RAILS.map((rail) => mkCell(fips, rail.key))
    mockGetJson.mockResolvedValue({ ok: true, status: 200, json: mkPayload(cells) })

    render(<CountyManifestGrid />)

    await waitFor(() => expect(screen.getByTestId('manifest-row-48021')).toBeInTheDocument())

    const cellBtn = document.querySelector('[data-testid="manifest-cell-48021-zoning"]') as HTMLElement
    fireEvent.click(cellBtn)

    await waitFor(() => {
      expect(screen.getByText('no basis recorded')).toBeInTheDocument()
    })
  })
  it('derives the column set from the API, including the rrc split and rail-corridor', async () => {
    const fips = '48021'
    const cells = FIXTURE_RAILS.map((rail) => mkCell(fips, rail.key))
    mockGetJson.mockResolvedValue({ ok: true, status: 200, json: mkPayload(cells) })

    render(<CountyManifestGrid />)
    await waitFor(() => expect(screen.getByTestId(`manifest-row-${fips}`)).toBeInTheDocument())

    expect(document.querySelector(`[data-testid="manifest-cell-${fips}-rrc-wells"]`)).toBeTruthy()
    expect(document.querySelector(`[data-testid="manifest-cell-${fips}-rrc-pipelines"]`)).toBeTruthy()
    expect(document.querySelector(`[data-testid="manifest-cell-${fips}-rail-corridor"]`)).toBeTruthy()
    expect(document.querySelector(`[data-testid="manifest-cell-${fips}-rrc"]`)).toBeNull()
    expect(document.querySelector(`[data-testid="manifest-cell-${fips}-join"]`)).toBeNull()

    const rowCells = document.querySelectorAll(`[data-testid^="manifest-cell-${fips}-"]`)
    expect(rowCells.length).toBe(FIXTURE_RAIL_COUNT)
  })

  it('follows the API when it serves a rail set this file does not declare', async () => {
    const fips = '48021'
    const apiRails = ['geometry', 'cad', 'a-brand-new-rail']
    const cells = apiRails.map((key) => mkCell(fips, key))
    mockGetJson.mockResolvedValue({
      ok: true,
      status: 200,
      json: {
        counties: [
          { countyFips: fips, countyName: 'Bastrop', hasStale: false, rewarmUnsafe: false, rows: [], facets: [] },
        ],
        manifestCells: cells,
        railCapabilities: mkCaps(apiRails),
        summary: {
          onboardedCount: 0,
          totalCounties: 1,
          staleCount: 0,
          rewarmUnsafeCount: 0,
          totalRails: apiRails.length,
          totalCells: apiRails.length,
          satisfiedCells: 0,
          texasCompletenessPct: 0,
        },
      },
    })

    render(<CountyManifestGrid />)
    await waitFor(() => expect(screen.getByTestId(`manifest-row-${fips}`)).toBeInTheDocument())

    const rowCells = document.querySelectorAll(`[data-testid^="manifest-cell-${fips}-"]`)
    expect(rowCells.length).toBe(3)
    expect(document.querySelector(`[data-testid="manifest-cell-${fips}-a-brand-new-rail"]`)).toBeTruthy()
    expect(screen.getByText('1×3')).toBeInTheDocument()
  })

  it(
    'grid dimension label always agrees with the served cell count',
    async () => {
      const cells = mkFullGrid(254)
      mockGetJson.mockResolvedValue({ ok: true, status: 200, json: mkPayload(cells) })

      render(<CountyManifestGrid />)
      await waitFor(() => expect(screen.getByText('County Manifest')).toBeInTheDocument())

      expect(screen.getByText(`254×${FIXTURE_RAIL_COUNT}`)).toBeInTheDocument()
      expect(screen.getByText((254 * FIXTURE_RAIL_COUNT).toLocaleString() + ' cells')).toBeInTheDocument()
    },
    30_000,
  )

  // SS-W8 replaced the STALE banner with an ALARM that names what the staleness
  // invalidates. The banner testid is gone on purpose; a banner gets read past.
  it('always renders computedAt and raises a staleness ALARM when the snapshot is old', async () => {
    const staleAt = new Date(Date.now() - LEDGER_STALE_AFTER_MS - 60_000).toISOString()
    const cells = FIXTURE_RAILS.map((rail) => mkCell('48021', rail.key))
    mockGetJson.mockResolvedValue({
      ok: true,
      status: 200,
      json: mkPayload(cells, {
        computedAt: staleAt,
        servedAt: new Date().toISOString(),
        materializationAgeMs: LEDGER_STALE_AFTER_MS + 60_000,
      }),
    })

    render(<CountyManifestGrid />)
    await waitFor(() => expect(screen.getByTestId('manifest-computed-at')).toBeInTheDocument())
    expect(screen.getByTestId('manifest-computed-at')).toHaveTextContent(staleAt)
    const bar = screen.getByTestId('manifest-alarm-bar')
    expect(bar).toHaveAttribute('data-worst', 'warn')
    expect(bar).toHaveTextContent('STALE')
    expect(bar).toHaveTextContent(staleAt)
    // The alarm states the consequence, not just the fact.
    expect(bar).toHaveTextContent(/claim about/i)
    expect(screen.queryByTestId('manifest-stale-banner')).toBeNull()
  })

  it('says FRESH and raises no firing alarm when computedAt is recent', async () => {
    const cells = FIXTURE_RAILS.map((rail) => mkCell('48021', rail.key))
    mockGetJson.mockResolvedValue({ ok: true, status: 200, json: mkPayload(cells) })

    render(<CountyManifestGrid />)
    await waitFor(() => expect(screen.getByTestId('manifest-computed-at')).toBeInTheDocument())
    expect(screen.getByTestId('manifest-alarm-bar')).toHaveAttribute('data-worst', 'ok')
    expect(screen.queryByTestId('manifest-stale-banner')).toBeNull()
  })
})

describe('isLedgerMaterializationStale', () => {
  it('fail-closed: missing computedAt is stale', () => {
    expect(isLedgerMaterializationStale({ onboardedCount: 0, totalCounties: 0, staleCount: 0, rewarmUnsafeCount: 0 })).toBe(true)
  })

  it('fresh snapshot is not stale', () => {
    expect(
      isLedgerMaterializationStale({
        onboardedCount: 0,
        totalCounties: 0,
        staleCount: 0,
        rewarmUnsafeCount: 0,
        computedAt: new Date().toISOString(),
        materializationAgeMs: 0,
      }),
    ).toBe(false)
  })
})

// ── SS-W6: subtabs, re-read verdict, derivation audit, derived denominators ────
//
// Added 2026-08-18 (P-44). These pin the four things the County Manifest was getting
// wrong against the payload it was already being served: a hardcoded rail count in the
// filter label, a column tag sampled from one county, a reachable ceiling that never
// reached the screen, and a refresh that could not distinguish a re-read from a
// recompute.

describe('CountyManifestGrid — SS-W6 subtabs and derivation', () => {
  const mockLoadConfig = vi.mocked(spineClientModule.loadConfig)
  const mockApiBase = vi.mocked(spineClientModule.apiBase)
  const mockGetJson = vi.mocked(spineClientModule.getJson)

  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadConfig.mockReturnValue({
      cortexApiUrl: '/api/spine/cortex',
      mcpUrl: '/api/spine/mcp',
      retrievalApiUrl: '/api/spine/retrieval',
      hauskaKey: '',
      installId: 'test',
    })
    mockApiBase.mockReturnValue('/api/spine/cortex')
  })

  it('derives the gap-filter denominator from the API instead of hardcoding it', async () => {
    const cells = FIXTURE_RAILS.map((rail) => mkCell('48021', rail.key))
    mockGetJson.mockResolvedValue({ ok: true, status: 200, json: mkPayload(cells) })

    render(<CountyManifestGrid />)
    await waitFor(() => expect(screen.getByTestId('manifest-gap-filter-label')).toBeInTheDocument())
    // The label read "below 3/13" while the API served 14 rails.
    expect(screen.getByTestId('manifest-gap-filter-label')).toHaveTextContent(
      `below 3 of ${FIXTURE_RAIL_COUNT} rails satisfied`,
    )
    expect(screen.queryByText('below 3/13')).toBeNull()
  })

  it('shows a rail reachable ceiling when the capability probe defines one below the county count', async () => {
    const fips = '48021'
    const cells = FIXTURE_RAILS.map((rail) => mkCell(fips, rail.key))
    const caps = mkCaps(FIXTURE_RAILS.map((r) => r.key)).map((c) =>
      c.railKey === 'rrc-wells'
        ? { ...c, maxCountiesReachable: 1, sourceBasis: 'RRC public GIS Harris County mirror' }
        : c,
    )
    mockGetJson.mockResolvedValue({
      ok: true,
      status: 200,
      // totalCounties 254 mirrors the live grid denominator; the rrc-wells source can
      // reach exactly one county, so 0/254 and 0/1 are different findings.
      json: { ...mkPayload(cells, { totalCounties: 254 }), railCapabilities: caps },
    })

    render(<CountyManifestGrid />)
    await waitFor(() => expect(screen.getByTestId(`manifest-row-${fips}`)).toBeInTheDocument())
    // SS-W8: the rail's OWN ceiling is the denominator, not 254. 0/254 manufactures a
    // 253-county hole; 0/1 is the honest reading of the same fact.
    expect(screen.getByTestId('rail-score-rrc-wells')).toHaveTextContent('0/1')
    // A rail with no ceiling served must not invent one — it falls back to the payload
    // county count and SAYS that no reach probe defines a ceiling.
    expect(screen.getByTestId('rail-score-geometry')).toHaveTextContent('0/254')
  })

  it('reports a re-read that does not move computedAt as upstream staleness, not a refresh', async () => {
    const computedAt = new Date().toISOString()
    const cells = FIXTURE_RAILS.map((rail) => mkCell('48021', rail.key))
    mockGetJson.mockResolvedValue({
      ok: true,
      status: 200,
      json: mkPayload(cells, { computedAt, servedAt: computedAt, materializationAgeMs: 0 }),
    })

    render(<CountyManifestGrid />)
    await waitFor(() => expect(screen.getByTestId('manifest-read-strip')).toBeInTheDocument())
    expect(screen.getByTestId('manifest-reread-verdict')).toHaveTextContent('first read of this session')

    fireEvent.click(screen.getByRole('button', { name: /re-read manifest/i }))
    await waitFor(() =>
      expect(screen.getByTestId('manifest-reread-verdict')).toHaveTextContent('computedAt did NOT move'),
    )
    expect(screen.getByTestId('manifest-reread-verdict')).toHaveTextContent('cannot recompute')
    expect(mockGetJson).toHaveBeenCalledTimes(2)
  })

  it('reports a re-read that DOES move computedAt as a new materialization', async () => {
    const first = '2026-08-14T17:41:22.500Z'
    const second = new Date().toISOString()
    const cells = FIXTURE_RAILS.map((rail) => mkCell('48021', rail.key))
    mockGetJson
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: mkPayload(cells, { computedAt: first, servedAt: first, materializationAgeMs: 0 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: mkPayload(cells, { computedAt: second, servedAt: second, materializationAgeMs: 0 }),
      })

    render(<CountyManifestGrid />)
    await waitFor(() => expect(screen.getByTestId('manifest-read-strip')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /re-read manifest/i }))
    await waitFor(() =>
      expect(screen.getByTestId('manifest-reread-verdict')).toHaveTextContent('computedAt moved'),
    )
  })

  it('names the hand-declared indicators that cannot fire on the served payload', async () => {
    // Live shape: hasWriter true and atomFamilyState present on every cell.
    const cells = FIXTURE_RAILS.map((rail) =>
      mkCell('48021', rail.key, { hasWriter: true, atomFamilyState: 'present', displayState: 'not-yet' }),
    )
    mockGetJson.mockResolvedValue({ ok: true, status: 200, json: mkPayload(cells) })

    render(<CountyManifestGrid />)
    await waitFor(() => expect(screen.getByTestId('manifest-derivation')).toBeInTheDocument())
    // hasWriter, atomFamilyState and isPartial are all constant on this payload, which
    // is the live shape: three legend/tag controls that are switched off and look on.
    expect(screen.getByTestId('manifest-derivation')).toHaveTextContent('3 upstream indicators cannot fire')

    fireEvent.click(screen.getByTestId('manifest-derivation-toggle'))
    const panel = screen.getByTestId('manifest-derivation')
    expect(panel).toHaveTextContent('hasWriter')
    expect(panel).toHaveTextContent('atomFamilyState')
    expect(panel).toHaveTextContent('isPartial')
    expect(panel).toHaveTextContent('declared-upstream')
    expect(panel).toHaveTextContent('derived-api')
    // The legend says so too, at the point of use.
    expect(screen.getByTestId('legend-cannot-fire-no-atom')).toBeInTheDocument()
  })

  it('surfaces a cell whose coverage clears its threshold while its state says unacquired', async () => {
    const cells = FIXTURE_RAILS.map((rail) =>
      mkCell('48021', rail.key, {
        displayState: 'not-yet',
        honestCoveragePct: rail.key === 'envelope' ? 99.77 : null,
        thresholdPct: 90,
        hasWriter: true,
        atomFamilyState: 'present',
      }),
    )
    mockGetJson.mockResolvedValue({ ok: true, status: 200, json: mkPayload(cells) })

    render(<CountyManifestGrid />)
    await waitFor(() => expect(screen.getByTestId('manifest-derivation')).toBeInTheDocument())
    expect(screen.getByTestId('manifest-derivation')).toHaveTextContent('1 self-contradicting cells')

    fireEvent.click(screen.getByTestId('manifest-derivation-toggle'))
    expect(screen.getByTestId('manifest-derivation')).toHaveTextContent('48021:envelope')
  })

  it('counts county names by origin instead of silently backfilling them', async () => {
    const cells = ['48021', '48001'].flatMap((fips) => FIXTURE_RAILS.map((rail) => mkCell(fips, rail.key)))
    // mkPayload names only 48021; 48001 arrives with countyName null.
    mockGetJson.mockResolvedValue({ ok: true, status: 200, json: mkPayload(cells, { totalCounties: 2 }) })

    render(<CountyManifestGrid />)
    await waitFor(() => expect(screen.getByTestId('manifest-row-48001')).toBeInTheDocument())
    // The roster fills the display name...
    expect(screen.getByTestId('manifest-row-48001')).toHaveTextContent('Anderson')

    fireEvent.click(screen.getByTestId('manifest-derivation-toggle'))
    // ...and the split is stated with its denominator.
    expect(screen.getByTestId('manifest-derivation')).toHaveTextContent(
      '1 served by the API, 1 filled from the local roster, 0 unresolved',
    )
  })

  it('switches to the serving sweep subtab and shows an honest not-probed state', async () => {
    const cells = FIXTURE_RAILS.map((rail) => mkCell('48021', rail.key))
    mockGetJson.mockResolvedValue({ ok: true, status: 200, json: mkPayload(cells) })

    render(<CountyManifestGrid />)
    await waitFor(() => expect(screen.getByTestId('manifest-subtabs')).toBeInTheDocument())
    expect(screen.getByTestId('manifest-grid-table')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('manifest-subtab-sweep'))
    expect(screen.getByTestId('serving-sweep-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('manifest-grid-table')).toBeNull()
    expect(screen.getByText('not probed yet')).toBeInTheDocument()
    // The pairing note is available before any sweep data exists.
    expect(screen.getByTestId('sweep-pairing-note')).toHaveTextContent(`7 of ${FIXTURE_RAIL_COUNT} rails pair`)

    fireEvent.click(screen.getByTestId('manifest-subtab-manifest'))
    expect(screen.getByTestId('manifest-grid-table')).toBeInTheDocument()
  })

  // SS-W8: the NO WRITER tag is DELETED. hasWriter is true on every cell the API
  // serves, so the tag could not fire under any data. What replaces it is measured.
  it('replaces the dead NO WRITER tag with a derived scoring-evidence tag that fires', async () => {
    const fipsList = ['48001', '48003', '48005']
    const cells = fipsList.flatMap((fips) =>
      FIXTURE_RAILS.map((rail) =>
        mkCell(fips, rail.key, {
          hasWriter: !(rail.key === 'roads' && fips === '48005'),
          atomFamilyState: 'present',
          displayState: 'not-yet',
          // Every rail but roads carries scoring evidence somewhere in the column.
          honestCoveragePct: rail.key === 'roads' ? null : 12.5,
          source: rail.key === 'roads' ? null : 'a-source',
        }),
      ),
    )
    mockGetJson.mockResolvedValue({ ok: true, status: 200, json: mkPayload(cells, { totalCounties: 3 }) })

    render(<CountyManifestGrid />)
    await waitFor(() => expect(screen.getByTestId('manifest-row-48005')).toBeInTheDocument())
    // The deleted control is gone...
    expect(screen.queryByText('NO WRITER 1')).toBeNull()
    // ...and the derived one fires exactly once, for the one rail with no evidence
    // anywhere in its column, out of 14 rails examined.
    expect(screen.getByTestId('rail-no-evidence-roads')).toBeInTheDocument()
    expect(screen.queryByTestId('rail-no-evidence-geometry')).toBeNull()
    expect(document.querySelectorAll('[data-testid^="rail-no-evidence-"]').length).toBe(1)
  })
})
