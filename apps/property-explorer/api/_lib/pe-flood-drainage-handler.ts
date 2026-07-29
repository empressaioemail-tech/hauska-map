// apps/property-explorer/api/_lib/pe-flood-drainage-handler.ts
//
// FLOOD & DRAINAGE report request handlers (R3 — the FIRST paid report).
//
// FOLDED into the pe-site-plan-export serverless function (report=
// flood-drainage discriminator) — PE sits at the 11/12 Vercel Hobby
// function cap, so this is NOT a new function; pe-site-plan-export.ts
// dispatches here. Underscore-prefixed dir = never deployed standalone.
//
// Surface (mirrors the pinned engine contract 1:1):
//   POST /api/pe-site-plan-export?report=flood-drainage
//     { parcelNodeId, address?, countyName?, rainfallDepthInches? }
//     → 200 { ok, parcelNodeId, study, artifact }   (engine 201 refresh)
//   GET  ...?report=flood-drainage&action=study&parcelNodeId=...
//     → 200 { ok, parcelNodeId, study }             (cached study passthrough)
//   GET  ...?report=flood-drainage&action=download&parcelNodeId=...&format=pdf-flood-drainage
//     → application/pdf stream
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
  FLOOD_ENGINE_TIMEOUT_MS,
  floodDrainageFilename,
  isValidParcelNodeId,
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
      signal: AbortSignal.timeout(FLOOD_ENGINE_TIMEOUT_MS),
    })
    if (upstream.status === 422) {
      // The engine's honest refresh failure (geometry/DEM/model) — pass the
      // real reason through, never the paywall and never a fake study.
      const body = (await upstream.json().catch(() => ({}))) as {
        message?: string
      }
      res.status(422).json({
        error: 'flood_drainage_refresh_failed',
        message: body.message ?? 'Drainage study could not be produced for this parcel.',
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
    if (upstream.status === 404 || upstream.status === 410) {
      // Honest cache misses from the engine (no study yet / bytes evicted)
      // — pass the engine's own reason through.
      const body = (await upstream.json().catch(() => ({}))) as {
        error?: string
        message?: string
      }
      res.status(upstream.status).json({
        error: body.error ?? 'study_unavailable',
        message: body.message,
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
      `attachment; filename="${floodDrainageFilename(parcelNodeId)}"`,
    )
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
