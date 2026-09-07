import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { mintShareToken } from './_lib/pe-share-token.js'
import { parseShareViewWhat, SHARE_VIEW_WHAT } from './pe-share-view.js'
import handler from './pe-share-view.js'

const SECRET = 'test-share-view-secret'
const PARCEL = '48021:105032'

function mockRes(): VercelResponse & { _status: number; _json: unknown; _sent: unknown; _headers: Record<string, string> } {
  const res = {
    _status: 0,
    _json: undefined as unknown,
    _sent: undefined as unknown,
    _headers: {} as Record<string, string>,
    status(code: number) {
      res._status = code
      return res
    },
    json(body: unknown) {
      res._json = body
      return res
    },
    send(body: unknown) {
      res._sent = body
      return res
    },
    setHeader(key: string, value: string) {
      res._headers[key] = value
      return res
    },
  }
  return res as unknown as VercelResponse & typeof res
}

function mockReq(query: Record<string, string>): VercelRequest {
  return { method: 'GET', query } as unknown as VercelRequest
}

describe('parseShareViewWhat', () => {
  it('accepts flood alongside the existing four', () => {
    expect(SHARE_VIEW_WHAT).toContain('flood')
    expect(parseShareViewWhat('flood')).toBe('flood')
  })

  it('rejects an unknown value (falsifier)', () => {
    expect(parseShareViewWhat('owner')).toBeNull()
    expect(parseShareViewWhat('')).toBeNull()
    expect(parseShareViewWhat(undefined)).toBeNull()
  })
})

describe('GET /api/pe-share-view?what=flood', () => {
  const prevSecret = process.env.PE_SHARE_SECRET
  const prevGateToken = process.env.HAUSKA_ENGINE_API_KEY
  let token: string

  beforeEach(() => {
    process.env.PE_SHARE_SECRET = SECRET
    process.env.HAUSKA_ENGINE_API_KEY = 'test-engine-gate-token'
    token = mintShareToken({ parcelNodeId: PARCEL, secret: SECRET, nowMs: Date.UTC(2026, 8, 7) }).token
  })
  afterEach(() => {
    process.env.PE_SHARE_SECRET = prevSecret
    process.env.HAUSKA_ENGINE_API_KEY = prevGateToken
    vi.unstubAllGlobals()
  })

  it('streams the PDF on a real report (positive)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => new TextEncoder().encode('%PDF-1.4 fake').buffer,
    })
    vi.stubGlobal('fetch', fetchMock)

    const res = mockRes()
    await handler(mockReq({ token, what: 'flood' }), res)

    expect(res._status).toBe(200)
    expect(res._headers['Content-Type']).toBe('application/pdf')
    expect(res._headers['Content-Disposition']).toContain('attachment')
    expect(Buffer.isBuffer(res._sent)).toBe(true)

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toContain(`/property-nodes/${encodeURIComponent(PARCEL)}/flood-drainage/download`)
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer test-engine-gate-token',
    })
  })

  it('honestly declines when the sharer never ran the report — never a trigger to run it (falsifier: not a 200)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'flood_not_found', message: 'No report on file.' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const res = mockRes()
    await handler(mockReq({ token, what: 'flood' }), res)

    expect(res._status).toBe(404)
    expect(res._json).toMatchObject({ error: 'flood_not_found' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('503s honestly when the engine gate token is not configured (never silently unsigned)', async () => {
    delete process.env.HAUSKA_ENGINE_API_KEY
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const res = mockRes()
    await handler(mockReq({ token, what: 'flood' }), res)

    expect(res._status).toBe(503)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('never reaches the engine on an invalid token — parcel comes from the token only', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const res = mockRes()
    await handler(mockReq({ token: 'not-a-real-token', what: 'flood' }), res)

    expect(res._status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('regression: siteplan/dossier/brief still route past the new flood branch', () => {
    expect(parseShareViewWhat('siteplan')).toBe('siteplan')
    expect(parseShareViewWhat('terrain')).toBe('terrain')
    expect(parseShareViewWhat('dossier')).toBe('dossier')
    expect(parseShareViewWhat('brief')).toBe('brief')
  })
})
