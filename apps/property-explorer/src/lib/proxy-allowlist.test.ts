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
  const DEEP_GET_EXACT = new Set([
    'api/property-explorer/v1/entitlement',
    'api/property-explorer/v1/saved-properties',
  ])
  const DEEP_GET_PREFIX = [
    'api/property-explorer/v1/research/layer-manifest',
  ]
  const DEEP_POST_EXACT = new Set([
    'api/property-explorer/v1/research/brief',
    'api/property-explorer/v1/research/hydrology',
    'api/property-explorer/v1/research/subsurface',
    'api/property-explorer/v1/entitlement/dev-unlock',
  ])
  const SAVED_PROPERTY_ITEM_RE = /^api\/property-explorer\/v1\/saved-properties\/[^/]+$/
  const RECORDS_REQUEST_PURCHASE_RE =
    /^api\/property-explorer\/v1\/records-request\/[^/]+\/(approve-purchase|decline-purchase)$/
  if (method === 'GET' || method === 'HEAD') {
    if (DEEP_GET_EXACT.has(upstreamPath)) return true
    return DEEP_GET_PREFIX.some((p) => upstreamPath === p || upstreamPath.startsWith(`${p}/`))
  }
  if (method === 'POST') {
    if (DEEP_POST_EXACT.has(upstreamPath)) return true
    if (RECORDS_REQUEST_PURCHASE_RE.test(upstreamPath)) return true
    return false
  }
  if (method === 'PUT' || method === 'DELETE') {
    return SAVED_PROPERTY_ITEM_RE.test(upstreamPath)
  }
  return false
}

/** Mirrors spine.ts retrieval browse allowlist (Gate C dual-serve + Track B1). */
function isRetrievalBrowsePathAllowed(method: string, upstreamPath: string): boolean {
  if (upstreamPath === 'health' || upstreamPath === 'healthz' || upstreamPath === 'ready') {
    return method === 'GET' || method === 'HEAD'
  }
  if (
    (method === 'GET' || method === 'HEAD') &&
    /^property-nodes\/[^/]+\/atom-chain$/.test(upstreamPath)
  ) {
    return true
  }
  if (method === 'POST' && /^property-nodes\/[^/]+\/attaching-roads$/.test(upstreamPath)) {
    return true
  }
  if ((method === 'GET' || method === 'HEAD') && upstreamPath === 'road-nodes/near-bbox') {
    return true
  }
  if (
    (method === 'GET' || method === 'HEAD') &&
    upstreamPath === 'building-footprints/near-bbox'
  ) {
    return true
  }
  if (
    (method === 'GET' || method === 'HEAD') &&
    upstreamPath === 'special-districts/near-bbox'
  ) {
    return true
  }
  if ((method === 'GET' || method === 'HEAD') && /^atoms\/[^/]+$/.test(upstreamPath)) {
    return true
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

  it('allows the entitlement dev-unlock POST on deep proxy (R1 stub seam)', () => {
    expect(
      isDeepPathAllowed('POST', 'api/property-explorer/v1/entitlement/dev-unlock'),
    ).toBe(true)
    // The entitlement READ stays GET-only; arbitrary entitlement writes blocked.
    expect(isDeepPathAllowed('POST', 'api/property-explorer/v1/entitlement')).toBe(false)
    expect(
      isDeepPathAllowed('POST', 'api/property-explorer/v1/entitlement/unlock'),
    ).toBe(false)
  })

  it('allows layer manifests on deep GET proxy', () => {
    expect(
      isDeepPathAllowed('GET', 'api/property-explorer/v1/research/layer-manifest/pe-r1-run'),
    ).toBe(true)
  })

  it('allows the saved-properties LIST on deep GET proxy (exact)', () => {
    expect(
      isDeepPathAllowed('GET', 'api/property-explorer/v1/saved-properties'),
    ).toBe(true)
    // No per-item GET exists upstream — subpaths stay blocked (tight list).
    expect(
      isDeepPathAllowed('GET', 'api/property-explorer/v1/saved-properties/48055:10068'),
    ).toBe(false)
  })

  it('allows saved property mutations on deep proxy (single item segment)', () => {
    expect(
      isDeepPathAllowed('PUT', 'api/property-explorer/v1/saved-properties/48055:10068'),
    ).toBe(true)
    expect(
      isDeepPathAllowed('DELETE', 'api/property-explorer/v1/saved-properties/48055:10068'),
    ).toBe(true)
  })

  it('blocks saved-properties abuse shapes on deep proxy', () => {
    // POST is not a saved-properties verb.
    expect(
      isDeepPathAllowed('POST', 'api/property-explorer/v1/saved-properties/48055:10068'),
    ).toBe(false)
    // Nested subpaths past the item segment stay blocked.
    expect(
      isDeepPathAllowed('PUT', 'api/property-explorer/v1/saved-properties/48055:10068/extra'),
    ).toBe(false)
    // Bare mutation on the collection stays blocked.
    expect(
      isDeepPathAllowed('DELETE', 'api/property-explorer/v1/saved-properties'),
    ).toBe(false)
  })

  it('allows records-request fee approve/decline POST on deep proxy', () => {
    const jobId = 'bab70fd3-3573-44fd-acda-61622c05d5e6'
    expect(
      isDeepPathAllowed(
        'POST',
        `api/property-explorer/v1/records-request/${jobId}/approve-purchase`,
      ),
    ).toBe(true)
    expect(
      isDeepPathAllowed(
        'POST',
        `api/property-explorer/v1/records-request/${jobId}/decline-purchase`,
      ),
    ).toBe(true)
    expect(
      isDeepPathAllowed(
        'POST',
        `api/property-explorer/v1/records-request/${jobId}/extra`,
      ),
    ).toBe(false)
  })

  it('allows retrieval atom-chain, attaching-roads POST, near-bbox, and atoms/:did', () => {
    expect(
      isRetrievalBrowsePathAllowed('GET', 'property-nodes/48209:156346/atom-chain'),
    ).toBe(true)
    expect(
      isRetrievalBrowsePathAllowed('POST', 'property-nodes/48021:34785/attaching-roads'),
    ).toBe(true)
    expect(isRetrievalBrowsePathAllowed('GET', 'road-nodes/near-bbox')).toBe(true)
    expect(
      isRetrievalBrowsePathAllowed(
        'GET',
        'atoms/did:hauska:zoning-fact:48209:156346',
      ),
    ).toBe(true)
  })

  it('blocks unlisted retrieval paths', () => {
    expect(isRetrievalBrowsePathAllowed('GET', 'search')).toBe(false)
    expect(isRetrievalBrowsePathAllowed('POST', 'property-nodes/x/atom-chain')).toBe(false)
  })
})
