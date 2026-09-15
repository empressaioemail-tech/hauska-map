// apps/property-explorer/api/_lib/pe-flood-drainage-handler.ts
//
// FLOOD & DRAINAGE report request handlers (R3 — the FIRST paid report).
//
// FOLDED into the pe-site-plan-export serverless function (report=
// flood-drainage discriminator) — PE sits at the 11/12 Vercel Hobby
// function cap, so this is NOT a new function; pe-site-plan-export.ts
// dispatches here. Underscore-prefixed dir = never deployed standalone.
//
// Surface (P-240, 2026-09-15 — refresh is now asynchronous; mirrors the
// pinned engine contract 1:1):
//   POST /api/pe-site-plan-export?report=flood-drainage
//     { parcelNodeId, address?, countyName?, rainfallDepthInches? }
//     → 202 { ok, parcelNodeId, state: queued|running, jobRef, pollAfterMs }
//       (engine 202 refresh; a second call while one is running returns the
//       SAME jobRef)
//   GET  ...?report=flood-drainage&action=study&parcelNodeId=...
//     → 200 { ok, parcelNodeId, study } once ready; 404 DECLARED wait
//       { error: "flood_drainage_in_progress", state, jobRef, pollAfterMs }
//       while queued/running (never a stale prior study); 422
//       { error: "flood_drainage_refresh_failed", errorClass } once failed;
//       otherwise the original 404 study_unavailable / 410 artifact_evicted
//   GET  ...?report=flood-drainage&action=download&parcelNodeId=...&format=pdf-flood-drainage
//     → application/pdf stream (carries X-Flood-Drainage-Generated-At) once
//       ready; the same declared-404-wait / 422-failed additions as /study
//       layered on the original 404/410 shapes
//
// TRANSPORT: direct BFF -> engine-api with gate-front headers (the proven
// pe-map-layers pattern; see pe-flood-drainage-core.ts for the rationale —
// engine gate middleware is global, no flood MCP tools exist).
//
// GATE: PE session + PROPERTY entitlement (per-property unlock OR Pro) —
// the usePropertyEntitlement server twin; 402 in the standard shape. The
// operator/dev bypass header works exactly as on the sibling exports.

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
  buildEngineRefreshBody,
  buildFloodDrainageGateHeaders,
  FLOOD_DRAINAGE_FORMAT,
  FLOOD_ENGINE_GATE_TOKEN_MESSAGE,
  FLOOD_ENGINE_GATE_TOKEN_MISSING_MESSAGE,
  FLOOD_REFRESH_ACK_TIMEOUT_MS,
  floodDrainageFilename,
  isValidParcelNodeId,
  mapEngineFloodDrainageAccepted,
  mapEngineFloodPayload,
  parseFloodDrainageRefreshBody,
  resolveFloodDrainageAuth,
  retryableFloodEngineFailureResponse,
} from './pe-flood-drainage-core.js'

