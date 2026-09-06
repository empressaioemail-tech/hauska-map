// apps/property-explorer/api/_lib/pe-feasibility-export-handler.ts
//
// FEASIBILITY STUDY report request handlers (P32 wave 2).
//
// FOLDED into the pe-site-plan-export serverless function (`kind=feasibility`
// discriminator — the SAME fold-in shape as `kind=dossier`; PE sits at the
// 11/12 Vercel Hobby function cap, so this is NOT a new function; see the
// top-of-file comment in pe-site-plan-export.ts).
//
// Surface (mirrors the pinned engine contract 1:1):
//   POST /api/pe-site-plan-export?kind=feasibility
//     { parcelNodeId, address?, countyName?, liveViewUrl? }
//     -> 200 the mapped FeasibilityExportBffResponse (engine 201 refresh)
//   GET  ...?kind=feasibility&action=download&parcelNodeId=...
//     -> application/pdf stream
//
// TRANSPORT: direct BFF -> engine-api with gate-front headers (the proven
// pe-flood-drainage-handler.ts pattern). There is NO feasibility-export MCP
// tool (hauska-mcp-server is a different seat's repo — out of scope here),
// so BOTH legs below call engine-api directly; unlike the dossier fold-in,
// which hops through MCP for its refresh POST.
//
// GATE: PE session + (STUDIO/TEAM entitlement OR an active Property Unlock
// on this parcel — P-104's rule, reused, extended by P-119; see
// pe-feasibility-export-core.ts) — the SAME per-parcel
// fetchPeEntitlementDetail read site-plan/terrain now use (P-119), not the
// old parcel-blind fetchPeEntitlement. The operator/dev bypass header works
// exactly as on the sibling exports.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { fetchPeEntitlementDetail } from './pe-entitlement.js'
import {
  isPeExportDevBypassArmed,
  PE_EXPORT_DEV_BYPASS_HEADER,
} from './pe-export-dev-bypass.js'
import { readPeSessionCookie } from './session-cookie.js'
import {
  classifyEngineFailure,
  engineApiBaseUrl,
  engineApiGateToken,
} from './pe-site-plan-export-core.js'
import {
  buildEngineFeasibilityRefreshBody,
  buildFeasibilityEngineGateHeaders,
  FEASIBILITY_ENGINE_GATE_TOKEN_MESSAGE,
  FEASIBILITY_ENGINE_GATE_TOKEN_MISSING_MESSAGE,
  feasibilityFilename,
  isValidParcelNodeId,
  mapEngineFeasibilityPayload,
  parseFeasibilityRefreshBody,
  resolveFeasibilityExportAuth,
  retryableFeasibilityEngineFailureResponse,
} from './pe-feasibility-export-core.js'

/**
 * Client-side budget for the engine's compose run (16-section assembly +
 * site-plan append). The Vercel function cap is 60 s; budget just under it
 * so an overrun classifies as the honest transient engine_timeout, never a
 * gate error — same reasoning as FLOOD_ENGINE_TIMEOUT_MS.
 */
const FEASIBILITY_ENGINE_TIMEOUT_MS = 55_000

/**
 * Session + (Studio/Team OR Property Unlock) entitlement gate. Writes the
 * failure response itself.
 *
 * P-119: takes `parcelNodeId` so `fetchPeEntitlementDetail` can report
 * `propertyUnlocked` for THIS parcel — the property-unlock check is
 * per-parcel, unlike the old parcel-blind `fetchPeEntitlement` this used to
 * call.
 */
