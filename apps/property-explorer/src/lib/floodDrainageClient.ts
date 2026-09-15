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

import { ExportTargetError, resolveExportTarget } from './export-target'

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
  /**
   * G-125 engine addition (feature-detect: absent when the live NOAA fetch
   * failed, or on a study produced before this shipped): the full NOAA
   * Atlas 14 frequency curve for this parcel centroid. One fetch answers
   * both vocabularies -- an inches depth and its return-period equivalent.
   */
  rainfallCurve?: Array<{ returnPeriodYears: number; depthInches: number }>
}

/** G-125: bounds mirrored from the engine/BFF validation (0, 60]. */
export const RAINFALL_DEPTH_MIN_INCHES = 0
export const RAINFALL_DEPTH_MAX_INCHES = 60

export interface RainfallCurveLookup {
  value: number
  /** Set when the input fell outside the curve's own range -- the value is
   * the curve's boundary, not an interpolation past NOAA's published range. */
  clamped?: 'low' | 'high'
}

function sortedCurve(
  curve: ReadonlyArray<{ returnPeriodYears: number; depthInches: number }>,
): Array<{ returnPeriodYears: number; depthInches: number }> {
  return [...curve].sort((a, b) => a.returnPeriodYears - b.returnPeriodYears)
}

/** Depth (inches) for a chosen return period, interpolated log-linearly
 * over the curve (the standard PFDS convention) -- the SAME method the
 * engine's PDF/gradient labels use, so the control and the exported
 * document can never disagree. Clamps at the curve's ends; never
 * extrapolates past NOAA's own published range. */
export function depthInchesForReturnPeriod(
  curve: ReadonlyArray<{ returnPeriodYears: number; depthInches: number }> | undefined,
  returnPeriodYears: number,
): RainfallCurveLookup | null {
  if (!curve || curve.length === 0) return null
  const pts = sortedCurve(curve)
  const first = pts[0]!
  const last = pts[pts.length - 1]!
  if (returnPeriodYears <= first.returnPeriodYears) {
    return { value: first.depthInches, clamped: returnPeriodYears < first.returnPeriodYears ? 'low' : undefined }
  }
  if (returnPeriodYears >= last.returnPeriodYears) {
    return { value: last.depthInches, clamped: returnPeriodYears > last.returnPeriodYears ? 'high' : undefined }
  }
  for (let i = 1; i < pts.length; i++) {
    const lo = pts[i - 1]!
    const hi = pts[i]!
    if (returnPeriodYears <= hi.returnPeriodYears) {
      const t =
        (Math.log(returnPeriodYears) - Math.log(lo.returnPeriodYears)) /
        (Math.log(hi.returnPeriodYears) - Math.log(lo.returnPeriodYears))
      return { value: lo.depthInches + (hi.depthInches - lo.depthInches) * t }
    }
  }
  return { value: last.depthInches }
}

/** The inverse: return period (years) for a chosen depth (inches). */
export function returnPeriodYearsForDepthInches(
  curve: ReadonlyArray<{ returnPeriodYears: number; depthInches: number }> | undefined,
  depthInches: number,
): RainfallCurveLookup | null {
  if (!curve || curve.length === 0) return null
  const pts = sortedCurve(curve)
  const first = pts[0]!
  const last = pts[pts.length - 1]!
  if (depthInches <= first.depthInches) {
    return { value: first.returnPeriodYears, clamped: depthInches < first.depthInches ? 'low' : undefined }
  }
  if (depthInches >= last.depthInches) {
    return { value: last.returnPeriodYears, clamped: depthInches > last.depthInches ? 'high' : undefined }
  }
  for (let i = 1; i < pts.length; i++) {
    const lo = pts[i - 1]!
    const hi = pts[i]!
    if (depthInches <= hi.depthInches) {
      const t = (depthInches - lo.depthInches) / (hi.depthInches - lo.depthInches)
      const logYears =
        Math.log(lo.returnPeriodYears) + (Math.log(hi.returnPeriodYears) - Math.log(lo.returnPeriodYears)) * t
      return { value: Math.exp(logYears) }
    }
  }
  return { value: last.returnPeriodYears }
}

