/**
 * Terrain export client types (WDLL item 9).
 */

export const TERRAIN_EXPORT_FORMATS = [
  'glb',
  'ifc',
  'dxf-3dface',
  'dxf-contour',
] as const

export type TerrainExportFormat = (typeof TERRAIN_EXPORT_FORMATS)[number]

export interface TerrainArtifactMeta {
  format: string
  byteCount?: number
  vertexCount?: number
  triangleCount?: number
  contourIntervalMeters?: number
  contourPolylineCount?: number
  deferred?: boolean
  deferredReason?: string
  ref?: string
}

export interface TerrainExportAtomView {
  atomDid?: string
  parcelNodeId: string
  sourceCitation?: string
  accessPolicy?: string
  fetchedAt?: string
  confidence?: {
    value?: number
    kind?: string
    provenance?: string
  }
  artifacts: Record<string, TerrainArtifactMeta>
}

export interface TerrainExportInlineDownload {
  format: TerrainExportFormat | string
  contentType: string
  base64: string
  byteCount: number
}

export interface TerrainExportBffResponse {
  ok: true
  parcelNodeId: string
  atom: TerrainExportAtomView
  selectedFormat: TerrainExportFormat
  downloadUrl: string
  downloads: Record<string, string | null>
  inlineDownload?: TerrainExportInlineDownload
}
