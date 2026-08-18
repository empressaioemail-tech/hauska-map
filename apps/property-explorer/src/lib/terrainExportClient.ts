/**
 * Client for the terrain export BFF (WDLL item 9).
 */

import type {
  TerrainExportBffResponse,
  TerrainExportFormat,
} from './terrainExportTypes.js'
import { ExportTargetError, resolveExportTarget } from './export-target'

export type { TerrainExportFormat, TerrainExportBffResponse }

export const TERRAIN_FORMAT_OPTIONS: Array<{
  id: TerrainExportFormat
  label: string
}> = [
  { id: 'glb', label: 'GLB mesh' },
  { id: 'ifc', label: 'IFC4 triangulated' },
  { id: 'dxf-3dface', label: 'DXF 3DFACE surface' },
  { id: 'dxf-contour', label: 'DXF contour polylines' },
]

export type TerrainExportClientResult =
  | { ok: true; data: TerrainExportBffResponse }
  | { ok: false; status: number; error: string; message?: string }

/** I1: keyed on the SUBJECT'S sheet id, never on a panel-local parcel id. */
export async function requestTerrainExport(
  parcelNodeId: string,
  format: TerrainExportFormat,
): Promise<TerrainExportClientResult> {
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
    const res = await fetch('/api/pe-terrain-export', {
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({
        factSheetId: target.factSheetId,
        parcelNodeId: target.parcelNodeId,
        format,
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const body = (await res.json().catch(() => ({}))) as {
      error?: string
      message?: string
    } & Partial<TerrainExportBffResponse>

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
        message: 'Terrain export response missing atom payload.',
      }
    }

    return { ok: true, data: body as TerrainExportBffResponse }
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: 'network_error',
      message: (err as Error).message,
    }
  }
}
