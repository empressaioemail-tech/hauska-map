/**
 * Client for the site-plan export BFF (Wave 3, WDLL items 7-8).
 * Sibling of terrainExportClient.ts.
 */

import type {
  SitePlanExportBffResponse,
  SitePlanExportFormat,
} from './sitePlanExportTypes.js'
import { ExportTargetError, resolveExportTarget } from './export-target'

export type { SitePlanExportFormat, SitePlanExportBffResponse }

export const SITE_PLAN_FORMAT_OPTIONS: Array<{
  id: SitePlanExportFormat
  label: string
}> = [
  { id: 'pdf-site-plan', label: 'PDF site-plan sheet' },
  { id: 'dxf-site-plan', label: 'DXF site plan (layered)' },
  { id: 'ifc-site-plan', label: 'IFC site plan (layered, solid terrain)' },
]

export type SitePlanExportClientResult =
  | { ok: true; data: SitePlanExportBffResponse }
  | { ok: false; status: number; error: string; message?: string }

// ---------------------------------------------------------------------------
// P-240 (OPS-24, 2026-09-15): refresh returns 202 with a job reference
// instead of the composed export — hauska-mcp-server's
// refresh_parcel_site_plan_export tool now ALWAYS returns fast (a real
// composition measures 56.8-115.9s, F7/P-240, well past this BFF's own
// Vercel 60s maxDuration). Ported onto P-155's feasibility-export pattern.
// `requestSitePlanExport` keeps its ORIGINAL one-await contract (so
// SitePlanExportSection.tsx needs zero changes — `busy` stays true for the
// whole wait) by polling the new `action=status` leg internally, on the
// BFF's own pollAfterMs, up to a 5-minute client-side cap. A cap hit reads
// as `still_processing` (never `failed`).
// ---------------------------------------------------------------------------

const SITE_PLAN_POLL_CLIENT_CAP_MS = 5 * 60_000
const SITE_PLAN_POLL_MIN_INTERVAL_MS = 3_000
const SITE_PLAN_POLL_MAX_INTERVAL_MS = 10_000

function clampSitePlanPollInterval(pollAfterMs: unknown): number {
  const ms =
    typeof pollAfterMs === 'number' && Number.isFinite(pollAfterMs)
      ? pollAfterMs
      : SITE_PLAN_POLL_MIN_INTERVAL_MS
  return Math.min(SITE_PLAN_POLL_MAX_INTERVAL_MS, Math.max(SITE_PLAN_POLL_MIN_INTERVAL_MS, ms))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function buildSitePlanStatusPath(parcelNodeId: string, format: SitePlanExportFormat): string {
  const qs = new URLSearchParams({ parcelNodeId, format, action: 'status' })
  return `/api/pe-site-plan-export?${qs.toString()}`
}

/** Polls the status leg until the job settles or the client cap is hit.
 * Never returns a `failed` result for a job that is merely slow — the
 * cap's own outcome is `still_processing`, distinct from
 * `site_plan_export_failed`. Deliberately uses a status/error pair that
 * does NOT land on `422` — SitePlanExportSection.tsx already has a
 * hardcoded (pre-P-240, effectively dead) `resp.status === 422` branch
 * with a setback-specific message that would otherwise show the wrong
 * copy for an unrelated job failure (e.g. geometry_unavailable). */
async function pollSitePlanExportStatus(
  parcelNodeId: string,
  format: SitePlanExportFormat,
  deadlineAt: number,
): Promise<SitePlanExportClientResult> {
  while (Date.now() < deadlineAt) {
    let res: Response
    try {
      res = await fetch(buildSitePlanStatusPath(parcelNodeId, format), {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      })
    } catch (err) {
      return { ok: false, status: 0, error: 'network_error', message: (err as Error).message }
    }
    const body = (await res.json().catch(() => ({}))) as {
      error?: string
      message?: string
      state?: string
      errorMessage?: string
      pollAfterMs?: number
    } & Partial<SitePlanExportBffResponse>
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: body.error ?? 'request_failed',
        message: body.message,
      }
    }
    if (body.state === 'ready') {
      if (!body.atom || !body.parcelNodeId) {
        return {
          ok: false,
          status: 502,
          error: 'invalid_response',
          message: 'Site-plan export status reported ready with no export payload.',
        }
      }
      return { ok: true, data: body as SitePlanExportBffResponse }
    }
    if (body.state === 'failed') {
      return {
        ok: false,
        status: 502,
        error: 'site_plan_export_failed',
        message: body.errorMessage ?? 'Site-plan export could not be produced for this parcel.',
      }
    }
    // queued | running | never-requested (the last shouldn't appear right
    // after an accepted refresh, but is treated as "keep waiting" rather
    // than an error — mirrors feasibility-export.ts's identical reasoning).
    await sleep(clampSitePlanPollInterval(body.pollAfterMs))
  }
  return {
    ok: false,
    status: 202,
    error: 'still_processing',
    message:
      'Site plan export is taking longer than expected. It is still being generated — click Export again in a minute to check.',
  }
}

/**
 * I1: the export runs against the SUBJECT'S sheet, by id. `address` and
 * `countyName` are read off that sheet, never off the caller — the DXF that
 * exported "city of Bastrop" got that string from the search box.
 *
 * P-240: the POST below now gets back a 202 job-accepted body instead of
 * the composed export — this function polls `action=status` internally
 * (pollSitePlanExportStatus) before resolving, so its own one-await
 * contract is unchanged for every caller (SitePlanExportSection.tsx needs
 * zero changes).
 */
export async function requestSitePlanExport(
  parcelNodeId: string,
  format: SitePlanExportFormat,
): Promise<SitePlanExportClientResult> {
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
    const res = await fetch('/api/pe-site-plan-export', {
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({
        factSheetId: target.factSheetId,
        parcelNodeId: target.parcelNodeId,
        format,
        ...(target.address ? { address: target.address } : {}),
        countyName: target.countyName,
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const body = (await res.json().catch(() => ({}))) as {
      error?: string
      message?: string
      state?: string
    } & Partial<SitePlanExportBffResponse>

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: body.error ?? 'request_failed',
        message: body.message,
      }
    }

    if (body.state !== 'queued' && body.state !== 'running') {
      return {
        ok: false,
        status: 502,
        error: 'invalid_response',
        message: 'Site-plan export refresh response missing a job state.',
      }
    }

    return pollSitePlanExportStatus(parcelNodeId, format, Date.now() + SITE_PLAN_POLL_CLIENT_CAP_MS)
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: 'network_error',
      message: (err as Error).message,
    }
  }
}
