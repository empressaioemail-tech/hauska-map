import { describe, expect, it } from 'vitest'
import {
  buildCortexSitusSearchUrl,
  mapSitusSearchResponse,
  parseSitusSearchParams,
} from '../../api/_lib/pe-situs-search-core'
import {
  mergeSearchSuggestions,
  situsHitToSuggestion,
} from './search-kinds'

describe('parseSitusSearchParams', () => {
  it('requires q', () => {
    expect(parseSitusSearchParams({}).ok).toBe(false)
  })

  it('defaults limit to 7', () => {
    const parsed = parseSitusSearchParams({ q: '1010 Pecan' })
    expect(parsed).toEqual({ ok: true, params: { q: '1010 Pecan', limit: 7 } })
  })
})

describe('buildCortexSitusSearchUrl', () => {
  it('targets brokerage situs-search', () => {
    const url = buildCortexSitusSearchUrl('https://cortex.test', {
      q: '6026 Marsh',
      limit: 5,
    })
    expect(url).toBe(
      'https://cortex.test/api/brokerage/v1/place/situs-search?q=6026+Marsh&limit=5',
    )
  })
})

describe('mapSitusSearchResponse', () => {
  it('drops malformed hits', () => {
    expect(
      mapSitusSearchResponse({
        hits: [
          { parcelNodeId: '48209:1', situsAddress: '1 MAIN', countyFips: '48209' },
          { parcelNodeId: '', situsAddress: 'bad' },
        ],
      }).hits,
    ).toHaveLength(1)
  })
})

describe('situsHitToSuggestion + mergeSearchSuggestions', () => {
  it('ranks situs parcels ahead of geocode and dedupes by parcel id', () => {
    const situs = [
      situsHitToSuggestion({
        parcelNodeId: '48021:58867',
        situsAddress: '1010 PECAN ST, BASTROP, TX',
        countyFips: '48021',
      })!,
    ]
    const geocode = [
      {
        kind: 'address' as const,
        label: '1010 Pecan St',
        sublabel: 'Bastrop, TX',
        lat: 30.1,
        lng: -97.3,
        extent: null,
        parcelNodeId: null,
        lookupQuery: '1010 Pecan St, Bastrop, TX',
      },
    ]
    const merged = mergeSearchSuggestions(situs, geocode)
    expect(merged[0]?.kind).toBe('parcel')
    expect(merged[0]?.parcelNodeId).toBe('48021:58867')
    expect(merged).toHaveLength(1)
  })
})
