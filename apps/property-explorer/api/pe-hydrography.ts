// Property Explorer HYDROGRAPHY BFF — real county-mapped streams.
//
// POST /api/pe-hydrography
//   Body: { bbox: {westLng,southLat,eastLng,northLat}, centerLat?, centerLng? }
//   Returns: { geojson, provider, provenance {source, layerName, vintage, kind},
//              degraded, honestEmptyReason, featureCount, status, detail? }
//
// A FREE browse layer (peer to contours + FEMA flood on the browse map) — no
// paid PE session required. Fetches the engine map-layers `hydrography` slot
// (REAL county-mapped stream geometry with source provenance) with server-side
// gate-front headers (the browser never holds the engine service token).
//
// HONESTY: real streams where the county maps them; an ok slot with zero
// streams is HONEST-EMPTY (empty FeatureCollection + a real reason); a county
// with no configured source is HONEST-UNAVAILABLE; and an engine build that
// does not know the `hydrography` layer yet (404 / unknown-layer) is the
// FEATURE-DETECT state — status "unavailable", "Hydrography not yet available",
// NEVER an error (the engine leg deploys separately).

import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  classifyEngineFailure,
  ENGINE_GATE_TOKEN_MESSAGE,
  ENGINE_GATE_TOKEN_MISSING_MESSAGE,
} from './_lib/pe-site-plan-export-core.js'
import {
  buildHydrographyAssembleBody,
  buildHydrographyGateHeaders,
  engineApiBaseUrl,
  engineApiGateToken,
  hydrographyUnavailableResponse,
  isHydrographyUnknownToEngine,
  mapHydrographyPayload,
  parseHydrographyRequest,
} from './_lib/pe-hydrography-core.js'

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const parsed = parseHydrographyRequest(req.body)
  if (!parsed.ok) {
    res.status(400).json({ error: 'invalid_request', message: parsed.message })
    return
  }

  const gateToken = engineApiGateToken()
  if (!gateToken) {
    // Preview deploys without the engine key: honest DEGRADED, not a fake layer.
    res.status(503).json({
      error: 'engine_gate_config',
      message: ENGINE_GATE_TOKEN_MISSING_MESSAGE,
      missing: 'HAUSKA_ENGINE_API_KEY|ENGINE_API_GATE_TOKEN',
    })
    return
  }

  const target = `${engineApiBaseUrl()}/v1/map-layers/assemble`
  try {
    const upstream = await fetch(target, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${gateToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...buildHydrographyGateHeaders(),
      },
      body: JSON.stringify(buildHydrographyAssembleBody(parsed.request)),
    })

    if (!upstream.ok) {
      const text = await upstream.text()
      const kind = classifyEngineFailure({ status: upstream.status, message: text })
      if (kind === 'gate') {
        res.status(503).json({
          error: 'engine_gate_config',
          message: ENGINE_GATE_TOKEN_MESSAGE,
          detail: text.slice(0, 300),
        })
        return
      }
      // FEATURE-DETECT: the engine build serving this request does not know the
      // `hydrography` layer yet (deploys separately). Honest 200 "unavailable",
      // never an error the map would surface as a failure.
      if (isHydrographyUnknownToEngine(upstream.status, text)) {
        res.status(200).json(hydrographyUnavailableResponse())
        return
      }
      res.status(502).json({
        error: 'upstream_error',
        message: text.slice(0, 300),
      })
      return
    }

    const payload = (await upstream.json().catch(() => null)) as unknown
    const mapped = mapHydrographyPayload(payload)
    res.status(200).json(mapped)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(502).json({
      error: 'engine_unreachable',
      message: `Engine API unreachable while assembling hydrography (${message}).`,
    })
  }
}
