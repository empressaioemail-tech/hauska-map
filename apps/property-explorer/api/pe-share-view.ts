// Property Explorer share-view data plane — Workbench W4 SHARE.
//
// GET /api/pe-share-view?token=<share-token>&what=brief|siteplan|terrain|dossier
//
// The ONLY data plane a share-link viewer has. No session, no service key in
// the browser: every request carries the signed one-parcel token, the server
// validates it (HMAC + expiry, api/_lib/pe-share-token.ts) and proxies the
// upstream fetch with SERVER credentials, pinned to the token's parcel:
//
//   what=brief    → anonymous cortex facet snapshot (facets + tier2) projected
//                   into the R1 brief payload (api/_lib/pe-share-brief.ts)
//                   plus the property header. Public-record-derived, owner-free
//                   (the upstream endpoint strips owner data at the bake).
//   what=siteplan → MCP download_parcel_site_plan_export (PDF bytes). DOWNLOAD
//                   only — never refresh, so a viewer can never consume an SDK
//                   meter or trigger compute; if no artifact was exported yet
//                   the response is an honest 404-style JSON.
//   what=terrain  → MCP download_parcel_terrain_export (format glb|ifc|
//                   dxf-3dface|dxf-contour, default glb). Same download-only
//                   rule.
//   what=dossier  → the SHARER's saved dossier (drawings, AI chat SUMMARY,
//                   notes) via the cortex service-key route (#362, GET
//                   /api/property-explorer/v1/internal/share-dossier). The
//                   owner scope comes ONLY from a v2 token; v1 tokens (and a
//                   cortex without the route yet) get an honest 404
//                   dossier_not_available — the share view then renders
//                   exactly as before, no dossier section, never an error.
//                   The projection strips owner-private pieces (chat THREAD,
//                   export paths, pin, status) — see _lib/pe-share-dossier.ts.
//
// Invalid token → 403 share_link_invalid; expired → 403 share_link_expired
// (the client renders "This share link has expired."); PE_SHARE_SECRET unset
// → honest 503 sharing_not_configured. The parcel id ALWAYS comes from the
// validated token — never from the query string.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { cortexApiUrl } from './_lib/oidc-config.js'
import { callMcpTool, mcpProductKey } from './_lib/mcp-server-client.js'
import {
  peShareSecret,
  resolveShareViewAccess,
  type ShareOwnerScope,
} from './_lib/pe-share-token.js'
import { buildShareBriefPayload, sharePropertyHeader } from './_lib/pe-share-brief.js'
import { buildShareDossierPayload } from './_lib/pe-share-dossier.js'
import {
  extractInlineDownload as extractSitePlanInline,
  sitePlanFilename,
} from './_lib/pe-site-plan-export-core.js'
import {
  extractInlineDownload as extractTerrainInline,
  parseTerrainFormat,
  terrainFilename,
  type TerrainExportFormat,
} from './_lib/pe-terrain-export-core.js'

export const SHARE_VIEW_WHAT = ['brief', 'siteplan', 'terrain', 'dossier'] as const
export type ShareViewWhat = (typeof SHARE_VIEW_WHAT)[number]

export function parseShareViewWhat(value: unknown): ShareViewWhat | null {
  return typeof value === 'string' &&
    (SHARE_VIEW_WHAT as readonly string[]).includes(value)
    ? (value as ShareViewWhat)
    : null
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

async function serveBrief(
  res: VercelResponse,
  parcelNodeId: string,
  expiresAt: string,
): Promise<void> {
  const url = `${cortexApiUrl()}/api/brokerage/v1/place/node/${encodeURIComponent(parcelNodeId)}/facets`
  let upstream: Response
  try {
    upstream = await fetch(url, { headers: { Accept: 'application/json' } })
  } catch (err) {
    res.status(502).json({
      error: 'upstream_error',
      message: err instanceof Error ? err.message : String(err),
    })
    return
  }
  if (upstream.status === 404) {
    res.status(404).json({
      error: 'baked_snapshot_not_found',
      message: 'No baked facet snapshot exists for this parcel node.',
    })
    return
  }
  if (!upstream.ok) {
    res.status(502).json({
      error: 'upstream_error',
      message: `Facet snapshot fetch returned ${upstream.status}.`,
    })
    return
  }
  const body = (await upstream.json().catch(() => null)) as {
    facets?: unknown
    tier2?: unknown
    snapshotAt?: unknown
  } | null
  if (!body || body.facets === undefined) {
    res.status(502).json({
      error: 'upstream_error',
      message: 'Facet snapshot response was not readable.',
    })
    return
  }
  const snapshotAt = typeof body.snapshotAt === 'string' ? body.snapshotAt : null
  res.status(200).json({
    property: sharePropertyHeader(parcelNodeId, body.facets),
    report: buildShareBriefPayload({
      parcelNodeId,
      facets: body.facets,
      tier2: body.tier2 ?? null,
      snapshotAt,
    }),
    share: { expiresAt },
  })
}

/**
 * what=dossier — service-key read of the SHARER's saved dossier (cortex
 * #362), feature-detected: any absence (v1 token, cortex route not deployed,
 * row gone, service key unset) is an honest 404 dossier_not_available so the
 * share page renders exactly as it did before the dossier shipped.
 */
async function serveDossier(
  res: VercelResponse,
  parcelNodeId: string,
  ownerScope: ShareOwnerScope | null,
  expiresAt: string,
): Promise<void> {
  if (!ownerScope) {
    // v1 token — read-only compat: no owner scope, no dossier, no error.
    res.status(404).json({
      error: 'dossier_not_available',
      message: 'This share link does not carry a dossier.',
    })
    return
  }
  const serviceKey = process.env.CORTEX_SERVICE_API_KEY?.trim()
  if (!serviceKey) {
    res.status(404).json({
      error: 'dossier_not_available',
      message: 'Dossier sharing is not configured on this deployment.',
    })
    return
  }
  const qs = new URLSearchParams({
    tenantId: ownerScope.tenantId,
    ownerUserId: ownerScope.ownerUserId,
    parcelNodeId,
  })
  const url = `${cortexApiUrl()}/api/property-explorer/v1/internal/share-dossier?${qs.toString()}`
  let upstream: Response
  try {
    upstream = await fetch(url, {
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        Accept: 'application/json',
      },
    })
  } catch (err) {
    res.status(502).json({
      error: 'upstream_error',
      message: err instanceof Error ? err.message : String(err),
    })
    return
  }
  // Feature-detect: route absent (older cortex) OR row absent both surface
  // as 404 — the share view renders as today, no dossier section.
  if (upstream.status === 404) {
    res.status(404).json({
      error: 'dossier_not_available',
      message: 'No saved dossier exists for this share.',
    })
    return
  }
  if (!upstream.ok) {
    res.status(502).json({
      error: 'upstream_error',
      message: `Dossier fetch returned ${upstream.status}.`,
    })
    return
  }
  const body = (await upstream.json().catch(() => null)) as {
    parcelNodeId?: unknown
    label?: unknown
    updatedAt?: unknown
    snapshot?: unknown
  } | null
  const dossier = body ? buildShareDossierPayload(body.snapshot) : null
  if (!dossier) {
    res.status(404).json({
      error: 'dossier_not_available',
      message: 'The saved dossier has nothing to share yet.',
    })
    return
  }
  res.status(200).json({
    parcelNodeId,
    label: typeof body?.label === 'string' ? body.label : null,
    updatedAt: typeof body?.updatedAt === 'string' ? body.updatedAt : null,
    dossier,
    share: { expiresAt },
  })
}

