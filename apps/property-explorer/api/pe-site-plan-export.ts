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
//
// DOSSIER FOLD-IN (engine #174 / MCP dossier tools): `?kind=dossier` routes
// the SAME function to the property-dossier PDF export — no new serverless
// function (Vercel 11/12 cap). POST ?kind=dossier refreshes via MCP
// refresh_parcel_dossier_export (body: address/countyName/verdictLine/brief/
// chatSummary/notes, forwarded verbatim after cap-trim); GET ?kind=dossier&
// action=download streams the pdf-dossier bytes via
// download_parcel_dossier_export. GATE DIFFERENCE: the dossier requires
// PROPERTY entitlement (paid OR the single-property unlock — the R1 line),
// not the Pro-only tier the site-plan formats keep.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { callMcpTool, mcpProductKey } from './_lib/mcp-server-client.js'
import {
  fetchPeEntitlement,
  fetchPeEntitlementDetail,
} from './_lib/pe-entitlement.js'
import {
  dossierFilename,
  mapMcpDossierPayload,
  parseDossierExportContent,
  refuseHollowXrayExport,
  resolveDossierExportAuth,
} from './_lib/pe-dossier-export-core.js'
import {
  isPeExportDevBypassArmed,
  PE_EXPORT_DEV_BYPASS_HEADER,
} from './_lib/pe-export-dev-bypass.js'
import { handleFloodDrainageRequest } from './_lib/pe-flood-drainage-handler.js'
import { readPeSessionCookie } from './_lib/session-cookie.js'
import {
  classifyEngineFailure,
  ENGINE_GATE_TOKEN_MESSAGE,
  extractInlineDownload,
  isValidParcelNodeId,
  mapMcpSitePlanPayload,
  parseSitePlanFormat,
  resolveSitePlanExportAuth,
  retryableEngineFailureResponse,
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
    factSheetId?: unknown
    format?: unknown
    address?: unknown
    countyName?: unknown
  }

  // I1: the export is keyed on the SUBJECT'S sealed sheet. The id is forwarded
  // to the engine so the rendered artifact prints it, and echoed back so the
  // client can compare what it asked for with what was drawn.
  const factSheetId =
    typeof body?.factSheetId === 'string' && body.factSheetId.trim()
      ? body.factSheetId.trim()
      : undefined

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
      ...(factSheetId ? { fact_sheet_id: factSheetId } : {}),
    })

    if (payload.isError === true) {
      const message = mcpToolErrorMessage(payload)
      // A missing setback rule is NO LONGER an export error (2026-07-27 operator
      // requirement): the engine now exports an honest-absent setback layer and
      // returns success with `setbackHonestAbsence: true`. So there is no
      // `setback_rule_missing` isError path to catch here anymore. Genuine
      // gate/payment/upstream failures below are still classified honestly.
      //
      // Do NOT map every MCP isError to 402 — that opened the customer paywall
      // for engine/upstream failures (operator saw Stripe with bypass on).
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

    const mapped = mapMcpSitePlanPayload(payload, format, parcelNodeId)
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
    // (No `setback_rule_missing` branch: a missing setback rule is an honest
    // export state now, not a thrown error — see the isError block above.)
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
    const transient = retryableEngineFailureResponse(kind, message)
    if (transient) {
      res.status(transient.status).json(transient.body)
      return
    }
    res.status(502).json({
      error: 'download_failed',
      message: `Site-plan download failed (${message}).`,
    })
  }
}

// ---------------------------------------------------------------------------
// DOSSIER leg (kind=dossier) — property-entitlement gate + MCP dossier tools.
// ---------------------------------------------------------------------------

/** Session + PROPERTY entitlement (paid OR unlocked-for-parcel; dev bypass). */
async function requireDossierSession(
  req: VercelRequest,
  res: VercelResponse,
  parcelNodeId: string,
): Promise<{ token: string; devBypass: boolean } | null> {
  const token = readPeSessionCookie(req.headers.cookie)
  const detail = token
    ? await fetchPeEntitlementDetail(token, parcelNodeId)
    : { ok: false as const, status: 401 as const }
  const gate = resolveDossierExportAuth({
    sessionToken: token,
    entitlement: detail.ok
      ? {
          ok: true,
          tier: detail.tier,
          propertyUnlocked: detail.propertyUnlocked,
        }
      : detail,
    devBypass: isPeExportDevBypassArmed({
      headerValue: req.headers[PE_EXPORT_DEV_BYPASS_HEADER],
    }),
  })
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.error, message: gate.message })
    return null
  }
  if (gate.devBypass) {
    res.setHeader('X-PE-Export-Dev-Bypass', '1')
  }
  return { token: token!, devBypass: gate.devBypass === true }
}

