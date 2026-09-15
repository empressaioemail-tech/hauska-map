/**
 * Site-plan export BFF tests — Wave 3, WDLL items 7-8.
 * Sibling of pe-terrain-export-bff.test.ts.
 */

import { describe, expect, it } from 'vitest'
import {
  buildDownloadPath,
  buildSitePlanEngineGateHeaders,
  classifyEngineFailure,
  ENGINE_TIMEOUT_RETRY_MESSAGE,
  ENGINE_UNREACHABLE_RETRY_MESSAGE,
  extractInlineDownload,
  isValidParcelNodeId,
  mapMcpSitePlanAccepted,
  mapMcpSitePlanPayload,
  mapMcpSitePlanStatusPayload,
  parseSitePlanFormat,
  resolveSitePlanExportAuth,
  retryableEngineFailureResponse,
  STUDIO_REQUIRED_MESSAGE,
  STUDIO_UNMEASURED_MESSAGE,
} from '../../api/_lib/pe-site-plan-export-core.js'
import { resolveTerrainExportAuth } from '../../api/_lib/pe-terrain-export-core.js'

describe('site-plan export core', () => {
  it('validates parcel node ids', () => {
    expect(isValidParcelNodeId('48029:105129')).toBe(true)
    expect(isValidParcelNodeId('bad')).toBe(false)
    expect(isValidParcelNodeId('48029/')).toBe(false)
  })

  it('parses supported formats', () => {
    expect(parseSitePlanFormat('pdf-site-plan')).toBe('pdf-site-plan')
    expect(parseSitePlanFormat('dxf-site-plan')).toBe('dxf-site-plan')
    expect(parseSitePlanFormat('ifc-site-plan')).toBe('ifc-site-plan')
    expect(parseSitePlanFormat('glb')).toBe(null)
  })

  it('denies anonymous session on auth gate', () => {
    const gate = resolveSitePlanExportAuth({
      sessionToken: null,
      entitlement: { ok: false, status: 401 },
    })
    expect(gate.ok).toBe(false)
    if (!gate.ok) {
      expect(gate.status).toBe(401)
      expect(gate.error).toBe('authentication_required')
    }
  })

  it('denies free tier on auth gate', () => {
    const gate = resolveSitePlanExportAuth({
      sessionToken: 'session-token',
      entitlement: { ok: true, tier: 'free', studioGranted: false, propertyUnlocked: false },
    })
    expect(gate.ok).toBe(false)
    if (!gate.ok) {
      expect(gate.status).toBe(402)
      expect(gate.error).toBe('payment_required')
    }
  })

  it('allows a Studio account on auth gate', () => {
    const gate = resolveSitePlanExportAuth({
      sessionToken: 'session-token',
      entitlement: { ok: true, tier: 'paid', studioGranted: true, propertyUnlocked: false },
    })
    expect(gate.ok).toBe(true)
  })

  // -------------------------------------------------------------------------
  // P-119 (2026-09-05 operator package table). Property Unlock is a SECOND
  // door alongside Studio/Team: it explicitly includes site-plan CAD and
  // terrain export. Cases below prove the new door opens, that Solo/Free
  // WITHOUT an active unlock still refuse, and that Studio/Team keep working
  // exactly as before (the P-104 regression basis above, now with
  // propertyUnlocked stated explicitly rather than omitted).
  // -------------------------------------------------------------------------

  it('P-119: an active Property Unlock passes even on tier "free" (no subscription at all)', () => {
    const gate = resolveSitePlanExportAuth({
      sessionToken: 'session-token',
      entitlement: { ok: true, tier: 'free', studioGranted: false, propertyUnlocked: true },
    })
    expect(gate.ok).toBe(true)
  })

  it('P-119: an active Property Unlock passes a paid-but-not-Studio (Solo) account too', () => {
    const gate = resolveSitePlanExportAuth({
      sessionToken: 'session-token',
      entitlement: { ok: true, tier: 'paid', studioGranted: false, propertyUnlocked: true },
    })
    expect(gate.ok).toBe(true)
  })

  it('P-119: Property Unlock passes even when studioGranted is UNMEASURED (null) — it is an independent door', () => {
    const gate = resolveSitePlanExportAuth({
      sessionToken: 'session-token',
      entitlement: { ok: true, tier: 'paid', studioGranted: null, propertyUnlocked: true },
    })
    expect(gate.ok).toBe(true)
  })

  it('P-119 REGRESSION: Solo with NO active unlock still refuses studio_required (the door did not become "any paid tier")', () => {
    const gate = resolveSitePlanExportAuth({
      sessionToken: 'session-token',
      entitlement: { ok: true, tier: 'paid', studioGranted: false, propertyUnlocked: false },
    })
    expect(gate.ok).toBe(false)
    if (!gate.ok) {
      expect(gate.status).toBe(402)
      expect(gate.error).toBe('studio_required')
    }
  })

  it('P-119 REGRESSION: Free with NO active unlock still refuses payment_required', () => {
    const gate = resolveSitePlanExportAuth({
      sessionToken: 'session-token',
      entitlement: { ok: true, tier: 'free', studioGranted: false, propertyUnlocked: false },
    })
    expect(gate.ok).toBe(false)
    if (!gate.ok) {
      expect(gate.status).toBe(402)
      expect(gate.error).toBe('payment_required')
    }
  })

  it('P-119 REGRESSION: Studio still passes with propertyUnlocked explicitly false (unrelated to the new door)', () => {
    const gate = resolveSitePlanExportAuth({
      sessionToken: 'session-token',
      entitlement: { ok: true, tier: 'paid', studioGranted: true, propertyUnlocked: false },
    })
    expect(gate.ok).toBe(true)
  })

  it('P-119 REGRESSION: Team (studioGranted true) still passes with propertyUnlocked false', () => {
    const gate = resolveSitePlanExportAuth({
      sessionToken: 'session-token',
      entitlement: { ok: true, tier: 'paid', studioGranted: true, propertyUnlocked: false },
    })
    expect(gate.ok).toBe(true)
  })

  it('P-119: does NOT reintroduce the A-068 class of bug — an active unlock is required, "any paid tier" is not enough on its own without it', () => {
    // A paid-but-not-Studio, not-unlocked account must still refuse. This is
    // the exact shape A-068 fixed (tier !== 'paid' was too broad); P-119 adds
    // a second door without loosening the first one back open.
    const gate = resolveSitePlanExportAuth({
      sessionToken: 'session-token',
      entitlement: { ok: true, tier: 'paid', studioGranted: false, propertyUnlocked: false },
    })
    expect(gate.ok).toBe(false)
  })

  // -------------------------------------------------------------------------
  // P-104. The gate used to read `tier !== 'paid'` and nothing else, so a $49
  // Solo subscriber was served the $129 Studio deliverable. Every case below
  // is stated in the violation direction: what the gate must REFUSE, and what
  // it must not confuse with something else.
  // -------------------------------------------------------------------------

  it('P-104 VIOLATION: a Solo subscriber is paid and is REFUSED', () => {
    const gate = resolveSitePlanExportAuth({
      sessionToken: 'session-token',
      // Exactly what /entitlement returns for a $49 Solo account with no
      // active unlock: tier "paid", studioGranted false, propertyUnlocked
      // false. The old gate passed it.
      entitlement: { ok: true, tier: 'paid', studioGranted: false, propertyUnlocked: false },
    })
    expect(gate.ok).toBe(false)
    if (!gate.ok) {
      expect(gate.status).toBe(402)
      expect(gate.error).toBe('studio_required')
      expect(gate.message).toBe(STUDIO_REQUIRED_MESSAGE)
      expect(gate.message).toMatch(/Studio/)
    }
  })

  it('P-104: the Solo refusal is DISTINGUISHABLE from the free-tier refusal', () => {
    const free = resolveSitePlanExportAuth({
      sessionToken: 'session-token',
      entitlement: { ok: true, tier: 'free', studioGranted: false, propertyUnlocked: false },
    })
    const solo = resolveSitePlanExportAuth({
      sessionToken: 'session-token',
      entitlement: { ok: true, tier: 'paid', studioGranted: false, propertyUnlocked: false },
    })
    expect(free.ok).toBe(false)
    expect(solo.ok).toBe(false)
    if (!free.ok && !solo.ok) {
      // Same status, different reason. A Solo subscriber told "payment
      // required" has already paid; the surface needs to know which upgrade
      // to offer.
      expect(free.status).toBe(402)
      expect(solo.status).toBe(402)
      expect(free.error).not.toBe(solo.error)
      expect(free.error).toBe('payment_required')
      expect(solo.error).toBe('studio_required')
    }
  })

  it('P-104 VIOLATION: an UNMEASURED grant is refused, and NOT as a paywall', () => {
    // studioGranted null = the /entitlement body carried no such key, i.e.
    // this BFF is deployed ahead of the cortex-api that computes it. Absent
    // is not false: telling a paying Studio customer they need to pay would
    // be a false statement about their account.
    const gate = resolveSitePlanExportAuth({
      sessionToken: 'session-token',
      entitlement: { ok: true, tier: 'paid', studioGranted: null, propertyUnlocked: false },
    })
    expect(gate.ok).toBe(false)
    if (!gate.ok) {
      expect(gate.status).toBe(503)
      expect(gate.error).toBe('entitlement_contract_incomplete')
      expect(gate.error).not.toBe('studio_required')
      expect(gate.error).not.toBe('payment_required')
      expect(gate.message).toBe(STUDIO_UNMEASURED_MESSAGE)
    }
  })

  it('P-104: site plan and terrain answer identically on every tier', () => {
    // They are one product rule. A divergence test, not two careful edits:
    // if a later change fixes one and not the other, this fails.
    const cases = [
      { tier: 'free' as const, studioGranted: false, propertyUnlocked: false },
      { tier: 'paid' as const, studioGranted: false, propertyUnlocked: false },
      { tier: 'paid' as const, studioGranted: true, propertyUnlocked: false },
      { tier: 'paid' as const, studioGranted: null, propertyUnlocked: false },
      // P-119 cases in the same divergence check: Property Unlock must open
      // both gates identically too.
      { tier: 'free' as const, studioGranted: false, propertyUnlocked: true },
      { tier: 'paid' as const, studioGranted: false, propertyUnlocked: true },
      { tier: 'paid' as const, studioGranted: null, propertyUnlocked: true },
    ]
    for (const ent of cases) {
      const sp = resolveSitePlanExportAuth({
        sessionToken: 'session-token',
        entitlement: { ok: true, ...ent },
      })
      const te = resolveTerrainExportAuth({
        sessionToken: 'session-token',
        entitlement: { ok: true, ...ent },
      })
      expect(sp.ok).toBe(te.ok)
      if (!sp.ok && !te.ok) {
        expect(sp.status).toBe(te.status)
        expect(sp.error).toBe(te.error)
      }
    }
  })

  it('mirrors terrain: signed-in free tier allowed when operator/dev bypass armed', () => {
    const gate = resolveSitePlanExportAuth({
      sessionToken: 'session-token',
      entitlement: { ok: true, tier: 'free', studioGranted: false, propertyUnlocked: false },
      devBypass: true,
    })
    expect(gate.ok).toBe(true)
    if (gate.ok) expect(gate.devBypass).toBe(true)
  })

  it('mirrors terrain: bypass still requires a session', () => {
    const gate = resolveSitePlanExportAuth({
      sessionToken: null,
      entitlement: { ok: false, status: 401 },
      devBypass: true,
    })
    expect(gate.ok).toBe(false)
    if (!gate.ok) expect(gate.status).toBe(401)
  })

  it('maps MCP refresh payload to BFF response with download links', () => {
    const mapped = mapMcpSitePlanPayload(
      {
        parcelNodeId: '48029:105129',
        atom: {
          atomDid: 'pterrain_site_plan_test',
          parcelNodeId: '48029:105129',
          sourceCitation: 'Parcel GIS + setback-rule + USGS 3DEP',
          accessPolicy: 'public-paid',
          fetchedAt: '2026-07-25T02:03:08.902Z',
          confidence: {
            value: 0.6,
            kind: 'asserted',
            provenance: 'Parcel GIS + setback-rule + USGS 3DEP; calibration pending',
          },
          artifacts: {
            'dxf-site-plan': {
              format: 'dxf-site-plan',
              ref: 'gcs://hauska-prod-497015-terrain-exports/site-plan/48029_105129/dxf/x',
              byteCount: 12345,
            },
            'ifc-site-plan': {
              format: 'ifc-site-plan',
              ref: 'gcs://hauska-prod-497015-terrain-exports/site-plan/48029_105129/ifc/y',
              byteCount: 54321,
            },
            'pdf-site-plan': {
              format: 'pdf-site-plan',
              ref: 'gcs://hauska-prod-497015-terrain-exports/site-plan/48029_105129/pdf/z',
              byteCount: 7900,
              pageCount: 2,
            },
          },
        },
        setbackDegenerate: false,
        streetHonestAbsence: true,
        floodZoneHonestUnavailable: true,
      },
      'pdf-site-plan',
    )

    expect(mapped.ok).toBe(true)
    if (mapped.ok) {
      expect(mapped.parcelNodeId).toBe('48029:105129')
      expect(mapped.atom.accessPolicy).toBe('public-paid')
      expect(mapped.downloads['pdf-site-plan']).toBe(
        buildDownloadPath('48029:105129', 'pdf-site-plan'),
      )
      expect(mapped.streetHonestAbsence).toBe(true)
      expect(mapped.floodZoneHonestUnavailable).toBe(true)
      expect(mapped.setbackDegenerate).toBe(false)
    }
  })

  it('maps a NO-setback engine payload to ok (honest-absent, NOT an error) and passes the flag through (2026-07-27 requirement)', () => {
    const mapped = mapMcpSitePlanPayload(
      {
        parcelNodeId: '48021:39282',
        atom: {
          parcelNodeId: '48021:39282',
          accessPolicy: 'public-paid',
          artifacts: {
            'pdf-site-plan': {
              format: 'pdf-site-plan',
              ref: 'gcs://bucket/site-plan/48021_39282/pdf/z',
              byteCount: 8100,
              pageCount: 2,
              setbackHonestAbsence: true,
            },
          },
        },
        // A missing setback rule is a SUCCESS state now, never isError.
        setbackHonestAbsence: true,
        setbackHonestAbsenceReason:
          'No setback-rule atom on file for this parcel; setbacks are not specified here and have not been verified.',
        streetHonestAbsence: true,
        floodZoneHonestUnavailable: true,
      },
      'pdf-site-plan',
    )

    expect(mapped.ok).toBe(true)
    if (mapped.ok) {
      expect(mapped.parcelNodeId).toBe('48021:39282')
      expect(mapped.setbackHonestAbsence).toBe(true)
      expect(mapped.setbackHonestAbsenceReason).toMatch(/no setback-rule atom/i)
      // Real downloadable sheet still produced.
      expect(mapped.downloads['pdf-site-plan']).toBe(
        buildDownloadPath('48021:39282', 'pdf-site-plan'),
      )
    }
  })

  it('extracts MCP inline download from data envelope', () => {
    const inline = extractInlineDownload({
      data: {
        parcelNodeId: '48029:105129',
        download: {
          format: 'pdf-site-plan',
          contentType: 'application/pdf',
          base64: 'JVBERi0x',
          byteCount: 6,
        },
      },
    })
    expect(inline?.format).toBe('pdf-site-plan')
    expect(inline?.base64).toBe('JVBERi0x')
    expect(inline?.byteCount).toBe(6)
  })

  it('maps inline download onto BFF response', () => {
    const mapped = mapMcpSitePlanPayload(
      {
        data: {
          parcelNodeId: '48029:105129',
          atom: {
            parcelNodeId: '48029:105129',
            accessPolicy: 'public-paid',
            artifacts: {
              'pdf-site-plan': {
                format: 'pdf-site-plan',
                ref: 'gcs://bucket/x',
                byteCount: 7900,
              },
            },
          },
          download: {
            format: 'pdf-site-plan',
            contentType: 'application/pdf',
            base64: 'JVBERi0x',
            byteCount: 6,
          },
        },
      },
      'pdf-site-plan',
    )
    expect(mapped.ok).toBe(true)
    if (mapped.ok) {
      expect(mapped.inlineDownload?.base64).toBe('JVBERi0x')
      expect(mapped.inlineDownload?.format).toBe('pdf-site-plan')
    }
  })

  it('QA-2: falls back to request parcelNodeId when MCP omits id', () => {
    const mapped = mapMcpSitePlanPayload(
      {
        data: {
          atom: {
            accessPolicy: 'public-paid',
            artifacts: {
              'pdf-site-plan': {
                format: 'pdf-site-plan',
                ref: 'gcs://bucket/x',
                byteCount: 100,
              },
            },
          },
        },
      },
      'pdf-site-plan',
      '48029:105129',
    )
    expect(mapped.ok).toBe(true)
    if (mapped.ok) expect(mapped.parcelNodeId).toBe('48029:105129')
  })

  it('QA-2: surfaces isError instead of missing-id false negative', () => {
    const mapped = mapMcpSitePlanPayload(
      { isError: true, message: 'setback rule missing' },
      'pdf-site-plan',
      '48029:105129',
    )
    expect(mapped.ok).toBe(false)
    if (!mapped.ok) expect(mapped.message).toMatch(/setback/i)
  })

  it('FIX 1: classifies a 401 / gate_front_context_required as gate, not unreachable', () => {
    expect(classifyEngineFailure({ status: 401 })).toBe('gate')
    expect(classifyEngineFailure({ status: 403 })).toBe('gate')
    expect(
      classifyEngineFailure({
        message:
          'Missing or invalid gate-front headers; engine-api accepts only gate-proxied calls',
      }),
    ).toBe('gate')
  })

  it('TIMEOUT FIX: "requires engine-api" / unreachable-shaped messages NEVER classify as gate', () => {
    // The live bug: MCP's 30s client timeout aborted a ~23s+ site-plan
    // refresh and produced this exact message shape; matching it into
    // 'gate' showed the customer a false gate-token error. It is an
    // unreachable/transient failure, never a gate one.
    expect(
      classifyEngineFailure({
        message:
          'Engine API unreachable at .../site-plan-export/refresh. Site-plan export requires engine-api.',
      }),
    ).toBe('unreachable')
    expect(
      classifyEngineFailure({ message: 'Site-plan export requires engine-api.' }),
    ).toBe('unreachable')
  })

  it('TIMEOUT FIX: timeout-shaped messages classify as engine_timeout, not gate', () => {
    // New MCP-side message (EngineApiTimeoutError).
    expect(
      classifyEngineFailure({
        message:
          'Engine API call timed out after 50000ms at .../site-plan-export/refresh. The engine may be cold-starting; retry the export in a moment.',
      }),
    ).toBe('engine_timeout')
    expect(classifyEngineFailure({ message: 'The operation was aborted' })).toBe(
      'engine_timeout',
    )
    expect(classifyEngineFailure({ message: 'request timeout' })).toBe('engine_timeout')
  })

  it('TIMEOUT FIX: retryableEngineFailureResponse maps transient kinds to 503 + retryable', () => {
    const timeout = retryableEngineFailureResponse(
      'engine_timeout',
      'Engine API call timed out after 50000ms at .../refresh',
    )
    expect(timeout?.status).toBe(503)
    expect(timeout?.body.error).toBe('engine_timeout')
    expect(timeout?.body.retryable).toBe(true)
    expect(timeout?.body.message).toBe(ENGINE_TIMEOUT_RETRY_MESSAGE)
    expect(ENGINE_TIMEOUT_RETRY_MESSAGE).toMatch(/cold start/i)

    const unreachable = retryableEngineFailureResponse('unreachable', 'fetch failed')
    expect(unreachable?.status).toBe(503)
    expect(unreachable?.body.error).toBe('engine_unreachable')
    expect(unreachable?.body.retryable).toBe(true)
    expect(unreachable?.body.message).toBe(ENGINE_UNREACHABLE_RETRY_MESSAGE)

    expect(retryableEngineFailureResponse('gate', 'x')).toBe(null)
    expect(retryableEngineFailureResponse('payment', 'x')).toBe(null)
    expect(retryableEngineFailureResponse('other', 'x')).toBe(null)
  })

  it('FIX 1: classifies a real connect failure as unreachable', () => {
    expect(classifyEngineFailure({ message: 'fetch failed' })).toBe('unreachable')
    expect(classifyEngineFailure({ message: 'ETIMEDOUT connect' })).toBe('unreachable')
    expect(classifyEngineFailure({ message: 'ECONNREFUSED 10.0.0.1:443' })).toBe(
      'unreachable',
    )
  })

  it('FIX 1: classifies paid-key / 402 as payment', () => {
    expect(classifyEngineFailure({ status: 402 })).toBe('payment')
    expect(
      classifyEngineFailure({ message: 'requires a paid X-Hauska-Key (public-paid)' }),
    ).toBe('payment')
  })

  it('FIX 1: unknown upstream text passes through as other', () => {
    expect(classifyEngineFailure({ status: 500, message: 'internal boom' })).toBe('other')
  })

  it('builds engine gate-front headers with site-plan-export packageId', () => {
    const headers = buildSitePlanEngineGateHeaders({
      requestId: 'req-test-1',
      credentialId: 'pe-bff',
      tenantId: 'public-catalog',
    })
    expect(headers['x-hauska-product']).toBe('cortex')
    expect(headers['x-hauska-package-id']).toBe('site-plan-export')
    expect(headers['x-hauska-access-tier']).toBe('public-paid')
    expect(headers['x-hauska-tenant-id']).toBe('public-catalog')
    expect(headers['x-hauska-gate-credential-id']).toBe('pe-bff')
    expect(headers['x-hauska-request-id']).toBe('req-test-1')
  })
})

