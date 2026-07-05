// api/spine.ts
//
// Vercel serverless proxy â€” same-origin gateway for the Command Center. The
// browser NEVER holds service keys; this function attaches auth from
// server-side env vars and routes by the first path segment to one of three
// upstreams. Requests arrive via the vercel.json rewrite
// /api/spine/(.*) -> /api/spine?upath=$1 (the [...path] catch-all did not
// match nested segments on the deployed alias, so routing is query-based):
//   /api/spine/cortex/*   -> CORTEX_API_URL with Authorization: Bearer CORTEX_SERVICE_API_KEY
//   /api/spine/mcp/*      -> MCP_URL with X-Hauska-Key: MCP_PRODUCT_KEY
//   /api/spine/retrieval/* -> RETRIEVAL_API_URL (no auth)
//
// SECURITY: allowlist methods/paths â€” GET only, plus POST for /api/spine/mcp/mcp
// (JSON-RPC). Reject /admin/* MCP paths (admin key stays out). Missing env var
// -> 503 with {error, missing}.

import type { VercelRequest, VercelResponse } from '@vercel/node'

interface Upstream {
  baseUrl: string
  headers: Record<string, string>
}

function getUpstream(pathSegments: string[]): { upstream: Upstream | null; error?: string; missing?: string } {
  const [segment, ...rest] = pathSegments

  if (segment === 'cortex') {
    const url = process.env.CORTEX_API_URL?.trim() || 'https://cortex-api-tds7av26va-uc.a.run.app'
    const key = process.env.CORTEX_SERVICE_API_KEY?.trim()
    if (!key) return { upstream: null, error: 'proxy not configured', missing: 'CORTEX_SERVICE_API_KEY' }
    return {
      upstream: {
        baseUrl: url.replace(/\/$/, ''),
        headers: { Authorization: `Bearer ${key}` },
      },
    }
  }

  if (segment === 'mcp') {
    const url = process.env.MCP_URL?.trim() || 'https://hauska-mcp-server-h7gvu7rgcq-uc.a.run.app'
    const key = process.env.MCP_PRODUCT_KEY?.trim()
    if (!key) return { upstream: null, error: 'proxy not configured', missing: 'MCP_PRODUCT_KEY' }
    // SECURITY: reject /admin/* paths
    if (rest.some((p) => p === 'admin' || p.startsWith('admin/'))) {
      return { upstream: null, error: 'forbidden', missing: undefined }
    }
    return {
      upstream: {
        baseUrl: url.replace(/\/$/, ''),
        headers: { 'X-Hauska-Key': key },
      },
    }
  }

  if (segment === 'retrieval') {
    const url = process.env.RETRIEVAL_API_URL?.trim() || 'https://hauska-retrieval-api-h7gvu7rgcq-uc.a.run.app'
    return {
      upstream: {
        baseUrl: url.replace(/\/$/, ''),
        headers: {},
      },
    }
  }

  return { upstream: null, error: 'unknown spine segment', missing: undefined }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const { upath } = req.query
  const upathStr = Array.isArray(upath) ? upath.join('/') : upath
  if (!upathStr) {
    res.status(400).json({ error: 'invalid path' })
    return
  }
  const path = upathStr.split('/').filter(Boolean)
  if (path.some((p) => p === '..' || p === '.')) {
    res.status(400).json({ error: 'invalid path' })
    return
  }

  const { upstream, error, missing } = getUpstream(path)
  if (!upstream) {
    if (missing) {
      res.status(503).json({ error, missing })
    } else if (error === 'forbidden') {
      res.status(403).json({ error: 'forbidden' })
    } else {
      res.status(400).json({ error })
    }
    return
  }

  const [_segment, ...rest] = path
  const upstreamPath = rest.join('/')
  const method = req.method || 'GET'

  // SECURITY: allowlist methods/paths â€” GET only, plus POST for /api/spine/mcp/mcp
  const allowedMethods = ['GET', 'HEAD']
  if (path[0] === 'mcp' && upstreamPath === 'mcp') {
    allowedMethods.push('POST')
  }
  if (!allowedMethods.includes(method)) {
    res.status(403).json({ error: 'method not allowed' })
    return
  }

  // forward the original query string (minus the rewrite's upath param)
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(req.query)) {
    if (k === 'upath') continue
    for (const val of Array.isArray(v) ? v : [v]) {
      if (val !== undefined) qs.append(k, val)
    }
  }
  const qsStr = qs.toString()
  const targetUrl = `${upstream.baseUrl}/${upstreamPath}${qsStr ? `?${qsStr}` : ''}`
  const headers: Record<string, string> = {
    ...upstream.headers,
    'Content-Type': req.headers['content-type'] || 'application/json',
  }

  // Forward relevant headers
  if (req.headers['accept']) headers['Accept'] = req.headers['accept']
  if (req.headers['mcp-protocol-version']) headers['MCP-Protocol-Version'] = req.headers['mcp-protocol-version']
  if (req.headers['mcp-session-id']) headers['mcp-session-id'] = req.headers['mcp-session-id']
  if (req.headers['x-hauska-dev-product']) headers['X-Hauska-Dev-Product'] = req.headers['x-hauska-dev-product']
  if (req.headers['x-hauska-install-id']) headers['X-Hauska-Install-Id'] = req.headers['x-hauska-install-id']

  try {
    const fetchOptions: RequestInit = {
      method,
      headers,
    }

    if (method === 'POST' && req.body) {
      fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
    }

    const upstreamRes = await fetch(targetUrl, fetchOptions)

    // Forward session headers from upstream
    const sessionId = upstreamRes.headers.get('mcp-session-id')
    if (sessionId) {
      res.setHeader('mcp-session-id', sessionId)
    }

    // Forward content type
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
