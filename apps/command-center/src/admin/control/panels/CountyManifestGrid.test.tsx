// CountyManifestGrid.test.tsx — pins the 254×13 manifest grid against manifestCells.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import { CountyManifestGrid } from './CountyManifestGrid'
import {
  MANIFEST_RAILS,
  RAIL_COUNT,
  type ManifestCell,
  type ManifestLedgerResponse,
} from './countyManifestTypes'

vi.mock('../../api/spineClient')

import * as spineClientModule from '../../api/spineClient'

function fipsForIndex(i: number): string {
  return String(48000 + i + 1).padStart(5, '0')
}

function mkCell(countyFips: string, railKey: string, overrides: Partial<ManifestCell> = {}): ManifestCell {
  const rail = MANIFEST_RAILS.find((r) => r.key === railKey)!
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
    for (const rail of MANIFEST_RAILS) {
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
    summary: {
      onboardedCount: 0,
      totalCounties: counties.length,
      staleCount: 0,
      rewarmUnsafeCount: 0,
      totalRails: RAIL_COUNT,
      totalCells: cells.length,
      satisfiedCells,
      texasCompletenessPct: 4.72,
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

  it('renders all 3,302 cells for a full 254×13 manifestCells payload', async () => {
    const cells = mkFullGrid(254)
    mockGetJson.mockResolvedValue({ ok: true, status: 200, json: mkPayload(cells) })

    render(<CountyManifestGrid />)

    await waitFor(() => {
      expect(screen.getByText('County Manifest')).toBeInTheDocument()
    })

    const rendered = document.querySelectorAll('[data-testid^="manifest-cell-"]')
    expect(rendered.length).toBe(254 * RAIL_COUNT)
  })

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
    for (const rail of MANIFEST_RAILS) {
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
    const cells = MANIFEST_RAILS.map((rail) =>
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

  it('shows 13 cells for a county with zero legacy facet coverage rows', async () => {
    const fips = '48129'
    const cells = MANIFEST_RAILS.map((rail) => mkCell(fips, rail.key, { displayState: 'not-yet' }))

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
        summary: {
          onboardedCount: 0,
          totalCounties: 1,
          staleCount: 0,
          rewarmUnsafeCount: 0,
          totalRails: RAIL_COUNT,
          totalCells: RAIL_COUNT,
          satisfiedCells: 0,
          texasCompletenessPct: 0,
        },
      },
    })

    render(<CountyManifestGrid />)

    await waitFor(() => expect(screen.getByTestId(`manifest-row-${fips}`)).toBeInTheDocument())

    const rowCells = document.querySelectorAll(`[data-testid^="manifest-cell-${fips}-"]`)
    expect(rowCells.length).toBe(RAIL_COUNT)
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
        totalCells: 26,
        satisfiedCells: 2,
        texasCompletenessPct: 4.72,
      }),
    })

    render(<CountyManifestGrid />)

    await waitFor(() => expect(screen.getByText('Texas weighted completeness')).toBeInTheDocument())
    expect(screen.getByText('4.72%')).toBeInTheDocument()
    expect(screen.getByText('parcel-weighted · headline')).toBeInTheDocument()
    expect(screen.getByText('Cells satisfied')).toBeInTheDocument()
    expect(screen.getByText('2/26 · secondary')).toBeInTheDocument()
  })

  it('cell drawer shows artifact path absence honestly', async () => {
    const fips = '48021'
    const cells = MANIFEST_RAILS.map((rail) => mkCell(fips, rail.key))
    mockGetJson.mockResolvedValue({ ok: true, status: 200, json: mkPayload(cells) })

    render(<CountyManifestGrid />)

    await waitFor(() => expect(screen.getByTestId('manifest-row-48021')).toBeInTheDocument())

    const cellBtn = document.querySelector('[data-testid="manifest-cell-48021-zoning"]') as HTMLElement
    fireEvent.click(cellBtn)

    await waitFor(() => {
      expect(screen.getByText('no artifact path recorded')).toBeInTheDocument()
    })
  })
})
