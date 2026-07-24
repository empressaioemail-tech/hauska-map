/**
 * Terrain export BFF tests — WDLL item 9.
 */

import { describe, expect, it } from 'vitest'
import {
  buildDownloadPath,
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
})
