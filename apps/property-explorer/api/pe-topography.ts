// Property Explorer topography (contours) BFF — qa/topo-panel-live.
//
// POST /api/pe-topography
//   Body: { bbox: {westLng,southLat,eastLng,northLat}, centerLat?, centerLng? }
//   Returns: { geojson, provider, tier, intervalLabel, degraded, featureCount, status }
//
// A FREE browse layer (peer to FEMA flood on the browse map) — no paid PE
// session required. Fetches the engine map-layers `topography` slot for the
// viewport with server-side gate-front headers (the browser never holds the
// engine service token).
//
// HONESTY: the engine map-layers `topography` slot serves 3DEP-DERIVED contours
// (1 m interval). It is NOT the Bastrop 1-ft LiDAR (that tier flows only through
// the DXF/site-plan EXPORT path). This BFF labels contours as 3DEP-derived and
// never claims 1-ft.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  classifyEngineFailure,
  ENGINE_GATE_TOKEN_MESSAGE,
  ENGINE_GATE_TOKEN_MISSING_MESSAGE,
} from './_lib/pe-site-plan-export-core.js'
import {
  buildAssembleBody,
  buildTopographyGateHeaders,
  engineApiBaseUrl,
  engineApiGateToken,
  mapAssemblePayload,
  parseTopoRequest,
} from './_lib/pe-topography-core.js'

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const parsed = parseTopoRequest(req.body)
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
        ...buildTopographyGateHeaders(),
      },
      body: JSON.stringify(buildAssembleBody(parsed.request)),
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
    const mapped = mapAssemblePayload(payload)
    res.status(200).json(mapped)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(502).json({
      error: 'engine_unreachable',
      message: `Engine API unreachable while assembling topography (${message}).`,
    })
  }
}
