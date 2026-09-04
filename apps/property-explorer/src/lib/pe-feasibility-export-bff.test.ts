/**
 * FEASIBILITY STUDY report BFF core tests (P32 wave 2).
 *
 * Covers the pure pieces of the fold-in contract: the Studio/Team entitlement
 * gate (P-104's rule, reused — NOT the property-unlock-or-Pro gate
 * flood-drainage/X-ray use), gate-front headers, refresh-body validation,
 * the FLAT engine-payload mapping (no `data` envelope, unlike
 * flood-drainage), the feasibility-worded transient failure classes, and the
 * filename/download-path helpers. Mirrors pe-flood-drainage-bff.test.ts and
 * pe-site-plan-export-bff.test.ts in shape and style.
 */

import { describe, expect, it } from 'vitest'
import {
  buildEngineFeasibilityRefreshBody,
  buildFeasibilityDownloadPath,
  buildFeasibilityEngineGateHeaders,
  FEASIBILITY_ENGINE_TIMEOUT_RETRY_MESSAGE,
  FEASIBILITY_ENGINE_UNREACHABLE_RETRY_MESSAGE,
  FEASIBILITY_EXPORT_FORMAT,
  FEASIBILITY_STUDIO_REQUIRED_MESSAGE,
  FEASIBILITY_STUDIO_UNMEASURED_MESSAGE,
  feasibilityFilename,
  mapEngineFeasibilityPayload,
  parseFeasibilityRefreshBody,
  resolveFeasibilityExportAuth,
  retryableFeasibilityEngineFailureResponse,
} from '../../api/_lib/pe-feasibility-export-core.js'
import { classifyEngineFailure, resolveSitePlanExportAuth } from '../../api/_lib/pe-site-plan-export-core.js'

const PARCEL = '48029:105129'

describe('feasibility export auth gate (Studio/Team — P-104 rule reused)', () => {
  it('anonymous -> 401 authentication_required', () => {
    const gate = resolveFeasibilityExportAuth({
      sessionToken: null,
      entitlement: { ok: false, status: 401 },
    })
    expect(gate.ok).toBe(false)
    if (!gate.ok) {
      expect(gate.status).toBe(401)
      expect(gate.error).toBe('authentication_required')
    }
  })

  it('signed-in free tier -> 402 payment_required', () => {
    const gate = resolveFeasibilityExportAuth({
      sessionToken: 'session-token',
      entitlement: { ok: true, tier: 'free', studioGranted: false },
    })
    expect(gate.ok).toBe(false)
    if (!gate.ok) {
      expect(gate.status).toBe(402)
      expect(gate.error).toBe('payment_required')
    }
  })

  it('signed-in paid but NOT Studio -> 402 studio_required, distinct from the free refusal', () => {
    const gate = resolveFeasibilityExportAuth({
      sessionToken: 'session-token',
      // Exactly what /entitlement returns for a $49 Solo account.
      entitlement: { ok: true, tier: 'paid', studioGranted: false },
    })
    expect(gate.ok).toBe(false)
    if (!gate.ok) {
      expect(gate.status).toBe(402)
      expect(gate.error).toBe('studio_required')
      expect(gate.message).toBe(FEASIBILITY_STUDIO_REQUIRED_MESSAGE)
      expect(gate.message).toMatch(/Studio/)
    }
  })

  it('UNMEASURED studioGranted (null) is refused, and NOT as a paywall', () => {
    const gate = resolveFeasibilityExportAuth({
      sessionToken: 'session-token',
      entitlement: { ok: true, tier: 'paid', studioGranted: null },
    })
    expect(gate.ok).toBe(false)
    if (!gate.ok) {
      expect(gate.status).toBe(503)
      expect(gate.error).toBe('entitlement_contract_incomplete')
      expect(gate.error).not.toBe('studio_required')
      expect(gate.error).not.toBe('payment_required')
      expect(gate.message).toBe(FEASIBILITY_STUDIO_UNMEASURED_MESSAGE)
    }
  })

  it('Studio account passes', () => {
    const gate = resolveFeasibilityExportAuth({
      sessionToken: 'session-token',
      entitlement: { ok: true, tier: 'paid', studioGranted: true },
    })
    expect(gate.ok).toBe(true)
  })

  it('entitlement service down -> 503, never a silent pass', () => {
    const gate = resolveFeasibilityExportAuth({
      sessionToken: 'session-token',
      entitlement: { ok: false, status: 503, message: 'down' },
    })
    expect(gate.ok).toBe(false)
    if (!gate.ok) {
      expect(gate.status).toBe(503)
      expect(gate.error).toBe('entitlement_unavailable')
    }
  })

  it('dev bypass skips the paid/Studio check but still requires a session', () => {
    const bypassed = resolveFeasibilityExportAuth({
      sessionToken: 'session-token',
      entitlement: { ok: true, tier: 'free', studioGranted: false },
      devBypass: true,
    })
    expect(bypassed.ok).toBe(true)
    if (bypassed.ok) expect(bypassed.devBypass).toBe(true)

    const gate = resolveFeasibilityExportAuth({
      sessionToken: null,
      entitlement: { ok: false, status: 401 },
      devBypass: true,
    })
    expect(gate.ok).toBe(false)
    if (!gate.ok) expect(gate.status).toBe(401)
  })

  it('answers identically to resolveSitePlanExportAuth on every tier (one product rule, P-104 reused)', () => {
    // Same cross-check pattern pe-site-plan-export-bff.test.ts already runs
    // between site-plan and terrain: if a later change fixes one gate and
    // not the other, this fails.
    const cases = [
      { tier: 'free' as const, studioGranted: false },
      { tier: 'paid' as const, studioGranted: false },
      { tier: 'paid' as const, studioGranted: true },
      { tier: 'paid' as const, studioGranted: null },
    ]
    for (const ent of cases) {
      const feas = resolveFeasibilityExportAuth({
        sessionToken: 'session-token',
        entitlement: { ok: true, ...ent },
      })
      const sitePlan = resolveSitePlanExportAuth({
        sessionToken: 'session-token',
        entitlement: { ok: true, ...ent },
      })
      expect(feas.ok).toBe(sitePlan.ok)
      if (!feas.ok && !sitePlan.ok) {
        expect(feas.status).toBe(sitePlan.status)
        expect(feas.error).toBe(sitePlan.error)
      }
    }
  })
})

