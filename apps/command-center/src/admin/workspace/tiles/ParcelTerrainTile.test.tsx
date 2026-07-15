// apps/command-center/src/admin/workspace/tiles/ParcelTerrainTile.test.tsx
//
// Component tests for the Parcel Terrain Model tile:
//   - it calls generate_parcel_terrain_model with the active engagement id,
//   - it renders the quality-gate signals (source citation, confidence +
//     provenance, coverage, DEM resolution) when data is present,
//   - it shows the generate-prompt (not an error) on a not-yet-generated
//     response,
//   - it asks for a case when no engagement is selected,
//   - it surfaces a named error on tool failure.
// The spine client is mocked so no network is touched.

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// ── mocks ──────────────────────────────────────────────────────────────
const callTool = vi.fn()

vi.mock('../../api/spineClient', () => ({
  loadConfig: () => ({
    cortexApiUrl: '/api/spine/cortex',
    mcpUrl: '/api/spine/mcp',
    retrievalApiUrl: '/api/spine/retrieval',
    hauskaKey: '',
    installId: 'spine-console-test',
  }),
  HauskaMcpClient: class {
    callTool = callTool
  },
}))

// TileErrorBoundary is a passthrough in tests (same as LiveMapTile.test).
vi.mock('@empressaio/cortex-tiles', () => ({
  TileErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

let engagement: { engagementId: string | null; activeParcel: Record<string, unknown> }
vi.mock('@empressaio/tile-shell', () => ({
  useEngagement: () => engagement,
}))

import { ParcelTerrainTile } from './ParcelTerrainTile'

const ENGAGEMENT_ID = '11111111-1111-4111-8111-111111111111'

const READY_ENVELOPE = {
  data: {
    status: 'ok',
    engagementId: ENGAGEMENT_ID,
    materializableElementId: 'mat-123',
    mesh: {
      available: true,
      ref: 'gs://hauska-terrain/mat-123/terrain.glb',
      metadata: {
        vertexCount: 4096,
        triangleCount: 8100,
        georefOrigin: { epsg: 32614, x: 621000, y: 3350000 },
        byteCount: 254000,
      },
    },
    ifc: {
      available: true,
      ref: 'gs://hauska-terrain/mat-123/terrain.ifc',
      metadata: { ifcSchemaVersion: 'IFC4', byteCount: 512000 },
    },
    coverage: { fraction: 0.92 },
    confidence: { estimate: 0.74, provenance: 'asserted', n: 0, intervalWidth: 1 },
    demResolutionMeters: 1,
    sourceCitation: 'USGS 3DEP (1m lidar)',
  },
  atoms: [{ did: `did:hauska:parcel-terrain-model:mat-123` }],
  meta: {},
}

// Bare-number guard fixture: the tool normalizes a bare upstream number into
// an asserted WidthedConfidence before it reaches the tile, so the confidence
// the surface receives ALWAYS carries a provenance. This fixture is the shape
// the tool's normalizeTerrainConfidence produces from a raw 0.74, and the
// test below asserts the tile never renders a bare "0.74" without a qualifier.
const BARE_NUMBER_NORMALIZED_ENVELOPE = {
  data: {
    ...READY_ENVELOPE.data,
    confidence: { estimate: 0.74, provenance: 'asserted', n: 0, intervalWidth: 1 },
  },
  atoms: READY_ENVELOPE.atoms,
  meta: {},
}

const NOT_GENERATED_ENVELOPE = {
  data: {
    status: 'not-yet-generated',
    engagementId: ENGAGEMENT_ID,
    reason: 'No parcel terrain model materialized for this engagement yet.',
    nextStep:
      'Run site-topography refresh (get_site_topography with refresh=true) to generate the mesh and IFC, then call again.',
  },
  atoms: [],
  meta: { note: 'Run site-topography refresh first.' },
}

beforeEach(() => {
  callTool.mockReset()
  engagement = { engagementId: ENGAGEMENT_ID, activeParcel: {} }
})

describe('ParcelTerrainTile', () => {
  it('calls generate_parcel_terrain_model with the active engagement id', async () => {
    callTool.mockResolvedValue(READY_ENVELOPE)
    render(<ParcelTerrainTile />)

    await waitFor(() => expect(callTool).toHaveBeenCalledTimes(1))
    expect(callTool).toHaveBeenCalledWith('generate_parcel_terrain_model', {
      engagementId: ENGAGEMENT_ID,
    })
  })

  it('renders mesh + IFC availability, metadata, and download refs when present', async () => {
    callTool.mockResolvedValue(READY_ENVELOPE)
    render(<ParcelTerrainTile />)

    await screen.findByTestId('parcel-terrain-tile')
    expect(screen.getByTestId('terrain-mesh-availability')).toHaveTextContent('available')
    expect(screen.getByTestId('terrain-ifc-availability')).toHaveTextContent('available')
    expect(screen.getByTestId('terrain-mesh-download')).toHaveAttribute(
      'href',
      'gs://hauska-terrain/mat-123/terrain.glb',
    )
    expect(screen.getByTestId('terrain-ifc-download')).toHaveAttribute(
      'href',
      'gs://hauska-terrain/mat-123/terrain.ifc',
    )
    // Mesh geometry metadata is surfaced.
    expect(screen.getByTestId('terrain-mesh-row')).toHaveTextContent('4096')
    expect(screen.getByTestId('terrain-mesh-row')).toHaveTextContent('8100')
    // IFC schema version is surfaced.
    expect(screen.getByTestId('terrain-ifc-row')).toHaveTextContent('IFC4')
  })

  it('surfaces the quality-gate signals (source, confidence + provenance, coverage, DEM resolution)', async () => {
    callTool.mockResolvedValue(READY_ENVELOPE)
    render(<ParcelTerrainTile />)

    await screen.findByTestId('terrain-quality-signals')
    expect(screen.getByTestId('terrain-source-citation')).toHaveTextContent('USGS 3DEP (1m lidar)')
    // Confidence estimate AND provenance, never a bare number presented as earned.
    expect(screen.getByTestId('terrain-confidence')).toHaveTextContent('0.74')
    expect(screen.getByTestId('terrain-confidence')).toHaveTextContent('asserted')
    // Coverage fraction rendered as a percentage.
    expect(screen.getByTestId('terrain-coverage')).toHaveTextContent('92.0%')
    // DEM resolution surfaced.
    expect(screen.getByTestId('terrain-dem-resolution')).toHaveTextContent('1 m')
  })

  it('never renders a bare confidence number without a provenance qualifier (commitment 2 guard)', async () => {
    callTool.mockResolvedValue(BARE_NUMBER_NORMALIZED_ENVELOPE)
    render(<ParcelTerrainTile />)

    const conf = await screen.findByTestId('terrain-confidence')
    // The estimate is shown WITH its provenance, never as a bare "0.74".
    expect(conf).toHaveTextContent('0.74')
    expect(conf).toHaveTextContent('asserted')
    expect(conf.textContent).toContain('(asserted)')
    // Guard the exact bad output: the confidence cell must not be a bare number.
    expect(conf.textContent?.trim()).not.toBe('0.74')
    expect(conf.textContent).toMatch(/0\.74\s*\(asserted\)/)
  })

  it('shows the generate-prompt (not an error) on a not-yet-generated response', async () => {
    callTool.mockResolvedValue(NOT_GENERATED_ENVELOPE)
    render(<ParcelTerrainTile />)

    const prompt = await screen.findByTestId('terrain-not-generated')
    expect(prompt).toHaveTextContent('Terrain model not generated yet')
    expect(prompt).toHaveTextContent('site-topography refresh')
    // It is a status prompt, not an error.
    expect(prompt).toHaveAttribute('role', 'status')
    expect(screen.queryByTestId('terrain-error')).not.toBeInTheDocument()
  })

  it('asks for a case when no engagement is selected, and does not call the tool', async () => {
    engagement = { engagementId: null, activeParcel: {} }
    callTool.mockResolvedValue(READY_ENVELOPE)
    render(<ParcelTerrainTile />)

    expect(screen.getByText('Select a case')).toBeInTheDocument()
    expect(callTool).not.toHaveBeenCalled()
  })

  it('surfaces a named error when the tool call fails', async () => {
    callTool.mockRejectedValue(new Error('MCP HTTP 401: unauthorized'))
    render(<ParcelTerrainTile />)

    const err = await screen.findByTestId('terrain-error')
    expect(err).toHaveTextContent('Terrain model failed')
    expect(err).toHaveTextContent('MCP HTTP 401: unauthorized')
    expect(err).toHaveAttribute('role', 'alert')
  })
})
