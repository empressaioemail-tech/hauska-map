/**
 * FEASIBILITY STUDY report handler tests (P32 wave 2).
 *
 * Exercises handleFeasibilityExportRequest end to end with a stubbed global
 * fetch (the codebase's established boundary-mock idiom — see
 * src/lib/recordsRequestClient.test.ts — rather than vi.mock'ing whole
 * modules, which this codebase does not otherwise do) and a real, valid
 * pe_session cookie header, so the actual auth gate + entitlement fetch +
 * engine-api call + response mapping all run for real. Never hits the
 * network: every fetch() call in this file is served by the stub.
 *
 * Covers the honest 401 / 402 (both free-tier and paid-but-not-Studio) /
 * 422 / 502 / 404 / 410 outcomes named in the P32 acceptance criteria.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { PE_SESSION_COOKIE } from './oidc-config.js'
import { handleFeasibilityExportRequest } from './pe-feasibility-export-handler.js'
import {
  FEASIBILITY_STUDIO_REQUIRED_MESSAGE,
  buildFeasibilityDownloadPath,
} from './pe-feasibility-export-core.js'

const PARCEL = '48029:105129'
const COOKIE = `${PE_SESSION_COOKIE}=test-session-token`

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }
}

function bufferResponse(status: number, bytes: Uint8Array) {
  return {
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: async () => bytes.buffer,
    json: async () => ({}),
    text: async () => '',
  }
}

/** Fake VercelRequest — only the fields the handler + its gate actually read. */
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

/** Routes the ONE stubbed fetch by URL substring — entitlement vs engine-api,
 *  exactly like the real network topology (two different services). */
