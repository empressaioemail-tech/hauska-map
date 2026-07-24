// apps/command-center/src/admin/workspace/tiles/ParcelTerrainTile.test.tsx
//
// Component tests for the Parcel Terrain Model tile (WDLL item 8):
//   - calls refresh_parcel_terrain_export with parcel_node_id + format,
//   - works without an engagement when parcel id is entered,
//   - renders quality-gate signals and download links,
//   - shows honest unknown-parcel and error states.

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

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

vi.mock('@empressaio/cortex-tiles', () => ({
  TileErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

let engagement: { engagementId: string | null; activeParcel: Record<string, unknown> }
vi.mock('@empressaio/tile-shell', () => ({
  useEngagement: () => engagement,
}))

import { ParcelTerrainTile, defaultParcelNodeId } from './ParcelTerrainTile'

const PARCEL_ID = '48021:27303'

const READY_ENVELOPE = {
  data: {
    parcelNodeId: PARCEL_ID,
    atom: {
      sourceCitation: 'USGS 3DEP',
      accessPolicy: 'public-paid',
      coverage: { coverageFraction: 1, resolutionMetersRequested: 1 },
      confidence: {
        value: 0.6,
        kind: 'asserted',
        provenance: 'USGS 3DEP DEM field; calibration pending',
        n: 0,
        intervalWidth: 1,
      },
    },
    artifacts: {
      glb: {
        format: 'glb',
        ref: 'gcs://hauska-prod-497015-terrain-exports/terrain/48021_27303/glb/e6fe2195',
        byteCount: 35528,
        vertexCount: 1012,
        triangleCount: 1890,
      },
      ifc: {
        format: 'ifc',
        ref: 'gcs://hauska-prod-497015-terrain-exports/terrain/48021_27303/ifc/e6fe2195',
        byteCount: 85193,
        vertexCount: 1012,
        triangleCount: 1890,
      },
      'dxf-3dface': {
        format: 'dxf-3dface',
        ref: 'gcs://hauska-prod-497015-terrain-exports/terrain/48021_27303/dxf-3dface/e6fe2195',
        byteCount: 520057,
        vertexCount: 1012,
        triangleCount: 1890,
      },
      'dxf-contour': {
        format: 'dxf-contour',
        ref: 'gcs://hauska-prod-497015-terrain-exports/terrain/48021_27303/dxf-contour/e6fe2195',
        byteCount: 63959,
        contourPolylineCount: 26,
      },
      'landxml-tin': {
        format: 'landxml-tin',
        ref: 'deferred:landxml-tin',
        deferred: true,
        deferredReason:
          'LandXML TIN writer is deferred; this phase ships the shared mesh and required GLB/IFC/DXF emitters without inventing a second TIN triangulation.',
      },
    },
    download: {
      format: 'glb',
      contentType: 'model/gltf-binary',
      base64: btoa('glTF'),
      byteCount: 4,
    },
  },
  meta: {
    note: 'Source: USGS 3DEP. One SDK meter consumed per export request.',
  },
}

beforeEach(() => {
  callTool.mockReset()
  engagement = { engagementId: null, activeParcel: {} }
})

describe('defaultParcelNodeId', () => {
  it('reads parcel_node_id from active context', () => {
    expect(defaultParcelNodeId({ parcel_node_id: '48021:27303' })).toBe('48021:27303')
  })

  it('derives county_fips:prop_id from fips + apn', () => {
    expect(defaultParcelNodeId({ county_fips: '48021', apn: '27303' })).toBe('48021:27303')
  })
})

describe('ParcelTerrainTile', () => {
  async function refreshWith(id = PARCEL_ID) {
    render(<ParcelTerrainTile />)
    fireEvent.change(screen.getByTestId('terrain-parcel-id-input'), { target: { value: id } })
    fireEvent.click(screen.getByTestId('terrain-refresh'))
  }

  it('calls refresh_parcel_terrain_export with parcel_node_id and format (no engagement)', async () => {
    callTool.mockResolvedValue(READY_ENVELOPE)
    await refreshWith()

    await waitFor(() => expect(callTool).toHaveBeenCalledTimes(1))
    expect(callTool).toHaveBeenCalledWith('refresh_parcel_terrain_export', {
      parcel_node_id: PARCEL_ID,
      format: 'glb',
    })
  })

  it('defaults parcel id from active context when available', async () => {
    engagement = {
      engagementId: 'eng-1',
      activeParcel: { parcel_node_id: '48021:27303' },
    }
    callTool.mockResolvedValue(READY_ENVELOPE)
    render(<ParcelTerrainTile />)

    expect(screen.getByTestId('terrain-parcel-id-input')).toHaveValue('48021:27303')
  })

  it('renders artifact availability, download link, and quality-gate signals', async () => {
    callTool.mockResolvedValue(READY_ENVELOPE)
    await refreshWith()

    await screen.findByTestId('terrain-quality-signals')
    expect(screen.getByTestId('terrain-format-glb-availability')).toHaveTextContent('available')
    expect(screen.getByTestId('terrain-format-landxml-tin-availability')).toHaveTextContent('deferred')
    expect(screen.getByTestId('terrain-source-citation')).toHaveTextContent('USGS 3DEP')
    expect(screen.getByTestId('terrain-confidence')).toHaveTextContent('0.60')
    expect(screen.getByTestId('terrain-confidence')).toHaveTextContent('USGS 3DEP DEM field')
    expect(screen.getByTestId('terrain-coverage')).toHaveTextContent('100.0%')
    expect(screen.getByTestId('terrain-dem-resolution')).toHaveTextContent('1 m')
    expect(screen.getByTestId('terrain-download')).toBeInTheDocument()
  })

  it('never renders a bare confidence number without a provenance qualifier', async () => {
    callTool.mockResolvedValue(READY_ENVELOPE)
    await refreshWith()

    const conf = await screen.findByTestId('terrain-confidence')
    expect(conf.textContent?.trim()).not.toBe('0.60')
    expect(conf.textContent).toMatch(/0\.60\s*\(/)
  })

  it('forwards the selected format to the MCP tool', async () => {
    callTool.mockResolvedValue(READY_ENVELOPE)
    render(<ParcelTerrainTile />)
    fireEvent.change(screen.getByTestId('terrain-parcel-id-input'), { target: { value: PARCEL_ID } })
    fireEvent.click(screen.getByLabelText('IFC4'))
    fireEvent.click(screen.getByTestId('terrain-refresh'))

    await waitFor(() => expect(callTool).toHaveBeenCalledTimes(1))
    expect(callTool).toHaveBeenCalledWith('refresh_parcel_terrain_export', {
      parcel_node_id: PARCEL_ID,
      format: 'ifc',
    })
  })

  it('shows landxml-tin as disabled with honest defer reason', () => {
    render(<ParcelTerrainTile />)
    const landxml = screen.getByTestId('terrain-format-option-landxml-tin').querySelector('input')
    expect(landxml).toBeDisabled()
    expect(screen.getByTestId('terrain-format-option-landxml-tin')).toHaveAttribute('title')
  })

  it('shows honest unknown-parcel state for missing ids', async () => {
    callTool.mockRejectedValue(new Error('HTTP 404: parcel not found for 99999:1'))
    await refreshWith('99999:1')

    const miss = await screen.findByTestId('terrain-unknown-parcel')
    expect(miss).toHaveTextContent('Parcel not found')
    expect(miss).toHaveTextContent('99999:1')
  })

  it('does not auto-call the tool before refresh is clicked', async () => {
    callTool.mockResolvedValue(READY_ENVELOPE)
    engagement = {
      engagementId: null,
      activeParcel: { parcel_node_id: PARCEL_ID },
    }
    render(<ParcelTerrainTile />)

    expect(screen.getByTestId('terrain-parcel-id-input')).toHaveValue(PARCEL_ID)
    expect(callTool).not.toHaveBeenCalled()
  })

  it('surfaces a named error when the tool call fails', async () => {
    callTool.mockRejectedValue(new Error('MCP HTTP 401: unauthorized'))
    await refreshWith()

    const err = await screen.findByTestId('terrain-error')
    expect(err).toHaveTextContent('Terrain export failed')
    expect(err).toHaveTextContent('MCP HTTP 401: unauthorized')
    expect(err).toHaveAttribute('role', 'alert')
  })
})
