// Property Explorer share-link mint BFF — Workbench W4 SHARE.
//
// POST /api/pe-share
//   Body: { parcelNodeId: "48021:27303" }
//   Auth: PE session only — share is FREE per the locked 2026-08-10 ladder
//   (acquisition channel; gating share defeats the share loop).
//   Writes a grant row first (P-86 item 6). Returns { url, humanUrl, grantId,
//   token, expiresAt } where url is /s/{grantId} (no HMAC) and humanUrl is
//   /share#token. No grant row → no URL.
//
// Trust model: see api/_lib/pe-share-token.ts. The token scopes an anonymous
// viewer to ONE parcel's read-only artifacts via /api/pe-share-view; nothing
// tenant-private and no session ever rides the link.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isValidParcelNodeId } from './_lib/parcel-node-id.js'
import { fetchPeEntitlementDetail } from './_lib/pe-entitlement.js'
import { deployOrigin } from './_lib/oidc-config.js'
import { readPeSessionCookie } from './_lib/session-cookie.js'
import { mintShareWithGrant } from './_lib/pe-share-grant.js'
import { productionShareGrantStore } from './_lib/pe-share-grant-store.js'
import { peShareSecret } from './_lib/pe-share-token.js'

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const token = readPeSessionCookie(req.headers.cookie)
  if (!token) {
    res.status(401).json({
      error: 'authentication_required',
      message: 'Sign in to create a share link for this property.',
    })
    return
  }

  const secret = peShareSecret()
  if (!secret) {
    res.status(503).json({
      error: 'sharing_not_configured',
      message: 'Sharing is not configured on this deployment (PE_SHARE_SECRET missing).',
    })
    return
  }

  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as {
    parcelNodeId?: unknown
  }
  const parcelNodeId =
    typeof body?.parcelNodeId === 'string' ? body.parcelNodeId.trim() : ''
  if (!isValidParcelNodeId(parcelNodeId)) {
    res.status(400).json({
      error: 'invalid_parcel_node_id',
      message: 'parcelNodeId must match {fips}:{propId}, e.g. 48021:27303.',
    })
    return
  }

  const store = productionShareGrantStore()
  if (!store) {
    res.status(503).json({
      error: 'grant_store_not_configured',
      message: 'Share grants are not configured on this deployment (CORTEX_SERVICE_API_KEY missing).',
    })
    return
  }

  const detail = await fetchPeEntitlementDetail(token)
  if (!detail.ok || !detail.tenantId || !detail.userId) {
    res.status(401).json({
      error: 'authentication_required',
      message: 'Sign in to create a share link for this property.',
    })
    return
  }

  const minted = await mintShareWithGrant({
    parcelNodeId,
    grantorUserId: detail.userId,
    grantorTenantId: detail.tenantId,
    origin: deployOrigin(req),
    secret,
    store,
  })
  if (!minted.ok) {
    if (minted.error === 'missing_grantor' || minted.error === 'invalid_parcel_node_id') {
      res.status(400).json({ error: minted.error })
      return
    }
    res.status(503).json({
      error: 'grant_persist_failed',
      message: 'Share grant could not be written. No link was minted.',
    })
    return
  }

  res.status(200).json({
    url: minted.url,
    humanUrl: minted.humanUrl,
    grantId: minted.grantId,
    token: minted.token,
    expiresAt: minted.expiresAt,
    parcelNodeId: minted.parcelNodeId,
  })
}