// ---------------------------------------------------------------------------
// P-240 (OPS-24, 2026-09-15): async job mapping. hauska-mcp-server's
// refresh_parcel_site_plan_export tool now ALWAYS returns fast (the engine's
// 202-accepted job envelope, under payload.data per the MCP envelope shape);
// check_parcel_site_plan_export_status is the new poll leg. Mirrors
// pe-feasibility-export-core.ts's mapEngineFeasibilityAccepted /
// mapEngineFeasibilityStatusPayload test coverage.
// ---------------------------------------------------------------------------

const PARCEL = '48029:105129'

describe('P-240: mapMcpSitePlanAccepted (refresh_parcel_site_plan_export fast-accept)', () => {
  it('maps a queued/running job envelope under payload.data, defaulting pollAfterMs when omitted', () => {
    const mapped = mapMcpSitePlanAccepted(
      { data: { parcelNodeId: PARCEL, state: 'queued', jobRef: 'job-1' } },
      PARCEL,
    )
    expect(mapped.ok).toBe(true)
    if (mapped.ok) {
      expect(mapped.response.state).toBe('queued')
      expect(mapped.response.jobRef).toBe('job-1')
      expect(mapped.response.pollAfterMs).toBe(5000)
    }
  })

  it('carries a non-default pollAfterMs through verbatim', () => {
    const mapped = mapMcpSitePlanAccepted(
      { data: { parcelNodeId: PARCEL, state: 'running', jobRef: 'job-2', pollAfterMs: 7000 } },
      PARCEL,
    )
    expect(mapped.ok).toBe(true)
    if (mapped.ok) expect(mapped.response.pollAfterMs).toBe(7000)
  })

  it('falls back to the request parcelNodeId when the envelope omits it', () => {
    const mapped = mapMcpSitePlanAccepted({ data: { state: 'queued', jobRef: 'job-3' } }, PARCEL)
    expect(mapped.ok).toBe(true)
    if (mapped.ok) expect(mapped.response.parcelNodeId).toBe(PARCEL)
  })

  it('refuses a payload with no queued/running state or jobRef — never fabricates a job reference', () => {
    expect(mapMcpSitePlanAccepted({ data: { state: 'ready' } }, PARCEL).ok).toBe(false)
    expect(mapMcpSitePlanAccepted({ data: { state: 'queued' } }, PARCEL).ok).toBe(false)
    expect(mapMcpSitePlanAccepted({ data: {} }, PARCEL).ok).toBe(false)
  })

  it('surfaces isError instead of a missing-state false negative', () => {
    const mapped = mapMcpSitePlanAccepted({ isError: true, message: 'metering denied' }, PARCEL)
    expect(mapped.ok).toBe(false)
    if (!mapped.ok) expect(mapped.message).toMatch(/metering denied/i)
  })
})

