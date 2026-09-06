/**
 * Terrain export BFF tests — WDLL item 9.
 */

import { describe, expect, it } from 'vitest'
import {
  buildDownloadPath,
  buildTerrainEngineGateHeaders,
  classifyEngineFailure,
  ENGINE_TIMEOUT_RETRY_MESSAGE,
  extractInlineDownload,
  isValidParcelNodeId,
  mapMcpTerrainPayload,
  parseTerrainFormat,
  resolveTerrainExportAuth,
  retryableEngineFailureResponse,
  TERRAIN_STUDIO_REQUIRED_MESSAGE,
  TERRAIN_STUDIO_UNMEASURED_MESSAGE,
} from '../../api/_lib/pe-terrain-export-core.js'

describe('terrain export core', () => {
  it('validates parcel node ids', () => {
    expect(isValidParcelNodeId('48021:27303')).toBe(true)
    expect(isValidParcelNodeId('bad')).toBe(false)
    expect(isValidParcelNodeId('48021/')).toBe(false)
  })

  it('parses supported formats', () => {
    expect(parseTerrainFormat('glb')).toBe('glb')
    expect(parseTerrainFormat('dxf-contour')).toBe('dxf-contour')
    expect(parseTerrainFormat('landxml-tin')).toBe(null)
  })

  it('denies anonymous session on auth gate', () => {
    const gate = resolveTerrainExportAuth({
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
    const gate = resolveTerrainExportAuth({
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
    const gate = resolveTerrainExportAuth({
      sessionToken: 'session-token',
      entitlement: { ok: true, tier: 'paid', studioGranted: true, propertyUnlocked: false },
    })
    expect(gate.ok).toBe(true)
  })

  // -------------------------------------------------------------------------
  // P-119 (2026-09-05 operator package table). Same Property Unlock door as
  // site-plan — see pe-site-plan-export-bff.test.ts for the full rationale.
  // -------------------------------------------------------------------------

  it('P-119: an active Property Unlock passes even on tier "free"', () => {
    const gate = resolveTerrainExportAuth({
      sessionToken: 'session-token',
      entitlement: { ok: true, tier: 'free', studioGranted: false, propertyUnlocked: true },
    })
    expect(gate.ok).toBe(true)
  })

  it('P-119: an active Property Unlock passes a Solo (paid, not Studio) account', () => {
    const gate = resolveTerrainExportAuth({
      sessionToken: 'session-token',
      entitlement: { ok: true, tier: 'paid', studioGranted: false, propertyUnlocked: true },
    })
    expect(gate.ok).toBe(true)
  })

  it('P-119: Property Unlock passes even when studioGranted is UNMEASURED (null)', () => {
    const gate = resolveTerrainExportAuth({
      sessionToken: 'session-token',
      entitlement: { ok: true, tier: 'paid', studioGranted: null, propertyUnlocked: true },
    })
    expect(gate.ok).toBe(true)
  })

  it('P-119 REGRESSION: Solo with NO active unlock still refuses studio_required', () => {
    const gate = resolveTerrainExportAuth({
      sessionToken: 'session-token',
      entitlement: { ok: true, tier: 'paid', studioGranted: false, propertyUnlocked: false },
    })
    expect(gate.ok).toBe(false)
    if (!gate.ok) expect(gate.error).toBe('studio_required')
  })

  it('P-119 REGRESSION: Free with NO active unlock still refuses payment_required', () => {
    const gate = resolveTerrainExportAuth({
      sessionToken: 'session-token',
      entitlement: { ok: true, tier: 'free', studioGranted: false, propertyUnlocked: false },
    })
    expect(gate.ok).toBe(false)
    if (!gate.ok) expect(gate.error).toBe('payment_required')
  })

  it('P-119 REGRESSION: Studio still passes with propertyUnlocked explicitly false', () => {
    const gate = resolveTerrainExportAuth({
      sessionToken: 'session-token',
      entitlement: { ok: true, tier: 'paid', studioGranted: true, propertyUnlocked: false },
    })
    expect(gate.ok).toBe(true)
  })

  // -------------------------------------------------------------------------
  // P-104. Terrain carried `studioGated: true` in the reports catalog, which
  // drove a lock in the React tree and NOTHING on the server: a direct call
  // walked past it. That catalog flag was the only artifact anyone would have
  // found by grepping for "studio", which is how this survived review. There
  // was no "allows paid tier" test here before P-104 either, so the leak was
  // never even asserted as intended behaviour.
  // -------------------------------------------------------------------------

  it('P-104 VIOLATION: a Solo subscriber is paid and is REFUSED', () => {
    const gate = resolveTerrainExportAuth({
      sessionToken: 'session-token',
      entitlement: { ok: true, tier: 'paid', studioGranted: false, propertyUnlocked: false },
    })
    expect(gate.ok).toBe(false)
    if (!gate.ok) {
      expect(gate.status).toBe(402)
      expect(gate.error).toBe('studio_required')
      expect(gate.message).toBe(TERRAIN_STUDIO_REQUIRED_MESSAGE)
      expect(gate.message).toMatch(/Studio/)
    }
  })

  it('P-104: the Solo refusal is DISTINGUISHABLE from the free-tier refusal', () => {
    const free = resolveTerrainExportAuth({
      sessionToken: 'session-token',
      entitlement: { ok: true, tier: 'free', studioGranted: false, propertyUnlocked: false },
    })
    const solo = resolveTerrainExportAuth({
      sessionToken: 'session-token',
      entitlement: { ok: true, tier: 'paid', studioGranted: false, propertyUnlocked: false },
    })
    expect(free.ok).toBe(false)
    expect(solo.ok).toBe(false)
    if (!free.ok && !solo.ok) {
      expect(free.error).toBe('payment_required')
      expect(solo.error).toBe('studio_required')
      expect(free.error).not.toBe(solo.error)
    }
  })

  it('P-104 VIOLATION: an UNMEASURED grant is refused, and NOT as a paywall', () => {
    const gate = resolveTerrainExportAuth({
      sessionToken: 'session-token',
      entitlement: { ok: true, tier: 'paid', studioGranted: null, propertyUnlocked: false },
    })
    expect(gate.ok).toBe(false)
    if (!gate.ok) {
      expect(gate.status).toBe(503)
      expect(gate.error).toBe('entitlement_contract_incomplete')
      expect(gate.message).toBe(TERRAIN_STUDIO_UNMEASURED_MESSAGE)
    }
  })

  it('allows signed-in free tier when operator/dev bypass is armed', () => {
    const gate = resolveTerrainExportAuth({
      sessionToken: 'session-token',
      entitlement: { ok: true, tier: 'free', studioGranted: false, propertyUnlocked: false },
      devBypass: true,
    })
    expect(gate.ok).toBe(true)
    if (gate.ok) expect(gate.devBypass).toBe(true)
  })

  it('still requires session even with bypass armed', () => {
    const gate = resolveTerrainExportAuth({
      sessionToken: null,
      entitlement: { ok: false, status: 401 },
      devBypass: true,
    })
    expect(gate.ok).toBe(false)
    if (!gate.ok) expect(gate.status).toBe(401)
  })

  it('maps MCP refresh payload to BFF response with download links', () => {
    const mapped = mapMcpTerrainPayload(
      {
        parcelNodeId: '48021:27303',
        atom: {
          atomDid: 'pterrain_test',
          parcelNodeId: '48021:27303',
          sourceCitation: 'USGS 3DEP',
          accessPolicy: 'public-paid',
          fetchedAt: '2026-07-24T02:03:08.902Z',
          confidence: {
            value: 0.6,
            kind: 'asserted',
            provenance: 'USGS 3DEP DEM field; calibration pending',
          },
          artifacts: {
            glb: {
              format: 'glb',
              ref: 'gcs://hauska-prod-497015-terrain-exports/terrain/48021_27303/glb/x',
              byteCount: 35528,
            },
            ifc: {
              format: 'ifc',
              ref: 'gcs://hauska-prod-497015-terrain-exports/terrain/48021_27303/ifc/y',
              byteCount: 85193,
            },
            'landxml-tin': {
              format: 'landxml-tin',
              ref: 'deferred:landxml-tin',
              deferred: true,
              deferredReason: 'LandXML TIN writer is deferred',
            },
          },
        },
      },
      'glb',
    )

    expect(mapped.ok).toBe(true)
    if (mapped.ok) {
      expect(mapped.parcelNodeId).toBe('48021:27303')
      expect(mapped.atom.sourceCitation).toBe('USGS 3DEP')
      expect(mapped.atom.accessPolicy).toBe('public-paid')
      expect(mapped.downloads.glb).toBe(buildDownloadPath('48021:27303', 'glb'))
      expect(mapped.downloads['landxml-tin']).toBeUndefined()
      expect(mapped.atom.artifacts['landxml-tin']?.deferred).toBe(true)
    }
  })

  it('extracts MCP inline download from data envelope', () => {
    const inline = extractInlineDownload({
      data: {
        parcelNodeId: '48021:27303',
        download: {
          format: 'dxf-contour',
          contentType: 'application/dxf',
          base64: 'QUJD',
          byteCount: 3,
        },
      },
    })
    expect(inline?.format).toBe('dxf-contour')
    expect(inline?.base64).toBe('QUJD')
    expect(inline?.byteCount).toBe(3)
  })

  it('maps inline download onto BFF response', () => {
    const mapped = mapMcpTerrainPayload(
      {
        data: {
          parcelNodeId: '48021:27303',
          atom: {
            parcelNodeId: '48021:27303',
            sourceCitation: 'USGS 3DEP',
            accessPolicy: 'public-paid',
            artifacts: {
              'dxf-contour': {
                format: 'dxf-contour',
                ref: 'gcs://bucket/x',
                byteCount: 31776,
              },
            },
          },
          download: {
            format: 'dxf-contour',
            contentType: 'application/dxf',
            base64: 'QUJD',
            byteCount: 3,
          },
        },
      },
      'dxf-contour',
    )
    expect(mapped.ok).toBe(true)
    if (mapped.ok) {
      expect(mapped.inlineDownload?.base64).toBe('QUJD')
      expect(mapped.inlineDownload?.format).toBe('dxf-contour')
    }
  })

  it('builds engine gate-front headers with required seam fields', () => {
    const headers = buildTerrainEngineGateHeaders({
      requestId: 'req-test-1',
      credentialId: 'pe-bff',
      tenantId: 'public-catalog',
    })
    expect(headers['x-hauska-product']).toBe('cortex')
    expect(headers['x-hauska-package-id']).toBe('terrain-export')
    expect(headers['x-hauska-access-tier']).toBe('public-paid')
    expect(headers['x-hauska-tenant-id']).toBe('public-catalog')
    expect(headers['x-hauska-gate-credential-id']).toBe('pe-bff')
    expect(headers['x-hauska-request-id']).toBe('req-test-1')
    expect(headers['X-Hauska-Package']).toBeUndefined()
  })

  it('TIMEOUT FIX: mirrors site-plan classifier — timeout/unreachable never classify as gate', () => {
    expect(
      classifyEngineFailure({
        message:
          'Engine API call timed out after 45000ms at .../terrain-export/download. The engine may be cold-starting; retry the download in a moment.',
      }),
    ).toBe('engine_timeout')
    expect(
      classifyEngineFailure({
        message:
          'Engine API unreachable at .../terrain-export/refresh. Terrain export requires engine-api.',
      }),
    ).toBe('unreachable')
    expect(classifyEngineFailure({ status: 401 })).toBe('gate')
    expect(
      classifyEngineFailure({ message: 'gate_front_context_required' }),
    ).toBe('gate')
  })

  it('TIMEOUT FIX: retryableEngineFailureResponse returns 503 retryable for transient kinds', () => {
    const timeout = retryableEngineFailureResponse('engine_timeout', 'timed out after 45000ms')
    expect(timeout?.status).toBe(503)
    expect(timeout?.body.error).toBe('engine_timeout')
    expect(timeout?.body.retryable).toBe(true)
    expect(timeout?.body.message).toBe(ENGINE_TIMEOUT_RETRY_MESSAGE)

    const unreachable = retryableEngineFailureResponse('unreachable', 'ECONNREFUSED')
    expect(unreachable?.status).toBe(503)
    expect(unreachable?.body.error).toBe('engine_unreachable')

    expect(retryableEngineFailureResponse('gate', 'x')).toBe(null)
    expect(retryableEngineFailureResponse('other', 'x')).toBe(null)
  })
})
