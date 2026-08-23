// Geocode BFF contract tests — param validation + passthrough to the Photon
// upstream (env-tunable base), wire-feature trimming, and the honest error
// shape. Pure core (api/_lib/pe-geocode-core), no serverless runtime.

import { describe, expect, it } from 'vitest'
import {
  buildPhotonUrl,
  DEFAULT_GEOCODER_URL,
  detectTexasIntent,
  filterAndRankTexasFeatures,
  GEOCODE_DEFAULT_LIMIT,
  isServedCountry,
  isTexasFeature,
  mapPhotonResponse,
  parseGeocodeParams,
  TEXAS_DEFAULT_BIAS,
  TEXAS_BBOX,
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
    expect(parsed.params.lat).toBe(TEXAS_DEFAULT_BIAS.lat)
    expect(parsed.params.lon).toBe(TEXAS_DEFAULT_BIAS.lon)
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
    const parsed = parseGeocodeParams({ q: 'main street springfield' })
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

describe('Texas-aware geocode bias and filtering', () => {
  it('detectTexasIntent matches state name, TX, 78xxx zip, and served cities', () => {
    expect(detectTexasIntent('17005 Simsbrook Drive, Pflugerville, Texas')).toBe(true)
    expect(detectTexasIntent('1503 Farm St, Bastrop, TX')).toBe(true)
    expect(detectTexasIntent('78660')).toBe(true)
    expect(detectTexasIntent('Simsbrook Dr, Pflugerville')).toBe(true)
    expect(detectTexasIntent('Main Street, Bastrop')).toBe(true)
  })

  it('applies Austin metro default bias when Texas intent and no viewport', () => {
    const parsed = parseGeocodeParams({
      q: '17005 Simsbrook Drive, Pflugerville, Texas',
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.params.lat).toBe(TEXAS_DEFAULT_BIAS.lat)
    expect(parsed.params.lon).toBe(TEXAS_DEFAULT_BIAS.lon)
    expect(parsed.params.zoom).toBe(TEXAS_DEFAULT_BIAS.zoom)
  })

  it('does not override an explicit viewport bias', () => {
    const parsed = parseGeocodeParams({
      q: '17005 Simsbrook Drive, Texas',
      lat: '29.42',
      lon: '-98.49',
      zoom: '12',
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.params.lat).toBeCloseTo(29.42)
    expect(parsed.params.lon).toBeCloseTo(-98.49)
    expect(parsed.params.zoom).toBeCloseTo(12)
  })

  it('adds Texas bbox to the Photon URL when query signals Texas', () => {
    const parsed = parseGeocodeParams({ q: 'Simsbrook Drive, TX' })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const url = new URL(buildPhotonUrl(DEFAULT_GEOCODER_URL, parsed.params))
    expect(url.searchParams.get('bbox')).toBe(TEXAS_BBOX.join(','))
    expect(url.searchParams.get('lat')).toBe(String(TEXAS_DEFAULT_BIAS.lat))
    expect(url.searchParams.get('lon')).toBe(String(TEXAS_DEFAULT_BIAS.lon))
  })

  const wire = (
    name: string,
    state: string | null,
    lat: number,
    lng: number,
    postcode?: string,
  ) => ({
    name,
    housenumber: null,
    street: null,
    city: null,
    county: null,
    state,
    postcode: postcode ?? null,
    countrycode: 'US',
    osmKey: null,
    osmValue: null,
    type: null,
    lat,
    lng,
    extent: null,
  })

  it('drops non-Texas US hits when Texas intent and prefers 786 postcode', () => {
    const maine = wire('Simsbrook Drive', 'Maine', 44.5, -69.5)
    const pflugerville = wire('Simsbrook Drive', 'Texas', 30.45, -97.62, '78660')
    const austin = wire('Simsbrook Drive', 'Texas', 30.27, -97.74, '78701')
    const ranked = filterAndRankTexasFeatures([maine, austin, pflugerville], 'Simsbrook, TX')
    expect(ranked.map((f) => f.name)).toEqual(['Simsbrook Drive', 'Simsbrook Drive'])
    expect(ranked[0].postcode).toBe('78660')
    expect(isTexasFeature(maine)).toBe(false)
    expect(isTexasFeature(pflugerville)).toBe(true)
  })

  it('mapPhotonResponse applies Texas filter when query signals Texas', () => {
    const mapped = mapPhotonResponse(
      {
        features: [
          {
            geometry: { coordinates: [-69.5, 44.5] },
            properties: { name: 'Simsbrook', state: 'Maine', countrycode: 'US' },
          },
          {
            geometry: { coordinates: [-97.62, 30.45] },
            properties: {
              name: 'Simsbrook Drive',
              state: 'Texas',
              postcode: '78660',
              countrycode: 'US',
            },
          },
        ],
      },
      '17005 Simsbrook Drive, Pflugerville, Texas',
    )
    expect(mapped.features).toHaveLength(1)
    expect(mapped.features[0].state).toBe('Texas')
    expect(mapped.features[0].postcode).toBe('78660')
  })
})