/** Screening-level honesty line (G-125): visible on screen AND in the PDF,
 * matching the engine's FLOOD_DRAINAGE_DISCLAIMER verbatim so the two
 * surfaces never disagree. */
export const FLOOD_DRAINAGE_SCREEN_DISCLAIMER =
  'Screening-level drainage model, not a drainage study or engineering determination. Verify drainage with a licensed engineer before design or permitting.'

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

/** Pure body-builder for the refresh POST, split out so the G-125 optional
 * depth passthrough is unit-testable without mocking fetch/subjectStore. */
export function buildFloodDrainageRefreshBody(
  target: Pick<ReturnType<typeof resolveExportTarget>, 'factSheetId' | 'parcelNodeId' | 'address' | 'countyName'>,
  opts?: { rainfallDepthInches?: number },
): Record<string, unknown> {
  return {
    factSheetId: target.factSheetId,
    parcelNodeId: target.parcelNodeId,
    ...(target.address ? { address: target.address } : {}),
    countyName: target.countyName,
    liveViewUrl: `/?parcelNodeId=${encodeURIComponent(target.parcelNodeId)}`,
    ...(opts?.rainfallDepthInches !== undefined
      ? { rainfallDepthInches: opts.rainfallDepthInches }
      : {}),
  }
}

// ---------------------------------------------------------------------------
// P-240 (OPS-24, 2026-09-15): refresh returns 202 with a job reference
// instead of the composed study — the engine's own authoring measured
// 56-75s on Travis (F7/P-240), well past the OLD client abort both this BFF
// leg and the engine itself used to hold a socket open for. Ported onto
// P-155's feasibility-export pattern. `requestFloodDrainageRefresh` now
// polls the (unchanged path, now job-aware) `/study` leg internally so this
// function's own CONTRACT (one awaited call, resolving to the same
// FloodDrainageClientResult shape) is unchanged for FloodTool.tsx — `busy`
// stays true for the whole wait.
//
// There is no separate BFF status leg for this report the way
// feasibility-export.ts needed one: flood-drainage's `/study` endpoint
// ALREADY carries the job state on its own DECLARED-wait 404
// (`flood_drainage_in_progress`, with `jobRef`/`pollAfterMs`) and on its
// 422 (`flood_drainage_refresh_failed`, with `errorClass`) — adding a
// second BFF route would just be an extra hop to the same information the
// poll loop needs anyway to fetch the final study payload. This is a
// route-shape difference from feasibility, not an invented pattern: the
// engine itself re-shaped `/study` for exactly this purpose (see
// routes/flood-drainage.ts's own "never a stale prior study" comment).
// ---------------------------------------------------------------------------

/** Ceiling on how long the browser keeps polling before giving up and
 * telling the customer to check back — NOT a claim that the job failed.
 * ~4x the observed 75s Travis max (F7/P-240), mirroring the engine's own
 * FLOOD_DRAINAGE_JOB_STALL_CEILING_MS and feasibility-export.ts's identical
 * "~4x the observed max" convention. */
const FLOOD_DRAINAGE_POLL_CLIENT_CAP_MS = 5 * 60_000
const FLOOD_DRAINAGE_POLL_MIN_INTERVAL_MS = 3_000
const FLOOD_DRAINAGE_POLL_MAX_INTERVAL_MS = 10_000

