/**
 * FLOOD & DRAINAGE report BFF tests (R3 — the first paid report).
 *
 * Covers the fold-in contract pieces: the property-scoped entitlement gate
 * (the usePropertyEntitlement server twin), gate-front headers, refresh-body
 * validation, engine-payload mapping (incl. honest-empty passthrough), the
 * flood-worded transient failure classes, and the filename.
 */

import { describe, expect, it } from 'vitest'
import {
  buildEngineRefreshBody,
  buildFloodDrainageGateHeaders,
  FLOOD_DRAINAGE_FORMAT,
  FLOOD_ENGINE_TIMEOUT_RETRY_MESSAGE,
  FLOOD_ENGINE_UNREACHABLE_RETRY_MESSAGE,
  FLOOD_PROPERTY_LOCKED_MESSAGE,
  floodDrainageFilename,
  mapEngineFloodPayload,
  parseFloodDrainageRefreshBody,
  resolveFloodDrainageAuth,
  retryableFloodEngineFailureResponse,
} from '../../api/_lib/pe-flood-drainage-core.js'
import { classifyEngineFailure } from '../../api/_lib/pe-site-plan-export-core.js'

const PARCEL = '48021:54321'

describe('flood-drainage auth gate (usePropertyEntitlement server twin)', () => {
  it('anonymous → 401 authentication_required', () => {
    const gate = resolveFloodDrainageAuth({
      sessionToken: null,
      entitlement: { ok: false, status: 401 },
    })
    expect(gate.ok).toBe(false)
    if (!gate.ok) {
      expect(gate.status).toBe(401)
      expect(gate.error).toBe('authentication_required')
    }
  })

  it('signed-in free without the unlock → 402 payment_required (the standard shape)', () => {
    const gate = resolveFloodDrainageAuth({
      sessionToken: 'session-token',
      entitlement: { ok: true, tier: 'free', propertyUnlocked: false },
    })
    expect(gate.ok).toBe(false)
    if (!gate.ok) {
      expect(gate.status).toBe(402)
      expect(gate.error).toBe('payment_required')
      expect(gate.message).toBe(FLOOD_PROPERTY_LOCKED_MESSAGE)
    }
  })

  it('feature-detect: propertyUnlocked null (older backend) NEVER counts as an unlock', () => {
    const gate = resolveFloodDrainageAuth({
      sessionToken: 'session-token',
      entitlement: { ok: true, tier: 'free', propertyUnlocked: null },
    })
    expect(gate.ok).toBe(false)
    if (!gate.ok) expect(gate.status).toBe(402)
  })

  it('per-property $15 unlock passes (via property); Pro passes (via pro)', () => {
    expect(
      resolveFloodDrainageAuth({
        sessionToken: 't',
        entitlement: { ok: true, tier: 'free', propertyUnlocked: true },
      }),
    ).toEqual({ ok: true, via: 'property' })
    expect(
      resolveFloodDrainageAuth({
        sessionToken: 't',
        entitlement: { ok: true, tier: 'paid', propertyUnlocked: null },
      }),
    ).toEqual({ ok: true, via: 'pro' })
  })

  it('entitlement service down → 503, never a silent pass', () => {
    const gate = resolveFloodDrainageAuth({
      sessionToken: 't',
      entitlement: { ok: false, status: 503, message: 'down' },
    })
    expect(gate.ok).toBe(false)
    if (!gate.ok) {
      expect(gate.status).toBe(503)
      expect(gate.error).toBe('entitlement_unavailable')
    }
  })

  it('dev bypass skips the paid check but still requires a session', () => {
    expect(
      resolveFloodDrainageAuth({
        sessionToken: 't',
        entitlement: { ok: true, tier: 'free', propertyUnlocked: false },
        devBypass: true,
      }),
    ).toEqual({ ok: true, via: 'dev-bypass' })
    const gate = resolveFloodDrainageAuth({
      sessionToken: null,
      entitlement: { ok: false, status: 401 },
      devBypass: true,
    })
    expect(gate.ok).toBe(false)
  })
})

describe('gate-front headers (direct BFF -> engine transport)', () => {
  it('stamps the paid tier + its own package id', () => {
    const headers = buildFloodDrainageGateHeaders({ requestId: 'req-1' })
    expect(headers['x-hauska-product']).toBe('cortex')
    expect(headers['x-hauska-package-id']).toBe('flood-drainage-report')
    expect(headers['x-hauska-access-tier']).toBe('public-paid')
    expect(headers['x-hauska-gate-credential-id']).toBe(
      'property-explorer-flood-drainage-bff',
    )
    expect(headers['x-hauska-request-id']).toBe('req-1')
    expect(headers['x-hauska-tenant-id']).toBe('public-catalog')
  })
})