async function requireStudioSession(
  req: VercelRequest,
  res: VercelResponse,
  parcelNodeId: string,
): Promise<{ token: string; devBypass: boolean } | null> {
  const token = readPeSessionCookie(req.headers.cookie)
  const detail = token
    ? await fetchPeEntitlementDetail(token, parcelNodeId)
    : { ok: false as const, status: 401 as const }
  const gate = resolveFeasibilityExportAuth({
    sessionToken: token,
    entitlement: detail.ok
      ? {
          ok: true,
          tier: detail.tier,
          studioGranted: detail.studioGranted,
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

function engineFailure(
  res: VercelResponse,
  input: { status?: number | null; message: string },
  fallback: { error: string },
): void {
  const kind = classifyEngineFailure(input)
  if (kind === 'gate') {
    res.status(503).json({
      error: 'engine_gate_config',
      message: FEASIBILITY_ENGINE_GATE_TOKEN_MESSAGE,
      detail: input.message,
    })
    return
  }
  const transient = retryableFeasibilityEngineFailureResponse(kind, input.message)
  if (transient) {
    res.status(transient.status).json(transient.body)
    return
  }
  res.status(502).json({ error: fallback.error, message: input.message })
}

function queryString(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

async function handleRefresh(req: VercelRequest, res: VercelResponse): Promise<void> {
  const parsed = parseFeasibilityRefreshBody(req.body)
  if (!parsed.ok) {
    res.status(400).json({ error: 'invalid_request', message: parsed.message })
    return
  }
  if (!(await requireStudioSession(req, res, parsed.request.parcelNodeId))) return

  const gateToken = engineApiGateToken()
  if (!gateToken) {
    res.status(503).json({
      error: 'engine_gate_config',
      message: FEASIBILITY_ENGINE_GATE_TOKEN_MISSING_MESSAGE,
      missing: 'HAUSKA_ENGINE_API_KEY|ENGINE_API_GATE_TOKEN',
    })
    return
  }

  const { parcelNodeId } = parsed.request
  const target = `${engineApiBaseUrl()}/v1/property-nodes/${encodeURIComponent(parcelNodeId)}/feasibility-export/refresh`
  try {
    const upstream = await fetch(target, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${gateToken}`,
        'Content-Type': 'application/json',
        ...buildFeasibilityEngineGateHeaders(),
      },
      body: JSON.stringify(buildEngineFeasibilityRefreshBody(parsed.request)),
      signal: AbortSignal.timeout(FEASIBILITY_ENGINE_TIMEOUT_MS),
    })
    if (upstream.status === 422) {
      // The engine's honest refresh failure (e.g. no resolvable site plan
      // for this parcel) — pass the real reason through, never the paywall
      // and never a fake report.
      const body = (await upstream.json().catch(() => ({}))) as { message?: string }
      res.status(422).json({
        error: 'feasibility_export_failed',
        message: body.message ?? 'Feasibility study could not be produced for this parcel.',
      })
      return
    }
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '')
      engineFailure(
        res,
        { status: upstream.status, message: text || `engine ${upstream.status}` },
        { error: 'upstream_error' },
      )
      return
    }
    const payload = await upstream.json().catch(() => null)
    const mapped = mapEngineFeasibilityPayload(payload, parcelNodeId)
    if (!mapped.ok) {
      res.status(502).json({ error: 'upstream_error', message: mapped.message })
      return
    }
    res.status(200).json(mapped.response)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    engineFailure(res, { message }, { error: 'upstream_error' })
  }
}

async function handleDownload(req: VercelRequest, res: VercelResponse): Promise<void> {
  const parcelNodeId = queryString(req.query.parcelNodeId)
  if (!isValidParcelNodeId(parcelNodeId)) {
    res.status(400).json({ error: 'invalid_parcel_node_id' })
    return
  }
  if (!(await requireStudioSession(req, res, parcelNodeId))) return

  const gateToken = engineApiGateToken()
  if (!gateToken) {
    res.status(503).json({
      error: 'engine_gate_config',
      message: FEASIBILITY_ENGINE_GATE_TOKEN_MISSING_MESSAGE,
      missing: 'HAUSKA_ENGINE_API_KEY|ENGINE_API_GATE_TOKEN',
    })
    return
  }

  const target = `${engineApiBaseUrl()}/v1/property-nodes/${encodeURIComponent(parcelNodeId)}/feasibility-export/download`
  try {
    const upstream = await fetch(target, {
      headers: {
        Authorization: `Bearer ${gateToken}`,
        ...buildFeasibilityEngineGateHeaders(),
      },
      signal: AbortSignal.timeout(30_000),
    })
    // Pinned contract: 404 artifact_unavailable (nothing on file), 410
    // artifact_evicted (stored ref can't be read back). Pass through as-is —
    // honest cache-miss states, never a fabricated download.
    if (upstream.status === 404 || upstream.status === 410) {
      const body = (await upstream.json().catch(() => ({}))) as {
        error?: string
        message?: string
      }
      res.status(upstream.status).json({
        error: body.error ?? 'artifact_unavailable',
        message: body.message,
      })
      return
    }
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '')
      engineFailure(
        res,
        { status: upstream.status, message: text || `engine ${upstream.status}` },
        { error: 'download_failed' },
      )
      return
    }
    const bytes = Buffer.from(await upstream.arrayBuffer())
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${feasibilityFilename(parcelNodeId)}"`,
    )
    res.status(200).send(bytes)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    engineFailure(res, { message }, { error: 'download_failed' })
  }
}

/** Entry point the folded pe-site-plan-export function dispatches to. */
export async function handleFeasibilityExportRequest(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const action = queryString(req.query.action)
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
