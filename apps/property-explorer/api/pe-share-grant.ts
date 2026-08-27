// GET /s/:grantId  (rewritten to /api/pe-share-grant?grantId=)
//
// Server-visible share instrument (P-86 items 2, 5, 7). The grant id is in
// the path the server receives. HMAC is never accepted here. Expired and
// revoked are distinct 403s. After the grant row resolves, compose the same
// instrument as pe-share-view (brief / dossier / siteplan / terrain / xray)
// using grantor ids from the row, then render HTML / markdown / JSON.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  isBrowserShareNavigation,
  isShareGrantId,
  resolveGrantViewAccess,
  shareAppLandingPath,
} from './_lib/pe-share-grant.js'
import { productionShareGrantStore } from './_lib/pe-share-grant-store.js'
import type { ShareGrantStore } from './_lib/pe-share-grant-store.js'
import {
  composeShareInstrument,
  negotiateShareFormat,
  renderShareInstrument,
  shareInstrumentContentType,
  type ShareInstrument,
} from './_lib/pe-share-instrument.js'
import { callMcpTool, mcpProductKey } from './_lib/mcp-server-client.js'
import {
  extractInlineDownload as extractSitePlanInline,
  sitePlanFilename,
} from './_lib/pe-site-plan-export-core.js'
import {
  extractInlineDownload as extractTerrainInline,
  parseTerrainFormat,
  terrainFilename,
} from './_lib/pe-terrain-export-core.js'

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

export type ShareGrantHandlerDeps = {
  store?: ShareGrantStore | null
  compose?: typeof composeShareInstrument
}

export async function handlePeShareGrant(
  req: VercelRequest,
  res: VercelResponse,
  deps: ShareGrantHandlerDeps = {},
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

  const store =
    deps.store !== undefined ? deps.store : productionShareGrantStore()
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

  const what = first(req.query.what)?.trim().toLowerCase()
  if (what === 'siteplan' || what === 'terrain') {
    if (!mcpProductKey()) {
      res.status(503).json({ error: 'proxy not configured', missing: 'MCP_PRODUCT_KEY' })
      return
    }
    try {
      const tool =
        what === 'siteplan'
          ? 'download_parcel_site_plan_export'
          : 'download_parcel_terrain_export'
      const format =
        what === 'terrain'
          ? (parseTerrainFormat(first(req.query.format)) ?? 'glb')
          : 'pdf-site-plan'
      const payload = await callMcpTool(tool, {
        parcel_node_id: access.row.parcelNodeId,
        format,
      })
      if (payload.isError === true) {
        res.status(404).json({
          error: 'artifact_not_available',
          message: 'Not available on this link — the sharer did not export it.',
        })
        return
      }
      const inline =
        what === 'siteplan'
          ? extractSitePlanInline(payload)
          : extractTerrainInline(payload)
      if (!inline) {
        res.status(502).json({
          error: 'download_failed',
          message: 'Download returned no artifact bytes.',
        })
        return
      }
      const filename =
        what === 'siteplan'
          ? sitePlanFilename(access.row.parcelNodeId, 'pdf-site-plan')
          : terrainFilename(access.row.parcelNodeId, format)
      const buffer = Buffer.from(inline.base64, 'base64')
      res.setHeader('Content-Type', inline.contentType || 'application/octet-stream')
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`)
      res.status(200).send(buffer)
    } catch (err) {
      res.status(502).json({
        error: 'download_failed',
        message: err instanceof Error ? err.message : String(err),
      })
    }
    return
  }

  const dest = req.headers['sec-fetch-dest']
  const mode = req.headers['sec-fetch-mode']
  if (
    isBrowserShareNavigation({
      queryFormat: first(req.query.format),
      secFetchDest: typeof dest === 'string' ? dest : undefined,
      secFetchMode: typeof mode === 'string' ? mode : undefined,
    })
  ) {
    res.setHeader('Location', shareAppLandingPath(grantId))
    res.status(302).end()
    return
  }

  const format = negotiateShareFormat(
    first(req.query.format),
    typeof req.headers.accept === 'string' ? req.headers.accept : undefined,
  )
  res.setHeader('Content-Type', shareInstrumentContentType(format))
  res.setHeader('X-Share-Freshness-Days', '30')

  if (req.method === 'HEAD') {
    res.status(200).end()
    return
  }

  const compose = deps.compose ?? composeShareInstrument
  let instrument: ShareInstrument
  try {
    instrument = await compose({ grant: access.row })
  } catch (err) {
    res.status(502).json({
      error: 'share_compose_failed',
      message: err instanceof Error ? err.message : String(err),
      grantId,
    })
    return
  }

  res.status(200).send(renderShareInstrument(instrument, format))
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  await handlePeShareGrant(req, res)
}
