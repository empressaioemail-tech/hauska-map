// apps/property-explorer/api/_lib/pe-flood-drainage-core.ts
//
// Pure helpers for the FLOOD & DRAINAGE report BFF (R3 — the FIRST paid
// report bubble). Framework-free so validation, gate-header construction,
// auth resolution, and engine-payload mapping are unit-testable without a
// serverless runtime.
//
// TRANSPORT (decided R3): DIRECT BFF -> engine-api with gate-front headers —
// the SAME proven pattern the topo/hydro/hydrography BFFs use against
// /v1/map-layers/assemble. Engine-api's gate middleware is GLOBAL
// (server.ts app.use("*") bearer + gate-front; v1.use("*") gate-context
// mode), identical for /v1/map-layers and /v1/property-nodes — there is no
// per-route-family signing, and NO flood-drainage MCP tools exist. If the
// deployed engine ever flips gate-context to enforce mode, these calls fail
// CLOSED into the honest `engine_gate_config` 503 the map-layer BFFs already
// surface — never a silent fallback.
//
// PAID enforcement is OURS (BFF): PE session + PROPERTY entitlement
// (per-property $15 unlock OR Pro tier) via fetchPeEntitlementDetail — the
// usePropertyEntitlement server twin the WB7b dossier leg established.
// 402 carries the standard shape.

import {
  type EngineFailureKind,
  isValidParcelNodeId,
} from './pe-site-plan-export-core.js'

export { isValidParcelNodeId }

/** The single engine artifact format this report exposes (pinned contract). */
export const FLOOD_DRAINAGE_FORMAT = 'pdf-flood-drainage' as const

/** The report discriminator on the folded pe-site-plan-export function. */
export const FLOOD_DRAINAGE_REPORT = 'flood-drainage' as const

/**
 * P-240 (OPS-24, 2026-09-15): refresh no longer waits for the engine to
 * COMPOSE the study (that took 56-75s measured on Travis, F7/P-240,
 * 6 of 11 calls over the OLD 55,000ms client abort while the engine itself
 * returned 201 on all 11 — the engine never failed) — it returns 202 as
 * soon as the engine ACKNOWLEDGES the job (queued/running), ported onto
 * P-155's feasibility-export pattern. 15s is generous headroom over that
 * ack, not a budget for the composition itself. The OLD
 * `FLOOD_ENGINE_TIMEOUT_MS = 55_000` budgeted for composition finishing
 * inline and is retired along with the "cold start" retry copy it existed
 * to excuse below.
 */
export const FLOOD_REFRESH_ACK_TIMEOUT_MS = 15_000

/**
 * Gate-front headers engine-api requires on every non-health call. Mirrors
 * buildSitePlanEngineGateHeaders at the public-PAID tier with its own
 * package id so gate-front logging can distinguish the report.
 */
export function buildFloodDrainageGateHeaders(opts?: {
  requestId?: string
  credentialId?: string
  tenantId?: string
}): Record<string, string> {
  const requestId =
    opts?.requestId?.trim() ||
    (typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `pe-flood-${Date.now()}`)
  return {
    'x-hauska-product': 'cortex',
    'x-hauska-tenant-id': opts?.tenantId?.trim() || 'public-catalog',
    'x-hauska-package-id': 'flood-drainage-report',
    'x-hauska-access-tier': 'public-paid',
    'x-hauska-gate-credential-id':
      opts?.credentialId?.trim() || 'property-explorer-flood-drainage-bff',
    'x-hauska-request-id': requestId,
  }
}

// ---------------------------------------------------------------------------
// Auth — session + PROPERTY entitlement (the R3 paid gate).
// ---------------------------------------------------------------------------

export const FLOOD_PROPERTY_LOCKED_MESSAGE =
  'Unlock this property (or Pro) to run the flood & drainage report.'

export type FloodDrainageAuthResult =
  | { ok: true; via: 'pro' | 'property' | 'dev-bypass' }
  | { ok: false; status: 401 | 402 | 503; error: string; message?: string }

/**
 * The property-scoped paid gate: session required always; the operator/dev
 * bypass (session still required) skips only the paid check; otherwise the
 * property must be unlocked OR the user Pro. 402 is the STANDARD shape
 * `{ error: "payment_required", message }` so the client's reactive belt
 * (openPaywall) keeps working unchanged. Entitlement input is the
 * fetchPeEntitlementDetail snapshot shape (the same source the WB7b dossier
 * gate consumes) — propertyUnlocked null (older backend, no property block)
 * NEVER counts as an unlock.
 */
