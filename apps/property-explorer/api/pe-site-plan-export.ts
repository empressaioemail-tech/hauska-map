// Property Explorer site-plan export BFF — Wave 3, WDLL items 7-8.
//
// POST /api/pe-site-plan-export
//   Body: { parcelNodeId: "48029:105129", format?: "dxf-site-plan"|"ifc-site-plan"|"pdf-site-plan", address?, countyName? }
//   Requires PE session + paid entitlement. Calls MCP refresh_parcel_site_plan_export
//   with server-side MCP_PRODUCT_KEY (one SDK meter per request at MCP).
//
// GET /api/pe-site-plan-export?parcelNodeId=...&format=pdf-site-plan&action=download
//   Streams artifact bytes from engine-api with full gate-front headers
//   (service token + x-hauska-* seam). Same auth gate. Prefer MCP inline
//   base64 from POST when available (no second hop).
//
// Sibling of pe-terrain-export.ts: same session/entitlement gate, distinct
// engine route (site-plan-export/*) and MCP tool
// (refresh_parcel_site_plan_export).

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
  mapMcpSitePlanPayload,
  parseSitePlanFormat,
  resolveSitePlanExportAuth,
  sitePlanFilename,
  type SitePlanExportFormat,
} from './_lib/pe-site-plan-export-core.js'

async function requirePaidSession(
  req: VercelRequest,
  res: VercelResponse,
): Promise<{ token: string; devBypass: boolean } | null> {
  const token = readPeSessionCookie(req.headers.cookie)
  const entitlement = token ? await fetchPeEntitlement(token) : { ok: false as const, status: 401 as const }
  const gate = resolveSitePlanExportAuth({
    sessionToken: token,
    entitlement,
    // Same operator/dev bypass as terrain export (session required; skip paid).
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
  return 'Site-plan export declined.'
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
    address?: unknown
    countyName?: unknown
  }

  const parcelNodeId = body?.parcelNodeId
  if (!isValidParcelNodeId(parcelNodeId)) {
    res.status(400).json({
      error: 'invalid_parcel_node_id',
      message: 'parcelNodeId must match {fips}:{propId}, e.g. 48029:105129.',
    })
    return
  }

  const format: SitePlanExportFormat = parseSitePlanFormat(body?.format) ?? 'pdf-site-plan'
  const address = typeof body?.address === 'string' ? body.address : undefined
  const countyName = typeof body?.countyName === 'string' ? body.countyName : undefined

  try {
    const payload = await callMcpTool('refresh_parcel_site_plan_export', {
      parcel_node_id: parcelNodeId,
      format,
      ...(address ? { address } : {}),
      ...(countyName ? { county_name: countyName } : {}),
    })

    if (payload.isError === true) {
      const message = mcpToolErrorMessage(payload)
      // Do NOT map every MCP isError to 402 — that opened the customer paywall
      // for engine/setback/upstream failures (operator saw Stripe with bypass on).
      if (/422|setback/i.test(message)) {
        // Keep anti-fabrication 422; soft customer copy (setback correctness is post-F1).
        res.status(422).json({
          error: 'setback_rule_missing',
          message: 'Setbacks not available for this parcel yet.',
          detail: message,
        })
        return
      }
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
      // FIX 1: a gate/auth rejection (engine-api's gate_front_context_required,
      // or a 401/403 forwarded through MCP) previously surfaced as the
      // misleading "Engine API unreachable ... requires engine-api". Reframe it
      // as the honest server-config cause; only genuine connect failures say
      // "unreachable".
      const kind = classifyEngineFailure({ message })
      if (kind === 'gate') {
        res.status(503).json({
          error: 'engine_gate_config',
          message: ENGINE_GATE_TOKEN_MESSAGE,
          detail: message,
        })
        return
      }
      res.status(502).json({ error: 'upstream_error', message })
      return
    }

    const mapped = mapMcpSitePlanPayload(payload, format, parcelNodeId)
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
    if (/422|setback/i.test(message)) {
      res.status(422).json({
        error: 'setback_rule_missing',
        message: 'Setbacks not available for this parcel yet.',
        detail: message,
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
  const format = parseSitePlanFormat(Array.isArray(formatRaw) ? formatRaw[0] : formatRaw)

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
  // X-Hauska-Gate-Signature, produced from GATE_CONTEXT_SIGNING_KEY which
  // lives only in the MCP gate). A direct PE->engine call with a Bearer
  // token and plain gate-front headers is rejected with
  // gate_front_context_required — that was the honest-but-dead-end
  // "needs an engine-api gate token" the operator hit. The site-plan PDF
  // is ~430 KiB, over the MCP inline cap, so the refresh POST returns a
  // ref and the download flows here; it must be gate-signed too. MCP's
  // download_parcel_site_plan_export signs the gate and returns the bytes
  // as base64. One SDK meter is consumed at refresh, not here.
  if (!mcpProductKey()) {
    res.status(503).json({
      error: 'proxy not configured',
      missing: 'MCP_PRODUCT_KEY',
    })
    return
  }

  try {
    const payload = await callMcpTool('download_parcel_site_plan_export', {
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
      res.status(502).json({ error: 'download_failed', message })
      return
    }

    const inline = extractInlineDownload(payload)
    if (!inline) {
      res.status(502).json({
        error: 'download_failed',
        message: 'MCP site-plan download returned no artifact bytes.',
      })
      return
    }

    const buffer = Buffer.from(inline.base64, 'base64')
    res.setHeader('Content-Type', inline.contentType || 'application/octet-stream')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${sitePlanFilename(parcelNodeId, format)}"`,
    )
    res.status(200).send(buffer)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (isMcpPaymentMessage(message)) {
      res.status(402).json({ error: 'payment_required', message })
      return
    }
    // A thrown MCP/engine error: classify honestly. Only genuine
    // connect/timeout failures say "unreachable".
    const kind = classifyEngineFailure({ message })
    if (kind === 'gate') {
      res.status(503).json({
        error: 'engine_gate_config',
        message: ENGINE_GATE_TOKEN_MESSAGE,
        detail: message,
      })
      return
    }
    res.status(502).json({
      error: 'download_failed',
      message: `Site-plan download failed (${message}).`,
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
