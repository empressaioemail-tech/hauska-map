// Property Explorer terrain export BFF — WDLL item 9.
//
// POST /api/pe-terrain-export
//   Body: { parcelNodeId: "48021:27303", format?: "glb"|"ifc"|"dxf-3dface"|"dxf-contour" }
//   Requires PE session + STUDIO entitlement (P-104). Calls MCP
//   refresh_parcel_terrain_export
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
  classifyEngineFailure,
  ENGINE_GATE_TOKEN_MESSAGE,
  extractInlineDownload,
  isValidParcelNodeId,
  mapMcpTerrainPayload,
  parseTerrainFormat,
  resolveTerrainExportAuth,
  retryableEngineFailureResponse,
  terrainFilename,
  type TerrainExportFormat,
} from './_lib/pe-terrain-export-core.js'

/**
 * P-104: renamed from `requirePaidSession`. The old name was accurate about
 * what the code did (`tier !== 'paid'`) and wrong about what the product
 * sells: Solo is paid, and Solo does not include terrain. The rename is not
 * cosmetic - it is what a reader would have needed to catch this by reading.
 */
async function requireStudioSession(
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
  const session = await requireStudioSession(req, res)
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
    factSheetId?: unknown
    format?: unknown
  }

  // I1: the export is keyed on the SUBJECT'S sealed sheet id, forwarded so the
  // rendered artifact prints it and echoed back so the client can compare.
  const factSheetId =
    typeof body?.factSheetId === 'string' && body.factSheetId.trim()
      ? body.factSheetId.trim()
      : undefined

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
      ...(factSheetId ? { fact_sheet_id: factSheetId } : {}),
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
      // FIX 1: honest gate/auth classification (same as site-plan).
      const kind = classifyEngineFailure({ message })
      if (kind === 'gate') {
        res.status(503).json({
          error: 'engine_gate_config',
          message: ENGINE_GATE_TOKEN_MESSAGE,
          detail: message,
        })
        return
      }
      // FIX (2026-07-28): an engine timeout (cold start) or connect failure
      // is transient — 503 + retryable with an honest customer message,
      // never the misleading gate-token message.
      const transient = retryableEngineFailureResponse(kind, message)
      if (transient) {
        res.status(transient.status).json(transient.body)
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

    res.status(200).json({ ...mapped, ...(factSheetId ? { factSheetId } : {}) })
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
    // FIX 1: honest classification for thrown MCP/engine errors.
    const kind = classifyEngineFailure({ message })
    if (kind === 'gate') {
      res.status(503).json({
        error: 'engine_gate_config',
        message: ENGINE_GATE_TOKEN_MESSAGE,
        detail: message,
      })
      return
    }
    const transient = retryableEngineFailureResponse(kind, message)
    if (transient) {
      res.status(transient.status).json(transient.body)
      return
    }
    res.status(502).json({ error: 'upstream_error', message })
  }
}

async function handleDownload(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (!(await requireStudioSession(req, res))) return

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

  // Download through the MCP gate, NOT directly to engine-api.
  //
  // engine-api accepts ONLY gate-signed calls (X-Hauska-Gate-Context +
  // X-Hauska-Gate-Signature from GATE_CONTEXT_SIGNING_KEY, held only in the
  // MCP gate). A direct PE->engine Bearer call with plain gate-front headers
  // is rejected with gate_front_context_required. Terrain meshes routinely
  // exceed the MCP inline cap, so the refresh POST returns a ref and the
  // download flows here; it must be gate-signed too.
  // download_parcel_terrain_export signs the gate and returns bytes as
  // base64. One SDK meter is consumed at refresh, not here.
  if (!mcpProductKey()) {
    res.status(503).json({
      error: 'proxy not configured',
      missing: 'MCP_PRODUCT_KEY',
    })
    return
  }

  try {
    const payload = await callMcpTool('download_parcel_terrain_export', {
      parcel_node_id: parcelNodeId,
      format,
    })

    if (payload.isError === true) {
      const message = mcpToolErrorMessage(payload)
      if (isMcpPaymentMessage(message)) {
        res.status(402).json({ error: 'payment_required', message })
        return
      }
      const kind = classifyEngineFailure({ message })
      if (kind === 'gate') {
        res.status(503).json({
          error: 'engine_gate_config',
          message: ENGINE_GATE_TOKEN_MESSAGE,
          detail: message,
        })
        return
      }
      const transient = retryableEngineFailureResponse(kind, message)
      if (transient) {
        res.status(transient.status).json(transient.body)
        return
      }
      res.status(502).json({ error: 'download_failed', message })
      return
    }

    const inline = extractInlineDownload(payload)
    if (!inline) {
      res.status(502).json({
        error: 'download_failed',
        message: 'MCP terrain download returned no artifact bytes.',
      })
      return
    }

    const buffer = Buffer.from(inline.base64, 'base64')
    res.setHeader('Content-Type', inline.contentType || 'application/octet-stream')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${terrainFilename(parcelNodeId, format)}"`,
    )
    res.status(200).send(buffer)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (isMcpPaymentMessage(message)) {
      res.status(402).json({ error: 'payment_required', message })
      return
    }
    const kind = classifyEngineFailure({ message })
    if (kind === 'gate') {
      res.status(503).json({
        error: 'engine_gate_config',
        message: ENGINE_GATE_TOKEN_MESSAGE,
        detail: message,
      })
      return
    }
    const transient = retryableEngineFailureResponse(kind, message)
    if (transient) {
      res.status(transient.status).json(transient.body)
      return
    }
    res.status(502).json({
      error: 'download_failed',
      message: `Terrain download failed (${message}).`,
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
