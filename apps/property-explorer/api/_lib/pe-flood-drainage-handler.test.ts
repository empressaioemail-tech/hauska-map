/**
 * FLOOD & DRAINAGE report handler tests (P-240 / OPS-24, 2026-09-15).
 *
 * Exercises handleFloodDrainageRequest end to end with a stubbed global
 * fetch (the codebase's established boundary-mock idiom — see
 * pe-feasibility-export-handler.test.ts) and a real, valid pe_session
 * cookie header, so the actual auth gate + entitlement fetch + engine-api
 * call + response mapping all run for real. Never hits the network: every
 * fetch() call in this file is served by the stub.
 *
 * P-240 ported flood-drainage's refresh onto the SAME async job pattern
 * P-155 shipped for feasibility-export: refresh now 202s a job reference
 * instead of composing inline, and /study + /download now declare an
 * honest 404 wait while queued/running (never a stale prior study) and a
 * 422 once the job settles to failed. This file covers those additions —
 * the pure engine-payload mapping is covered exhaustively in
 * src/lib/pe-flood-drainage-bff.test.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { PE_SESSION_COOKIE } from './oidc-config.js'
import { handleFloodDrainageRequest } from './pe-flood-drainage-handler.js'

const PARCEL = '48021:54321'
const COOKIE = `${PE_SESSION_COOKIE}=test-session-token`

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: { get: (key: string) => headers[key] ?? null },
  }
}

function bufferResponse(status: number, bytes: Uint8Array, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: async () => bytes.buffer,
    json: async () => ({}),
    text: async () => '',
    headers: { get: (key: string) => headers[key] ?? null },
  }
}

function makeReq(opts: {
  method: 'GET' | 'POST'
  query?: Record<string, string>
  body?: unknown
  cookie?: string | null
}): VercelRequest {
  return {
    method: opts.method,
    query: opts.query ?? {},
    body: opts.body,
    headers: {
      cookie: opts.cookie === null ? undefined : (opts.cookie ?? COOKIE),
    },
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
    send(payload: unknown) {
      res.body = payload
      return res
    },
  }
  return res as unknown as VercelResponse & typeof res
}

/** Routes the ONE stubbed fetch by URL substring, checked most-specific
 * first so `/flood-drainage/refresh` never shadows `/flood-drainage/study`
 * or vice versa. */