function mcpToolErrorMessage(payload: Record<string, unknown>): string {
  for (const key of ['message', 'reason', 'error', 'raw'] as const) {
    const v = payload[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return 'Download declined.'
}

async function serveDownload(
  res: VercelResponse,
  opts: {
    tool: 'download_parcel_site_plan_export' | 'download_parcel_terrain_export'
    args: Record<string, unknown>
    filename: string
    extract: (payload: Record<string, unknown>) => { base64: string; contentType?: string | null } | undefined
  },
): Promise<void> {
  if (!mcpProductKey()) {
    res.status(503).json({ error: 'proxy not configured', missing: 'MCP_PRODUCT_KEY' })
    return
  }
  try {
    const payload = await callMcpTool(opts.tool, opts.args)
    if (payload.isError === true) {
      // Honest availability: the sharer never exported this artifact (or the
      // engine has no copy). Download-only — a share viewer cannot trigger a
      // refresh, so this is a terminal honest state for the link.
      res.status(404).json({
        error: 'artifact_not_available',
        message: mcpToolErrorMessage(payload),
      })
      return
    }
    const inline = opts.extract(payload)
    if (!inline) {
      res.status(502).json({
        error: 'download_failed',
        message: 'Download returned no artifact bytes.',
      })
      return
    }
    const buffer = Buffer.from(inline.base64, 'base64')
    res.setHeader('Content-Type', inline.contentType || 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${opts.filename}"`)
    res.status(200).send(buffer)
  } catch (err) {
    res.status(502).json({
      error: 'download_failed',
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const access = resolveShareViewAccess({
    token: first(req.query.token),
    secret: peShareSecret(),
  })
  if (!access.ok) {
    const _d = access as { status: number; error: string; message?: string }
    res.status(_d.status).json({ error: _d.error, message: _d.message })
    return
  }

  const what = parseShareViewWhat(first(req.query.what))
  if (!what) {
    res.status(400).json({
      error: 'invalid_what',
      message: 'what must be one of brief, siteplan, terrain, dossier.',
    })
    return
  }

  // The parcel comes from the VALIDATED TOKEN only — a share viewer can reach
  // exactly this parcel's artifacts and nothing else.
  const parcelNodeId = access.parcelNodeId

  if (what === 'brief') {
    await serveBrief(res, parcelNodeId, access.expiresAt)
    return
  }

  if (what === 'dossier') {
    await serveDossier(res, parcelNodeId, access.ownerScope, access.expiresAt)
    return
  }

  if (what === 'siteplan') {
    await serveDownload(res, {
      tool: 'download_parcel_site_plan_export',
      args: { parcel_node_id: parcelNodeId, format: 'pdf-site-plan' },
      filename: sitePlanFilename(parcelNodeId, 'pdf-site-plan'),
      extract: extractSitePlanInline,
    })
    return
  }

  const format: TerrainExportFormat = parseTerrainFormat(first(req.query.format)) ?? 'glb'
  await serveDownload(res, {
    tool: 'download_parcel_terrain_export',
    args: { parcel_node_id: parcelNodeId, format },
    filename: terrainFilename(parcelNodeId, format),
    extract: extractTerrainInline,
  })
}
