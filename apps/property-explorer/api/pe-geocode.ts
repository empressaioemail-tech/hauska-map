// Property Explorer geocode BFF — type-ahead map search.
//
// GET /api/pe-geocode?q=<text>&lat=<bias>&lon=<bias>&zoom=<bias>&limit=<n>
//   Returns: { features: GeocodeWireFeature[], attribution: "search © OSM" }
//
// Proxies the public OSM-based Photon API (no API key). The BFF exists so the
// base URL is env-tunable (GEOCODER_URL, default photon.komoot.io), responses
// edge-cache for 60s, we send a proper User-Agent, and client IPs are never
// exposed to the third party beyond necessity (the upstream call carries no
// client identity — only the query + viewport bias).
//
// Results are OSM data; the suggest dropdown shows "search © OSM" and the
// basemap already credits © OSM.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  buildPhotonUrl,
  geocoderBaseUrl,
  mapPhotonResponse,
  parseGeocodeParams,
} from './_lib/pe-geocode-core.js'

const UPSTREAM_TIMEOUT_MS = 5_000

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed', message: 'GET only' })
    return
  }

  const parsed = parseGeocodeParams(req.query as Record<string, unknown>)
  if (!parsed.ok) {
    res.status(400).json({ error: 'invalid_request', message: 'message' in parsed ? parsed.message : 'invalid request' })
    return
  }

  const target = buildPhotonUrl(geocoderBaseUrl(), parsed.params)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS)
  try {
    const upstream = await fetch(target, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        // Proper self-identification to the public geocoder.
        'User-Agent': 'hauska-property-explorer-search/0.1 (BFF)',
      },
      signal: ctrl.signal,
    })
    if (!upstream.ok) {
      res.status(502).json({
        error: 'geocoder_unreachable',
        message: `geocoder responded ${upstream.status}`,
      })
      return
    }
    const json = (await upstream.json().catch(() => null)) as unknown
    // Edge cache: identical queries within 60s share one upstream call.
    res.setHeader(
      'Cache-Control',
      'public, s-maxage=60, stale-while-revalidate=300',
    )
    res.status(200).json(mapPhotonResponse(json))
  } catch (err) {
    res.status(502).json({
      error: 'geocoder_unreachable',
      message:
        (err as Error)?.name === 'AbortError'
          ? `geocoder timed out after ${UPSTREAM_TIMEOUT_MS}ms`
          : `geocoder fetch failed — ${(err as Error)?.message ?? 'unknown'}`,
    })
  } finally {
    clearTimeout(timer)
  }
}
