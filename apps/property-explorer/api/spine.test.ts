/**
 * spine.ts had no test file before P-118. Rather than backfill coverage for
 * this entire pre-existing 480-line generic proxy (out of scope for this
 * change), this suite covers only what P-118 touched: the new
 * `api/pe-help/chat` entry in the cortex browse POST allowlist — proving it
 * is reachable through the SAME anonymous-safe mechanism every other
 * allowlisted browse path already uses, and that the allowlist did not
 * silently widen beyond it.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import handler from './spine.js'

function makeReq(opts: {
  method: 'GET' | 'POST'
  query: Record<string, string>
  body?: unknown
}): VercelRequest {
  return {
    method: opts.method,
    query: opts.query,
    body: opts.body,
    headers: {},
  } as unknown as VercelRequest
}

function makeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(payload: unknown) {
      res.body = payload
      return res
    },
    setHeader(name: string, value: string) {
      res.headers[name] = value
      return res
    },
    send(payload: unknown) {
      res.body = payload
      return res
    },
  }
  return res as unknown as VercelResponse & typeof res
}

describe('P-118: /api/spine/cortex/api/pe-help/chat is browse-allowlisted, anonymous-safe', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.CORTEX_API_URL
    delete process.env.CORTEX_SERVICE_API_KEY
  })

  it('forwards POST api/pe-help/chat to cortex with the service key attached — no caller credential required', async () => {
    process.env.CORTEX_API_URL = 'https://cortex.example.test'
    process.env.CORTEX_SERVICE_API_KEY = 'svc-key-123'
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ message: 'Solo is $49/month.' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const req = makeReq({
      method: 'POST',
      query: { upath: 'cortex/api/pe-help/chat' },
      // no cookie, no X-Hauska-Key, no Authorization — anonymous caller
      body: { message: 'What does Solo cost?' },
    })
    const res = makeRes()
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://cortex.example.test/api/pe-help/chat')
    expect(init.headers.Authorization).toBe('Bearer svc-key-123')
  })

  it('still refuses an arbitrary, non-allowlisted cortex POST path — the allowlist did not silently widen', async () => {
    process.env.CORTEX_API_URL = 'https://cortex.example.test'
    process.env.CORTEX_SERVICE_API_KEY = 'svc-key-123'
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const req = makeReq({
      method: 'POST',
      query: { upath: 'cortex/api/pe-help/definitely-not-allowlisted' },
      body: { message: 'x' },
    })
    const res = makeRes()
    await handler(req, res)

    expect(res.statusCode).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('is admitted by BOTH of the file\'s two cortex-browse-POST lists, not just one', async () => {
    // spine.ts carries isCortexBrowsePathAllowed's own exact list (gates
    // whether the path is conceptually allowed) AND a second, separate
    // `cortexBrowsePostExact` array inside the handler body (what actually
    // admits POST into `allowedMethods`). A path present in only one 403s
    // despite reading as allowed — this suite's own first assertion caught
    // exactly that during development. Read the source directly so a future
    // edit to only one list fails this test rather than silently 403ing.
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const source = readFileSync(fileURLToPath(new URL('./spine.ts', import.meta.url)), 'utf8')
    const occurrences = source.split("'api/pe-help/chat'").length - 1
    expect(occurrences).toBeGreaterThanOrEqual(2)
  })

  it('GET api/pe-help/chat is refused — the route is POST-only', async () => {
    process.env.CORTEX_API_URL = 'https://cortex.example.test'
    process.env.CORTEX_SERVICE_API_KEY = 'svc-key-123'
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const req = makeReq({
      method: 'GET',
      query: { upath: 'cortex/api/pe-help/chat' },
    })
    const res = makeRes()
    await handler(req, res)

    expect(res.statusCode).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
