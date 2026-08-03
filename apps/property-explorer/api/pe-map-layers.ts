// Property Explorer MAP-LAYERS BFF — one function, three free browse layers.
//
// POST /api/pe-map-layers?layer=topography|hydrology|hydrography|opportunity-zone
//   Body: { bbox: {westLng,southLat,eastLng,northLat}, centerLat?, centerLng? }
//   Opportunity Zone also accepts { scope: "texas", simplify?: boolean } for the
//   one-shot statewide (STATE=48) regional-pattern LOD — no bbox required.
//
// CONSOLIDATION (2026-07-29): pe-topography, pe-hydrology and pe-hydrography
// were three serverless functions with an identical skeleton; the Vercel Hobby
// plan caps a deployment at 12 functions, so they now share this ONE function.
// The public client URLs are unchanged — vercel.json rewrites
//   /api/pe-topography  -> /api/pe-map-layers?layer=topography
//   /api/pe-hydrology   -> /api/pe-map-layers?layer=hydrology
//   /api/pe-hydrography -> /api/pe-map-layers?layer=hydrography
//   /api/pe-opportunity-zone -> /api/pe-map-layers?layer=opportunity-zone
// Each branch below is the faithful body of its former function; the per-layer
// cores in ./_lib are untouched (their tests pin the behavior).
//
// HONESTY per layer is unchanged: topography serves the per-viewport contour
// tier verbatim; hydrology (derived D8 — retired as a customer layer, still
// serves report input); hydrography serves real county-mapped streams with
// honest-empty / honest-unavailable / feature-detect states.

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
import {
  buildHydrologyAssembleBody,
  buildHydrologyGateHeaders,
  mapHydrologyPayload,
  parseHydrologyRequest,
} from './_lib/pe-hydrology-core.js'
import {
  buildHydrographyAssembleBody,
  buildHydrographyGateHeaders,
  hydrographyUnavailableResponse,
  isHydrographyUnknownToEngine,
  mapHydrographyPayload,
  parseHydrographyRequest,
} from './_lib/pe-hydrography-core.js'
import {
  assembleOpportunityZoneLayer,
  parseOpportunityZoneRequest,
} from './_lib/pe-opportunity-zone-core.js'

function missingGateResponse(res: VercelResponse): void {
  // Preview deploys without the engine key: honest DEGRADED, not a fake layer.
  res.status(503).json({
    error: 'engine_gate_config',
    message: ENGINE_GATE_TOKEN_MISSING_MESSAGE,
    missing: 'HAUSKA_ENGINE_API_KEY|ENGINE_API_GATE_TOKEN',
  })
}

async function handleTopography(req: VercelRequest, res: VercelResponse): Promise<void> {
  const parsed = parseTopoRequest(req.body)
  if (!parsed.ok) {
    res.status(400).json({ error: 'invalid_request', message: parsed.message })
    return
  }
  const gateToken = engineApiGateToken()
  if (!gateToken) return missingGateResponse(res)

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
    res.status(200).json(mapAssemblePayload(payload))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(502).json({
      error: 'engine_unreachable',
      message: `Engine API unreachable while assembling topography (${message}).`,
    })
  }
}

async function handleHydrology(req: VercelRequest, res: VercelResponse): Promise<void> {
  const parsed = parseHydrologyRequest(req.body)
  if (!parsed.ok) {
    res.status(400).json({ error: 'invalid_request', message: parsed.message })
    return
  }
  const gateToken = engineApiGateToken()
  if (!gateToken) return missingGateResponse(res)

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
    res.status(200).json(mapHydrologyPayload(payload))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(502).json({
      error: 'engine_unreachable',
      message: `Engine API unreachable while assembling hydrology flow (${message}).`,
    })
  }
}

async function handleHydrography(req: VercelRequest, res: VercelResponse): Promise<void> {
  const parsed = parseHydrographyRequest(req.body)
  if (!parsed.ok) {
    res.status(400).json({ error: 'invalid_request', message: parsed.message })
    return
  }
  const gateToken = engineApiGateToken()
  if (!gateToken) return missingGateResponse(res)

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
    res.status(200).json(mapHydrographyPayload(payload))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(502).json({
      error: 'engine_unreachable',
      message: `Engine API unreachable while assembling hydrography (${message}).`,
    })
  }
}

async function handleOpportunityZone(req: VercelRequest, res: VercelResponse): Promise<void> {
  const parsed = parseOpportunityZoneRequest(req.body)
  if (!parsed.ok) {
    res.status(400).json({ error: 'invalid_request', message: parsed.message })
    return
  }
  try {
    const payload = await assembleOpportunityZoneLayer(parsed.request)
    res.status(200).json(payload)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(502).json({
      error: 'upstream_error',
      message: `Opportunity Zone tract assembly failed (${message}).`,
    })
  }
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }
  const layerRaw = req.query.layer
  const layer = Array.isArray(layerRaw) ? layerRaw[0] : layerRaw
  switch (layer) {
    case 'topography':
      return handleTopography(req, res)
    case 'hydrology':
      return handleHydrology(req, res)
    case 'hydrography':
      return handleHydrography(req, res)
    case 'opportunity-zone':
      return handleOpportunityZone(req, res)
    default:
      res.status(400).json({
        error: 'invalid_layer',
        message: 'layer must be topography, hydrology, hydrography or opportunity-zone',
      })
  }
}
