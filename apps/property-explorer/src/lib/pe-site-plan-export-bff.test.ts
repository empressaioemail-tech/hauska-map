/**
 * Site-plan export BFF tests — Wave 3, WDLL items 7-8.
 * Sibling of pe-terrain-export-bff.test.ts.
 */

import { describe, expect, it } from 'vitest'
import {
  buildDownloadPath,
  buildSitePlanEngineGateHeaders,
  extractInlineDownload,
  isValidParcelNodeId,
  mapMcpSitePlanPayload,
  parseSitePlanFormat,
  resolveSitePlanExportAuth,
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
