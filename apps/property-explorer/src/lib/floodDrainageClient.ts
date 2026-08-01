/**
 * Client for the FLOOD & DRAINAGE report BFF (R3 — the first paid report).
 *
 * The BFF surface is FOLDED into the pe-site-plan-export function
 * (?report=flood-drainage — PE is at the Vercel Hobby function cap):
 *   POST /api/pe-site-plan-export?report=flood-drainage        → run/refresh
 *   GET  ...&action=study&parcelNodeId=...                     → cached study
 *   GET  ...&action=download&parcelNodeId=...&format=pdf-flood-drainage → PDF
 *
 * The study payload is the engine's truth verbatim (catchment, drainage
 * zones, rainfall ponding, flow lines, provenance, briefing, honestEmpty).
 * This client never rewrites values — it types the fields the dock viz and
 * provenance line consume and passes the rest through.
 */

export const FLOOD_DRAINAGE_FORMAT = 'pdf-flood-drainage' as const

const BFF_BASE = '/api/pe-site-plan-export?report=flood-drainage'

export interface GeoJsonFeature {
  type: 'Feature'
  geometry: { type: string; coordinates: unknown } | null
  properties?: Record<string, unknown> | null
}

export interface GeoJsonFeatureCollection {
  type: 'FeatureCollection'
  features: GeoJsonFeature[]
}

export interface FloodDrainageStudyView {
  parcelNodeId: string
  catchmentGeoJson: GeoJsonFeatureCollection
  drainageZonesGeoJson: GeoJsonFeatureCollection
  rainfallResultGeoJson: GeoJsonFeatureCollection | null
  flowLinesGeoJson: GeoJsonFeatureCollection
  rainfallDepthInches: number
  rainfallSource: 'noaa-atlas14' | 'parameter' | 'default'
  demProvenance: { source: string; resolutionMeters: number }
  /** Layman briefing — deterministic sentences from real study values. */
  briefing: string
  honestEmpty?: { reason: string }
  flowExits?: Array<{ lng: number; lat: number; bearingDeg: number }>
  stats?: {
    catchmentAreaSqFt: number
    pondedAreaSqFt: number | null
    flowExitCount: number
    pourPoint: { lng: number; lat: number }
  }
  parcelRingWgs84?: Array<[number, number]>
  catchmentBbox?: {
    westLng: number
    southLat: number
    eastLng: number
    northLat: number
  }
  /**
   * FD1 engine v2 addition (feature-detect: absent on older cached studies
   * and until the engine deploys): a transparent water-ramp PNG of the
   * drainage field, anchored to its own bbox, for the main-map overlay.
   */
  gradient?: {
    pngBase64: string
    bbox: { westLng: number; southLat: number; eastLng: number; northLat: number }
    note?: string
  }
  /**
   * Engine v3 addition (feature-detect: absent on older cached studies and
   * until the engine deploys): traced D8 flow-accumulation ridgelines,
   * ordered downstream. `strength` is 0..1 normalized log flow accumulation
   * (the gradient normalization); kind "exit" = the trace leaves the parcel
   * ring. Drives the strength-scaled flow ribbons on the main-map overlay.
   */
  flowPaths?: Array<{
    coordinates: Array<[number, number]>
    strength: number
    kind: 'interior' | 'exit'
  }>
  /**
   * Engine v3 addition, index-aligned with `flowPaths`: one closed polygon
   * ring per path — the contributing-corridor swath, widening downstream.
   * Drives the translucent watershed corridors under the flow ribbons.
   */
  catchmentSwaths?: Array<{
    coordinates: Array<[number, number]>
    strength: number
    kind: 'interior' | 'exit'
  }>
  /** Engine provenance note for flowPaths + catchmentSwaths derivation. */
  flowPathsNote?: string
  generatedAt?: string
}

export type FloodDrainageClientResult =
  | { ok: true; study: FloodDrainageStudyView }
  | { ok: false; status: number; error: string; message?: string; retryable?: boolean }

