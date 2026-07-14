// apps/command-center/src/admin/workspace/tiles/ReportTile.test.tsx
//
// Generic parameterized report tile: honest missing-context states (select a
// case / needs a geocoded parcel / needs a jurisdiction), the report-read
// pattern (getReport on mount), the Run flow for engagement-scoped engines
// (runReport → getReport via ReportTileShell), the read-only rendering for
// code-engine capabilities, and the honest "no report endpoint" state for the
// cortex SPA-fallthrough (HTML where JSON was expected).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ReportTile } from './ReportTile'

const getReport = vi.fn()
const runReport = vi.fn()
let engagement: { engagementId: string | null; activeParcel: Record<string, unknown> }

vi.mock('@empressaio/cortex-tiles', () => ({
  useCortexClient: () => ({ getReport, runReport }),
  // Minimal shell mirroring the published contract: run button + error +
  // result JSON + empty hint.
  ReportTileShell: ({ label, busy, error, onRun, result, emptyHint, runLabel, quotaBanner }: any) => (
    <div data-testid="report-shell">
      <span>{label}</span>
      {quotaBanner && <span role="status">{quotaBanner}</span>}
      <button type="button" disabled={busy} onClick={onRun}>
        {runLabel ?? 'Run report'}
      </button>
      {error && <div role="alert">{error}</div>}
      {result ? <pre>{JSON.stringify(result)}</pre> : <p>{emptyHint}</p>}
    </div>
  ),
}))

vi.mock('@empressaio/tile-shell', () => ({
  useEngagement: () => engagement,
}))

const parcel = (over: Record<string, unknown> = {}) => ({
  engagementId: null,
  apn: null,
  jurisdiction: null,
  address: null,
  lat: null,
  lng: null,
  ...over,
})

beforeEach(() => {
  getReport.mockReset()
  runReport.mockReset()
  engagement = { engagementId: null, activeParcel: parcel() }
})

const CAP = {
  id: 'calibration',
  label: 'Finding Calibration',
  status: 'partial',
  engine: 'engagement',
  requires: { engagementId: true },
}

describe('ReportTile honest states', () => {
  it('asks for a case when no engagement is selected', () => {
    render(<ReportTile capability={CAP} />)
    expect(screen.getByText('Select a case')).toBeInTheDocument()
    expect(getReport).not.toHaveBeenCalled()
  })

  it('asks for a geocoded parcel when the capability requires an APN', async () => {
    engagement = { engagementId: 'eng-1', activeParcel: parcel() }
    getReport.mockResolvedValue({ status: 'not-run' })
    render(
      <ReportTile
        capability={{ ...CAP, id: 'avm', label: 'AVM', requires: { apn: true } }}
      />,
    )
    expect(await screen.findByText('Needs a geocoded parcel')).toBeInTheDocument()
  })

  it('asks for a jurisdiction when required and missing', async () => {
    engagement = { engagementId: 'eng-1', activeParcel: parcel({ apn: 'R12345' }) }
    getReport.mockResolvedValue({ status: 'not-run' })
    render(
      <ReportTile
        capability={{
          ...CAP,
          id: 'precedence',
          label: 'Precedence',
          engine: 'code',
          requires: { jurisdiction: true },
        }}
      />,
    )
    expect(await screen.findByText('Needs a jurisdiction')).toBeInTheDocument()
  })

  it('renders the honest no-endpoint state on the SPA fallthrough', async () => {
    engagement = { engagementId: 'eng-1', activeParcel: parcel() }
    getReport.mockRejectedValue(
      new SyntaxError(`Unexpected token '<', "<!doctype "... is not valid JSON`),
    )
    render(<ReportTile capability={{ ...CAP, requires: {} }} />)
    expect(await screen.findByText('No report endpoint')).toBeInTheDocument()
    expect(screen.getByText(/capability status: partial/)).toBeInTheDocument()
  })
})

describe('ReportTile report read + run', () => {
  it('reads the report on mount and shows the result payload', async () => {
    engagement = { engagementId: 'eng-1', activeParcel: parcel() }
    getReport.mockResolvedValue({ status: 'ok', result: { score: 0.91 } })
    render(<ReportTile capability={{ ...CAP, requires: {} }} />)
    expect(await screen.findByText(/"score":0.91/)).toBeInTheDocument()
    expect(getReport).toHaveBeenCalledWith('eng-1', 'calibration')
    // partial capability status is surfaced, not hidden
    expect(screen.getByRole('status').textContent).toContain('PARTIAL')
  })

  it('runs an engagement-scoped report and re-reads', async () => {
    engagement = { engagementId: 'eng-1', activeParcel: parcel() }
    getReport.mockResolvedValueOnce({ status: 'not-run' })
    runReport.mockResolvedValue({ generationId: 'g-1' })
    getReport.mockResolvedValueOnce({ status: 'ok', result: { rows: 3 } })

    render(<ReportTile capability={{ ...CAP, requires: {} }} />)
    expect(await screen.findByText(/has not run/)).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Run Finding Calibration' }))
    })
    expect(runReport).toHaveBeenCalledWith('eng-1', 'calibration')
    expect(await screen.findByText(/"rows":3/)).toBeInTheDocument()
  })

  it('surfaces report errors honestly', async () => {
    engagement = { engagementId: 'eng-1', activeParcel: parcel() }
    getReport.mockResolvedValue({ status: 'error', error: 'geocode_miss' })
    render(<ReportTile capability={{ ...CAP, requires: {} }} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('geocode_miss')
  })

  it('renders read-only status (no run button) for code-engine capabilities', async () => {
    engagement = {
      engagementId: 'eng-1',
      activeParcel: parcel({ jurisdiction: 'bastrop_tx' }),
    }
    getReport.mockResolvedValue({ status: 'not-run' })
    render(
      <ReportTile
        capability={{
          id: 'icc-ingest',
          label: 'ICC Code Connect Ingest',
          status: 'partial',
          engine: 'code',
          requires: { jurisdiction: true },
        }}
      />,
    )
    expect(await screen.findByText('not-run')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText(/read-only here/)).toBeInTheDocument()
  })
})