export function resolveFloodDrainageAuth(input: {
  sessionToken: string | null
  entitlement:
    | { ok: true; tier: 'free' | 'paid'; propertyUnlocked: boolean | null }
    | { ok: false; status: 401 | 503; message?: string }
  devBypass?: boolean
}): FloodDrainageAuthResult {
  if (!input.sessionToken) {
    return {
      ok: false,
      status: 401,
      error: 'authentication_required',
      message: 'Sign in to run the flood & drainage report.',
    }
  }
  if (input.devBypass) {
    return { ok: true, via: 'dev-bypass' }
  }
  if (!input.entitlement.ok) {
    return {
      ok: false,
      status: input.entitlement.status,
      error:
        input.entitlement.status === 401
          ? 'authentication_required'
          : 'entitlement_unavailable',
      message: input.entitlement.message,
    }
  }
  if (input.entitlement.tier === 'paid') {
    return { ok: true, via: 'pro' }
  }
  if (input.entitlement.propertyUnlocked === true) {
    return { ok: true, via: 'property' }
  }
  return {
    ok: false,
    status: 402,
    error: 'payment_required',
    message: FLOOD_PROPERTY_LOCKED_MESSAGE,
  }
}

// ---------------------------------------------------------------------------
// Request parsing.
// ---------------------------------------------------------------------------

export interface FloodDrainageRefreshRequest {
  parcelNodeId: string
  /**
   * The SUBJECT'S sealed fact-sheet id (I1). The study that came back for
   * 48027:498770 while 498778 was selected is why the study is keyed on the
   * sheet the user is looking at, and why the artifact prints the id.
   */
  factSheetId?: string
  address?: string
  countyName?: string
  rainfallDepthInches?: number
  liveViewUrl?: string
}

/** Validate the refresh POST body (engine bounds mirrored: 0 < depth <= 60). */
export function parseFloodDrainageRefreshBody(
  body: unknown,
): { ok: true; request: FloodDrainageRefreshRequest } | { ok: false; message: string } {
  const b = (typeof body === 'string' ? safeJson(body) : body) as
    | Record<string, unknown>
    | null
  if (!b || typeof b !== 'object') {
    return { ok: false, message: 'body must be a JSON object with parcelNodeId' }
  }
  if (!isValidParcelNodeId(b.parcelNodeId)) {
    return {
      ok: false,
      message: 'parcelNodeId must match {fips}:{propId}, e.g. 48029:105129.',
    }
  }
  const request: FloodDrainageRefreshRequest = {
    parcelNodeId: b.parcelNodeId as string,
  }
  if (typeof b.factSheetId === 'string' && b.factSheetId.trim()) {
    request.factSheetId = b.factSheetId.trim().slice(0, 64)
  }
  if (typeof b.address === 'string' && b.address.trim()) {
    request.address = b.address.slice(0, 200)
  }
  if (typeof b.countyName === 'string' && b.countyName.trim()) {
    request.countyName = b.countyName.slice(0, 120)
  }
  if (b.rainfallDepthInches !== undefined) {
    const depth = b.rainfallDepthInches
    if (
      typeof depth !== 'number' ||
      !Number.isFinite(depth) ||
      depth <= 0 ||
      depth > 60
    ) {
      return {
        ok: false,
        message: 'rainfallDepthInches must be a number in (0, 60].',
      }
    }
    request.rainfallDepthInches = depth
  }
  if (typeof b.liveViewUrl === 'string' && b.liveViewUrl.trim()) {
    request.liveViewUrl = b.liveViewUrl.trim().slice(0, 500)
  }
  return { ok: true, request }
}

/** Build the engine refresh body — only the pinned-contract fields. */
export function buildEngineRefreshBody(
  req: FloodDrainageRefreshRequest,
): Record<string, unknown> {
  return {
    ...(req.factSheetId ? { factSheetId: req.factSheetId } : {}),
    ...(req.address ? { address: req.address } : {}),
    ...(req.countyName ? { countyName: req.countyName } : {}),
    ...(req.rainfallDepthInches !== undefined
      ? { rainfallDepthInches: req.rainfallDepthInches }
      : {}),
    ...(req.liveViewUrl ? { liveViewUrl: req.liveViewUrl } : {}),
  }
}

// ---------------------------------------------------------------------------
// Engine payload mapping (validation-light passthrough — the study is the
// engine's truth; the BFF never rewrites values, only verifies the shape).
// ---------------------------------------------------------------------------

export interface FloodDrainageBffResponse {
  ok: true
  parcelNodeId: string
  study: Record<string, unknown>
  artifact?: Record<string, unknown> | null
}

/**
 * Map the engine refresh/study payload (`{ data: { parcelNodeId, study,
 * artifact? } }`) to the BFF response. A payload without a `study` object is
 * an upstream error, never a fabricated empty study.
 */
export function mapEngineFloodPayload(
  payload: unknown,
  parcelNodeId: string,
): { ok: true; response: FloodDrainageBffResponse } | { ok: false; message: string } {
  const p = payload as Record<string, unknown> | null
  const data = (p?.data ?? null) as Record<string, unknown> | null
  const study = (data?.study ?? null) as Record<string, unknown> | null
  if (!study || typeof study !== 'object') {
    return {
      ok: false,
      message: 'Engine flood-drainage payload carried no study object.',
    }
  }
  const artifact = (data?.artifact ?? null) as Record<string, unknown> | null
  return {
    ok: true,
    response: {
      ok: true,
      parcelNodeId,
      study,
      ...(artifact ? { artifact } : {}),
    },
  }
}

