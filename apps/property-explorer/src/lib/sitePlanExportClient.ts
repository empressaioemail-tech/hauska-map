/**
 * Client for the site-plan export BFF (Wave 3, WDLL items 7-8).
 * Sibling of terrainExportClient.ts.
 */

import type {
  SitePlanExportBffResponse,
  SitePlanExportFormat,
} from './sitePlanExportTypes.js'

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

export async function requestSitePlanExport(
  parcelNodeId: string,
  format: SitePlanExportFormat,
): Promise<SitePlanExportClientResult> {
  try {
    const res = await fetch('/api/pe-site-plan-export', {
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ parcelNodeId, format }),
      headers: { 'Content-Type': 'application/json' },
    })
    const body = (await res.json().catch(() => ({}))) as {
      error?: string
      message?: string
    } & Partial<SitePlanExportBffResponse>

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: body.error ?? 'request_failed',
        message: body.message,
      }
    }

    if (!body.ok || !body.atom || !body.parcelNodeId) {
      return {
        ok: false,
        status: 502,
        error: 'invalid_response',
        message: 'Site-plan export response missing atom payload.',
      }
    }

    return { ok: true, data: body as SitePlanExportBffResponse }
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: 'network_error',
      message: (err as Error).message,
    }
  }
}
