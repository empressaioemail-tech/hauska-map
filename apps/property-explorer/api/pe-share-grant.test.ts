import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handlePeShareGrant } from './pe-share-grant.js'
import { createMemoryShareGrantStore } from './_lib/pe-share-grant-store.js'
import type { ShareGrantRow } from './_lib/pe-share-grant.js'

const PARCEL = '48021:105032'
const GRANT_ID = '2c1a9d4e-7b11-4f0a-9c3d-0a1b2c3d4e5f'

const ROW: ShareGrantRow = {
  id: GRANT_ID,
  grantorUserId: 'user-1',
  grantorTenantId: 'tenant-a',
  parcelNodeId: PARCEL,
  createdAt: '2026-09-01T00:00:00.000Z',
  expiresAt: '2099-01-01T00:00:00.000Z',
  revokedAt: null,
}

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
  return {
    method: 'GET',
    query,
    headers: {},
  } as unknown as VercelRequest
}

describe('GET /s/:grantId?what=flood', () => {
  const prevGateToken = process.env.HAUSKA_ENGINE_API_KEY

  beforeEach(() => {
    process.env.HAUSKA_ENGINE_API_KEY = 'test-engine-gate-token'
  })
  afterEach(() => {
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
    const store = createMemoryShareGrantStore([ROW])

    const res = mockRes()
    await handlePeShareGrant(mockReq({ grantId: GRANT_ID, what: 'flood' }), res, { store })

    expect(res._status).toBe(200)
    expect(res._headers['Content-Type']).toBe('application/pdf')
    expect(Buffer.isBuffer(res._sent)).toBe(true)
    const [url] = fetchMock.mock.calls[0]!
    expect(url).toContain(`/property-nodes/${encodeURIComponent(PARCEL)}/flood-drainage/download`)
  })

  it('honestly declines when the sharer never ran the report (falsifier: not a 200)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    })
    vi.stubGlobal('fetch', fetchMock)
    const store = createMemoryShareGrantStore([ROW])

    const res = mockRes()
    await handlePeShareGrant(mockReq({ grantId: GRANT_ID, what: 'flood' }), res, { store })

    expect(res._status).toBe(404)
    expect(res._json).toMatchObject({ error: 'artifact_not_available' })
  })

  it('never reaches the engine for a revoked grant — access is checked before what dispatch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const store = createMemoryShareGrantStore([{ ...ROW, revokedAt: '2026-09-02T00:00:00.000Z' }])

    const res = mockRes()
    await handlePeShareGrant(mockReq({ grantId: GRANT_ID, what: 'flood' }), res, { store })

    expect(res._status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('503s honestly when the engine gate token is not configured', async () => {
    delete process.env.HAUSKA_ENGINE_API_KEY
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const store = createMemoryShareGrantStore([ROW])

    const res = mockRes()
    await handlePeShareGrant(mockReq({ grantId: GRANT_ID, what: 'flood' }), res, { store })

    expect(res._status).toBe(503)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
