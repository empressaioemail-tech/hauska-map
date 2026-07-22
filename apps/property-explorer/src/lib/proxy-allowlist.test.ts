/**
 * Browse vs deep proxy allowlist tests (WDLL 13, 14).
 */

import { describe, it, expect } from 'vitest'

function isCortexBrowsePathAllowed(method: string, upstreamPath: string): boolean {
  if (method === 'GET' || method === 'HEAD') {
    if (upstreamPath === 'api/brokerage/v1/coverage') return true
    if (/^api\/brokerage\/v1\/place\/node\/[^/]+\/facets$/.test(upstreamPath)) return true
    return false
  }
  if (method === 'POST') {
    const exact = [
      'api/brokerage/v1/place/buildable-envelope',
      'api/brokerage/v1/map-data',
      'api/brokerage/v1/map-data/gis-layer',
      'api/brokerage/v1/map-data/composite-layer',
    ]
    return exact.includes(upstreamPath)
  }
  return false
}

function isDeepPathAllowed(method: string, upstreamPath: string): boolean {
  const DEEP_GET_EXACT = new Set(['api/property-explorer/v1/entitlement'])
  const DEEP_GET_PREFIX = ['api/property-explorer/v1/saved-properties']
  const DEEP_POST_EXACT = new Set([
    'api/property-explorer/v1/research/brief',
    'api/property-explorer/v1/research/hydrology',
    'api/property-explorer/v1/research/subsurface',
  ])
  const DEEP_POST_PREFIX = ['api/property-explorer/v1/research/layer-manifest']
  if (method === 'GET' || method === 'HEAD') {
    if (DEEP_GET_EXACT.has(upstreamPath)) return true
    return DEEP_GET_PREFIX.some((p) => upstreamPath === p || upstreamPath.startsWith(`${p}/`))
  }
  if (method === 'POST') {
    if (DEEP_POST_EXACT.has(upstreamPath)) return true
    return DEEP_POST_PREFIX.some((p) => upstreamPath.startsWith(`${p}/`))
  }
  if (method === 'PUT' || method === 'DELETE') {
    return upstreamPath.startsWith('api/property-explorer/v1/saved-properties/')
  }
  return false
}

describe('proxy allowlists', () => {
  it('allows anonymous facet read', () => {
    expect(
      isCortexBrowsePathAllowed('GET', 'api/brokerage/v1/place/node/48055:10068/facets'),
    ).toBe(true)
  })

  it('blocks anonymous deep research on browse proxy', () => {
    expect(
      isCortexBrowsePathAllowed('POST', 'api/property-explorer/v1/research/brief'),
    ).toBe(false)
  })

  it('allows deep research on deep proxy', () => {
    expect(isDeepPathAllowed('POST', 'api/property-explorer/v1/research/brief')).toBe(true)
  })

  it('allows saved property mutations on deep proxy', () => {
    expect(
      isDeepPathAllowed('PUT', 'api/property-explorer/v1/saved-properties/48055:10068'),
    ).toBe(true)
  })
})
