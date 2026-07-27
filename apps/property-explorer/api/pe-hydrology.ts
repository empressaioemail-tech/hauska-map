// Property Explorer hydrology (D8 flow) BFF — qa/topo-panel-1ft-hydro.
//
// POST /api/pe-hydrology
//   Body: { bbox: {westLng,southLat,eastLng,northLat}, centerLat?, centerLng? }
//   Returns: { geojson, provider, channelCount, accumulationThreshold, routing,
//              library, honestEmptyReason, degraded, featureCount, status }
//
// A FREE browse layer (peer to contours + FEMA flood on the browse map) — no
// paid PE session required. Fetches the engine map-layers `hydrology-flow` slot
// (LIVE D8 flow accumulation over the viewport 3DEP DEM) with server-side
// gate-front headers (the browser never holds the engine service token).
//
// HONESTY: an ok slot with zero channels is HONEST-EMPTY (empty FeatureCollection
// + a real `honestEmptyReason` like "no flow channels above accumulation
// threshold in this bbox"), NOT a fabricated meander. This BFF passes that reason
// through so the client can show the honest-empty chip.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  classifyEngineFailure,
  ENGINE_GATE_TOKEN_MESSAGE,
  ENGINE_GATE_TOKEN_MISSING_MESSAGE,
} from './_lib/pe-site-plan-export-core.js'
import {
  buildHydrologyAssembleBody,
  buildHydrologyGateHeaders,
  engineApiBaseUrl,
  engineApiGateToken,
  mapHydrologyPayload,
  parseHydrologyRequest,
} from './_lib/pe-hydrology-core.js'

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const parsed = parseHydrologyRequest(req.body)
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
        ...buildHydrologyGateHeaders(),
      },
      body: JSON.stringify(buildHydrologyAssembleBody(parsed.request)),
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
      res.status(upstream.status === 404 ? 404 : 502).json({
        error: upstream.status === 404 ? 'no_coverage' : 'upstream_error',
        message: text.slice(0, 300),
      })
      return
    }

    const payload = (await upstream.json().catch(() => null)) as unknown
    const mapped = mapHydrologyPayload(payload)
    res.status(200).json(mapped)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(502).json({
      error: 'engine_unreachable',
      message: `Engine API unreachable while assembling hydrology flow (${message}).`,
    })
  }
}
