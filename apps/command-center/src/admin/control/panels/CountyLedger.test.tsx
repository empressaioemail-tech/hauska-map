// apps/command-center/src/admin/control/panels/CountyLedger.test.tsx
//
// Pins the coverage-percent render against the 9801.0% regression: the
// county_facet_coverage.honest_coverage_pct field (numeric(5,2)) is ALREADY
// a 0..100 percent value, never a 0..1 fraction. A fixture value of 98.01
// must render "98.0%", not "9801.0%" (the old `* 100` bug).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
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

// ── Focused-fix expand: GET /api/onboarding-ledger/events (ldt PR #383) ──
//
// The v2 fixture above only exercises the closed-pill render (count > 0,
// never expanded — the fetch is lazy and must not fire until the operator
// opens the row). These fixtures drive the expand interaction itself:
// grouped-by-defectClass render, pagination math, error state, and the
// "no open findings" empty state distinct from "failed to load".

const ONE_ROW_LEDGER_PAYLOAD = {
  counties: [
    {
      countyFips: '48021',
      countyName: 'Elgin',
      onboarded: true,
      hasStale: false,
      rewarmUnsafe: false,
      recipeVersions: ['1.0.0'],
      certStates: [],
      facets: [],
      rows: [
        {
          rowId: 'Elgin',
          countyName: 'Elgin',
          gate: { passCount: 2, declineCount: 1, checks: [] },
          cert: null,
          openDefectClasses: [{ defectClass: 'ADAPTER-NEEDED', count: 3 }],
          focusedFixCount: 3,
        },
      ],
    },
  ],
  summary: { onboardedCount: 1, totalCounties: 1, staleCount: 0, rewarmUnsafeCount: 0 },
}

function mkEvent(overrides: Partial<{
  id: string
  ts: string
  fips: string
  rowId: string
  parcelNodeId: string | null
  sourceKind: string
  railOrCheck: string | null
  checkId: string | null
  sweepId: string | null
  declineReason: string | null
  defectClass: string
  severity: string | null
  evidence: unknown
  artifactRef: string | null
  status: string
  firstSeenAt: string
  lastSeenAt: string
  resolvedAt: string | null
}>) {
  return {
    id: 'evt-1',
    ts: '2026-08-01T00:00:00.000Z',
    fips: '48021',
    rowId: 'Elgin',
    parcelNodeId: null,
    sourceKind: 'preflight',
    railOrCheck: 'railASourceReachable',
    checkId: null,
    sweepId: null,
    declineReason: 'no Rail A layer wired',
    defectClass: 'ADAPTER-NEEDED',
    severity: null,
    evidence: null,
    artifactRef: null,
    status: 'open',
    firstSeenAt: '2026-08-01T00:00:00.000Z',
    lastSeenAt: '2026-08-01T00:00:00.000Z',
    resolvedAt: null,
    ...overrides,
  }
}

/** Opens the (only) focused-fix `<details>` on the page by firing `toggle`
 *  directly — jsdom doesn't run native `<details>` disclosure triggers from
 *  a plain click, so the component's onToggle handler is driven this way. */
function openFocusedFixDetails(container: HTMLElement) {
  const summary = within(container).getByText('3')
  const details = summary.closest('details')
  if (!details) throw new Error('focused-fix <details> not found')
  Object.defineProperty(details, 'open', { value: true, writable: true, configurable: true })
  fireEvent(details, new Event('toggle', { bubbles: false }))
  return details
}