function stubFetch(routes: {
  entitlement?: () => unknown
  refresh?: () => unknown
  download?: () => unknown
}) {
  const mock = vi.fn(async (url: string | URL, _init?: RequestInit) => {
    const u = String(url)
    if (u.includes('/entitlement')) {
      if (!routes.entitlement) throw new Error(`unexpected entitlement fetch: ${u}`)
      return routes.entitlement()
    }
    if (u.includes('/feasibility-export/refresh')) {
      if (!routes.refresh) throw new Error(`unexpected refresh fetch: ${u}`)
      return routes.refresh()
    }
    if (u.includes('/feasibility-export/download')) {
      if (!routes.download) throw new Error(`unexpected download fetch: ${u}`)
      return routes.download()
    }
    throw new Error(`unexpected fetch: ${u}`)
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

describe('handleFeasibilityExportRequest', () => {
  const prevEngineKey = process.env.HAUSKA_ENGINE_API_KEY
  const prevGateToken = process.env.ENGINE_API_GATE_TOKEN
  const prevBypass = process.env.PE_EXPORT_DEV_BYPASS
  const prevBypassSecret = process.env.PE_EXPORT_DEV_BYPASS_SECRET

  beforeEach(() => {
    process.env.HAUSKA_ENGINE_API_KEY = 'test-engine-gate-token'
    delete process.env.ENGINE_API_GATE_TOKEN
    delete process.env.PE_EXPORT_DEV_BYPASS
    delete process.env.PE_EXPORT_DEV_BYPASS_SECRET
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    if (prevEngineKey === undefined) delete process.env.HAUSKA_ENGINE_API_KEY
    else process.env.HAUSKA_ENGINE_API_KEY = prevEngineKey
    if (prevGateToken === undefined) delete process.env.ENGINE_API_GATE_TOKEN
    else process.env.ENGINE_API_GATE_TOKEN = prevGateToken
    if (prevBypass === undefined) delete process.env.PE_EXPORT_DEV_BYPASS
    else process.env.PE_EXPORT_DEV_BYPASS = prevBypass
    if (prevBypassSecret === undefined) delete process.env.PE_EXPORT_DEV_BYPASS_SECRET
    else process.env.PE_EXPORT_DEV_BYPASS_SECRET = prevBypassSecret
  })

  it('401s a signed-out request without touching the network', async () => {
    const fetchMock = stubFetch({})
    const req = makeReq({ method: 'POST', body: { parcelNodeId: PARCEL }, cookie: null })
    const res = makeRes()
    await handleFeasibilityExportRequest(req, res)
    expect(res.statusCode).toBe(401)
    expect((res.body as { error: string }).error).toBe('authentication_required')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('402s a signed-in FREE tier account (payment_required)', async () => {
    stubFetch({ entitlement: () => jsonResponse(200, { tier: 'free' }) })
    const req = makeReq({ method: 'POST', body: { parcelNodeId: PARCEL } })
    const res = makeRes()
    await handleFeasibilityExportRequest(req, res)
    expect(res.statusCode).toBe(402)
    expect((res.body as { error: string }).error).toBe('payment_required')
  })

  it('402s a signed-in PAID-but-not-Studio account (studio_required — the P-104 distinction)', async () => {
    stubFetch({
      entitlement: () => jsonResponse(200, { tier: 'paid', studioGranted: false }),
    })
    const req = makeReq({ method: 'POST', body: { parcelNodeId: PARCEL } })
    const res = makeRes()
    await handleFeasibilityExportRequest(req, res)
    expect(res.statusCode).toBe(402)
    expect((res.body as { error: string }).error).toBe('studio_required')
    expect((res.body as { message: string }).message).toBe(FEASIBILITY_STUDIO_REQUIRED_MESSAGE)
  })

  // ---------------------------------------------------------------------------
  // P-119 (2026-09-05 operator package table): Feasibility Study is also in
  // the Property Unlock row. These prove the handler-level wiring end to
  // end, not just the pure gate function (already covered exhaustively in
  // src/lib/pe-feasibility-export-bff.test.ts).
  // ---------------------------------------------------------------------------

  it('P-119: reads the PER-PARCEL entitlement (fetchPeEntitlementDetail) — the entitlement URL carries parcelNodeId', async () => {
    const fetchMock = stubFetch({
      entitlement: () => jsonResponse(200, { tier: 'paid', studioGranted: true }),
      refresh: () =>
        jsonResponse(201, {
          atom: { parcelNodeId: PARCEL },
          artifacts: { 'pdf-feasibility': { format: 'pdf-feasibility', ref: 'gcs://bucket/x' } },
        }),
    })
    const req = makeReq({ method: 'POST', body: { parcelNodeId: PARCEL } })
    const res = makeRes()
    await handleFeasibilityExportRequest(req, res)
    const entitlementCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/entitlement'),
    )
    expect(entitlementCall).toBeTruthy()
    expect(String(entitlementCall![0])).toContain(`parcelNodeId=${encodeURIComponent(PARCEL)}`)
  })

  it('P-119: a Property-Unlock session (tier free, no subscription) PASSES — 200, not the paywall', async () => {
    stubFetch({
      entitlement: () =>
        jsonResponse(200, { tier: 'free', studioGranted: false, property: { unlocked: true } }),
      refresh: () =>
        jsonResponse(201, {
          atom: { parcelNodeId: PARCEL },
          artifacts: { 'pdf-feasibility': { format: 'pdf-feasibility', ref: 'gcs://bucket/x' } },
        }),
    })
    const req = makeReq({ method: 'POST', body: { parcelNodeId: PARCEL } })
    const res = makeRes()
    await handleFeasibilityExportRequest(req, res)
    expect(res.statusCode).toBe(200)
    expect((res.body as { ok: boolean }).ok).toBe(true)
  })

  it('P-119: a Property-Unlock session on the DOWNLOAD leg also passes (streams the PDF)', async () => {
    const bytes = new TextEncoder().encode('%PDF-1.4 fake bytes')
    stubFetch({
      entitlement: () =>
        jsonResponse(200, { tier: 'free', studioGranted: false, property: { unlocked: true } }),
      download: () => bufferResponse(200, bytes),
    })
    const req = makeReq({ method: 'GET', query: { action: 'download', parcelNodeId: PARCEL } })
    const res = makeRes()
    await handleFeasibilityExportRequest(req, res)
    expect(res.statusCode).toBe(200)
    expect(res.headersSet['Content-Type']).toBe('application/pdf')
  })

  it('P-119 REGRESSION: Solo (paid, NO Property Unlock) still refuses studio_required', async () => {
    stubFetch({
      entitlement: () =>
        jsonResponse(200, { tier: 'paid', studioGranted: false, property: { unlocked: false } }),
    })
    const req = makeReq({ method: 'POST', body: { parcelNodeId: PARCEL } })
    const res = makeRes()
    await handleFeasibilityExportRequest(req, res)
    expect(res.statusCode).toBe(402)
    expect((res.body as { error: string }).error).toBe('studio_required')
  })

  it('P-119 REGRESSION: Free (no subscription, NO Property Unlock) still refuses payment_required', async () => {
    stubFetch({
      entitlement: () =>
        jsonResponse(200, { tier: 'free', studioGranted: false, property: { unlocked: false } }),
    })
    const req = makeReq({ method: 'POST', body: { parcelNodeId: PARCEL } })
    const res = makeRes()
    await handleFeasibilityExportRequest(req, res)
    expect(res.statusCode).toBe(402)
    expect((res.body as { error: string }).error).toBe('payment_required')
  })

  it('400s a malformed refresh body before ever touching entitlement or the engine', async () => {
    const fetchMock = stubFetch({})
    const req = makeReq({ method: 'POST', body: { parcelNodeId: 'not-a-parcel-id' } })
    const res = makeRes()
    await handleFeasibilityExportRequest(req, res)
    expect(res.statusCode).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('422s an honest engine refusal (e.g. no resolvable site plan) — never the paywall, never a fake report', async () => {
    stubFetch({
      entitlement: () => jsonResponse(200, { tier: 'paid', studioGranted: true }),
      refresh: () =>
        jsonResponse(422, { message: 'No resolvable site plan for this parcel.' }),
    })
    const req = makeReq({ method: 'POST', body: { parcelNodeId: PARCEL } })
    const res = makeRes()
    await handleFeasibilityExportRequest(req, res)
    expect(res.statusCode).toBe(422)
    expect((res.body as { error: string }).error).toBe('feasibility_export_failed')
    expect((res.body as { message: string }).message).toBe(
      'No resolvable site plan for this parcel.',
    )
  })

  it('200s a Studio account and maps the pinned engine contract, including the section/open-item counts', async () => {
    const fetchMock = stubFetch({
      entitlement: () => jsonResponse(200, { tier: 'paid', studioGranted: true }),
      refresh: () =>
        jsonResponse(201, {
          atom: { parcelNodeId: PARCEL, atomDid: 'pfeasibility_test' },
          artifacts: {
            'pdf-feasibility': { format: 'pdf-feasibility', ref: 'gcs://bucket/x', byteCount: 950000 },
          },
          pageCount: 22,
          feasibilityPageCount: 20,
          sitePlanAppended: true,
          sectionCount: 16,
          openItemCount: 3,
          narrativeIsDeterministicSkeleton: false,
        }),
    })
    const req = makeReq({
      method: 'POST',
      body: { parcelNodeId: PARCEL, address: '905 Pecan St', countyName: 'Bastrop' },
    })
    const res = makeRes()
    await handleFeasibilityExportRequest(req, res)
    expect(res.statusCode).toBe(200)
    const body = res.body as {
      ok: boolean
      parcelNodeId: string
      downloadUrl: string
      sectionCount: number
      openItemCount: number
    }
    expect(body.ok).toBe(true)
    expect(body.parcelNodeId).toBe(PARCEL)
    expect(body.downloadUrl).toBe(buildFeasibilityDownloadPath(PARCEL))
    expect(body.sectionCount).toBe(16)
    expect(body.openItemCount).toBe(3)

    // Gate-front headers + the refresh body PE forwards actually reached
    // engine-api — the RPT1 concern is a silent no-op, not just a status code.
    const refreshCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/feasibility-export/refresh'),
    )
    expect(refreshCall).toBeTruthy()
    const [, init] = refreshCall as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers['x-hauska-package-id']).toBe('feasibility-export')
    expect(headers.Authorization).toBe('Bearer test-engine-gate-token')
    expect(JSON.parse(String(init.body))).toEqual({
      address: '905 Pecan St',
      countyName: 'Bastrop',
    })
  })

  it('503s with the honest gate-token-missing message when the engine key is not configured', async () => {
    delete process.env.HAUSKA_ENGINE_API_KEY
    delete process.env.ENGINE_API_GATE_TOKEN
    stubFetch({ entitlement: () => jsonResponse(200, { tier: 'paid', studioGranted: true }) })
    const req = makeReq({ method: 'POST', body: { parcelNodeId: PARCEL } })
    const res = makeRes()
    await handleFeasibilityExportRequest(req, res)
    expect(res.statusCode).toBe(503)
    expect((res.body as { error: string }).error).toBe('engine_gate_config')
  })

  it('download: 404 artifact_unavailable passes through honestly (never a fabricated file)', async () => {
    stubFetch({
      entitlement: () => jsonResponse(200, { tier: 'paid', studioGranted: true }),
      download: () => jsonResponse(404, { error: 'artifact_unavailable', message: 'nothing on file' }),
    })
    const req = makeReq({ method: 'GET', query: { action: 'download', parcelNodeId: PARCEL } })
    const res = makeRes()
    await handleFeasibilityExportRequest(req, res)
    expect(res.statusCode).toBe(404)
    expect((res.body as { error: string }).error).toBe('artifact_unavailable')
  })

  it('download: 410 artifact_evicted passes through honestly', async () => {
    stubFetch({
      entitlement: () => jsonResponse(200, { tier: 'paid', studioGranted: true }),
      download: () => jsonResponse(410, { error: 'artifact_evicted', message: 'ref could not be read back' }),
    })
    const req = makeReq({ method: 'GET', query: { action: 'download', parcelNodeId: PARCEL } })
    const res = makeRes()
    await handleFeasibilityExportRequest(req, res)
    expect(res.statusCode).toBe(410)
    expect((res.body as { error: string }).error).toBe('artifact_evicted')
  })

  it('download: streams the PDF bytes with the right content type + filename on success', async () => {
    const bytes = new TextEncoder().encode('%PDF-1.4 fake bytes')
    stubFetch({
      entitlement: () => jsonResponse(200, { tier: 'paid', studioGranted: true }),
      download: () => bufferResponse(200, bytes),
    })
    const req = makeReq({ method: 'GET', query: { action: 'download', parcelNodeId: PARCEL } })
    const res = makeRes()
    await handleFeasibilityExportRequest(req, res)
    expect(res.statusCode).toBe(200)
    expect(res.headersSet['Content-Type']).toBe('application/pdf')
    expect(res.headersSet['Content-Disposition']).toContain('48029_105129_feasibility_study.pdf')
  })

  it('405s an unsupported method', async () => {
    const req = makeReq({ method: 'GET', query: { parcelNodeId: PARCEL } })
    const res = makeRes()
    await handleFeasibilityExportRequest(req, res)
    expect(res.statusCode).toBe(405)
  })
})
