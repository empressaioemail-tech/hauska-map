/**
 * Spine Health panel smoke — ports Control Tower shell; uses shared atomTrace client.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, waitFor } from '@testing-library/react'

vi.mock('../../api/spineClient', () => ({
  loadConfig: () => ({
    retrievalApiUrl: '/api/spine/retrieval',
    cortexApiUrl: '/api/spine/cortex',
    mcpUrl: '/api/spine/mcp',
  }),
}))

const fetchSpineHealthSummary = vi.fn()
const runSpineHealthPack = vi.fn()

vi.mock('../../api/atomTrace', () => ({
  fetchSpineHealthSummary: (...args: unknown[]) => fetchSpineHealthSummary(...args),
  runSpineHealthPack: (...args: unknown[]) => runSpineHealthPack(...args),
}))

import { SpineHealth } from './SpineHealth'

describe('SpineHealth panel (COMPLETE-BASTROP B1)', () => {
  beforeEach(() => {
    fetchSpineHealthSummary.mockReset()
    runSpineHealthPack.mockReset()
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders board from shared fetchSpineHealthSummary (not raw fetch)', async () => {
    fetchSpineHealthSummary.mockResolvedValue({
      ok: true,
      status: 200,
      json: {
        pack: 'bastrop',
        source: 'test',
        alertCount: 1,
        generatedAt: '2026-07-27T15:00:00.000Z',
        rows: [
          {
            probeId: 'zoning-agol:bastrop-city-tx',
            kind: 'source',
            pack: 'bastrop',
            status: 'dead',
            alert: true,
            currentValue: 0,
            baselineValue: 574,
            signal: {},
          },
          {
            probeId: 'bastrop-tx:zoning',
            kind: 'source',
            pack: 'bastrop',
            status: 'dead-expected',
            alert: false,
            currentValue: 0,
            baselineValue: 0,
            signal: {},
          },
        ],
      },
    })

    render(<SpineHealth />)
    await waitFor(() => {
      expect(screen.getByTestId('spine-health-board')).toBeTruthy()
    })
    expect(screen.getByTestId('spine-health-row-zoning-agol:bastrop-city-tx')).toBeTruthy()
    expect(screen.getByTestId('spine-health-alerts')).toBeTruthy()
    expect(screen.getAllByText(/ALERT/).length).toBeGreaterThanOrEqual(1)
    expect(fetchSpineHealthSummary).toHaveBeenCalled()
  })

  it('source file imports atomTrace client (one read path)', () => {
    const src = readFileSync(resolve(import.meta.dirname, 'SpineHealth.tsx'), 'utf8')
    expect(src).toMatch(/from ['"].*atomTrace['"]/)
    expect(src).toMatch(/fetchSpineHealthSummary/)
    expect(src.includes("fetch('/api/spine/retrieval/health/spine")).toBe(false)
    expect(src.includes('fetch(`/api/spine/retrieval/health/spine')).toBe(false)
  })
})
