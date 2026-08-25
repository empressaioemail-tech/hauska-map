// Property Explorer who-serves BFF — utility territory read at parcel centroid.
//
// GET /api/pe-who-serves?lat=&lng=
// Proxies cortex GET /api/who-serves with the service key server-side.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { cortexApiUrl } from './_lib/oidc-config.js'
import {
  fetchWhoServesFromCortex,
  parseWhoServesParams,
} from './_lib/pe-who-serves-core.js'

const UPSTREAM_TIMEOUT_MS = 8_000

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed', message: 'GET only' })
    return
  }

  const parsed = parseWhoServesParams(req.query as Record<string, unknown>)
  if (!parsed.ok) {
    res.status(400).json({ error: 'invalid_request', message: parsed.message })
    return
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS)
  try {
    const section = await fetchWhoServesFromCortex(parsed.lat, parsed.lng, {
      baseUrl: cortexApiUrl(),
      apiKey: process.env.CORTEX_SERVICE_API_KEY?.trim(),
      fetchImpl: (url, init) =>
        fetch(url, { ...init, signal: ctrl.signal }),
    })
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    res.status(200).json(section)
  } catch (err) {
    const message =
      (err as Error)?.name === 'AbortError'
        ? `who-serves timed out after ${UPSTREAM_TIMEOUT_MS}ms`
        : (err as Error)?.message ?? 'who-serves read failed'
    res.status(502).json({ error: 'who_serves_read_failed', message })
  } finally {
    clearTimeout(timer)
  }
}
