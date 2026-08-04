// apps/command-center/src/admin/control/panels/CountyLedger.test.tsx
//
// Pins the coverage-percent render against the 9801.0% regression: the
// county_facet_coverage.honest_coverage_pct field (numeric(5,2)) is ALREADY
// a 0..100 percent value, never a 0..1 fraction. A fixture value of 98.01
// must render "98.0%", not "9801.0%" (the old `* 100` bug).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { CountyLedger } from './CountyLedger'

vi.mock('../../api/spineClient')

import * as spineClientModule from '../../api/spineClient'

describe('CountyLedger', () => {
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

  it('renders a 98.01 honestCoveragePct fixture as "98.0%", never "9801.0%"', async () => {
    mockGetJson.mockResolvedValue({
      ok: true,
      status: 200,
      json: {
        counties: [
          {
            countyFips: '48021',
            onboarded: true,
            hasStale: false,
            rewarmUnsafe: false,
            recipeVersions: ['1.0.0'],
            certStates: ['certified'],
            facets: [
              {
                facet: 'zoning',
                honestCoveragePct: 98.01,
                integrityVerdict: 'clean',
                certState: 'certified',
                recipeVersion: '1.0.0',
                stalenessFlag: false,
                rewarmUnsafe: false,
                sourceVintage: '202503',
                onboarded: true,
              },
            ],
          },
        ],
        summary: {
          onboardedCount: 1,
          totalCounties: 1,
          staleCount: 0,
          rewarmUnsafeCount: 0,
        },
      },
    })

    render(<CountyLedger />)

    await waitFor(() => {
      expect(screen.getByText('County Ledger')).toBeInTheDocument()
    })

    expect(screen.getByText('98.0%')).toBeInTheDocument()
    expect(screen.queryByText('9801.0%')).not.toBeInTheDocument()
  })

  it('renders "—" for a null honestCoveragePct (honest-absence, not a fabricated percent)', async () => {
    mockGetJson.mockResolvedValue({
      ok: true,
      status: 200,
      json: {
        counties: [
          {
            countyFips: '48021',
            onboarded: false,
            hasStale: false,
            rewarmUnsafe: false,
            recipeVersions: [],
            certStates: [],
            facets: [
              {
                facet: 'zoning',
                honestCoveragePct: null,
                integrityVerdict: 'unmeasured',
                certState: null,
                recipeVersion: null,
                stalenessFlag: false,
                rewarmUnsafe: false,
                sourceVintage: null,
                onboarded: false,
              },
            ],
          },
        ],
        summary: {
          onboardedCount: 0,
          totalCounties: 1,
          staleCount: 0,
          rewarmUnsafeCount: 0,
        },
      },
    })

    render(<CountyLedger />)

    await waitFor(() => {
      expect(screen.getByText('County Ledger')).toBeInTheDocument()
    })

    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })
})
