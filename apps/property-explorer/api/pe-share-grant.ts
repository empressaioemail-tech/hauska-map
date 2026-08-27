// GET /s/:grantId  (rewritten to /api/pe-share-grant?grantId=)
//
// Server-visible share. The grant id is in the path the server receives.
// HMAC is never accepted here. Expired and revoked are distinct 403s.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  isShareGrantId,
  resolveGrantViewAccess,
} from './_lib/pe-share-grant.js'
import { productionShareGrantStore } from './_lib/pe-share-grant-store.js'

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const grantId = first(req.query.grantId)?.trim() ?? ''
  if (!isShareGrantId(grantId)) {
    res.status(403).json({
      error: 'share_grant_invalid',
      message: 'This share link is invalid or has expired.',
    })
    return
  }

  const store = productionShareGrantStore()
  if (!store) {
    res.status(503).json({
      error: 'grant_store_not_configured',
      message: 'Share grants are not configured on this deployment.',
    })
    return
  }

  let row
  try {
    row = await store.getById(grantId)
  } catch {
    res.status(503).json({
      error: 'grant_store_unavailable',
      message: 'Share grant could not be read.',
    })
    return
  }

  const access = resolveGrantViewAccess(row)
  if (!access.ok) {
    res.status(access.status).json({
      error: access.error,
      message: access.message,
      grantId,
    })
    return
  }

  res.status(200).json({
    grantId: access.row.id,
    parcelNodeId: access.row.parcelNodeId,
    expiresAt: access.row.expiresAt,
    createdAt: access.row.createdAt,
  })
}
