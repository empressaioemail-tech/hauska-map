// Geocode BFF contract tests — param validation + passthrough to the Photon
// upstream (env-tunable base), wire-feature trimming, and the honest error
// shape. Pure core (api/_lib/pe-geocode-core), no serverless runtime.

import { describe, expect, it } from 'vitest'
import {
  buildPhotonUrl,
  DEFAULT_GEOCODER_URL,
  GEOCODE_DEFAULT_LIMIT,
  isServedCountry,
  mapPhotonResponse,
  parseGeocodeParams,
} from '../../api/_lib/pe-geocode-core'

describe('geocode param parsing', () => {
  it('requires q; trims it; defaults limit to 7', () => {
    const bad = parseGeocodeParams({})
    expect(bad.ok).toBe(false)
    const parsed = parseGeocodeParams({ q: '  main street bastrop  ' })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.params.q).toBe('main street bastrop')
    expect(parsed.params.limit).toBe(GEOCODE_DEFAULT_LIMIT)
    expect(parsed.params.lat).toBeNull()
    expect(parsed.params.lon).toBeNull()
  })

  it('accepts viewport bias only as a lat+lon PAIR; clamps limit to 10', () => {
    const pairless = parseGeocodeParams({ q: 'x', lat: '30.1' })
    expect(pairless.ok && pairless.params.lat).toBeNull()
    const parsed = parseGeocodeParams({ q: 'x', lat: '30.11', lon: '-97.31', zoom: '14.6', limit: '25' })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.params.lat).toBeCloseTo(30.11)
    expect(parsed.params.lon).toBeCloseTo(-97.31)
    expect(parsed.params.zoom).toBeCloseTo(14.6)
    // limit above the cap is rejected back to the default, never passed through.
    expect(parsed.params.limit).toBe(GEOCODE_DEFAULT_LIMIT)
  })

  it('rejects out-of-range coordinates and oversized queries', () => {
    const parsed = parseGeocodeParams({ q: 'x', lat: '99', lon: '-97.3' })
    expect(parsed.ok && parsed.params.lat).toBeNull()
    expect(parseGeocodeParams({ q: 'y'.repeat(300) }).ok).toBe(false)
  })
})

describe('upstream URL construction (param passthrough)', () => {
  it('builds the Photon /api URL with q/limit/lat/lon/zoom', () => {
    const parsed = parseGeocodeParams({ q: 'main street', lat: '30.11', lon: '-97.31', zoom: '14', limit: '7' })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const url = new URL(buildPhotonUrl(DEFAULT_GEOCODER_URL, parsed.params))
    expect(url.origin).toBe('https://photon.komoot.io')
    expect(url.pathname).toBe('/api')
    expect(url.searchParams.get('q')).toBe('main street')
    expect(url.searchParams.get('lat')).toBe('30.11')
    expect(url.searchParams.get('lon')).toBe('-97.31')
    expect(url.searchParams.get('zoom')).toBe('14')
    expect(url.searchParams.get('limit')).toBe('7')
  })

  it('base URL is env-tunable (trailing slash tolerated); bias omitted when absent', () => {
    const parsed = parseGeocodeParams({ q: 'austin texas' })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const url = new URL(buildPhotonUrl('https://geo.internal.example/', parsed.params))
    expect(url.origin).toBe('https://geo.internal.example')
    expect(url.searchParams.has('lat')).toBe(false)
    expect(url.searchParams.has('lon')).toBe(false)
  })
})

describe('Photon response mapping', () => {
  const FEATURE = {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-97.31, 30.11] },
    properties: {
      name: 'Main Street',
      osm_key: 'highway',
      osm_value: 'residential',
      city: 'Bastrop',
      state: 'Texas',
      countrycode: 'US',
      extent: [-97.33, 30.12, -97.3, 30.1],
    },
  }

  it('trims features to the wire shape and keeps the extent', () => {
    const mapped = mapPhotonResponse({ type: 'FeatureCollection', features: [FEATURE] })
    expect(mapped.features.length).toBe(1)
    const f = mapped.features[0]
    expect(f.name).toBe('Main Street')
    expect(f.osmKey).toBe('highway')
    expect(f.lat).toBe(30.11)
    expect(f.lng).toBe(-97.31)
    expect(f.extent).toEqual([-97.33, 30.12, -97.3, 30.1])
    expect(mapped.attribution).toBe('search © OSM')
  })

  it('skips features without usable coordinates; never throws on malformed payloads', () => {
    expect(mapPhotonResponse(null).features).toEqual([])
    expect(mapPhotonResponse('garbage').features).toEqual([])
    expect(
      mapPhotonResponse({
        features: [{ geometry: { coordinates: ['x', 'y'] }, properties: {} }],
      }).features,
    ).toEqual([])
  })

  it('drops a malformed extent instead of passing junk to fitBounds', () => {
    const mapped = mapPhotonResponse({
      features: [
        {
          geometry: { coordinates: [-97.31, 30.11] },
          properties: {
            name: 'X',
            countrycode: 'US',
            extent: [-97.33, 'bad', -97.3, 30.1],
          },
        },
      ],
    })
    expect(mapped.features[0].extent).toBeNull()
  })
})

// UPDATED BEHAVIOUR (P-39): the two fixtures above gained `countrycode: 'US'`.
// mapPhotonResponse now filters to the served country, so a fixture with no
// country is correctly dropped — the old expectations encoded the unfiltered
// behaviour this change deliberately removes.
describe('US-only filtering (server side)', () => {
  const feature = (countrycode: string | null, name: string) => ({
    geometry: { type: 'Point', coordinates: [-97.31, 30.11] },
    properties: {
      name,
      ...(countrycode === null ? {} : { countrycode }),
    },
  })

  it('keeps US results and drops every other country', () => {
    const mapped = mapPhotonResponse({
      features: [
        feature('US', 'Bastrop, Texas'),
        feature('FR', 'Bastrop-sur-Mer'),
        feature('DE', 'Bastropstrasse'),
      ],
    })
    expect(mapped.features.map((f) => f.name)).toEqual(['Bastrop, Texas'])
  })

  it('accepts a lowercase country code', () => {
    const mapped = mapPhotonResponse({ features: [feature('us', 'Elgin')] })
    expect(mapped.features).toHaveLength(1)
  })

  it('drops a feature that names no country at all', () => {
    // The exclusion set is part of the contract: this filter answers "can we
    // place it in a US jurisdiction", and an uncountried node cannot be.
    const mapped = mapPhotonResponse({ features: [feature(null, 'Nowhere')] })
    expect(mapped.features).toEqual([])
  })

  it('exposes the predicate so the rule has exactly one implementation', () => {
    const [us] = mapPhotonResponse({ features: [feature('US', 'x')] }).features
    expect(isServedCountry(us)).toBe(true)
    expect(isServedCountry({ ...us, countrycode: 'CA' })).toBe(false)
    expect(isServedCountry({ ...us, countrycode: null })).toBe(false)
  })
})