describe('P-240: mapMcpSitePlanStatusPayload (check_parcel_site_plan_export_status)', () => {
  it('never-requested is its own answer, not mapped onto failed or an error', () => {
    const mapped = mapMcpSitePlanStatusPayload(
      { data: { parcelNodeId: PARCEL, state: 'never-requested' } },
      'pdf-site-plan',
    )
    expect(mapped.ok).toBe(true)
    if (mapped.ok) expect(mapped.response.state).toBe('never-requested')
  })

  it('queued/running carries the jobRef and pollAfterMs through', () => {
    const mapped = mapMcpSitePlanStatusPayload(
      { data: { parcelNodeId: PARCEL, state: 'running', jobRef: 'job-4', pollAfterMs: 6000 } },
      'pdf-site-plan',
    )
    expect(mapped.ok).toBe(true)
    if (mapped.ok) {
      expect(mapped.response.state).toBe('running')
      if (mapped.response.state === 'running') {
        expect(mapped.response.jobRef).toBe('job-4')
        expect(mapped.response.pollAfterMs).toBe(6000)
      }
    }
  })

  it('failed carries errorClass + errorMessage, with an honest default message', () => {
    const mapped = mapMcpSitePlanStatusPayload(
      { data: { parcelNodeId: PARCEL, state: 'failed', errorClass: 'geometry_unavailable' } },
      'pdf-site-plan',
    )
    expect(mapped.ok).toBe(true)
    if (mapped.ok && mapped.response.state === 'failed') {
      expect(mapped.response.errorClass).toBe('geometry_unavailable')
      expect(mapped.response.errorMessage).toBe(
        'Site-plan export could not be produced for this parcel.',
      )
    }
  })

  it('ready reshapes { atom, artifacts, result } into the same export payload mapMcpSitePlanPayload produces, plus state:"ready"', () => {
    const mapped = mapMcpSitePlanStatusPayload(
      {
        data: {
          parcelNodeId: PARCEL,
          state: 'ready',
          atom: { parcelNodeId: PARCEL, accessPolicy: 'public-paid' },
          artifacts: {
            'pdf-site-plan': { format: 'pdf-site-plan', ref: 'gcs://bucket/x', byteCount: 7900 },
          },
          result: {
            setbackHonestAbsence: true,
            setbackHonestAbsenceReason: 'no setback-rule atom on file',
            streetHonestAbsence: true,
          },
        },
      },
      'pdf-site-plan',
    )
    expect(mapped.ok).toBe(true)
    if (mapped.ok && mapped.response.state === 'ready') {
      expect(mapped.response.parcelNodeId).toBe(PARCEL)
      expect(mapped.response.downloadUrl).toBe(buildDownloadPath(PARCEL, 'pdf-site-plan'))
      expect(mapped.response.setbackHonestAbsence).toBe(true)
      expect(mapped.response.streetHonestAbsence).toBe(true)
    }
  })

  it('ready with no matching artifact still maps ok (downloadUrl built even if the format is not yet on file — mirrors mapMcpSitePlanPayload)', () => {
    const mapped = mapMcpSitePlanStatusPayload(
      { data: { parcelNodeId: PARCEL, state: 'ready', atom: {}, artifacts: {}, result: {} } },
      'pdf-site-plan',
    )
    expect(mapped.ok).toBe(true)
  })

  it('an unrecognized state is refused, never silently treated as any known state', () => {
    expect(
      mapMcpSitePlanStatusPayload({ data: { parcelNodeId: PARCEL, state: 'bogus' } }, 'pdf-site-plan')
        .ok,
    ).toBe(false)
  })

  it('surfaces isError instead of a missing-id false negative', () => {
    const mapped = mapMcpSitePlanStatusPayload(
      { isError: true, message: 'gate_front_context_required' },
      'pdf-site-plan',
      PARCEL,
    )
    expect(mapped.ok).toBe(false)
    if (!mapped.ok) expect(mapped.message).toMatch(/gate_front_context_required/i)
  })
})
