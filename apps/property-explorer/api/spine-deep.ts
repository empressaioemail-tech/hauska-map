// Authenticated deep-route proxy — forwards user session Bearer to Cortex.
// WDLL items 13, 14 — must NOT use CORTEX_SERVICE_API_KEY (service = max tier).
//
// /api/spine-deep/(.*) -> /api/spine-deep?upath=$1
// Only property-explorer deep paths are allowlisted.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { cortexApiUrl } from './_lib/oidc-config.js'
import { readPeSessionCookie } from './_lib/session-cookie.js'

const DEEP_GET_EXACT = new Set([
  'api/property-explorer/v1/entitlement',
])

const DEEP_GET_PREFIX = [
  'api/property-explorer/v1/saved-properties',
  'api/property-explorer/v1/research/layer-manifest',
]

const DEEP_POST_EXACT = new Set([
  'api/property-explorer/v1/research/brief',
  'api/property-explorer/v1/research/hydrology',
  'api/property-explorer/v1/research/subsurface',
])

function isDeepPathAllowed(method: string, upstreamPath: string): boolean {
  if (method === 'GET' || method === 'HEAD') {
    if (DEEP_GET_EXACT.has(upstreamPath)) return true
    return DEEP_GET_PREFIX.some((p) => upstreamPath === p || upstreamPath.startsWith(`${p}/`))
  }
  if (method === 'POST') {
    if (DEEP_POST_EXACT.has(upstreamPath)) return true
    return false
  }
  if (method === 'PUT' || method === 'DELETE') {
    return upstreamPath.startsWith('api/property-explorer/v1/saved-properties/')
  }
  return false
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

  const token = readPeSessionCookie(req.headers.cookie)
  if (!token) {
    res.status(401).json({ error: 'authentication_required' })
    return
  }

  const upstreamPath = path.join('/')
  const method = req.method ?? 'GET'
  if (!isDeepPathAllowed(method, upstreamPath)) {
    res.status(403).json({ error: 'forbidden', message: 'Path not on deep allowlist' })
    return
  }

  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(req.query)) {
    if (k === 'upath') continue
    for (const val of Array.isArray(v) ? v : [v]) {
      if (val !== undefined) qs.append(k, val)
    }
  }
  const qsStr = qs.toString()
  const targetUrl = `${cortexApiUrl()}/${upstreamPath}${qsStr ? `?${qsStr}` : ''}`

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: req.headers.accept?.toString() ?? 'application/json',
    'Content-Type': req.headers['content-type']?.toString() ?? 'application/json',
  }

  try {
    const fetchOptions: RequestInit = { method, headers }
    if ((method === 'POST' || method === 'PUT' || method === 'PATCH') && req.body) {
      fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
    }
    const upstreamRes = await fetch(targetUrl, fetchOptions)
    const contentType = upstreamRes.headers.get('content-type')
    if (contentType) res.setHeader('Content-Type', contentType)
    const text = await upstreamRes.text()
    res.status(upstreamRes.status).send(text)
  } catch (err) {
    res.status(502).json({
      error: 'upstream error',
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
