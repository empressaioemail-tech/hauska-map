// Property Explorer share-link mint BFF — Workbench W4 SHARE.
//
// POST /api/pe-share
//   Body: { parcelNodeId: "48021:27303" }
//   Auth: PE session + the SAME entitlement class as exporting (paid tier, or
//   the operator dev bypass) — the sharer must be able to see what they share.
//   Mints a signed share token (HMAC-SHA256 over {v:1, p, exp}, 30-day TTL,
//   env PE_SHARE_SECRET) and returns { url, token, expiresAt }.
//
// Trust model: see api/_lib/pe-share-token.ts. The token scopes an anonymous
// viewer to ONE parcel's read-only artifacts via /api/pe-share-view; nothing
// tenant-private and no session ever rides the link.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isValidParcelNodeId } from './_lib/parcel-node-id.js'
import {
  fetchPeEntitlement,
  fetchPeEntitlementDetail,
} from './_lib/pe-entitlement.js'
import {
  isPeExportDevBypassArmed,
  PE_EXPORT_DEV_BYPASS_HEADER,
} from './_lib/pe-export-dev-bypass.js'
import { deployOrigin } from './_lib/oidc-config.js'
import { readPeSessionCookie } from './_lib/session-cookie.js'
import { resolveSitePlanExportAuth } from './_lib/pe-site-plan-export-core.js'
import { mintShareToken, peShareSecret } from './_lib/pe-share-token.js'

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  // Same auth gate as the exports (session + paid entitlement, dev bypass
  // honored) — sharing is the same entitlement class as exporting.
  const token = readPeSessionCookie(req.headers.cookie)
  const entitlement = token
    ? await fetchPeEntitlement(token)
    : { ok: false as const, status: 401 as const }
  const gate = resolveSitePlanExportAuth({
    sessionToken: token,
    entitlement,
    devBypass: isPeExportDevBypassArmed({
      headerValue: req.headers[PE_EXPORT_DEV_BYPASS_HEADER],
    }),
  })
  if (!gate.ok) {
    const _g = gate as { status: number; error: string; message?: string }
    res.status(_g.status).json({ error: _g.error, message: _g.message })
    return
  }

  const secret = peShareSecret()
  if (!secret) {
    // Honest unconfigured state — never mint an unsigned link.
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

  // TOKEN v2 (dossier share): embed the SHARER's owner scope {tenantId,
  // ownerUserId} so the share view can fetch their saved dossier through the
  // cortex service-key route. Scope comes from the entitlement snapshot for
  // THIS session. If it cannot be resolved (older cortex, transient failure)
  // the link is still minted as v1 — read-only share keeps working, the
  // share view simply renders without the dossier section.
  const detail = token ? await fetchPeEntitlementDetail(token) : null
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
