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
  mapMcpSitePlanPayload,
  parseSitePlanFormat,
  resolveSitePlanExportAuth,
  retryableEngineFailureResponse,
} from '../../api/_lib/pe-site-plan-export-core.js'

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
      entitlement: { ok: true, tier: 'free' },
    })
    expect(gate.ok).toBe(false)
    if (!gate.ok) {
      expect(gate.status).toBe(402)
      expect(gate.error).toBe('payment_required')
    }
  })

  it('allows paid tier on auth gate', () => {
    const gate = resolveSitePlanExportAuth({
      sessionToken: 'session-token',
      entitlement: { ok: true, tier: 'paid' },
    })
    expect(gate.ok).toBe(true)
  })

  it('mirrors terrain: signed-in free tier allowed when operator/dev bypass armed', () => {
    const gate = resolveSitePlanExportAuth({
      sessionToken: 'session-token',
      entitlement: { ok: true, tier: 'free' },
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
