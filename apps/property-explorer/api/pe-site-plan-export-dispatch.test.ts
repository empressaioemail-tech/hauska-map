/**
 * pe-site-plan-export.ts DISPATCH tests (P32 wave 2).
 *
 * RPT1's regression risk, named directly in the P32 feasibility plan's
 * acceptance criteria: ONE serverless function now carries FOUR reports —
 * site-plan/terrain (default), the dossier fold-in (`?kind=dossier`), the
 * flood & drainage fold-in (`?report=flood-drainage`), and the feasibility
 * fold-in (`?kind=feasibility`, added this wave) — because PE sits at the
 * Vercel Hobby 11/12 serverless-function cap. A query-param collision here
 * would silently route one report's request into another report's gate and
 * engine call.
 *
 * Every leg below is driven signed-out (no session cookie), which makes
 * every gate short-circuit to 401 BEFORE any network call — so a global
 * fetch stub that throws on any call proves the request never escaped its
 * own leg, and each leg's own DISTINCT 401 copy proves it landed in the
 * right gate, not merely "a" 401 from whichever leg runs first.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import handler from './pe-site-plan-export.js'

const PARCEL = '48029:105129'

function makeReq(opts: {
  method: 'GET' | 'POST'
  query?: Record<string, string>
  body?: unknown
}): VercelRequest {
  return {
    method: opts.method,
    query: opts.query ?? {},
    body: opts.body,
    headers: {}, // no cookie — every gate below must 401, never touch the network
  } as unknown as VercelRequest
}

function makeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(payload: unknown) {
      res.body = payload
      return res
    },
    setHeader() {
      return res
    },
    send(payload: unknown) {
      res.body = payload
      return res
    },
  }
  return res as unknown as VercelResponse & typeof res
}

describe('pe-site-plan-export.ts dispatch — three fold-in legs never collide', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn(async (url: string | URL) => {
      throw new Error(`unexpected network call in a signed-out dispatch test: ${String(url)}`)
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('?kind=feasibility POST -> the feasibility gate (P32, added this wave)', async () => {
    const res = makeRes()
    await handler(
      makeReq({ method: 'POST', query: { kind: 'feasibility' }, body: { parcelNodeId: PARCEL } }),
      res,
    )
    expect(res.statusCode).toBe(401)
    expect((res.body as { message: string }).message).toBe(
      'Sign in to generate the feasibility study.',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('?kind=feasibility&action=download GET -> the feasibility gate too (not the default download leg)', async () => {
    const res = makeRes()
    await handler(
      makeReq({
        method: 'GET',
        query: { kind: 'feasibility', action: 'download', parcelNodeId: PARCEL },
      }),
      res,
    )
    expect(res.statusCode).toBe(401)
    expect((res.body as { message: string }).message).toBe(
      'Sign in to generate the feasibility study.',
    )
  })

  it('?kind=dossier POST -> the dossier (X-ray) gate, NOT the feasibility or site-plan gate', async () => {
    const res = makeRes()
    await handler(
      makeReq({ method: 'POST', query: { kind: 'dossier' }, body: { parcelNodeId: PARCEL } }),
      res,
    )
    expect(res.statusCode).toBe(401)
    expect((res.body as { message: string }).message).toBe(
      'Sign in to export the property dossier.',
    )
  })

  it('?report=flood-drainage POST -> the flood & drainage gate, NOT the feasibility gate', async () => {
    const res = makeRes()
    await handler(
      makeReq({
        method: 'POST',
        query: { report: 'flood-drainage' },
        body: { parcelNodeId: PARCEL },
      }),
      res,
    )
    expect(res.statusCode).toBe(401)
    expect((res.body as { message: string }).message).toBe(
      'Sign in to run the flood & drainage report.',
    )
  })

  it('no kind/report (the default site-plan/terrain leg) POST -> the site-plan gate, unaffected by the fold-ins', async () => {
    const res = makeRes()
    await handler(makeReq({ method: 'POST', query: {}, body: { parcelNodeId: PARCEL } }), res)
    expect(res.statusCode).toBe(401)
    expect((res.body as { message: string }).message).toBe('Sign in to export the site plan.')
  })

  it('an unknown ?report is still refused 400, unaffected by the new ?kind=feasibility leg', async () => {
    const res = makeRes()
    await handler(makeReq({ method: 'POST', query: { report: 'bogus' } }), res)
    expect(res.statusCode).toBe(400)
    expect((res.body as { error: string }).error).toBe('unknown_report')
  })
})
