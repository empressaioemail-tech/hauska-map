// api/icc.ts
//
// Vercel serverless proxy for ICC Code Connect demo. Routes
// GET /api/icc?path=<upstream-path>&<params> to RETRIEVAL_API_URL with
// Authorization: Bearer RETRIEVAL_API_KEY (server-side env, trimmed).
//
// SECURITY: allowlist — only 'search' and 'atoms/<did>' upstream paths,
// GET only, and FORCE jurisdiction=icc-model-code on every search call
// (this surface must not become a general corpus browser).
//
// 502 with a message on upstream error; 503 {missing} when env unset.

import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method not allowed' })
    return
  }

  const { path: pathParam, ...otherParams } = req.query
  const pathStr = Array.isArray(pathParam) ? pathParam[0] : pathParam

  if (!pathStr || typeof pathStr !== 'string') {
    res.status(400).json({ error: 'missing path parameter' })
    return
  }

  // SECURITY: allowlist — only 'search' and 'atoms/<did>'
  const isSearch = pathStr === 'search'
  const isAtom = /^atoms\/[^/]+$/.test(pathStr)

  if (!isSearch && !isAtom) {
    res.status(403).json({ error: 'path not allowed' })
    return
  }

  // Check env vars
  const baseUrl = (process.env.RETRIEVAL_API_URL?.trim() || 'https://hauska-retrieval-api-h7gvu7rgcq-uc.a.run.app').replace(/\/$/, '')
  const apiKey = process.env.RETRIEVAL_API_KEY?.trim()

  if (!apiKey) {
    res.status(503).json({ error: 'proxy not configured', missing: 'RETRIEVAL_API_KEY' })
    return
  }

  // Build query string — FORCE jurisdiction=icc-model-code on search
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(otherParams)) {
    if (k === 'path') continue
    for (const val of Array.isArray(v) ? v : [v]) {
      if (val !== undefined && typeof val === 'string') {
        qs.append(k, val)
      }
    }
  }

  if (isSearch) {
    qs.set('jurisdiction', 'icc-model-code')
  }

  const qsStr = qs.toString()
  const targetUrl = `${baseUrl}/${pathStr}${qsStr ? `?${qsStr}` : ''}`

  try {
    const upstreamRes = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
    })

    const contentType = upstreamRes.headers.get('content-type')
    if (contentType) {
      res.setHeader('Content-Type', contentType)
    }

    const text = await upstreamRes.text()
    res.status(upstreamRes.status).send(text)
  } catch (err) {
    res.status(502).json({ error: 'upstream error', message: err instanceof Error ? err.message : String(err) })
  }
}
