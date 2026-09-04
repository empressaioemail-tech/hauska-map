// apps/property-explorer/api/_lib/pe-feasibility-export-core.ts
//
// Pure helpers for the FEASIBILITY STUDY report BFF (P32 wave 2 — the
// engine side shipped in hauska-engine PR #380; this is the PE-side wiring
// only). Framework-free so gate-header construction, auth resolution, and
// engine-payload mapping are unit-testable without a serverless runtime.
//
// TRANSPORT: DIRECT BFF -> engine-api with gate-front headers — the SAME
// proven pattern pe-flood-drainage-core.ts uses (see that file's own
// comment for the full rationale: engine-api's gate middleware is global,
// no per-route-family signing). There is NO feasibility-export MCP tool
// (hauska-mcp-server is a different seat's repo; adding one there is out of
// scope for this wiring) so, UNLIKE the dossier fold-in (which hops through
// MCP for its refresh POST and only goes direct-to-engine-api for its
// download GET), BOTH the refresh POST and the download GET call engine-api
// directly here.
//
// GATE: Studio/Team ONLY — the P32 tier ruling
// (doc_repo/_decisions/2026-09-03_p32_feasibility_tier_ruling.md): reuse the
// server-computed studioGranted, never a new independent check. This is the
// SAME decision structure resolveSitePlanExportAuth already enforces for
// site-plan/terrain (P-104) — NOT the property-unlock-or-Pro gate
// flood-drainage and X-ray use. The structure is intentionally re-declared
// here (not imported) because its refusal copy is feasibility-specific;
// pe-feasibility-export.test.ts binds the two gates to answer identically
// on every tier, the same cross-check pattern
// pe-site-plan-export-bff.test.ts already runs between site-plan and
// terrain.

import {
  type EngineFailureKind,
  isValidParcelNodeId,
} from './pe-site-plan-export-core.js'

export { isValidParcelNodeId }

/** The single engine artifact format this report exposes (pinned contract). */
export const FEASIBILITY_EXPORT_FORMAT = 'pdf-feasibility' as const

/**
 * Gate-front headers engine-api requires on every non-health call. Mirrors
 * buildSitePlanEngineGateHeaders / buildFloodDrainageGateHeaders with its
 * own package id so gate-front logging can distinguish this report from
 * site-plan-export (same reasoning as the comment on
 * buildSitePlanEngineGateHeaders).
 */
export function buildFeasibilityEngineGateHeaders(opts?: {
  requestId?: string
  credentialId?: string
  tenantId?: string
}): Record<string, string> {
  const requestId =
    opts?.requestId?.trim() ||
    (typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `pe-feasibility-${Date.now()}`)
  return {
    'x-hauska-product': 'cortex',
    'x-hauska-tenant-id': opts?.tenantId?.trim() || 'public-catalog',
    'x-hauska-package-id': 'feasibility-export',
    'x-hauska-access-tier': 'public-paid',
    'x-hauska-gate-credential-id':
      opts?.credentialId?.trim() || 'property-explorer-feasibility-bff',
    'x-hauska-request-id': requestId,
  }
}

// ---------------------------------------------------------------------------
// Auth — session + STUDIO/TEAM entitlement (P-104's rule, reused verbatim;
// NOT the property-unlock-or-Pro gate).
// ---------------------------------------------------------------------------

export const FEASIBILITY_STUDIO_REQUIRED_MESSAGE =
  'Feasibility Study is a Studio deliverable. Your plan does not include it.'

/** Refusal reason when the entitlement server did not report `studioGranted`
 *  at all — UNMEASURED, not denied. Never shown as a paywall. */
export const FEASIBILITY_STUDIO_UNMEASURED_MESSAGE =
  'Studio entitlement could not be determined: the entitlement service did not report studioGranted. Feasibility Study is refused rather than served unverified.'

export type FeasibilityExportAuthResult =
  | { ok: true; devBypass?: boolean }
  | { ok: false; status: 401 | 402 | 503; error: string; message?: string }

/**
 * Mirrors resolveSitePlanExportAuth's decision structure exactly — one
 * product rule (Studio or Team via the server-computed studioGranted),
 * `studioGranted` deliberately REQUIRED (not optional) so no call site can
 * omit it and fall through silently — with feasibility's own refusal copy.
 */