describe('gate-front headers (direct BFF -> engine transport, no MCP tool exists for this report)', () => {
  it('stamps the paid tier + its own package id, distinct from site-plan-export', () => {
    const headers = buildFeasibilityEngineGateHeaders({ requestId: 'req-1' })
    expect(headers['x-hauska-product']).toBe('cortex')
    expect(headers['x-hauska-package-id']).toBe('feasibility-export')
    expect(headers['x-hauska-access-tier']).toBe('public-paid')
    expect(headers['x-hauska-gate-credential-id']).toBe(
      'property-explorer-feasibility-bff',
    )
    expect(headers['x-hauska-request-id']).toBe('req-1')
    expect(headers['x-hauska-tenant-id']).toBe('public-catalog')
  })

  it('generates a request id when none is supplied', () => {
    const headers = buildFeasibilityEngineGateHeaders()
    expect(headers['x-hauska-request-id']).toBeTruthy()
  })
})

describe('refresh body validation', () => {
  it('accepts the fields PE forwards today (address, countyName, liveViewUrl)', () => {
    const parsed = parseFeasibilityRefreshBody({
      parcelNodeId: PARCEL,
      address: '714 Spring St',
      countyName: 'Bastrop',
      liveViewUrl: '/?parcelNodeId=48029%3A105129',
    })
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.request.parcelNodeId).toBe(PARCEL)
      expect(buildEngineFeasibilityRefreshBody(parsed.request)).toEqual({
        address: '714 Spring St',
        countyName: 'Bastrop',
        liveViewUrl: '/?parcelNodeId=48029%3A105129',
      })
    }
  })

  it('rejects a bad parcel id', () => {
    expect(parseFeasibilityRefreshBody({ parcelNodeId: 'bad' }).ok).toBe(false)
    expect(parseFeasibilityRefreshBody({}).ok).toBe(false)
    expect(parseFeasibilityRefreshBody(null).ok).toBe(false)
  })

  it('parses a raw JSON string body and strips absent optionals', () => {
    const parsed = parseFeasibilityRefreshBody(JSON.stringify({ parcelNodeId: PARCEL }))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(buildEngineFeasibilityRefreshBody(parsed.request)).toEqual({})
  })

  it('trims and caps oversized optional fields rather than rejecting the request', () => {
    const longAddress = 'A'.repeat(500)
    const parsed = parseFeasibilityRefreshBody({
      parcelNodeId: PARCEL,
      address: longAddress,
    })
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.request.address?.length).toBe(200)
  })
})

