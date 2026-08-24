// Property Explorer share-link mint BFF — Workbench W4 SHARE.
//
// POST /api/pe-share
//   Body: { parcelNodeId: "48021:27303" }
//   Auth: PE session only — share is FREE per the locked 2026-08-10 ladder
//   (acquisition channel; gating share defeats the share loop).
//   Mints a signed share token (HMAC-SHA256 over {v:1, p, exp}, 30-day TTL,
//   env PE_SHARE_SECRET) and returns { url, token, expiresAt }.
//
// Trust model: see api/_lib/pe-share-token.ts. The token scopes an anonymous
// viewer to ONE parcel's read-only artifacts via /api/pe-share-view; nothing
// tenant-private and no session ever rides the link.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isValidParcelNodeId } from './_lib/parcel-node-id.js'
import { fetchPeEntitlementDetail } from './_lib/pe-entitlement.js'
import { deployOrigin } from './_lib/oidc-config.js'
import { readPeSessionCookie } from './_lib/session-cookie.js'
import { mintShareToken, peShareSecret } from './_lib/pe-share-token.js'

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

  const detail = await fetchPeEntitlementDetail(token)
  const ownerScope =
    detail?.ok && detail.tenantId && detail.userId
      ? { tenantId: detail.tenantId, ownerUserId: detail.userId }
      : null

  const minted = mintShareToken({ parcelNodeId, secret, ownerScope })
  res.status(200).json({
    url: `${deployOrigin(req)}/share#${minted.token}`,
    token: minted.token,
    expiresAt: minted.expiresAt,
    parcelNodeId,
    tokenVersion: minted.version,
  })
}
