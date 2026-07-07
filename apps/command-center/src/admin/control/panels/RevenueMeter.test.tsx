// apps/command-center/src/admin/control/panels/RevenueMeter.test.tsx
//
// Revenue Meter panel tests: render with fixture data, error state, and the
// unbilled warning when Stripe key not mounted (billed=0, unbilled>0).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { RevenueMeter } from './RevenueMeter'
import type { MeteringResult } from '../../api/spineClient'

// Mock the spineClient
vi.mock('../../api/spineClient')

import * as spineClientModule from '../../api/spineClient'

describe('RevenueMeter', () => {
  const mockFetchMeteringSummary = vi.mocked(spineClientModule.fetchMeteringSummary)
  const mockLoadConfig = vi.mocked(spineClientModule.loadConfig)
  
  mockLoadConfig.mockReturnValue({
    cortexApiUrl: '/api/spine/cortex',
    mcpUrl: '/api/spine/mcp',
    retrievalApiUrl: '/api/spine/retrieval',
    hauskaKey: '',
    installId: 'test',
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render with fixture data', async () => {
    const fixtureData: MeteringResult = {
      status: 'ok',
      summary: {
        windowDays: 7,
        totals: {
          layer2Calls: 12500,
          billed: 10000,
          unbilled: 2500,
        },
        days: [
          { date: '2026-07-01', layer2Calls: 1800, byProduct: { map: 1000, reporting: 800 }, byTool: { search_atoms: 1500 } },
          { date: '2026-07-02', layer2Calls: 1900, byProduct: { map: 1100, codex: 800 }, byTool: { list_tools: 1600 } },
          { date: '2026-07-03', layer2Calls: 1750, byProduct: { reporting: 1000, codex: 750 }, byTool: { search_atoms: 1400 } },
          { date: '2026-07-04', layer2Calls: 1850, byProduct: { map: 1200, reporting: 650 }, byTool: { call_tool: 1500 } },
          { date: '2026-07-05', layer2Calls: 1700, byProduct: { codex: 1000, map: 700 }, byTool: { search_atoms: 1300 } },
          { date: '2026-07-06', layer2Calls: 1800, byProduct: { reporting: 1100, codex: 700 }, byTool: { list_tools: 1400 } },
          { date: '2026-07-07', layer2Calls: 1700, byProduct: { map: 900, reporting: 800 }, byTool: { search_atoms: 1200 } },
        ],
      },
    }

    mockFetchMeteringSummary.mockResolvedValue(fixtureData)

    render(<RevenueMeter />)

    await waitFor(() => {
      expect(screen.getByText('Revenue Meter')).toBeInTheDocument()
    })

    // Check totals
    expect(screen.getByText(/Layer-2 calls:/)).toBeInTheDocument()
    expect(screen.getByText('12,500')).toBeInTheDocument()
    expect(screen.getByText(/Billed:/)).toBeInTheDocument()
    expect(screen.getByText('10,000')).toBeInTheDocument()
    expect(screen.getByText(/Unbilled:/)).toBeInTheDocument()
    expect(screen.getByText('2,500')).toBeInTheDocument()

    // Check section headers
    expect(screen.getByText('Totals · 7d window')).toBeInTheDocument()
    expect(screen.getByText('Per-day volume')).toBeInTheDocument()
    expect(screen.getByText('By Product')).toBeInTheDocument()
    expect(screen.getByText('Top 5 Tools')).toBeInTheDocument()
  })

  it('should render error state', async () => {
    const errorResult: MeteringResult = {
      status: 'error',
      message: 'MCP metering endpoint unreachable',
      httpStatus: 503,
    }

    mockFetchMeteringSummary.mockResolvedValue(errorResult)

    render(<RevenueMeter />)

    await waitFor(() => {
      expect(screen.getByText(/Couldn't load/)).toBeInTheDocument()
    })

    expect(screen.getByText(/MCP metering endpoint unreachable/)).toBeInTheDocument()
  })

  it('should show unbilled warning when Stripe key not mounted', async () => {
    const unbilledData: MeteringResult = {
      status: 'ok',
      summary: {
        windowDays: 7,
        totals: {
          layer2Calls: 5000,
          billed: 0,
          unbilled: 5000,
        },
        days: [
          { date: '2026-07-01', layer2Calls: 700, byProduct: { map: 400, reporting: 300 }, byTool: { search_atoms: 500 } },
          { date: '2026-07-02', layer2Calls: 750, byProduct: { reporting: 450, codex: 300 }, byTool: { list_tools: 600 } },
          { date: '2026-07-03', layer2Calls: 720, byProduct: { map: 420, codex: 300 }, byTool: { search_atoms: 550 } },
          { date: '2026-07-04', layer2Calls: 710, byProduct: { reporting: 410, map: 300 }, byTool: { call_tool: 520 } },
          { date: '2026-07-05', layer2Calls: 730, byProduct: { codex: 430, reporting: 300 }, byTool: { search_atoms: 540 } },
          { date: '2026-07-06', layer2Calls: 720, byProduct: { map: 420, codex: 300 }, byTool: { list_tools: 530 } },
          { date: '2026-07-07', layer2Calls: 670, byProduct: { reporting: 370, map: 300 }, byTool: { search_atoms: 480 } },
        ],
      },
    }

    mockFetchMeteringSummary.mockResolvedValue(unbilledData)

    render(<RevenueMeter />)

    await waitFor(() => {
      expect(screen.getAllByText(/Unbilled:/)).toHaveLength(2)
    })

    // Check for the warning pill
    expect(screen.getByText(/stripe key missing/i)).toBeInTheDocument()

    // Check for the warning banner
    expect(screen.getByText(/Stripe key not mounted/i)).toBeInTheDocument()
    expect(screen.getByText(/All 5,000 calls are unbilled/i)).toBeInTheDocument()
  })

  it('should render loading state initially', () => {
    mockFetchMeteringSummary.mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    render(<RevenueMeter />)

    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('should render day selector buttons', async () => {
    const fixtureData: MeteringResult = {
      status: 'ok',
      summary: {
        windowDays: 7,
        totals: { layer2Calls: 1000, billed: 1000, unbilled: 0 },
        days: [
          { date: '2026-07-07', layer2Calls: 1000, byProduct: { map: 1000 }, byTool: { search_atoms: 1000 } },
        ],
      },
    }

    mockFetchMeteringSummary.mockResolvedValue(fixtureData)

    render(<RevenueMeter />)

    await waitFor(() => {
      expect(screen.getByText('Revenue Meter')).toBeInTheDocument()
    })

    // Check for day selector buttons
    expect(screen.getByRole('button', { name: '7d' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '14d' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '30d' })).toBeInTheDocument()
  })
})