function stubFetch(routes: {
  entitlement?: () => unknown
  refresh?: () => unknown
  study?: () => unknown
  download?: () => unknown
}) {
  const mock = vi.fn(async (url: string | URL, _init?: RequestInit) => {
    const u = String(url)
    if (u.includes('/entitlement')) {
      if (!routes.entitlement) throw new Error(`unexpected entitlement fetch: ${u}`)
      return routes.entitlement()
    }
    if (u.includes('/flood-drainage/refresh')) {
      if (!routes.refresh) throw new Error(`unexpected refresh fetch: ${u}`)
      return routes.refresh()
    }
    if (u.includes('/flood-drainage/download')) {
      if (!routes.download) throw new Error(`unexpected download fetch: ${u}`)
      return routes.download()
    }
    if (u.includes('/flood-drainage/study')) {
      if (!routes.study) throw new Error(`unexpected study fetch: ${u}`)
      return routes.study()
    }
    throw new Error(`unexpected fetch: ${u}`)
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

describe('handleFloodDrainageRequest', () => {
  const prevEngineKey = process.env.HAUSKA_ENGINE_API_KEY
  const prevGateToken = process.env.ENGINE_API_GATE_TOKEN

  beforeEach(() => {
    process.env.HAUSKA_ENGINE_API_KEY = 'test-engine-gate-token'
    delete process.env.ENGINE_API_GATE_TOKEN
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    if (prevEngineKey === undefined) delete process.env.HAUSKA_ENGINE_API_KEY
    else process.env.HAUSKA_ENGINE_API_KEY = prevEngineKey
    if (prevGateToken === undefined) delete process.env.ENGINE_API_GATE_TOKEN
    else process.env.ENGINE_API_GATE_TOKEN = prevGateToken
  })

  it('401s a signed-out request without touching the network', async () => {
    const fetchMock = stubFetch({})
    const req = makeReq({ method: 'POST', body: { parcelNodeId: PARCEL }, cookie: null })
    const res = makeRes()
    await handleFloodDrainageRequest(req, res)
    expect(res.statusCode).toBe(401)
    expect((res.body as { error: string }).error).toBe('authentication_required')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('402s a signed-in free tier account with no property unlock', async () => {
    stubFetch({ entitlement: () => jsonResponse(200, { tier: 'free', property: { unlocked: false } }) })
    const req = makeReq({ method: 'POST', body: { parcelNodeId: PARCEL } })
    const res = makeRes()
    await handleFloodDrainageRequest(req, res)
    expect(res.statusCode).toBe(402)
    expect((res.body as { error: string }).error).toBe('payment_required')
  })

  // ---------------------------------------------------------------------------
  // P-240: refresh now 202s a job reference instead of composing inline.
  // ---------------------------------------------------------------------------

  it('202s a property-unlocked account\'s refresh — job accepted, gate-front headers + forwarded body reach engine-api', async () => {
    const fetchMock = stubFetch({
      entitlement: () => jsonResponse(200, { tier: 'free', property: { unlocked: true } }),
      refresh: () => jsonResponse(202, { state: 'queued', jobRef: 'job-1', pollAfterMs: 5000 }),
    })
    const req = makeReq({
      method: 'POST',
      body: { parcelNodeId: PARCEL, address: '714 Spring St', countyName: 'Bastrop' },
    })
    const res = makeRes()
    await handleFloodDrainageRequest(req, res)
    expect(res.statusCode).toBe(202)
    const body = res.body as { ok: boolean; parcelNodeId: string; state: string; jobRef: string }
    expect(body.ok).toBe(true)
    expect(body.parcelNodeId).toBe(PARCEL)
    expect(body.state).toBe('queued')
    expect(body.jobRef).toBe('job-1')

    const refreshCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/flood-drainage/refresh'))
    expect(refreshCall).toBeTruthy()
    const [, init] = refreshCall as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>)['x-hauska-package-id']).toBe('flood-drainage-report')
    expect(JSON.parse(String(init.body))).toEqual({
      address: '714 Spring St',
      countyName: 'Bastrop',
    })
  })

  it('a running job on a second refresh call still 202s through whatever the engine answers (SAME jobRef is the engine\'s own contract, not remapped here)', async () => {
    stubFetch({
      entitlement: () => jsonResponse(200, { tier: 'paid', property: { unlocked: false } }),
      refresh: () => jsonResponse(202, { state: 'running', jobRef: 'job-1', pollAfterMs: 5000 }),
    })
    const req = makeReq({ method: 'POST', body: { parcelNodeId: PARCEL } })
    const res = makeRes()
    await handleFloodDrainageRequest(req, res)
    expect(res.statusCode).toBe(202)
    expect((res.body as { state: string; jobRef: string }).state).toBe('running')
    expect((res.body as { state: string; jobRef: string }).jobRef).toBe('job-1')
  })

  it('refresh: a malformed 202 body (no jobRef) is an honest upstream error, never a fabricated job', async () => {
    stubFetch({
      entitlement: () => jsonResponse(200, { tier: 'paid', property: { unlocked: false } }),
      refresh: () => jsonResponse(202, { state: 'queued' }),
    })
    const req = makeReq({ method: 'POST', body: { parcelNodeId: PARCEL } })
    const res = makeRes()
    await handleFloodDrainageRequest(req, res)
    expect(res.statusCode).toBe(502)
    expect((res.body as { error: string }).error).toBe('upstream_error')
  })

  // ---------------------------------------------------------------------------
  // P-240: /study now declares an honest wait / failure instead of ever
  // silently serving a stale prior study while a new refresh is in flight.
  // ---------------------------------------------------------------------------

  it('study: 200s the ready study unchanged (mapEngineFloodPayload shape untouched by P-240)', async () => {
    stubFetch({
      entitlement: () => jsonResponse(200, { tier: 'paid', property: { unlocked: false } }),
      study: () =>
        jsonResponse(200, { data: { parcelNodeId: PARCEL, study: { parcelNodeId: PARCEL, briefing: 'x' } } }),
    })
    const req = makeReq({ method: 'GET', query: { action: 'study', parcelNodeId: PARCEL } })
    const res = makeRes()
    await handleFloodDrainageRequest(req, res)
    expect(res.statusCode).toBe(200)
    expect((res.body as { study: { briefing: string } }).study.briefing).toBe('x')
  })

  it('study: 404 DECLARED wait while running passes jobRef/pollAfterMs through (never a stale study)', async () => {
    stubFetch({
      entitlement: () => jsonResponse(200, { tier: 'paid', property: { unlocked: false } }),
      study: () =>
        jsonResponse(404, {
          error: 'flood_drainage_in_progress',
          state: 'running',
          jobRef: 'job-2',
          pollAfterMs: 5000,
          message: 'Flood & Drainage study is still being generated for this parcel.',
        }),
    })
    const req = makeReq({ method: 'GET', query: { action: 'study', parcelNodeId: PARCEL } })
    const res = makeRes()
    await handleFloodDrainageRequest(req, res)
    expect(res.statusCode).toBe(404)
    const body = res.body as { error: string; state: string; jobRef: string; pollAfterMs: number }
    expect(body.error).toBe('flood_drainage_in_progress')
    expect(body.state).toBe('running')
    expect(body.jobRef).toBe('job-2')
    expect(body.pollAfterMs).toBe(5000)
  })

  it('study: 422 passes the failed job\'s errorClass through honestly', async () => {
    stubFetch({
      entitlement: () => jsonResponse(200, { tier: 'paid', property: { unlocked: false } }),
      study: () =>
        jsonResponse(422, {
          error: 'flood_drainage_refresh_failed',
          errorClass: 'geometry_unavailable',
          message: 'parcel geometry could not be resolved for this parcel',
        }),
    })
    const req = makeReq({ method: 'GET', query: { action: 'study', parcelNodeId: PARCEL } })
    const res = makeRes()
    await handleFloodDrainageRequest(req, res)
    expect(res.statusCode).toBe(422)
    const body = res.body as { error: string; errorClass: string }
    expect(body.error).toBe('flood_drainage_refresh_failed')
    expect(body.errorClass).toBe('geometry_unavailable')
  })

  it('study: the OLD no-job 404 (study_unavailable) still passes through unchanged', async () => {
    stubFetch({
      entitlement: () => jsonResponse(200, { tier: 'paid', property: { unlocked: false } }),
      study: () =>
        jsonResponse(404, {
          error: 'study_unavailable',
          message: 'No flood-drainage study for this parcel; call flood-drainage/refresh',
        }),
    })
    const req = makeReq({ method: 'GET', query: { action: 'study', parcelNodeId: PARCEL } })
    const res = makeRes()
    await handleFloodDrainageRequest(req, res)
    expect(res.statusCode).toBe(404)
    expect((res.body as { error: string }).error).toBe('study_unavailable')
  })

  // ---------------------------------------------------------------------------
  // P-240: /download gets the same declared-wait / failed-job additions,
  // plus the new X-Flood-Drainage-Generated-At header on success.
  // ---------------------------------------------------------------------------

  it('download: 404 DECLARED wait passes state/jobRef through (never a bare absence)', async () => {
    stubFetch({
      entitlement: () => jsonResponse(200, { tier: 'paid', property: { unlocked: false } }),
      download: () =>
        jsonResponse(404, {
          error: 'flood_drainage_in_progress',
          state: 'queued',
          jobRef: 'job-3',
          pollAfterMs: 5000,
        }),
    })
    const req = makeReq({ method: 'GET', query: { action: 'download', parcelNodeId: PARCEL } })
    const res = makeRes()
    await handleFloodDrainageRequest(req, res)
    expect(res.statusCode).toBe(404)
    const body = res.body as { error: string; state: string; jobRef: string }
    expect(body.error).toBe('flood_drainage_in_progress')
    expect(body.state).toBe('queued')
    expect(body.jobRef).toBe('job-3')
  })

  it('download: 422 failed_job passes the errorClass through', async () => {
    stubFetch({
      entitlement: () => jsonResponse(200, { tier: 'paid', property: { unlocked: false } }),
      download: () =>
        jsonResponse(422, {
          error: 'flood_drainage_refresh_failed',
          errorClass: 'compose_timeout',
          message: 'timed out',
        }),
    })
    const req = makeReq({ method: 'GET', query: { action: 'download', parcelNodeId: PARCEL } })
    const res = makeRes()
    await handleFloodDrainageRequest(req, res)
    expect(res.statusCode).toBe(422)
    expect((res.body as { errorClass: string }).errorClass).toBe('compose_timeout')
  })

  it('download: streams the PDF and forwards X-Flood-Drainage-Generated-At', async () => {
    const bytes = new TextEncoder().encode('%PDF-1.4 fake bytes')
    stubFetch({
      entitlement: () => jsonResponse(200, { tier: 'paid', property: { unlocked: false } }),
      download: () =>
        bufferResponse(200, bytes, { 'X-Flood-Drainage-Generated-At': '2026-09-15T12:00:00.000Z' }),
    })
    const req = makeReq({ method: 'GET', query: { action: 'download', parcelNodeId: PARCEL } })
    const res = makeRes()
    await handleFloodDrainageRequest(req, res)
    expect(res.statusCode).toBe(200)
    expect(res.headersSet['Content-Type']).toBe('application/pdf')
    expect(res.headersSet['X-Flood-Drainage-Generated-At']).toBe('2026-09-15T12:00:00.000Z')
  })
})