describe('CountyLedger — focused-fix expand', () => {
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

  it('does not fetch events until the row is expanded', async () => {
    mockGetJson.mockResolvedValue({ ok: true, status: 200, json: ONE_ROW_LEDGER_PAYLOAD })

    render(<CountyLedger />)
    await waitFor(() => expect(screen.getByText('County Ledger')).toBeInTheDocument())

    // Only the county-ledger call has fired — no /events call yet.
    expect(mockGetJson).toHaveBeenCalledTimes(1)
    expect(mockGetJson).toHaveBeenCalledWith(
      expect.stringContaining('/api/county-ledger'),
      expect.anything(),
      expect.anything(),
    )
  })

  it('expanding the row lazily fetches and renders events grouped by defectClass', async () => {
    mockGetJson.mockImplementation(async (url: string) => {
      if (url.includes('/api/county-ledger')) {
        return { ok: true, status: 200, json: ONE_ROW_LEDGER_PAYLOAD }
      }
      if (url.includes('/api/onboarding-ledger/events')) {
        return {
          ok: true,
          status: 200,
          json: {
            rowId: 'Elgin',
            total: 3,
            limit: 50,
            offset: 0,
            events: [
              mkEvent({ id: 'evt-1', defectClass: 'ADAPTER-NEEDED', parcelNodeId: '48021:100' }),
              mkEvent({ id: 'evt-2', defectClass: 'ADAPTER-NEEDED', parcelNodeId: '48021:101' }),
              mkEvent({ id: 'evt-3', defectClass: 'BLOCK13-QUARANTINE', checkId: 'block13', declineReason: null }),
            ],
          },
        }
      }
      return { ok: false, status: 404, json: null, error: 'unexpected url' }
    })

    const { container } = render(<CountyLedger />)
    await waitFor(() => expect(screen.getByText('County Ledger')).toBeInTheDocument())

    openFocusedFixDetails(container)

    await waitFor(() => {
      expect(mockGetJson).toHaveBeenCalledWith(
        expect.stringContaining('/api/onboarding-ledger/events'),
        expect.anything(),
        expect.anything(),
      )
    })

    const eventsCall = mockGetJson.mock.calls.find((c) => (c[0] as string).includes('/api/onboarding-ledger/events'))
    expect(eventsCall?.[0]).toContain('rowId=Elgin')
    expect(eventsCall?.[0]).toContain('status=open')
    expect(eventsCall?.[0]).toContain('limit=50')
    expect(eventsCall?.[0]).toContain('offset=0')

    await waitFor(() => {
      expect(screen.getByText('ADAPTER-NEEDED')).toBeInTheDocument()
    })
    expect(screen.getByText('BLOCK13-QUARANTINE')).toBeInTheDocument()
    expect(screen.getByText('48021:100')).toBeInTheDocument()
    expect(screen.getByText('48021:101')).toBeInTheDocument()
    expect(screen.getByText('block13')).toBeInTheDocument()
    expect(screen.getByText('1-3 of 3')).toBeInTheDocument()
  })

  it('shows an honest "no open findings" empty state, not an error, when the page comes back empty', async () => {
    mockGetJson.mockImplementation(async (url: string) => {
      if (url.includes('/api/county-ledger')) {
        return { ok: true, status: 200, json: ONE_ROW_LEDGER_PAYLOAD }
      }
      if (url.includes('/api/onboarding-ledger/events')) {
        return { ok: true, status: 200, json: { rowId: 'Elgin', total: 0, limit: 50, offset: 0, events: [] } }
      }
      return { ok: false, status: 404, json: null, error: 'unexpected url' }
    })

    const { container } = render(<CountyLedger />)
    await waitFor(() => expect(screen.getByText('County Ledger')).toBeInTheDocument())

    openFocusedFixDetails(container)

    await waitFor(() => {
      expect(screen.getByText('no open findings')).toBeInTheDocument()
    })
  })

  it('shows "failed to load: <reason>", not a silent blank, on a fetch error', async () => {
    mockGetJson.mockImplementation(async (url: string) => {
      if (url.includes('/api/county-ledger')) {
        return { ok: true, status: 200, json: ONE_ROW_LEDGER_PAYLOAD }
      }
      if (url.includes('/api/onboarding-ledger/events')) {
        return { ok: false, status: 500, json: null, error: 'onboarding_ledger_events_read_failed' }
      }
      return { ok: false, status: 404, json: null, error: 'unexpected url' }
    })

    const { container } = render(<CountyLedger />)
    await waitFor(() => expect(screen.getByText('County Ledger')).toBeInTheDocument())

    openFocusedFixDetails(container)

    await waitFor(() => {
      expect(screen.getByText(/failed to load: onboarding_ledger_events_read_failed/)).toBeInTheDocument()
    })
  })

  it('paginates: the next-page control fetches offset=50 and is absent once every event is on the page', async () => {
    const page0 = {
      rowId: 'Elgin',
      total: 60,
      limit: 50,
      offset: 0,
      events: Array.from({ length: 50 }, (_, i) =>
        mkEvent({ id: `evt-${i}`, defectClass: 'ADAPTER-NEEDED', parcelNodeId: `48021:${i}` }),
      ),
    }
    const page1 = {
      rowId: 'Elgin',
      total: 60,
      limit: 50,
      offset: 50,
      events: Array.from({ length: 10 }, (_, i) =>
        mkEvent({ id: `evt-${50 + i}`, defectClass: 'ADAPTER-NEEDED', parcelNodeId: `48021:${50 + i}` }),
      ),
    }
    mockGetJson.mockImplementation(async (url: string) => {
      if (url.includes('/api/county-ledger')) {
        return { ok: true, status: 200, json: ONE_ROW_LEDGER_PAYLOAD }
      }
      if (url.includes('/api/onboarding-ledger/events')) {
        return { ok: true, status: 200, json: url.includes('offset=50') ? page1 : page0 }
      }
      return { ok: false, status: 404, json: null, error: 'unexpected url' }
    })

    const { container } = render(<CountyLedger />)
    await waitFor(() => expect(screen.getByText('County Ledger')).toBeInTheDocument())

    openFocusedFixDetails(container)

    await waitFor(() => {
      expect(screen.getByText('1-50 of 60')).toBeInTheDocument()
    })
    // hasNextPage: offset(0) + events.length(50) < total(60) -> next control present.
    const nextBtn = screen.getByText('next →')
    expect(nextBtn).toBeInTheDocument()
    expect(screen.queryByText('← prev')).not.toBeInTheDocument()

    fireEvent.click(nextBtn)

    await waitFor(() => {
      expect(screen.getByText('51-60 of 60')).toBeInTheDocument()
    })
    // hasNextPage: offset(50) + events.length(10) == total(60) -> no further page.
    expect(screen.queryByText('next →')).not.toBeInTheDocument()
    expect(screen.getByText('← prev')).toBeInTheDocument()

    const eventsCalls = mockGetJson.mock.calls.filter((c) => (c[0] as string).includes('/api/onboarding-ledger/events'))
    expect(eventsCalls.some((c) => (c[0] as string).includes('offset=0'))).toBe(true)
    expect(eventsCalls.some((c) => (c[0] as string).includes('offset=50'))).toBe(true)
  })
})