export function resolveFeasibilityExportAuth(input: {
  sessionToken: string | null
  entitlement:
    | { ok: true; tier: 'free' | 'paid'; studioGranted: boolean | null }
    | { ok: false; status: 401 | 402 | 503; message?: string }
  /** Operator/dev bypass — session still required; skips paid check. */
  devBypass?: boolean
}): FeasibilityExportAuthResult {
  if (!input.sessionToken) {
    return {
      ok: false,
      status: 401,
      error: 'authentication_required',
      message: 'Sign in to generate the feasibility study.',
    }
  }
  if (input.devBypass) {
    return { ok: true, devBypass: true }
  }
  if (!input.entitlement.ok) {
    const denied = input.entitlement as { status: 503 | 402 | 401; message?: string }
    return {
      ok: false,
      status: denied.status,
      error:
        denied.status === 401
          ? 'authentication_required'
          : denied.status === 402
            ? 'payment_required'
            : 'entitlement_unavailable',
      message: denied.message,
    }
  }
  if (input.entitlement.tier !== 'paid') {
    return {
      ok: false,
      status: 402,
      error: 'payment_required',
      message: 'Pro entitlement required.',
    }
  }
  // P-104's rule. Paid is necessary and NOT sufficient: Solo is paid.
  if (input.entitlement.studioGranted === null) {
    return {
      ok: false,
      status: 503,
      error: 'entitlement_contract_incomplete',
      message: FEASIBILITY_STUDIO_UNMEASURED_MESSAGE,
    }
  }
  if (input.entitlement.studioGranted !== true) {
    return {
      ok: false,
      status: 402,
      error: 'studio_required',
      message: FEASIBILITY_STUDIO_REQUIRED_MESSAGE,
    }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Request parsing. The engine's refresh body accepts a fuller override
// contract (bboxOverride, ringOverride, resolutionMeters,
// contourIntervalMeters, frontEdgeIndex, skirtDepthFeet, streetAnchors,
// centroidOverride, floodStudyAvailable, narrativeOverride) — none of that
// is exposed at this UI surface yet. PE forwards exactly what the
// dossier-export refresh body already sends today: address, countyName,
// liveViewUrl. Wiring the fuller override contract is a follow-up, not this
// wave.
// ---------------------------------------------------------------------------

export interface FeasibilityRefreshRequest {
  parcelNodeId: string
  address?: string
  countyName?: string
  liveViewUrl?: string
}

export function parseFeasibilityRefreshBody(
  body: unknown,
): { ok: true; request: FeasibilityRefreshRequest } | { ok: false; message: string } {
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
  const request: FeasibilityRefreshRequest = {
    parcelNodeId: b.parcelNodeId as string,
  }
  if (typeof b.address === 'string' && b.address.trim()) {
    request.address = b.address.trim().slice(0, 200)
  }
  if (typeof b.countyName === 'string' && b.countyName.trim()) {
    request.countyName = b.countyName.trim().slice(0, 120)
  }
  if (typeof b.liveViewUrl === 'string' && b.liveViewUrl.trim()) {
    request.liveViewUrl = b.liveViewUrl.trim().slice(0, 500)
  }
  return { ok: true, request }
}

/** Build the engine refresh body — only the fields PE forwards today. */
export function buildEngineFeasibilityRefreshBody(
  req: FeasibilityRefreshRequest,
): Record<string, unknown> {
  return {
    ...(req.address ? { address: req.address } : {}),
    ...(req.countyName ? { countyName: req.countyName } : {}),
    ...(req.liveViewUrl ? { liveViewUrl: req.liveViewUrl } : {}),
  }
}

// ---------------------------------------------------------------------------
// Response mapping. The pinned contract's refresh (201) / GET (200) body is
// FLAT — no `data` envelope, unlike flood-drainage's `{ data: { study,
// artifact } }`:
//   { atom, artifacts: { "pdf-feasibility": {...} }, pageCount,
//     feasibilityPageCount, sitePlanAppended, sitePlanUnavailableReason?,
//     sectionCount, openItemCount, narrativeIsDeterministicSkeleton }
// ---------------------------------------------------------------------------

export function buildFeasibilityDownloadPath(parcelNodeId: string): string {
  const qs = new URLSearchParams({
    parcelNodeId,
    kind: 'feasibility',
    action: 'download',
  })
  return `/api/pe-site-plan-export?${qs.toString()}`
}

export function feasibilityFilename(parcelNodeId: string): string {
  return `${parcelNodeId.replace(':', '_')}_feasibility_study.pdf`
}

export interface FeasibilityExportBffResponse {
  ok: true
  parcelNodeId: string
  format: typeof FEASIBILITY_EXPORT_FORMAT
  downloadUrl: string
  pageCount?: number
  feasibilityPageCount?: number
  sitePlanAppended?: boolean
  sitePlanUnavailableReason?: string
  sectionCount?: number
  openItemCount?: number
  narrativeIsDeterministicSkeleton?: boolean
}

function optBool(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined
}

function optNum(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null
}

/**
 * Map the engine's refresh (201) / GET (200) payload to the BFF response.
 * A payload without an `artifacts["pdf-feasibility"]` entry is an upstream
 * error, never a fabricated download link.
 */
export function mapEngineFeasibilityPayload(
  payload: unknown,
  requestParcelNodeId: string,
): { ok: true; response: FeasibilityExportBffResponse } | { ok: false; message: string } {
  const p = asRecord(payload)
  if (!p) {
    return { ok: false, message: 'Engine feasibility-export payload was not an object.' }
  }
  const atom = asRecord(p.atom)
  const artifacts = asRecord(p.artifacts)
  const artifact = artifacts ? asRecord(artifacts[FEASIBILITY_EXPORT_FORMAT]) : null
  if (!artifact) {
    return {
      ok: false,
      message: 'Engine feasibility-export payload carried no pdf-feasibility artifact.',
    }
  }
  const parcelNodeId =
    (typeof atom?.parcelNodeId === 'string' && atom.parcelNodeId) ||
    (typeof p.parcelNodeId === 'string' && p.parcelNodeId) ||
    requestParcelNodeId

  if (!isValidParcelNodeId(parcelNodeId)) {
    return { ok: false, message: 'Engine feasibility-export payload missing parcelNodeId.' }
  }

  return {
    ok: true,
    response: {
      ok: true,
      parcelNodeId,
      format: FEASIBILITY_EXPORT_FORMAT,
      downloadUrl: buildFeasibilityDownloadPath(parcelNodeId),
      pageCount: optNum(p.pageCount),
      feasibilityPageCount: optNum(p.feasibilityPageCount),
      sitePlanAppended: optBool(p.sitePlanAppended),
      sitePlanUnavailableReason:
        typeof p.sitePlanUnavailableReason === 'string'
          ? p.sitePlanUnavailableReason
          : undefined,
      sectionCount: optNum(p.sectionCount),
      openItemCount: optNum(p.openItemCount),
      narrativeIsDeterministicSkeleton: optBool(p.narrativeIsDeterministicSkeleton),
    },
  }
}

// ---------------------------------------------------------------------------
// Honest failure copy (timeout classes REUSED from the site-plan core's
// classifyEngineFailure; only the customer wording is report-specific).
// ---------------------------------------------------------------------------

export const FEASIBILITY_ENGINE_GATE_TOKEN_MESSAGE =
  'Feasibility Study needs an engine-api gate token (server config) — HAUSKA_ENGINE_API_KEY / gate-front context not set or not accepted.'

export const FEASIBILITY_ENGINE_TIMEOUT_RETRY_MESSAGE =
  'Feasibility Study engine timed out — this usually means a cold start. Try the report again in a moment.'

export const FEASIBILITY_ENGINE_UNREACHABLE_RETRY_MESSAGE =
  'Feasibility Study engine did not respond — it may be restarting. Try the report again in a moment.'

export const FEASIBILITY_ENGINE_GATE_TOKEN_MISSING_MESSAGE =
  'Feasibility Study is not configured: engine-api gate token missing (set HAUSKA_ENGINE_API_KEY or ENGINE_API_GATE_TOKEN).'

/**
 * 503 + retryable body for the transient engine failure classes
 * (timeout / unreachable); null for everything else so callers keep their
 * existing gate/payment/other handling.
 */
export function retryableFeasibilityEngineFailureResponse(
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
        message: FEASIBILITY_ENGINE_TIMEOUT_RETRY_MESSAGE,
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
        message: FEASIBILITY_ENGINE_UNREACHABLE_RETRY_MESSAGE,
        retryable: true,
        detail,
      },
    }
  }
  return null
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}