// ---------------------------------------------------------------------------
// P-240 (OPS-24, 2026-09-15): async job mapping. Refresh now ACCEPTS (202)
// instead of returning the composed study inline — `mapEngineFloodPayload`
// above is UNCHANGED and still does real work: the engine's `/study` and
// `/download` legs keep the pinned `{ data: { parcelNodeId, study } }`
// shape on their own 200 (ready) response, so that mapper still applies
// there verbatim. `mapEngineFloodDrainageAccepted` below is what the NEW
// refresh leg uses instead — mirrors mapEngineFeasibilityAccepted
// (pe-feasibility-export-core.ts) 1:1.
// ---------------------------------------------------------------------------

export type FloodDrainageJobState = 'queued' | 'running' | 'ready' | 'failed'

export interface FloodDrainageAcceptedResponse {
  ok: true
  parcelNodeId: string
  state: 'queued' | 'running'
  jobRef: string
  pollAfterMs: number
}

const DEFAULT_FLOOD_POLL_AFTER_MS = 5_000

/** Maps the engine's 202 refresh-accepted body: `{ state, jobRef,
 * pollAfterMs, statusUrl, downloadUrl }`. Never `ready` on this leg — the
 * engine's refresh handler always answers `queued` or `running` (a second
 * refresh while one is running returns the SAME jobRef, never a new one). */
export function mapEngineFloodDrainageAccepted(
  payload: unknown,
  requestParcelNodeId: string,
): { ok: true; response: FloodDrainageAcceptedResponse } | { ok: false; message: string } {
  const p = payload as Record<string, unknown> | null
  if (!p || (p.state !== 'queued' && p.state !== 'running') || typeof p.jobRef !== 'string') {
    return {
      ok: false,
      message: 'Engine flood-drainage refresh payload missing a queued/running state or jobRef.',
    }
  }
  return {
    ok: true,
    response: {
      ok: true,
      parcelNodeId: requestParcelNodeId,
      state: p.state,
      jobRef: p.jobRef,
      pollAfterMs:
        typeof p.pollAfterMs === 'number' && Number.isFinite(p.pollAfterMs)
          ? p.pollAfterMs
          : DEFAULT_FLOOD_POLL_AFTER_MS,
    },
  }
}

// ---------------------------------------------------------------------------
// Honest failure copy (timeout classes REUSED from the site-plan core's
// classifyEngineFailure; only the customer wording is report-specific).
//
// P-240 (2026-09-15): the refresh leg now only waits for the engine to
// ACCEPT the job (202), not to finish composing it — the two retired
// messages below both told the customer "this can take up to a minute /
// may be restarting, try again", which was never the honest mechanism
// (F7/P-240: the engine was never cold; the OLD client budget was just
// shorter than the composition). A timeout on the ACK itself is now
// genuinely rare and genuinely means the engine didn't respond in time, so
// the replacement copy says exactly that and nothing about cold starts or
// manual retries — the browser's poll loop (floodDrainageClient.ts) is the
// retry mechanism now, not the customer.
// ---------------------------------------------------------------------------

export const FLOOD_ENGINE_GATE_TOKEN_MESSAGE =
  'Flood & drainage report needs an engine-api gate token (server config) — HAUSKA_ENGINE_API_KEY / gate-front context not set or not accepted.'

export const FLOOD_ENGINE_ACK_TIMEOUT_MESSAGE =
  'Flood & drainage engine did not accept the request in time. Try Generate again.'

export const FLOOD_ENGINE_ACK_UNREACHABLE_MESSAGE =
  'Flood & drainage engine did not respond. Try Generate again.'

export const FLOOD_ENGINE_GATE_TOKEN_MISSING_MESSAGE =
  'Flood & drainage report is not configured: engine-api gate token missing (set HAUSKA_ENGINE_API_KEY or ENGINE_API_GATE_TOKEN).'

/**
 * 503 + retryable body for the transient engine failure classes on the
 * ACCEPT leg only; null for everything else so callers keep their existing
 * gate/payment/other handling. Since P-240 this can only fire when the
 * engine fails to even ACKNOWLEDGE the refresh (queued/running) —
 * composition failures surface as a job `state: failed` on the `/study` /
 * `/download` legs instead, never as this transient-retry shape.
 */
export function retryableFloodEngineFailureResponse(
  kind: EngineFailureKind,
  detail: string,
): {
  status: 503
  body: { error: string; message: string; retryable: true; detail: string }
} | null {
  if (kind === 'engine_timeout') {
    return {
      status: 503,
      body: {
        error: 'engine_timeout',
        message: FLOOD_ENGINE_ACK_TIMEOUT_MESSAGE,
        retryable: true,
        detail,
      },
    }
  }
  if (kind === 'unreachable') {
    return {
      status: 503,
      body: {
        error: 'engine_unreachable',
        message: FLOOD_ENGINE_ACK_UNREACHABLE_MESSAGE,
        retryable: true,
        detail,
      },
    }
  }
  return null
}

export function floodDrainageFilename(parcelNodeId: string): string {
  return `${parcelNodeId.replace(':', '_')}_flood_drainage.pdf`
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}