describe('engine payload mapping (FLAT shape — no `data` envelope, unlike flood-drainage)', () => {
  it('maps the pinned contract shape and builds the download link', () => {
    const mapped = mapEngineFeasibilityPayload(
      {
        atom: { parcelNodeId: PARCEL, atomDid: 'pfeasibility_test' },
        artifacts: {
          'pdf-feasibility': {
            format: FEASIBILITY_EXPORT_FORMAT,
            ref: 'gcs://hauska-prod-497015-feasibility-exports/48029_105129/pdf/x',
            byteCount: 900000,
          },
        },
        pageCount: 22,
        feasibilityPageCount: 20,
        sitePlanAppended: true,
        sectionCount: 16,
        openItemCount: 4,
        narrativeIsDeterministicSkeleton: false,
      },
      PARCEL,
    )
    expect(mapped.ok).toBe(true)
    if (mapped.ok) {
      expect(mapped.response.parcelNodeId).toBe(PARCEL)
      expect(mapped.response.format).toBe(FEASIBILITY_EXPORT_FORMAT)
      expect(mapped.response.downloadUrl).toBe(buildFeasibilityDownloadPath(PARCEL))
      expect(mapped.response.pageCount).toBe(22)
      expect(mapped.response.feasibilityPageCount).toBe(20)
      expect(mapped.response.sitePlanAppended).toBe(true)
      expect(mapped.response.sectionCount).toBe(16)
      expect(mapped.response.openItemCount).toBe(4)
      expect(mapped.response.narrativeIsDeterministicSkeleton).toBe(false)
    }
  })

  it('honest sitePlanAppended:false + reason passes through verbatim', () => {
    const reason = 'No resolvable site plan for this parcel.'
    const mapped = mapEngineFeasibilityPayload(
      {
        atom: { parcelNodeId: PARCEL },
        artifacts: { 'pdf-feasibility': { format: FEASIBILITY_EXPORT_FORMAT, ref: 'gcs://x' } },
        sitePlanAppended: false,
        sitePlanUnavailableReason: reason,
      },
      PARCEL,
    )
    expect(mapped.ok).toBe(true)
    if (mapped.ok) {
      expect(mapped.response.sitePlanAppended).toBe(false)
      expect(mapped.response.sitePlanUnavailableReason).toBe(reason)
    }
  })

  it('falls back to the request parcelNodeId when the engine omits it', () => {
    const mapped = mapEngineFeasibilityPayload(
      {
        artifacts: { 'pdf-feasibility': { format: FEASIBILITY_EXPORT_FORMAT, ref: 'gcs://x' } },
      },
      PARCEL,
    )
    expect(mapped.ok).toBe(true)
    if (mapped.ok) expect(mapped.response.parcelNodeId).toBe(PARCEL)
  })

  it('a payload with NO pdf-feasibility artifact is an upstream error, never a fabricated download link', () => {
    expect(mapEngineFeasibilityPayload({ atom: { parcelNodeId: PARCEL }, artifacts: {} }, PARCEL).ok).toBe(
      false,
    )
    expect(mapEngineFeasibilityPayload({}, PARCEL).ok).toBe(false)
    expect(mapEngineFeasibilityPayload(null, PARCEL).ok).toBe(false)
  })
})

describe('honest transient failures (timeout classes reused from classifyEngineFailure)', () => {
  it('timeout -> 503 retryable with the feasibility-worded copy', () => {
    const kind = classifyEngineFailure({ message: 'The operation timed out after 55000ms' })
    expect(kind).toBe('engine_timeout')
    const resp = retryableFeasibilityEngineFailureResponse(kind, 'detail')
    expect(resp?.status).toBe(503)
    expect(resp?.body.retryable).toBe(true)
    expect(resp?.body.message).toBe(FEASIBILITY_ENGINE_TIMEOUT_RETRY_MESSAGE)
  })

  it('connect failure -> 503 retryable unreachable copy; gate/payment/other stay non-retryable', () => {
    const kind = classifyEngineFailure({ message: 'fetch failed: ECONNREFUSED' })
    expect(kind).toBe('unreachable')
    const resp = retryableFeasibilityEngineFailureResponse(kind, 'detail')
    expect(resp?.body.message).toBe(FEASIBILITY_ENGINE_UNREACHABLE_RETRY_MESSAGE)
    expect(retryableFeasibilityEngineFailureResponse('gate', 'x')).toBeNull()
    expect(retryableFeasibilityEngineFailureResponse('payment', 'x')).toBeNull()
    expect(retryableFeasibilityEngineFailureResponse('other', 'x')).toBeNull()
  })
})

describe('filename + download path', () => {
  it('derives the pdf filename from the parcel node id', () => {
    expect(feasibilityFilename(PARCEL)).toBe('48029_105129_feasibility_study.pdf')
  })

  it('the download path routes back through the feasibility fold-in leg', () => {
    const path = buildFeasibilityDownloadPath(PARCEL)
    expect(path).toContain('/api/pe-site-plan-export?')
    expect(path).toContain('kind=feasibility')
    expect(path).toContain('action=download')
    expect(path).toContain(encodeURIComponent(PARCEL))
  })
})
