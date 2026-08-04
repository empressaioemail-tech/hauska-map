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

  it('renders exactly as the legacy fixture when a payload carries no `rows` field (graceful degradation, pre-v2 counties)', async () => {
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

    // No jurisdiction rows exist on this payload, so the summary pill falls
    // back to the legacy onboardedCount/totalCounties math, not the v2
    // certified-count math.
    expect(screen.getByText('1/1 onboarded')).toBeInTheDocument()
    expect(screen.getByText('98.0%')).toBeInTheDocument()
    expect(screen.getByText('certified')).toBeInTheDocument()
  })

  it('renders v2 jurisdiction rows with gate/cert/defect-class/focused-fix chips, grouped under the county header', async () => {
    mockGetJson.mockResolvedValue({
      ok: true,
      status: 200,
      json: {
        counties: [
          {
            countyFips: '48021',
            countyName: 'Bastrop',
            onboarded: true,
            hasStale: false,
            rewarmUnsafe: false,
            recipeVersions: ['1.0.0'],
            certStates: ['certified'],
            facets: [],
            rows: [
              {
                rowId: 'Bastrop',
                countyName: 'Bastrop',
                gate: {
                  passCount: 8,
                  declineCount: 0,
                  checks: [{ id: 'railASourceReachable', outcome: 'PASS' }],
                },
                cert: {
                  label: '7/7',
                  blockPass: true,
                  scopeAnnotations: [],
                  gradedAt: '2026-08-03T00:00:00.000Z',
                },
                openDefectClasses: [],
                focusedFixCount: 0,
              },
              {
                rowId: 'Elgin',
                countyName: 'Elgin',
                gate: {
                  passCount: 2,
                  declineCount: 1,
                  checks: [
                    { id: 'railASourceReachable', outcome: 'DECLINE', reason: 'no Rail A layer wired' },
                  ],
                },
                cert: null,
                openDefectClasses: [{ defectClass: 'ADAPTER-NEEDED', count: 1 }],
                focusedFixCount: 1,
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

    // County header shows the name; the jurisdiction rows nested under it
    // reuse "Bastrop" as the rowId too (county == its own single city row
    // in this fixture), so assert on the count of occurrences rather than
    // a single unique match. Elgin appears once (jurisdiction row only,
    // the county header is FIPS 48021/Bastrop for this fixture).
    expect(screen.getAllByText('Bastrop').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Elgin')).toBeInTheDocument()

    // Gate chips: Bastrop 8/8, Elgin 2/3 (2 pass + 1 decline).
    expect(screen.getByText('8/8')).toBeInTheDocument()
    expect(screen.getByText('2/3')).toBeInTheDocument()

    // Cert: Bastrop graded "7/7", Elgin has no cert run recorded (not
    // "UNCERTED" styling — an honest absence state instead).
    expect(screen.getByText('7/7')).toBeInTheDocument()
    expect(screen.getByText('no cert run recorded')).toBeInTheDocument()

    // Open defect class chip for Elgin.
    expect(screen.getByText('ADAPTER-NEEDED ×1')).toBeInTheDocument()

    // Focused-fix count pill for Elgin (1), "none open"/"0" style absence for Bastrop's defect classes.
    expect(screen.getByText('none open')).toBeInTheDocument()

    // Certified-count pill: 1 of 2 rows carries cert.blockPass === true.
    expect(screen.getByText('1/2 certified')).toBeInTheDocument()
  })

  it('renders an honest "no gate run recorded" state for a registry row with no county_gate_cert_state entry, not UNCERTED styling', async () => {
    mockGetJson.mockResolvedValue({
      ok: true,
      status: 200,
      json: {
        counties: [
          {
            countyFips: '48091',
            countyName: 'Smithville',
            onboarded: false,
            hasStale: false,
            rewarmUnsafe: false,
            recipeVersions: [],
            certStates: [],
            facets: [],
            rows: [
              {
                rowId: 'Smithville',
                countyName: 'Smithville',
                gate: null,
                cert: null,
                openDefectClasses: [],
                focusedFixCount: 0,
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

    expect(screen.getByText('no gate run recorded')).toBeInTheDocument()
    expect(screen.getByText('no cert run recorded')).toBeInTheDocument()
    expect(screen.queryByText(/uncerted/i)).not.toBeInTheDocument()
    // Zero registry rows carry cert.blockPass true, so the pill reads 0/1.
    expect(screen.getByText('0/1 certified')).toBeInTheDocument()
  })
})
