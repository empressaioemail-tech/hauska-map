/**
 * Site-plan export client types (Wave 3, WDLL items 7-8).
 * Sibling of terrainExportTypes.ts.
 */

export const SITE_PLAN_EXPORT_FORMATS = [
  'dxf-site-plan',
  'ifc-site-plan',
  'pdf-site-plan',
] as const

export type SitePlanExportFormat = (typeof SITE_PLAN_EXPORT_FORMATS)[number]

export interface SitePlanArtifactMeta {
  format: string
  byteCount?: number
  pageCount?: number
  annotationCount?: number
  deferred?: boolean
  deferredReason?: string
  ref?: string
}

export interface SitePlanExportAtomView {
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
  artifacts: Record<string, SitePlanArtifactMeta>
}

export interface SitePlanExportInlineDownload {
  format: SitePlanExportFormat | string
  contentType: string
  base64: string
  byteCount: number
}

export interface SitePlanExportBffResponse {
  ok: true
  parcelNodeId: string
  atom: SitePlanExportAtomView
  selectedFormat: SitePlanExportFormat
  downloadUrl: string
  downloads: Record<string, string | null>
  inlineDownload?: SitePlanExportInlineDownload
  setbackDegenerate?: boolean
  setbackDegenerateReason?: string
  streetHonestAbsence?: boolean
  zoningHonestAbsence?: boolean
  floodZoneHonestUnavailable?: boolean
}
