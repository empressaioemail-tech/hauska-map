// apps/command-center/src/admin/control/panels/ParcelTrace.test.tsx
//
// Resolve-flow tests for the Parcel Trace panel (mocked fetch). The resolve
// step must ride the endpoints that exist on deployed cortex:
//   POST /api/plan-review/geocode  (address in the body → placeKey)
//   GET  /api/brokerage/v1/place/:placeKey/atoms
// — never the old GET /api/brokerage/v1/place/resolve (SPA fallthrough, and
// it never sent the address). Geocode misses and empty atom lists render
// honest states; the trace half (retrieval /atoms/trace/:did) is unchanged.

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { ParcelTrace } from './ParcelTrace'

const DEFAULT_ADDRESS = '1101 Colorado St, Austin, TX 78701'
const PLACE_KEY = 'coord:29.88408:-97.93273'

type MockRoute = { ok: boolean; status: number; body: unknown }

function jsonResponse({ ok, status, body }: MockRoute) {
  return { ok, status, json: async () => body, headers: { get: () => null }, text: async () => JSON.stringify(body) }
}

let fetchMock: ReturnType<typeof vi.fn>

function installFetch(routes: Array<{ match: (url: string, init?: RequestInit) => boolean; res: MockRoute }>) {
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const route = routes.find((r) => r.match(String(url), init))
    if (!route) throw new Error(`unmocked fetch: ${init?.method || 'GET'} ${url}`)
    return jsonResponse(route.res)
  })
  vi.stubGlobal('fetch', fetchMock)
}

const geocodeHit = {
  match: (url: string, init?: RequestInit) => url.endsWith('/api/plan-review/geocode') && init?.method === 'POST',
  res: {
    ok: true,
    status: 200,
    body: {
      placeKey: PLACE_KEY,
      apn: null,
      jurisdiction: null,
      address: DEFAULT_ADDRESS,
      lat: 29.88408,
      lng: -97.93273,
      city: 'Austin',
      state: 'Texas',
      confidence: 'high',
    },
  },
}

const atomsUrl = `/api/spine/cortex/api/brokerage/v1/place/${encodeURIComponent(PLACE_KEY)}/atoms`

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ParcelTrace resolve flow', () => {
  it('resolves via POST plan-review/geocode (address in body) then GETs place atoms', async () => {
    installFetch([
      geocodeHit,
      {
        match: (url) => url.includes('/place/') && url.endsWith('/atoms'),
        res: {
          ok: true,
          status: 200,
          body: {
            placeKey: PLACE_KEY,
            jurisdictionKey: 'bastrop_tx',
            atomCount: 1,
            atoms: [{ atomDid: 'did:atom:test-1', family: 'code-section', title: 'Setbacks' }],
          },
        },
      },
    ])

    render(<ParcelTrace />)

    await waitFor(() => expect(screen.getByText(`placeKey: ${PLACE_KEY}`)).toBeInTheDocument())

    // Call 1: POST geocode with the address in the JSON body
    const [geoUrl, geoInit] = fetchMock.mock.calls[0]
    expect(String(geoUrl)).toBe('/api/spine/cortex/api/plan-review/geocode')
    expect(geoInit?.method).toBe('POST')
    expect(JSON.parse(String(geoInit?.body))).toEqual({ address: DEFAULT_ADDRESS })

    // Call 2: GET the real place-atoms route with the URL-encoded placeKey
    const [atomsCallUrl, atomsInit] = fetchMock.mock.calls[1]
    expect(String(atomsCallUrl)).toBe(atomsUrl)
    expect(atomsInit?.method ?? 'GET').not.toBe('POST')

    // Atoms render
    expect(screen.getByText('did:atom:test-1')).toBeInTheDocument()
    // The old nonexistent resolve path is never called
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('place/resolve'))).toBe(false)
  })

  it('traces a clicked atom via retrieval /atoms/trace/:did (unchanged half)', async () => {
    installFetch([
      geocodeHit,
      {
        match: (url) => url.includes('/place/') && url.endsWith('/atoms'),
        res: {
          ok: true,
          status: 200,
          body: { placeKey: PLACE_KEY, atomCount: 1, atoms: [{ atomDid: 'did:atom:test-1', family: 'code-section' }] },
        },
      },
      {
        match: (url) => url.includes('/api/spine/retrieval/atoms/trace/'),
        res: { ok: true, status: 200, body: { trace: { nodes: 3 } } },
      },
    ])

    render(<ParcelTrace />)
    await waitFor(() => expect(screen.getByText('did:atom:test-1')).toBeInTheDocument())

    fireEvent.click(screen.getByText('did:atom:test-1'))
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([u]) => String(u) === `/api/spine/retrieval/atoms/trace/${encodeURIComponent('did:atom:test-1')}`),
      ).toBe(true),
    )
  })

  it('shows an honest geocode-miss error (422 geocode_miss) and does not fetch atoms', async () => {
    installFetch([
      {
        match: (url, init) => url.endsWith('/api/plan-review/geocode') && init?.method === 'POST',
        res: { ok: false, status: 422, body: { error: 'geocode_miss', message: 'Could not geocode the provided address' } },
      },
    ])

    render(<ParcelTrace />)

    await waitFor(() => expect(screen.getByText(/Geocode miss/)).toBeInTheDocument())
    expect(fetchMock.mock.calls.length).toBe(1)
  })

  it('shows an honest geocode_miss error when the atoms lookup 404s for an unknown placeKey', async () => {
    installFetch([
      geocodeHit,
      {
        match: (url) => url.includes('/place/') && url.endsWith('/atoms'),
        res: { ok: false, status: 404, body: { error: 'geocode_miss' } },
      },
    ])

    render(<ParcelTrace />)

    await waitFor(() => expect(screen.getByText(new RegExp(`Place ${PLACE_KEY.replace(/[:.]/g, '\\$&')} is unknown`))).toBeInTheDocument())
  })

  it('renders an honest empty state (resolved place, zero atoms) — not the enter-an-address prompt', async () => {
    installFetch([
      geocodeHit,
      {
        match: (url) => url.includes('/place/') && url.endsWith('/atoms'),
        res: { ok: true, status: 200, body: { placeKey: PLACE_KEY, jurisdictionKey: null, atomCount: 0, atoms: [] } },
      },
    ])

    render(<ParcelTrace />)

    await waitFor(() => expect(screen.getByText(`placeKey: ${PLACE_KEY}`)).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText(/no atoms are composed at this place/)).toBeInTheDocument())
    expect(screen.queryByText(/Enter an address above/)).not.toBeInTheDocument()
  })
})
