// Deep-proxy allowlist. Imported by spine-deep.ts and by the unit test so
// the test cannot pass on a stale copy of the set.

export const DEEP_GET_EXACT = new Set([
  'api/property-explorer/v1/entitlement',
  // W4 My Properties: the saved-properties LIST (exact — the only GET the
  // saved-properties surface needs; per-item reads don't exist upstream).
  'api/property-explorer/v1/saved-properties',
  // P-85 Records Request — latest jobs for a parcel (parcelNodeId query).
  'api/property-explorer/v1/records-request',
  // P-85 Records Request — cross-parcel inbox for My reports.
  'api/property-explorer/v1/records-request/inbox',
  // P-94 Team roster — Settings tab GET. Writes stay off until the client
  // has a write path; invite UI is display-only.
  'api/property-explorer/v1/team/members',
  // P-87 Claude Sync — which AI clients have authenticated as this account.
  // OMITTING THIS SHIPPED A DEAD CARD. spine-deep checks the session cookie
  // FIRST and the allowlist SECOND, so a signed-out probe returns 401 for every
  // path and an unlisted one looks exactly like a listed one; only a signed-IN
  // request reveals the 403. The card read that 403 as "not connected" and
  // showed setup instructions to every user on every account. A new deep GET is
  // not done until its path is on this list.
  'api/property-explorer/v1/ai-connections',
  // P-98 next-action rail — the ACCOUNT-WIDE active unlocks with expiry.
  // peEntitlement can only answer one parcelNodeId at a time, so the rail's
  // highest rung (an unlock about to lapse) has no read without this. Listed
  // here in the SAME change that added the client (src/lib/unlockClient.ts),
  // because the two are independently authored halves and a missing line here
  // is a 403 that a signed-out probe cannot see.
  'api/property-explorer/v1/entitlement/unlocks',
])

export const DEEP_GET_PREFIX = [
  'api/property-explorer/v1/research/layer-manifest',
  // P-85 Card 3 — captured instrument page (PNG/PDF) on a records-request artifact.
  'api/property-explorer/v1/records-request/artifacts',
]

export const DEEP_POST_EXACT = new Set([
  'api/property-explorer/v1/research/brief',
  'api/property-explorer/v1/research/hydrology',
  'api/property-explorer/v1/research/subsurface',
  // W3 workbench chat — same user-session Bearer as research/brief (never the
  // service key, never the extension's install-id/public-key wedge).
  'api/brokerage/v1/research/chat',
  // R1 paywall LEGACY test seam: the cortex dev-unlock the $15 stub used
  // before real checkout wiring. Kept on the allowlist for the billingClient
  // `armed` test seam only — the client never reaches this path in
  // production (see billingClient.ts startPropertyUnlock).
  'api/property-explorer/v1/entitlement/dev-unlock',
  // LIVE-PAYMENTS wave (WDLL item 3): the real, authenticated, user-scoped
  // $15 one-time property-unlock Stripe checkout. 404/403 on a cortex build
  // without it yet → the client feature-detects back to the honest "coming"
  // state (WA1/WA2 coordination — see 2026-08-05 WDLL + WA1 dispatch).
  'api/property-explorer/v1/entitlement/checkout',
  // WDLL item 1 — user-authenticated Pro subscription checkout (pe_user_id
  // in Stripe metadata; distinct from install-scoped brokerage checkout).
  'api/property-explorer/v1/billing/checkout',
  // WDLL item 6 — anonymous → authenticated claim, fired once on sign-in.
  'api/property-explorer/v1/claim-session',
  'api/property-explorer/v1/claim-local-state',
  // P-85 Records Request — enqueue clerk-index job by parcelNodeId.
  'api/property-explorer/v1/records-request',
  // P-98 next-action rail — activation instrumentation (shown / acted per
  // action id). User-scoped, NOT the install-scoped gtm_events spine. A
  // missing line here would 403 every event and the rail would look measured
  // while measuring nothing, which is the starved-mechanism defect exactly.
  'api/property-explorer/v1/activation-events',
  // A-062 billing portal — the Stripe Customer Portal session terms.html has
  // promised customers all along. Listed in the SAME change that added the
  // client (src/lib/portalClient.ts), because the two are independently
  // authored halves and a missing line here is a 403 that a signed-out probe
  // cannot see: spine-deep.ts checks the session cookie BEFORE the allowlist.
  // Omitting it would ship a Cancel button that fails for every paying
  // customer and reads to them as "cancellation is broken", which is worse
  // than the honest Not built row it replaces.
  //
  // The POST carries { returnUrl } and NO customer id — the server resolves
  // the Stripe customer from the session and refuses a supplied one.
  'api/property-explorer/v1/billing/portal',
])

// W4 My Properties: PUT (upsert) / DELETE on exactly ONE path segment after
// saved-properties/ — the :parcelNodeId. No nested subpaths.
export const SAVED_PROPERTY_ITEM_RE = /^api\/property-explorer\/v1\/saved-properties\/[^/]+$/

// P-85 W1 item 6 — fee approve/decline on a specific records-request job.
export const RECORDS_REQUEST_PURCHASE_RE =
  /^api\/property-explorer\/v1\/records-request\/[^/]+\/(approve-purchase|decline-purchase)$/

export function isDeepPathAllowed(method: string, upstreamPath: string): boolean {
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
