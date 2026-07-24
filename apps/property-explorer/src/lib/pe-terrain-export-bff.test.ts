/**
 * Terrain export BFF tests — WDLL item 9.
 */

import { describe, expect, it } from 'vitest'
import {
  buildDownloadPath,
  buildTerrainEngineGateHeaders,
  extractInlineDownload,
  isValidParcelNodeId,
  mapMcpTerrainPayload,
  parseTerrainFormat,
  resolveTerrainExportAuth,
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
      entitlement: { ok: true, tier: 'free' },
    })
    expect(gate.ok).toBe(false)
    if (!gate.ok) {
      expect(gate.status).toBe(402)
      expect(gate.error).toBe('payment_required')
    }
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
})
