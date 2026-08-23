// Property Explorer situs-search BFF — authoritative parcel situs typeahead.
//
// GET /api/pe-situs-search?q=<text>&limit=<n>
//   Returns: { hits: { parcelNodeId, situsAddress, countyFips }[] }
//
// Proxies cortex GET /api/brokerage/v1/place/situs-search with the service
// key server-side. Edge-cache 60s; situs index ranks above Photon geocode.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  buildCortexSitusSearchUrl,
  cortexBaseUrl,
  mapSitusSearchResponse,
  parseSitusSearchParams,
} from './_lib/pe-situs-search-core.js'

const UPSTREAM_TIMEOUT_MS = 5_000

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed', message: 'GET only' })
    return
  }

  const parsed = parseSitusSearchParams(req.query as Record<string, unknown>)
  if (!parsed.ok) {
    res.status(400).json({
      error: 'invalid_request',
      message: 'message' in parsed ? parsed.message : 'invalid request',
    })
    return
  }

  const key = process.env.CORTEX_SERVICE_API_KEY?.trim()
  if (!key) {
    res.status(503).json({
      error: 'proxy_not_configured',
      missing: 'CORTEX_SERVICE_API_KEY',
    })
    return
  }

  const target = buildCortexSitusSearchUrl(cortexBaseUrl(), parsed.params)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS)
  try {
    const upstream = await fetch(target, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${key}`,
      },
      signal: ctrl.signal,
    })
    if (!upstream.ok) {
      res.status(502).json({
        error: 'situs_search_unreachable',
        message: `cortex responded ${upstream.status}`,
      })
      return
    }
    const json = (await upstream.json().catch(() => null)) as unknown
    res.setHeader(
      'Cache-Control',
      'public, s-maxage=60, stale-while-revalidate=300',
    )
    res.status(200).json(mapSitusSearchResponse(json))
  } catch (err) {
    res.status(502).json({
      error: 'situs_search_unreachable',
      message:
        (err as Error)?.name === 'AbortError'
          ? `cortex timed out after ${UPSTREAM_TIMEOUT_MS}ms`
          : `cortex fetch failed — ${(err as Error)?.message ?? 'unknown'}`,
    })
  } finally {
    clearTimeout(timer)
  }
}
