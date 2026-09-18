// Property Explorer situs-search BFF — authoritative parcel situs typeahead.
//
// GET /api/pe-situs-search?q=<text>&limit=<n>
//   Returns: { hits: { parcelNodeId, situsAddress, countyFips }[] }
//            and, when the search found no hits, the coverage answer beside
//            them (P-353): missClass with outOfCoverageCounty, or
//            outOfCoverageState, or coverageCheckUnavailableReason.
//
// Proxies cortex GET /api/brokerage/v1/place/situs-search with the service
// key server-side. Edge-cache 60s; situs index ranks above Photon geocode.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  buildCortexSitusSearchUrl,
  coverageUnavailableResponse,
  mapSitusSearchResponse,
  parseSitusSearchParams,
} from './_lib/pe-situs-search-core.js'

const DEFAULT_CORTEX_URL = 'https://cortex-api-tds7av26va-uc.a.run.app'
/**
 * P-353. This ceiling was 5s, which sits too close to the real thing: the
 * coverage path measured 3.8s end to end for Cameron on 2026-09-18, so a
 * slow-but-answering coverage check was being turned into an outage by
 * ~1.2s of headroom. Cortex's full ladder (situs keys, then address points,
 * then the coverage source) is the SLOW, deliberate answer, not the failure
 * case. 9s still sits inside the customer-leg probe's own 12s budget for
 * this leg (doc_repo scripts/surface-probe.mjs), so a ceiling that is
 * genuinely too low surfaces as a measured timeout, not a dead surface.
 */
const UPSTREAM_TIMEOUT_MS = 9_000

function cortexBaseUrl(): string {
  return (process.env.CORTEX_API_URL?.trim() || DEFAULT_CORTEX_URL).replace(
    /\/$/,
    '',
  )
}

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
      // P-353 item 4. A cortex that refuses is a coverage check that could
      // not answer — the fourth owed class, served honestly. It is never a
      // miss: an empty list with no class is exactly the P-205 collapse.
      res.setHeader('Cache-Control', 'no-store')
      res.status(200).json(
        coverageUnavailableResponse(`cortex responded ${upstream.status}`),
      )
      return
    }
    const json = (await upstream.json().catch(() => null)) as unknown
    if (json == null) {
      // A body we cannot read is an answer we do not have. Same class, same
      // reason: never an invented miss.
      res.setHeader('Cache-Control', 'no-store')
      res.status(200).json(
        coverageUnavailableResponse('cortex returned a non-JSON body'),
      )
      return
    }
    res.setHeader(
      'Cache-Control',
      'public, s-maxage=60, stale-while-revalidate=300',
    )
    res.status(200).json(mapSitusSearchResponse(json))
  } catch (err) {
    // P-353 item 4. A timeout must read as "the coverage check is
    // unavailable", never as a miss and never as a bare transport error the
    // customer cannot interpret. Still HTTP 200 with a named class, because
    // the class IS the answer.
    const timedOut = (err as Error)?.name === 'AbortError'
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json(
      coverageUnavailableResponse(
        timedOut
          ? `cortex timed out after ${UPSTREAM_TIMEOUT_MS}ms`
          : `cortex fetch failed — ${(err as Error)?.message ?? 'unknown'}`,
      ),
    )
  } finally {
    clearTimeout(timer)
  }
}