/**
 * STALE-STYLE GATE (Fix C). The flood-drainage study is CACHED by the engine
 * (the study GET serves the last-refreshed stored study). Studies produced
 * before the current visual language shipped are missing its data markers and
 * render in the OLD look (raw flow lines, un-dissolved zones, no severity
 * bands). Those markers live in the study DATA, so re-running is the only way
 * to get the current styling — a client re-render cannot upgrade a legacy
 * payload.
 *
 * A study is CURRENT-STYLED when it carries at least one current-era marker:
 *   - `flowPaths`      (engine v3 — traced flow ribbons)
 *   - `catchmentSwaths`(engine v3 — contributing-corridor swaths)
 *   - `gradient`       (engine v2 — drainage-field water ramp PNG)
 *   - any drainage-zone feature with a numeric `concentration` (v4 dissolved
 *     severity bands)
 * honestEmpty studies are exempt — they draw no geometry, so there is nothing
 * to style. Anything else is treated as an OLD-STYLED stale study.
 */
export function isCurrentStyledFloodStudy(
  study: FloodDrainageStudyView | null | undefined,
): boolean {
  if (!study || typeof study !== 'object') return false
  if (study.honestEmpty) return true
  if (Array.isArray(study.flowPaths) && study.flowPaths.length > 0) return true
  if (Array.isArray(study.catchmentSwaths) && study.catchmentSwaths.length > 0) {
    return true
  }
  if (study.gradient && typeof study.gradient.pngBase64 === 'string') return true
  const zoneFeatures = study.drainageZonesGeoJson?.features
  if (Array.isArray(zoneFeatures)) {
    for (const f of zoneFeatures) {
      const c = (f?.properties as { concentration?: unknown } | null | undefined)
        ?.concentration
      if (c === 0 || c === 1 || c === 2) return true
    }
  }
  return false
}

function asStudy(body: Record<string, unknown>): FloodDrainageStudyView | null {
  const study = body.study as FloodDrainageStudyView | undefined
  if (!study || typeof study !== 'object') return null
  return study
}

async function parseOutcome(res: Response): Promise<FloodDrainageClientResult> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: typeof body.error === 'string' ? body.error : 'request_failed',
      message: typeof body.message === 'string' ? body.message : undefined,
      retryable: body.retryable === true,
    }
  }
  const study = asStudy(body)
  if (!study) {
    return {
      ok: false,
      status: 502,
      error: 'invalid_response',
      message: 'Flood & drainage response carried no study payload.',
    }
  }
  return { ok: true, study }
}

/** Run (or re-run) the parcel drainage study — honest work, ~15-45 s. */
export async function requestFloodDrainageRefresh(
  parcelNodeId: string,
  opts?: { address?: string | null; countyName?: string | null },
): Promise<FloodDrainageClientResult> {
  try {
    const res = await fetch(BFF_BASE, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parcelNodeId,
        ...(opts?.address ? { address: opts.address } : {}),
        ...(opts?.countyName ? { countyName: opts.countyName } : {}),
      }),
    })
    return await parseOutcome(res)
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: 'network_error',
      message: (err as Error).message,
    }
  }
}

/** Fetch the CACHED study (written at refresh) — cheap; 404 = none yet. */
export async function fetchFloodDrainageStudy(
  parcelNodeId: string,
): Promise<FloodDrainageClientResult> {
  try {
    const res = await fetch(
      `${BFF_BASE}&action=study&parcelNodeId=${encodeURIComponent(parcelNodeId)}`,
      { credentials: 'include', headers: { Accept: 'application/json' } },
    )
    return await parseOutcome(res)
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: 'network_error',
      message: (err as Error).message,
    }
  }
}

/** The gated PDF download path (session cookie rides the same-origin GET). */
export function floodDrainageDownloadPath(parcelNodeId: string): string {
  return `${BFF_BASE}&action=download&parcelNodeId=${encodeURIComponent(parcelNodeId)}&format=${FLOOD_DRAINAGE_FORMAT}`
}

export function floodDrainageFilename(parcelNodeId: string): string {
  return `${parcelNodeId.replace(':', '_')}_flood_drainage.pdf`
}

/** Honest provenance line: DEM source/resolution + rainfall forcing + source. */
export function floodProvenanceLine(study: FloodDrainageStudyView): string {
  const dem = study.demProvenance
  const demPart = dem
    ? `DEM: ${dem.source} @ ${dem.resolutionMeters} m`
    : 'DEM: unknown'
  const sourceLabel =
    study.rainfallSource === 'noaa-atlas14'
      ? 'NOAA Atlas 14'
      : study.rainfallSource === 'parameter'
        ? 'user parameter'
        : 'regional default (NOAA Atlas 14 Vol. 11)'
  return `${demPart} · Design storm: ${study.rainfallDepthInches}" (${sourceLabel})`
}
