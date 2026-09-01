/**
 * Browse vs deep proxy allowlist tests (WDLL 13, 14).
 */

import { describe, it, expect } from 'vitest'
import { isDeepPathAllowed } from '../../api/_lib/deep-allowlist.js'
// P-98: imported, not retyped. The rest of the SHIPPED_DEEP_* lists below are
// hand-transcribed literals, which makes them a THIRD copy of the path — a
// typo in the test and a typo in the client agree with each other and the
// check passes on a path nobody calls. Reading the client's own exported
// constant makes this a comparison between the two independently authored
// halves (client fetch target vs server allowlist) rather than between two
// transcriptions.
import { ACCOUNT_UNLOCKS_PATH } from './unlockClient'
import { ACTIVATION_EVENTS_PATH } from './activationEvents'
// P-98b: the parcel-LESS entitlement GET. Same reasoning as the two above —
// the constant the client builds its URL from, compared against the server
// allowlist rather than against a transcription of itself.
import { ACCOUNT_ENTITLEMENT_PATH } from './accountEntitlementClient'

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

  it('allows team roster GET on deep proxy and blocks neighbors (P-94)', () => {
    expect(isDeepPathAllowed('GET', 'api/property-explorer/v1/team/members')).toBe(true)
    expect(isDeepPathAllowed('HEAD', 'api/property-explorer/v1/team/members')).toBe(true)
    expect(isDeepPathAllowed('GET', 'api/property-explorer/v1/team/members/extra')).toBe(false)
    expect(isDeepPathAllowed('GET', 'api/property-explorer/v1/team')).toBe(false)
    expect(isDeepPathAllowed('POST', 'api/property-explorer/v1/team/members')).toBe(false)
  })

  it('allows records-request GET and inbox on deep proxy', () => {
    expect(isDeepPathAllowed('GET', 'api/property-explorer/v1/records-request')).toBe(true)
    expect(isDeepPathAllowed('GET', 'api/property-explorer/v1/records-request/inbox')).toBe(true)
  })

  it('allows records-request artifact document GET and blocks a neighboring invent', () => {
    expect(
      isDeepPathAllowed(
        'GET',
        'api/property-explorer/v1/records-request/artifacts/art-1/document',
      ),
    ).toBe(true)
    expect(
      isDeepPathAllowed('GET', 'api/property-explorer/v1/records-request/artifacts'),
    ).toBe(true)
    expect(
      isDeepPathAllowed('GET', 'api/property-explorer/v1/records-request/extra'),
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

describe('every deep path a shipped client calls is allowlisted', () => {
  // THE CHECK THAT WAS MISSING. P-87 shipped a GET the deep proxy refused, and
  // it was invisible because spine-deep.ts checks the session cookie BEFORE the
  // allowlist: signed out, every path returns 401 and an unlisted path looks
  // exactly like a listed one. Only a signed-IN request reveals the 403. The
  // card read that 403 as 'not connected' and showed setup instructions to
  // every user, on every account, permanently.
  //
  // A client-side fetch constant and a server-side allowlist entry are two
  // independently authored halves. This asserts they agree.
  const SHIPPED_DEEP_GETS = [
    'api/property-explorer/v1/entitlement',
    'api/property-explorer/v1/saved-properties',
    'api/property-explorer/v1/team/members',
    'api/property-explorer/v1/records-request',
    // P-87 Claude Sync.
    'api/property-explorer/v1/ai-connections',
    // P-98 next-action rail — read from the client module, see the import note.
    ACCOUNT_UNLOCKS_PATH,
  ]

  // The POST half had no parity coverage at all until P-98. The GET half was
  // written after a GET shipped unlisted; the same omission on a POST is just
  // as reachable and just as invisible (spine-deep checks the session cookie
  // before the allowlist for every verb, not only GET).
  const SHIPPED_DEEP_POSTS = [
    'api/property-explorer/v1/research/brief',
    'api/property-explorer/v1/billing/checkout',
    'api/property-explorer/v1/entitlement/checkout',
    'api/property-explorer/v1/claim-session',
    'api/property-explorer/v1/records-request',
    // P-98 activation instrumentation — read from the client module.
    ACTIVATION_EVENTS_PATH,
  ]

  it.each(SHIPPED_DEEP_GETS)('allows GET %s', (path) => {
    expect(isDeepPathAllowed('GET', path)).toBe(true)
  })

  it.each(SHIPPED_DEEP_POSTS)('allows POST %s', (path) => {
    expect(isDeepPathAllowed('POST', path)).toBe(true)
  })

  it('P-98b: the PARCEL-LESS entitlement GET needs no new allowlist line, and this proves it', () => {
    // THE CLAIM BEING VERIFIED RATHER THAN ASSUMED. deep-allowlist.ts line 5
    // is the string 'api/property-explorer/v1/entitlement' inside
    // DEEP_GET_EXACT. api/spine-deep.ts builds its allowlist key from the
    // req.query.upath SEGMENTS only (`const upstreamPath = path.join('/')`),
    // so the query string never reaches the check — which is why the
    // per-property form (?parcelNodeId=) and the account form (no query) hit
    // the SAME set member and only one line is needed for both.
    expect(ACCOUNT_ENTITLEMENT_PATH).toBe('api/property-explorer/v1/entitlement')
    expect(isDeepPathAllowed('GET', ACCOUNT_ENTITLEMENT_PATH)).toBe(true)
    expect(isDeepPathAllowed('HEAD', ACCOUNT_ENTITLEMENT_PATH)).toBe(true)
    // NOT VACUOUS, and NARROW: the read stays a read. An entitlement WRITE and
    // an invented neighbour are still refused on the same prefix.
    expect(isDeepPathAllowed('POST', ACCOUNT_ENTITLEMENT_PATH)).toBe(false)
    expect(isDeepPathAllowed('DELETE', ACCOUNT_ENTITLEMENT_PATH)).toBe(false)
    expect(isDeepPathAllowed('GET', `${ACCOUNT_ENTITLEMENT_PATH}/account`)).toBe(false)
  })

  it('P-98 paths are the ones the clients actually fetch', () => {
    // Second derivation for the two new rows: the constant the client builds
    // its URL from, spelled out once here. If either module renames its path
    // without the allowlist following, this fails rather than the rail
    // quietly 403ing in production.
    expect(ACCOUNT_UNLOCKS_PATH).toBe('api/property-explorer/v1/entitlement/unlocks')
    expect(ACTIVATION_EVENTS_PATH).toBe('api/property-explorer/v1/activation-events')
  })

  it('is NOT VACUOUS — a path nobody listed is still refused', () => {
    expect(isDeepPathAllowed('GET', 'api/property-explorer/v1/ai-connections-nope')).toBe(
      false,
    )
    expect(isDeepPathAllowed('GET', 'api/property-explorer/v1/invented')).toBe(false)
    // The two P-98 neighbours, and the verbs they are NOT allowed on. A set
    // membership check passes on any string that was added; these prove the
    // additions are narrow.
    expect(isDeepPathAllowed('GET', 'api/property-explorer/v1/entitlement/unlocks/x')).toBe(
      false,
    )
    expect(isDeepPathAllowed('POST', ACCOUNT_UNLOCKS_PATH)).toBe(false)
    expect(isDeepPathAllowed('GET', ACTIVATION_EVENTS_PATH)).toBe(false)
    expect(isDeepPathAllowed('POST', 'api/property-explorer/v1/activation-event')).toBe(
      false,
    )
  })
})