/** Session + property-entitlement gate. Writes the failure response itself. */
async function requireEntitledSession(
  req: VercelRequest,
  res: VercelResponse,
  parcelNodeId: string,
): Promise<boolean> {
  const token = readPeSessionCookie(req.headers.cookie)
  const devBypass = isPeExportDevBypassArmed({
    headerValue: req.headers[PE_EXPORT_DEV_BYPASS_HEADER],
  })
  // The usePropertyEntitlement server twin: the SAME detail reader the WB7b
  // dossier gate consumes (GET /entitlement?parcelNodeId=...).
  const detail =
    token && !devBypass
      ? await fetchPeEntitlementDetail(token, parcelNodeId)
      : ({ ok: false, status: 401 } as const)
  const gate = resolveFloodDrainageAuth({
    sessionToken: token,
    entitlement: detail.ok
      ? {
          ok: true,
          tier: detail.tier,
          propertyUnlocked: detail.propertyUnlocked,
        }
      : detail,
    devBypass,
  })
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.error, message: gate.message })
    return false
  }
  if (gate.via === 'dev-bypass') {
    res.setHeader('X-PE-Export-Dev-Bypass', '1')
  }
  return true
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
      message: FLOOD_ENGINE_GATE_TOKEN_MESSAGE,
      detail: input.message,
    })
    return
  }
  const transient = retryableFloodEngineFailureResponse(kind, input.message)
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
  const parsed = parseFloodDrainageRefreshBody(req.body)
  if (!parsed.ok) {
    res.status(400).json({ error: 'invalid_request', message: parsed.message })
    return
  }
  const { parcelNodeId } = parsed.request
  if (!(await requireEntitledSession(req, res, parcelNodeId))) return

  const gateToken = engineApiGateToken()
  if (!gateToken) {
    res.status(503).json({
      error: 'engine_gate_config',
      message: FLOOD_ENGINE_GATE_TOKEN_MISSING_MESSAGE,
      missing: 'HAUSKA_ENGINE_API_KEY|ENGINE_API_GATE_TOKEN',
    })
    return
  }

  const target = `${engineApiBaseUrl()}/v1/property-nodes/${encodeURIComponent(parcelNodeId)}/flood-drainage/refresh`
  try {
    const upstream = await fetch(target, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${gateToken}`,
        'Content-Type': 'application/json',
        ...buildFloodDrainageGateHeaders(),
      },
      body: JSON.stringify(buildEngineRefreshBody(parsed.request)),
      signal: AbortSignal.timeout(FLOOD_REFRESH_ACK_TIMEOUT_MS),
    })
    // P-240: the engine's async refresh route has NO 422 branch any more —
    // every geometry/DEM/model failure that used to surface here now
    // settles as a job `state: failed` on the /study or /download leg
    // instead (read on a later poll). A non-ok response here is always a
    // genuine ACCEPT-leg failure (gate/timeout/unreachable/other).
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '')
      engineFailure(
        res,
        { status: upstream.status, message: text || `engine ${upstream.status}` },
        { error: 'upstream_error' },
      )
      return
    }
    // P-240: the engine now answers 202 (queued/running) — it never
    // finishes composing inline, so there is no study payload to map here
    // yet. The browser polls the /study leg below for the result.
    const payload = (await upstream.json().catch(() => null)) as unknown
    const mapped = mapEngineFloodDrainageAccepted(payload, parcelNodeId)
    if (!mapped.ok) {
      res.status(502).json({ error: 'upstream_error', message: mapped.message })
      return
    }
    res.status(202).json({
      ...mapped.response,
      ...(parsed.request.factSheetId
        ? { factSheetId: parsed.request.factSheetId }
        : {}),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    engineFailure(res, { message }, { error: 'upstream_error' })
  }
}

async function handleStudy(req: VercelRequest, res: VercelResponse): Promise<void> {
  const parcelNodeId = queryString(req.query.parcelNodeId)
  if (!isValidParcelNodeId(parcelNodeId)) {
    res.status(400).json({ error: 'invalid_parcel_node_id' })
    return
  }
  if (!(await requireEntitledSession(req, res, parcelNodeId))) return

  const gateToken = engineApiGateToken()
  if (!gateToken) {
    res.status(503).json({
      error: 'engine_gate_config',
      message: FLOOD_ENGINE_GATE_TOKEN_MISSING_MESSAGE,
      missing: 'HAUSKA_ENGINE_API_KEY|ENGINE_API_GATE_TOKEN',
    })
    return
  }

  const target = `${engineApiBaseUrl()}/v1/property-nodes/${encodeURIComponent(parcelNodeId)}/flood-drainage/study`
  try {
    const upstream = await fetch(target, {
      headers: {
        Authorization: `Bearer ${gateToken}`,
        Accept: 'application/json',
        ...buildFloodDrainageGateHeaders(),
      },
      signal: AbortSignal.timeout(30_000),
    })
    // Pinned contract (P-240): 404 study_unavailable (nothing on file, OR
    // the DECLARED wait while queued/running — the engine's 404 body names
    // which via `state`), 410 artifact_evicted (stored ref can't be read
    // back), 422 flood_drainage_refresh_failed with an errorClass (the job
    // settled to `failed`). Pass through as-is — honest states, never a
    // stale study served silently while a new refresh is in flight.
    if (upstream.status === 404 || upstream.status === 410 || upstream.status === 422) {
      const body = (await upstream.json().catch(() => ({}))) as {
        error?: string
        message?: string
        state?: string
        errorClass?: string
        jobRef?: string
        pollAfterMs?: number
      }
      res.status(upstream.status).json({
        error: body.error ?? (upstream.status === 422 ? 'flood_drainage_refresh_failed' : 'study_unavailable'),
        message: body.message,
        ...(body.state ? { state: body.state } : {}),
        ...(body.errorClass ? { errorClass: body.errorClass } : {}),
        ...(body.jobRef ? { jobRef: body.jobRef } : {}),
        ...(body.pollAfterMs ? { pollAfterMs: body.pollAfterMs } : {}),
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
    const payload = (await upstream.json().catch(() => null)) as unknown
    const mapped = mapEngineFloodPayload(payload, parcelNodeId)
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
  const format = queryString(req.query.format) ?? FLOOD_DRAINAGE_FORMAT
  if (!isValidParcelNodeId(parcelNodeId)) {
    res.status(400).json({ error: 'invalid_parcel_node_id' })
    return
  }
  if (format !== FLOOD_DRAINAGE_FORMAT) {
    res.status(400).json({
      error: 'invalid_format',
      message: `format must be ${FLOOD_DRAINAGE_FORMAT}`,
    })
    return
  }
  if (!(await requireEntitledSession(req, res, parcelNodeId))) return

  const gateToken = engineApiGateToken()
  if (!gateToken) {
    res.status(503).json({
      error: 'engine_gate_config',
      message: FLOOD_ENGINE_GATE_TOKEN_MISSING_MESSAGE,
      missing: 'HAUSKA_ENGINE_API_KEY|ENGINE_API_GATE_TOKEN',
    })
    return
  }

  const target = `${engineApiBaseUrl()}/v1/property-nodes/${encodeURIComponent(parcelNodeId)}/flood-drainage/download?format=${FLOOD_DRAINAGE_FORMAT}`
  try {
    const upstream = await fetch(target, {
      headers: {
        Authorization: `Bearer ${gateToken}`,
        ...buildFloodDrainageGateHeaders(),
      },
      signal: AbortSignal.timeout(30_000),
    })
    // Same P-240 declared-wait / failed-job additions as /study above,
    // layered on the original 404 artifact_unavailable / 410 evicted shapes.
    if (upstream.status === 404 || upstream.status === 410 || upstream.status === 422) {
      const body = (await upstream.json().catch(() => ({}))) as {
        error?: string
        message?: string
        state?: string
        errorClass?: string
        jobRef?: string
        pollAfterMs?: number
      }
      res.status(upstream.status).json({
        error: body.error ?? (upstream.status === 422 ? 'flood_drainage_refresh_failed' : 'artifact_unavailable'),
        message: body.message,
        ...(body.state ? { state: body.state } : {}),
        ...(body.errorClass ? { errorClass: body.errorClass } : {}),
        ...(body.jobRef ? { jobRef: body.jobRef } : {}),
        ...(body.pollAfterMs ? { pollAfterMs: body.pollAfterMs } : {}),
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
      `attachment; filename="${floodDrainageFilename(parcelNodeId)}"`,
    )
    const generatedAt = upstream.headers.get('X-Flood-Drainage-Generated-At')
    if (generatedAt) {
      res.setHeader('X-Flood-Drainage-Generated-At', generatedAt)
    }
    res.status(200).send(bytes)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    engineFailure(res, { message }, { error: 'download_failed' })
  }
}

/** Entry point the folded pe-site-plan-export function dispatches to. */
export async function handleFloodDrainageRequest(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const action = queryString(req.query.action)
  if (req.method === 'POST') {
    await handleRefresh(req, res)
    return
  }
  if (req.method === 'GET' && action === 'study') {
    await handleStudy(req, res)
    return
  }
  if (req.method === 'GET' && action === 'download') {
    await handleDownload(req, res)
    return
  }
  res.status(405).json({ error: 'method_not_allowed' })
}
