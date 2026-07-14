// apps/command-center/src/admin/workspace/tiles/LiveMapTile.test.tsx
//
// Component tests for the live Map tile: the viewport loader (bbox →
// gis-layer fetch → overlays render call), the parcel click → info card +
// deep-link actions, the fixture default-OFF / FIXTURE-label rule, and the
// honest error / no-coverage states (never a silent fixture fallback).

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import { EngagementProvider, SpatialProvider } from '@empressaio/tile-shell'
import { PanelProvider } from '../../control/center/useActivePanel'
import { LIVE_PARCELS_KEY, LIVE_FEMA_KEY } from './liveGis'

// ── mocks ──────────────────────────────────────────────────────────────
const { floatingMapProps } = vi.hoisted(() => ({
  floatingMapProps: [] as Array<Record<string, any>>,
}))

vi.mock('@hauska/map-renderer', () => ({
  FloatingMap: (props: Record<string, any>) => {
    floatingMapProps.push(props)
    return <div data-testid="floating-map-stub" data-usefixture={String(props.useFixture)} />
  },
}))
vi.mock('@hauska/map-renderer/styles.css', () => ({}))
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}))
// tile-shell's dist entry imports this css; node's ESM loader (externalized
// deps) can't load .css, so stub it before importing the providers.
vi.mock('@empressaio/design-tokens/tokens.css', () => ({}))

vi.mock('@empressaio/cortex-tiles', () => ({
  PropertyBriefTile: () => <div data-testid="brief-card-stub" />,
  TileErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

import { LiveMapTile } from './LiveMapTile'

const latestMapProps = () => floatingMapProps[floatingMapProps.length - 1]

const SAN_MARCOS_VIEWPORT = {
  bbox: { west: -97.934, south: 29.865, east: -97.92, north: 29.876 },
  zoom: 15.2,
}

const PARCELS_ENVELOPE = {
  layer: 'parcels',
  provider: 'Hays County parcels (TxGIO/StratMap)',
  featureCount: 1,
  truncated: false,
  notSurveyGrade: true,
  geojson: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [0, 0]]] },
        properties: { apn: '12311', situsAddress: '600 CAPE RD, SAN MARCOS, TX 78666' },
      },
    ],
  },
}

const FEMA_ENVELOPE = {
  layer: 'fema',
  provider: 'FEMA NFHL',
  featureCount: 1,
  truncated: false,
  geojson: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [0, 0]]] },
        properties: { FLD_ZONE: 'AO' },
      },
    ],
  },
}