describe('refresh body validation', () => {
  it('accepts the pinned-contract fields', () => {
    const parsed = parseFloodDrainageRefreshBody({
      parcelNodeId: PARCEL,
      address: '714 Spring St',
      countyName: 'Bastrop',
      rainfallDepthInches: 9.5,
    })
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.request.parcelNodeId).toBe(PARCEL)
      expect(buildEngineRefreshBody(parsed.request)).toEqual({
        address: '714 Spring St',
        countyName: 'Bastrop',
        rainfallDepthInches: 9.5,
      })
    }
  })

  it('rejects a bad parcel id and out-of-range rainfall depth', () => {
    expect(parseFloodDrainageRefreshBody({ parcelNodeId: 'bad' }).ok).toBe(false)
    expect(
      parseFloodDrainageRefreshBody({ parcelNodeId: PARCEL, rainfallDepthInches: 0 }).ok,
    ).toBe(false)
    expect(
      parseFloodDrainageRefreshBody({ parcelNodeId: PARCEL, rainfallDepthInches: 61 }).ok,
    ).toBe(false)
    expect(
      parseFloodDrainageRefreshBody({ parcelNodeId: PARCEL, rainfallDepthInches: 'x' }).ok,
    ).toBe(false)
  })

  it('forwards liveViewUrl onto the engine body (W2.4; violate: dropping the field)', () => {
    const parsed = parseFloodDrainageRefreshBody({
      parcelNodeId: PARCEL,
      liveViewUrl: '/?parcelNodeId=48021%3A34137',
    })
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(buildEngineRefreshBody(parsed.request)).toEqual({
        liveViewUrl: '/?parcelNodeId=48021%3A34137',
      })
    }
  })

  it('parses a raw JSON string body and strips absent optionals', () => {
    const parsed = parseFloodDrainageRefreshBody(
      JSON.stringify({ parcelNodeId: PARCEL }),
    )
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(buildEngineRefreshBody(parsed.request)).toEqual({})
  })
})

describe('engine payload mapping', () => {
  it('maps the pinned { data: { study, artifact } } shape', () => {
    const mapped = mapEngineFloodPayload(
      {
        data: {
          parcelNodeId: PARCEL,
          study: { parcelNodeId: PARCEL, briefing: 'text' },
          artifact: { format: FLOOD_DRAINAGE_FORMAT, pageCount: 1 },
        },
      },
      PARCEL,
    )
    expect(mapped.ok).toBe(true)
    if (mapped.ok) {
      expect(mapped.response.ok).toBe(true)
      expect(mapped.response.study).toEqual({ parcelNodeId: PARCEL, briefing: 'text' })
      expect(mapped.response.artifact).toEqual({
        format: FLOOD_DRAINAGE_FORMAT,
        pageCount: 1,
      })
    }
  })

  it('passes honestEmpty through VERBATIM — never rewrites the reason', () => {
    const reason =
      'No significant drainage concentration modeled here (flat terrain within DEM resolution).'
    const mapped = mapEngineFloodPayload(
      { data: { study: { honestEmpty: { reason }, briefing: '' } } },
      PARCEL,
    )
    expect(mapped.ok).toBe(true)
    if (mapped.ok) {
      expect((mapped.response.study.honestEmpty as { reason: string }).reason).toBe(reason)
    }
  })

  it('a payload without a study object is an upstream error, never a fake study', () => {
    expect(mapEngineFloodPayload({ data: {} }, PARCEL).ok).toBe(false)
    expect(mapEngineFloodPayload(null, PARCEL).ok).toBe(false)
  })
})

describe('honest transient failures (timeout classes reused)', () => {
  it('timeout → 503 retryable with the flood copy', () => {
    const kind = classifyEngineFailure({ message: 'The operation timed out after 55000ms' })
    expect(kind).toBe('engine_timeout')
    const resp = retryableFloodEngineFailureResponse(kind, 'detail')
    expect(resp?.status).toBe(503)
    expect(resp?.body.retryable).toBe(true)
    expect(resp?.body.message).toBe(FLOOD_ENGINE_TIMEOUT_RETRY_MESSAGE)
  })

  it('connect failure → 503 retryable unreachable copy; gate stays non-retryable', () => {
    const kind = classifyEngineFailure({ message: 'fetch failed: ECONNREFUSED' })
    expect(kind).toBe('unreachable')
    const resp = retryableFloodEngineFailureResponse(kind, 'detail')
    expect(resp?.body.message).toBe(FLOOD_ENGINE_UNREACHABLE_RETRY_MESSAGE)
    expect(retryableFloodEngineFailureResponse('gate', 'detail')).toBeNull()
  })
})

describe('filename', () => {
  it('derives the pdf filename from the parcel node id', () => {
    expect(floodDrainageFilename(PARCEL)).toBe('48021_54321_flood_drainage.pdf')
  })
})
