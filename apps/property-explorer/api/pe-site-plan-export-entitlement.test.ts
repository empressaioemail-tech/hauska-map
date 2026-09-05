/**
 * pe-site-plan-export.ts ENTITLEMENT WIRING tests (P-119, 2026-09-05).
 *
 * The pure-logic gate (resolveSitePlanExportAuth) is covered exhaustively in
 * src/lib/pe-site-plan-export-bff.test.ts. This file proves the WIRING
 * around it inside the actual handler: that `requireStudioSession` now
 * reads the per-parcel `fetchPeEntitlementDetail` (not the parcel-blind
 * `fetchPeEntitlement`) BEFORE any MCP call, and that its answer actually
 * decides whether the request reaches MCP at all.
 *
 * Strategy: the entitlement fetch is stubbed by URL substring; the MCP call
 * is stubbed to THROW a distinctive, unmistakable error ('MCP_REACHED') the
 * moment it is invoked. This makes "did the gate pass" observable without
 * reimplementing the full MCP JSON-RPC handshake:
 *   - REFUSED (401/402) -> the MCP fetch is never called (verified directly).
 *   - GRANTED -> the request proceeds and the handler surfaces a 502 whose
 *     message is 'MCP_REACHED', proving it walked past the gate.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { PE_SESSION_COOKIE } from './_lib/oidc-config.js'
import handler from './pe-site-plan-export.js'

const PARCEL = '48029:105129'
const COOKIE = `${PE_SESSION_COOKIE}=test-session-token`

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  }
}

function makeReq(opts: { body?: unknown; cookie?: string | null }): VercelRequest {
  return {
    method: 'POST',
    query: {},
    body: opts.body,
    headers: { cookie: opts.cookie === null ? undefined : (opts.cookie ?? COOKIE) },
  } as unknown as VercelRequest
}

function makeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headersSet: {} as Record<string, string>,
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(payload: unknown) {
      res.body = payload
      return res
    },
    setHeader(key: string, value: string) {
      res.headersSet[key] = value
      return res
    },
  }
  return res as unknown as VercelResponse & typeof res
}

/** Routes the stubbed fetch by URL substring; the MCP leg always throws so a
 *  granted request is observable (502 'MCP_REACHED') without faking the
 *  JSON-RPC protocol. */
function stubFetch(entitlementBody: unknown) {
  const mock = vi.fn(async (url: string | URL) => {
    const u = String(url)
    if (u.includes('/entitlement')) {
      return jsonResponse(200, entitlementBody)
    }
    if (u.includes('/mcp')) {
      throw new Error('MCP_REACHED')
    }
    throw new Error(`unexpected fetch in entitlement-wiring test: ${u}`)
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

describe('pe-site-plan-export.ts — P-119 entitlement wiring (requireStudioSession)', () => {
  const prevKey = process.env.MCP_PRODUCT_KEY
  beforeEach(() => {
    process.env.MCP_PRODUCT_KEY = 'test-mcp-key'
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    if (prevKey === undefined) delete process.env.MCP_PRODUCT_KEY
    else process.env.MCP_PRODUCT_KEY = prevKey
  })

  it('reads the PER-PARCEL entitlement (fetchPeEntitlementDetail), not the parcel-blind read — the entitlement URL carries parcelNodeId', async () => {
    const fetchMock = stubFetch({ tier: 'paid', studioGranted: true, property: { unlocked: false } })
    const res = makeRes()
    await handler(makeReq({ body: { parcelNodeId: PARCEL } }), res)
    const entitlementCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/entitlement'),
    )
    expect(entitlementCall).toBeTruthy()
    expect(String(entitlementCall![0])).toContain(`parcelNodeId=${encodeURIComponent(PARCEL)}`)
  })

  it('P-119: a Property-Unlock session (tier free, no subscription) PASSES the gate and reaches MCP', async () => {
    stubFetch({ tier: 'free', studioGranted: false, property: { unlocked: true } })
    const res = makeRes()
    await handler(makeReq({ body: { parcelNodeId: PARCEL } }), res)
    expect(res.statusCode).toBe(502)
    expect((res.body as { message: string }).message).toBe('MCP_REACHED')
  })

  it('Solo session (paid, no Property Unlock) still REFUSES studio_required — MCP never reached', async () => {
    const fetchMock = stubFetch({ tier: 'paid', studioGranted: false, property: { unlocked: false } })
    const res = makeRes()
    await handler(makeReq({ body: { parcelNodeId: PARCEL } }), res)
    expect(res.statusCode).toBe(402)
    expect((res.body as { error: string }).error).toBe('studio_required')
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/mcp'))).toBe(false)
  })

  it('Free session (no subscription, no Property Unlock) still REFUSES payment_required — MCP never reached', async () => {
    const fetchMock = stubFetch({ tier: 'free', studioGranted: false, property: { unlocked: false } })
    const res = makeRes()
    await handler(makeReq({ body: { parcelNodeId: PARCEL } }), res)
    expect(res.statusCode).toBe(402)
    expect((res.body as { error: string }).error).toBe('payment_required')
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/mcp'))).toBe(false)
  })

  it('REGRESSION: Studio session still PASSES the gate exactly as before', async () => {
    stubFetch({ tier: 'paid', studioGranted: true, property: { unlocked: false } })
    const res = makeRes()
    await handler(makeReq({ body: { parcelNodeId: PARCEL } }), res)
    expect(res.statusCode).toBe(502)
    expect((res.body as { message: string }).message).toBe('MCP_REACHED')
  })

  it('REGRESSION: Team session (studioGranted true) still PASSES the gate', async () => {
    stubFetch({ tier: 'paid', studioGranted: true, property: { unlocked: false } })
    const res = makeRes()
    await handler(makeReq({ body: { parcelNodeId: PARCEL } }), res)
    expect(res.statusCode).toBe(502)
    expect((res.body as { message: string }).message).toBe('MCP_REACHED')
  })

  it('invalid parcelNodeId 400s before ever touching the entitlement network', async () => {
    const fetchMock = stubFetch({ tier: 'paid', studioGranted: true })
    const res = makeRes()
    await handler(makeReq({ body: { parcelNodeId: 'not-a-parcel' } }), res)
    expect(res.statusCode).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