function mockFetchByLayer(handlers: Record<string, () => Response | Promise<Response>>) {
  const fn = vi.fn(async (_url: string, init?: RequestInit) => {
    const { layer } = JSON.parse(String(init?.body ?? '{}'))
    const handler = handlers[layer]
    if (!handler) throw new Error(`unexpected layer ${layer}`)
    return handler()
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

function renderTile() {
  return render(
    <EngagementProvider>
      <SpatialProvider>
        <PanelProvider>
          <LiveMapTile />
        </PanelProvider>
      </SpatialProvider>
    </EngagementProvider>,
  )
}

beforeEach(() => {
  floatingMapProps.length = 0
  window.location.hash = ''
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('viewport loader', () => {
  it('fetches parcels + fema for the viewport bbox and passes them to the map as overlays', async () => {
    const fetchMock = mockFetchByLayer({
      parcels: () => new Response(JSON.stringify(PARCELS_ENVELOPE), { status: 200 }),
      fema: () => new Response(JSON.stringify(FEMA_ENVELOPE), { status: 200 }),
    })
    renderTile()

    act(() => latestMapProps().onViewportChange(SAN_MARCOS_VIEWPORT))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse(String(c[1]?.body)))
    expect(bodies).toEqual(
      expect.arrayContaining([
        { layer: 'parcels', bbox: SAN_MARCOS_VIEWPORT.bbox },
        { layer: 'fema', bbox: SAN_MARCOS_VIEWPORT.bbox },
      ]),
    )
    for (const [url] of fetchMock.mock.calls) {
      expect(url).toBe('/api/spine/cortex/api/brokerage/v1/map-data/gis-layer')
    }

    // The render call: overlays reach the map with FEMA below parcels.
    await waitFor(() => {
      const overlays = latestMapProps().overlays
      expect(overlays.map((o: any) => o.layerKey)).toEqual([LIVE_FEMA_KEY, LIVE_PARCELS_KEY])
      expect(overlays[1].geojson.features[0].properties.apn).toBe('12311')
      expect(overlays[1].interactive).toBe(true)
    })
    expect(screen.getByTestId('live-attribution').textContent).toContain(
      'Hays County parcels (TxGIO/StratMap)',
    )
    expect(screen.getByTestId('live-attribution').textContent).toContain('not survey grade')
  })

  it('gates parcels at wide zooms with a zoom-in hint instead of fetching', async () => {
    const fetchMock = mockFetchByLayer({
      fema: () => new Response(JSON.stringify(FEMA_ENVELOPE), { status: 200 }),
    })
    renderTile()

    act(() =>
      latestMapProps().onViewportChange({ bbox: SAN_MARCOS_VIEWPORT.bbox, zoom: 12 }),
    )

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).layer).toBe('fema')
    expect(screen.getByText('Zoom in for parcels')).toBeInTheDocument()
  })

  it('surfaces truncated responses as a chip', async () => {
    mockFetchByLayer({
      parcels: () =>
        new Response(JSON.stringify({ ...PARCELS_ENVELOPE, truncated: true }), { status: 200 }),
      fema: () => new Response(JSON.stringify(FEMA_ENVELOPE), { status: 200 }),
    })
    renderTile()
    act(() => latestMapProps().onViewportChange(SAN_MARCOS_VIEWPORT))
    await waitFor(() =>
      expect(
        screen.getByText('Parcel set truncated — zoom in for full coverage'),
      ).toBeInTheDocument(),
    )
  })
})

describe('error / no-coverage states', () => {
  it('shows an honest empty state on 404 and a NAMED error chip on failure — no fixture fallback', async () => {
    mockFetchByLayer({
      parcels: () =>
        new Response(JSON.stringify({ error: 'not-found', message: 'no coverage' }), {
          status: 404,
        }),
      fema: () =>
        new Response(
          JSON.stringify({ error: 'upstream-error', message: 'NFHL unavailable' }),
          { status: 502 },
        ),
    })
    renderTile()
    act(() => latestMapProps().onViewportChange(SAN_MARCOS_VIEWPORT))

    await waitFor(() => {
      expect(screen.getByText('No parcel coverage for this area')).toBeInTheDocument()
      expect(screen.getByText(/FEMA failed — fema: NFHL unavailable/)).toBeInTheDocument()
    })
    // No live overlays AND no fixture fallback: the map stays honest-empty.
    expect(latestMapProps().overlays).toEqual([])
    expect(latestMapProps().useFixture).toBe(false)
  })
})

describe('fixture labeling rule', () => {
  it('defaults fixture layers OFF and labels them FIXTURE when toggled on', async () => {
    mockFetchByLayer({
      parcels: () => new Response(JSON.stringify(PARCELS_ENVELOPE), { status: 200 }),
      fema: () => new Response(JSON.stringify(FEMA_ENVELOPE), { status: 200 }),
    })
    renderTile()

    // Default OFF, no fixture label.
    expect(latestMapProps().useFixture).toBe(false)
    expect(screen.queryByTestId('fixture-watermark')).not.toBeInTheDocument()

    // Toggled on → map gets useFixture AND a visible FIXTURE watermark.
    fireEvent.click(screen.getByTestId('fixture-toggle'))
    await waitFor(() => expect(latestMapProps().useFixture).toBe(true))
    expect(screen.getByTestId('fixture-watermark').textContent).toBe('FIXTURE')
  })
})

describe('parcel click-through', () => {
  const SELECTION = {
    layerKey: LIVE_PARCELS_KEY,
    lat: 29.87019,
    lng: -97.92754,
    apn: '12311',
    address: '600 CAPE RD, SAN MARCOS, TX 78666',
    properties: {
      layerKey: LIVE_PARCELS_KEY,
      apn: '12311',
      situsAddress: '600 CAPE RD, SAN MARCOS, TX 78666',
      owner: 'TEXAS PARKS & WILDLIFE DEPT',
      countyName: 'Hays',
      countyFips: '48209',
      provider: 'txgio',
      notSurveyGrade: true,
    },
  }

  it('opens the info card with the parcel identity and attribution', async () => {
    mockFetchByLayer({
      parcels: () => new Response(JSON.stringify(PARCELS_ENVELOPE), { status: 200 }),
      fema: () => new Response(JSON.stringify(FEMA_ENVELOPE), { status: 200 }),
    })
    renderTile()

    act(() => latestMapProps().onParcelSelect(SELECTION))

    const card = await screen.findByTestId('parcel-info-card')
    expect(card).toHaveTextContent('600 CAPE RD, SAN MARCOS, TX 78666')
    expect(screen.getByTestId('parcel-card-apn')).toHaveTextContent('12311')
    expect(card).toHaveTextContent('TEXAS PARKS & WILDLIFE DEPT')
    expect(card).toHaveTextContent('Hays County (48209)')
    expect(card).toHaveTextContent('Source: txgio')
    expect(card).toHaveTextContent('not survey grade')
  })

  it('"Run property brief" deep-links to the Property Investor panel', async () => {
    mockFetchByLayer({})
    renderTile()
    act(() => latestMapProps().onParcelSelect(SELECTION))
    fireEvent.click(await screen.findByText('Run property brief'))
    expect(window.location.hash).toContain('panel=lens-investor')
  })

  it('"Site analysis" deep-links to the Site Analysis panel', async () => {
    mockFetchByLayer({})
    renderTile()
    act(() => latestMapProps().onParcelSelect(SELECTION))
    fireEvent.click(await screen.findByText('Site analysis'))
    expect(window.location.hash).toContain('panel=site-analysis')
  })
})
