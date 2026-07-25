// Property Explorer terrain export BFF — WDLL item 9.
//
// POST /api/pe-terrain-export
//   Body: { parcelNodeId: "48021:27303", format?: "glb"|"ifc"|"dxf-3dface"|"dxf-contour" }
//   Requires PE session + paid entitlement. Calls MCP refresh_parcel_terrain_export
//   with server-side MCP_PRODUCT_KEY (one SDK meter per request at MCP).
//
// GET /api/pe-terrain-export?parcelNodeId=...&format=glb&action=download
//   Streams artifact bytes from engine-api with full gate-front headers
//   (service token + x-hauska-* seam). Same auth gate. Prefer MCP inline
//   base64 from POST when available (no second hop).

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { callMcpTool, mcpProductKey } from './_lib/mcp-server-client.js'
import { fetchPeEntitlement } from './_lib/pe-entitlement.js'
import {
  isPeExportDevBypassArmed,
  PE_EXPORT_DEV_BYPASS_HEADER,
} from './_lib/pe-export-dev-bypass.js'
import { readPeSessionCookie } from './_lib/session-cookie.js'
import {
  buildTerrainEngineGateHeaders,
  engineApiBaseUrl,
  engineApiGateToken,
  isValidParcelNodeId,
  mapMcpTerrainPayload,
  parseTerrainFormat,
  resolveTerrainExportAuth,
  terrainFilename,
  type TerrainExportFormat,
} from './_lib/pe-terrain-export-core.js'

async function requirePaidSession(
  req: VercelRequest,
  res: VercelResponse,
): Promise<{ token: string; devBypass: boolean } | null> {
  const token = readPeSessionCookie(req.headers.cookie)
  const entitlement = token ? await fetchPeEntitlement(token) : { ok: false as const, status: 401 as const }
  const gate = resolveTerrainExportAuth({
    sessionToken: token,
    entitlement,
    devBypass: isPeExportDevBypassArmed({
      headerValue: req.headers[PE_EXPORT_DEV_BYPASS_HEADER],
    }),
  })
  if (!gate.ok) {
    res.status(gate.status).json({
      error: gate.error,
      message: gate.message,
    })
    return null
  }
  if (gate.devBypass) {
    res.setHeader('X-PE-Export-Dev-Bypass', '1')
  }
  return { token: token!, devBypass: gate.devBypass === true }
}

function mcpToolErrorMessage(payload: Record<string, unknown>): string {
  for (const key of ['message', 'reason', 'error', 'raw'] as const) {
    const v = payload[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return 'Terrain export declined.'
}

function isMcpPaymentMessage(message: string): boolean {
  return /paid X-Hauska-Key|public-paid|anonymous and free|payment_required|upgrade or retry after quota|metering denied/i.test(
    message,
  )
}

async function handleRefresh(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const session = await requirePaidSession(req, res)
  if (!session) return

  if (!mcpProductKey()) {
    res.status(503).json({
      error: 'proxy not configured',
      missing: 'MCP_PRODUCT_KEY',
    })
    return
  }

  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as {
    parcelNodeId?: unknown
    format?: unknown
  }

  const parcelNodeId = body?.parcelNodeId
  if (!isValidParcelNodeId(parcelNodeId)) {
    res.status(400).json({
      error: 'invalid_parcel_node_id',
      message: 'parcelNodeId must match {fips}:{propId}, e.g. 48021:27303.',
    })
    return
  }

  const format: TerrainExportFormat = parseTerrainFormat(body?.format) ?? 'glb'

  try {
    const payload = await callMcpTool('refresh_parcel_terrain_export', {
      parcel_node_id: parcelNodeId,
      format,
    })

    if (payload.isError === true) {
      const message = mcpToolErrorMessage(payload)
      // Do NOT map every MCP isError to 402 — same false-paywall bug as site-plan.
      if (isMcpPaymentMessage(message)) {
        if (session.devBypass) {
          res.status(503).json({
            error: 'mcp_paid_key_required',
            message:
              'Operator bypass cleared the PE paywall, but MCP_PRODUCT_KEY is not paid-tier. ' +
              message,
          })
          return
        }
        res.status(402).json({ error: 'payment_required', message })
        return
      }
      res.status(502).json({ error: 'upstream_error', message })
      return
    }

    const mapped = mapMcpTerrainPayload(payload, format, parcelNodeId)
    if (!mapped.ok) {
      res.status(502).json({ error: 'upstream_error', message: mapped.message })
      return
    }

    res.status(200).json(mapped)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (isMcpPaymentMessage(message)) {
      if (session.devBypass) {
        res.status(503).json({
          error: 'mcp_paid_key_required',
          message:
            'Operator bypass cleared the PE paywall, but MCP rejected the call. ' + message,
        })
        return
      }
      res.status(402).json({
        error: 'payment_required',
        message,
      })
      return
    }
    res.status(502).json({ error: 'upstream_error', message })
  }
}

async function handleDownload(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (!(await requirePaidSession(req, res))) return

  const parcelNodeIdRaw = req.query.parcelNodeId
  const formatRaw = req.query.format
  const parcelNodeId = Array.isArray(parcelNodeIdRaw)
    ? parcelNodeIdRaw[0]
    : parcelNodeIdRaw
  const format = parseTerrainFormat(Array.isArray(formatRaw) ? formatRaw[0] : formatRaw)

  if (!isValidParcelNodeId(parcelNodeId)) {
    res.status(400).json({ error: 'invalid_parcel_node_id' })
    return
  }
  if (!format) {
    res.status(400).json({ error: 'invalid_format' })
    return
  }

  const gateToken = engineApiGateToken()
  if (!gateToken) {
    res.status(503).json({
      error: 'proxy not configured',
      missing: 'HAUSKA_ENGINE_API_KEY|ENGINE_API_GATE_TOKEN',
    })
    return
  }

  const target = `${engineApiBaseUrl()}/v1/property-nodes/${encodeURIComponent(parcelNodeId)}/terrain-export/download?format=${encodeURIComponent(format)}`

  try {
    const upstream = await fetch(target, {
      headers: {
        Authorization: `Bearer ${gateToken}`,
        Accept: '*/*',
        ...buildTerrainEngineGateHeaders(),
      },
    })

    if (!upstream.ok) {
      const text = await upstream.text()
      res.status(upstream.status).json({
        error: 'download_failed',
        message: text.slice(0, 300),
      })
      return
    }

    const contentType = upstream.headers.get('content-type')
    const disposition = upstream.headers.get('content-disposition')
    if (contentType) res.setHeader('Content-Type', contentType)
    if (disposition) res.setHeader('Content-Disposition', disposition)
    else {
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${terrainFilename(parcelNodeId, format)}"`,
      )
    }

    const buffer = Buffer.from(await upstream.arrayBuffer())
    res.status(200).send(buffer)
  } catch (err) {
    res.status(502).json({
      error: 'upstream_error',
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const actionRaw = req.query.action
  const action = Array.isArray(actionRaw) ? actionRaw[0] : actionRaw

  if (req.method === 'GET' && action === 'download') {
    await handleDownload(req, res)
    return
  }

  if (req.method === 'POST') {
    await handleRefresh(req, res)
    return
  }

  res.status(405).json({ error: 'method_not_allowed' })
}