/** Shared honest error mapping for MCP dossier failures (message or throw). */
function respondDossierFailure(
  res: VercelResponse,
  message: string,
  session: { devBypass: boolean } | null,
): void {
  if (isMcpPaymentMessage(message)) {
    if (session?.devBypass) {
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
  const kind = classifyEngineFailure({ message })
  if (kind === 'gate') {
    res.status(503).json({
      error: 'engine_gate_config',
      message: ENGINE_GATE_TOKEN_MESSAGE,
      detail: message,
    })
    return
  }
  // Honest-timeout classes: transient engine failures are 503 + retryable,
  // never a misleading gate-token or paywall message.
  const transient = retryableEngineFailureResponse(kind, message)
  if (transient) {
    res.status(transient.status).json(transient.body)
    return
  }
  res.status(502).json({ error: 'upstream_error', message })
}

async function handleDossierRefresh(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as
    | Record<string, unknown>
    | undefined

  const parcelNodeId = body?.parcelNodeId
  if (!isValidParcelNodeId(parcelNodeId)) {
    res.status(400).json({
      error: 'invalid_parcel_node_id',
      message: 'parcelNodeId must match {fips}:{propId}, e.g. 48029:105129.',
    })
    return
  }

  const session = await requireDossierSession(req, res, parcelNodeId)
  if (!session) return

  if (!mcpProductKey()) {
    res.status(503).json({
      error: 'proxy not configured',
      missing: 'MCP_PRODUCT_KEY',
    })
    return
  }

  // Cap-trim, then fail closed on missing verdict / brief facts (W4.P0).
  // User-content (notes, AI summary) may be absent and is omitted silently.
  const content = parseDossierExportContent(body)
  const hollow = refuseHollowXrayExport(content)
  if (!hollow.ok) {
    res.status(422).json({
      error: hollow.error,
      message: hollow.message,
      missing: hollow.missing,
    })
    return
  }

  try {
    const payload = await callMcpTool('refresh_parcel_dossier_export', {
      parcel_node_id: parcelNodeId,
      format: 'pdf-dossier',
      ...(content.address ? { address: content.address } : {}),
      ...(content.countyName ? { county_name: content.countyName } : {}),
      ...(content.verdictLine ? { verdict_line: content.verdictLine } : {}),
      ...(content.brief ? { brief: content.brief } : {}),
      ...(content.chatSummary ? { chat_summary: content.chatSummary } : {}),
      ...(content.notes ? { notes: content.notes } : {}),
    })

    if (payload.isError === true) {
      respondDossierFailure(res, mcpToolErrorMessage(payload), session)
      return
    }

    const mapped = mapMcpDossierPayload(payload, parcelNodeId)
    if (!mapped.ok) {
      res.status(502).json({ error: 'upstream_error', message: mapped.message })
      return
    }
    res.status(200).json(mapped)
  } catch (err) {
    respondDossierFailure(
      res,
      err instanceof Error ? err.message : String(err),
      session,
    )
  }
}

async function handleDossierDownload(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const parcelNodeIdRaw = req.query.parcelNodeId
  const parcelNodeId = Array.isArray(parcelNodeIdRaw)
    ? parcelNodeIdRaw[0]
    : parcelNodeIdRaw
  if (!isValidParcelNodeId(parcelNodeId)) {
    res.status(400).json({ error: 'invalid_parcel_node_id' })
    return
  }

  const session = await requireDossierSession(req, res, parcelNodeId)
  if (!session) return

  if (!mcpProductKey()) {
    res.status(503).json({
      error: 'proxy not configured',
      missing: 'MCP_PRODUCT_KEY',
    })
    return
  }

  try {
    // Gate-signed byte hop through MCP (engine-api accepts only gate-signed
    // calls) — same reason as the site-plan download above. Not metered:
    // the SDK meter was consumed at refresh.
    const payload = await callMcpTool('download_parcel_dossier_export', {
      parcel_node_id: parcelNodeId,
    })

    if (payload.isError === true) {
      const message = mcpToolErrorMessage(payload)
      if (/404|not found/i.test(message)) {
        res.status(404).json({
          error: 'artifact_not_available',
          message,
        })
        return
      }
      respondDossierFailure(res, message, session)
      return
    }

    const inline = extractInlineDownload(payload)
    if (!inline) {
      res.status(502).json({
        error: 'download_failed',
        message: 'MCP dossier download returned no artifact bytes.',
      })
      return
    }

    const buffer = Buffer.from(inline.base64, 'base64')
    res.setHeader('Content-Type', inline.contentType || 'application/pdf')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${dossierFilename(parcelNodeId)}"`,
    )
    res.status(200).send(buffer)
  } catch (err) {
    respondDossierFailure(
      res,
      err instanceof Error ? err.message : String(err),
      session,
    )
  }
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  // R3 FOLD-IN: the Flood & Drainage report rides THIS function
  // (?report=flood-drainage) — PE is at the 11/12 Vercel Hobby function
  // cap, so the first paid report adds a dispatcher param, not a 12th
  // function (the exact failure #108 hit). Everything else below is the
  // unchanged site-plan surface.
  const reportRaw = req.query.report
  const report = Array.isArray(reportRaw) ? reportRaw[0] : reportRaw
  if (report === 'flood-drainage') {
    await handleFloodDrainageRequest(req, res)
    return
  }
  if (report !== undefined) {
    res.status(400).json({ error: 'unknown_report', message: `Unknown report "${report}".` })
    return
  }

  const actionRaw = req.query.action
  const action = Array.isArray(actionRaw) ? actionRaw[0] : actionRaw
  const kindRaw = req.query.kind
  const kind = Array.isArray(kindRaw) ? kindRaw[0] : kindRaw

  if (kind === 'dossier') {
    if (req.method === 'GET' && action === 'download') {
      await handleDossierDownload(req, res)
      return
    }
    if (req.method === 'POST') {
      await handleDossierRefresh(req, res)
      return
    }
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

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