function clampFloodPollInterval(pollAfterMs: unknown): number {
  const ms =
    typeof pollAfterMs === 'number' && Number.isFinite(pollAfterMs)
      ? pollAfterMs
      : FLOOD_DRAINAGE_POLL_MIN_INTERVAL_MS
  return Math.min(FLOOD_DRAINAGE_POLL_MAX_INTERVAL_MS, Math.max(FLOOD_DRAINAGE_POLL_MIN_INTERVAL_MS, ms))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Polls the `/study` leg until the job settles (ready/failed) or the
 * client cap is hit. Never returns a `failed` result for a job that is
 * merely slow — the cap's own outcome is `still_processing`, distinct from
 * `flood_drainage_refresh_failed`. Mirrors feasibility-export.ts's
 * pollFeasibilityStatus, reading the study endpoint's own raw body instead
 * of a separate status envelope (see the route-shape note above). */
async function pollFloodDrainageStudy(
  parcelNodeId: string,
  deadlineAt: number,
): Promise<FloodDrainageClientResult> {
  while (Date.now() < deadlineAt) {
    let res: Response
    try {
      res = await fetch(
        `${BFF_BASE}&action=study&parcelNodeId=${encodeURIComponent(parcelNodeId)}`,
        { credentials: 'include', headers: { Accept: 'application/json' } },
      )
    } catch (err) {
      return { ok: false, status: 0, error: 'network_error', message: (err as Error).message }
    }
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (res.status === 404 && body.error === 'flood_drainage_in_progress') {
      await sleep(clampFloodPollInterval(body.pollAfterMs))
      continue
    }
    if (res.status === 422 && body.error === 'flood_drainage_refresh_failed') {
      return {
        ok: false,
        status: 422,
        error: 'flood_drainage_refresh_failed',
        message:
          typeof body.message === 'string'
            ? body.message
            : 'Drainage study could not be produced for this parcel.',
      }
    }
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
  return {
    ok: false,
    status: 202,
    error: 'still_processing',
    message:
      'Flood & drainage study is taking longer than expected. It is still being generated — try Re-run in a minute to check.',
  }
}

/**
 * Run (or re-run) the parcel drainage study — honest work, ~56-75 s
 * measured on Travis (F7/P-240).
 *
 * I1: keyed on the SUBJECT'S sheet. The study that came back for 48027:498770
 * while 498778 was selected is why this no longer accepts a panel-held id.
 *
 * G-125: `rainfallDepthInches` is an OPTIONAL override (0, 60], mirroring the
 * engine/BFF bound. Omitted (the default call every pre-G-125 caller still
 * makes) -> the engine's own default path, byte-identical to before this
 * option existed. The BFF (pe-flood-drainage-core.ts) and the engine route
 * already validated and forwarded this field before G-125; this is the
 * first caller that actually sends it.
 *
 * P-240: the POST below now gets back a 202 job-accepted body instead of
 * the composed study — this function polls `/study` internally
 * (pollFloodDrainageStudy) before resolving, so its own one-await contract
 * is unchanged for every caller (FloodTool.tsx needs zero changes).
 */
export async function requestFloodDrainageRefresh(
  parcelNodeId: string,
  opts?: { rainfallDepthInches?: number },
): Promise<FloodDrainageClientResult> {
  let target
  try {
    target = resolveExportTarget(parcelNodeId)
  } catch (err) {
    return {
      ok: false,
      status: 409,
      error: err instanceof ExportTargetError ? err.kind : 'export_target_error',
      message: (err as Error).message,
    }
  }
  try {
    const res = await fetch(BFF_BASE, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildFloodDrainageRefreshBody(target, opts)),
    })
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
    if (body.state !== 'queued' && body.state !== 'running') {
      return {
        ok: false,
        status: 502,
        error: 'invalid_response',
        message: 'Flood & drainage refresh response missing a job state.',
      }
    }
    return pollFloodDrainageStudy(parcelNodeId, Date.now() + FLOOD_DRAINAGE_POLL_CLIENT_CAP_MS)
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

/**
 * G-129 — the SmartCity Dashboards mount's async-tolerant refresh. Used ONLY
 * by that embed path; every existing caller (FloodTool.tsx's Generate/Re-run)
 * keeps calling requestFloodDrainageRefresh directly, byte-identical.
 *
 * P-240 UPDATE (2026-09-15): the MECHANISM this doc originally described —
 * "the refresh handler is a single awaited function that computes AND
 * persists the study before ever responding" — is retired along with the
 * engine's OLD synchronous refresh route. `requestFloodDrainageRefresh`
 * above now polls `/study` INTERNALLY (pollFloodDrainageStudy) until the
 * job is ready/failed or its own 5-minute cap is hit, so it only returns
 * `{status:503, error:'engine_timeout'}` in the now-rare case where the
 * BFF's ACK-only fetch itself (FLOOD_REFRESH_ACK_TIMEOUT_MS = 15s,
 * pe-flood-drainage-core.ts) fails to complete — the guard below still
 * fires correctly on that case and falls through to the SAME outer
 * `/study` poll this function always used, now just a rarer path than it
 * was pre-P-240 (when EVERY slow Travis parcel hit it). Left in place as a
 * safety net rather than retired outright — a genuine ACK failure is still
 * possible and this is the honest way to ride it out.
 *
 * SAFETY: a poll that lands on an OLDER cached study — a prior run at a
 * DIFFERENT depth, persisted before this run overwrites it — would be a real
 * dishonesty risk (showing a 9.5" result while the caller is waiting on a 4"
 * run). When the caller asked for a specific depth, a polled study is
 * accepted only if its own rainfallDepthInches matches what was requested.
 * Without a specific depth (the default-path caller), any successful poll is
 * accepted, matching the non-poll path's own no-cache-differentiation
 * (G-125: flood-drainage has no refresh-level caching at any depth).
 */
const FLOOD_EMBED_POLL_INTERVAL_MS = 8_000
/** Margin above the 92.5-102.8s cold-container times G-125 measured live for
 * THIS report (subprocess/DEM cold start, not depth-driven). */
const FLOOD_EMBED_POLL_BUDGET_MS = 180_000

export type FloodDrainageRefreshWithPollResult = FloodDrainageClientResult & {
  /** True once the fast synchronous path missed and a poll took over —
   * whether it eventually succeeded or the budget ran out. Absent on the
   * fast (no-poll) path. */
  polled?: boolean
}

export async function requestFloodDrainageRefreshWithPoll(
  parcelNodeId: string,
  opts?: { rainfallDepthInches?: number },
  pollOpts?: {
    intervalMs?: number
    budgetMs?: number
    /** Fires once, the moment the fast path has missed and polling starts —
     * the caller's cue to swap "Running…" for an honest "still working" line. */
    onPreparing?: () => void
    sleep?: (ms: number) => Promise<void>
  },
): Promise<FloodDrainageRefreshWithPollResult> {
  const first = await requestFloodDrainageRefresh(parcelNodeId, opts)
  if (first.ok) return first
  // Only the honest transient class is worth waiting past. A 401/402/422/400
  // is a real answer already: a 401/402 never becomes a study by waiting, and
  // a 422 already IS the engine's own honest refusal for this parcel.
  if (!(first.status === 503 && first.error === 'engine_timeout')) return first

  pollOpts?.onPreparing?.()
  const interval = pollOpts?.intervalMs ?? FLOOD_EMBED_POLL_INTERVAL_MS
  const budget = pollOpts?.budgetMs ?? FLOOD_EMBED_POLL_BUDGET_MS
  const sleep =
    pollOpts?.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const wantedDepth = opts?.rainfallDepthInches
  const deadline = Date.now() + budget

  while (Date.now() < deadline) {
    await sleep(interval)
    const polled = await fetchFloodDrainageStudy(parcelNodeId)
    if (!polled.ok) continue // honest "not ready yet" -- keep waiting out the budget
    if (wantedDepth !== undefined && polled.study.rainfallDepthInches !== wantedDepth) {
      continue // a stale cached study at a DIFFERENT depth -- not our answer
    }
    return { ...polled, polled: true }
  }
  return { ...first, polled: true }
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
