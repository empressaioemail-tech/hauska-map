// Shared site-plan-export BFF logic (testable; Wave 3, WDLL items 7-8).
//
// Sibling of pe-terrain-export-core.ts: same session + entitlement gate
// shape, same public-paid access tier, distinct engine route
// (site-plan-export/*) and format set (dxf-site-plan, ifc-site-plan,
// pdf-site-plan) mirroring the MCP-side refresh_parcel_site_plan_export
// tool (see hauska-mcp-server PR "refresh_parcel_site_plan_export Wave 3
// pay-gate").

export const SITE_PLAN_EXPORT_FORMATS = [
  'dxf-site-plan',
  'ifc-site-plan',
  'pdf-site-plan',
] as const

export type SitePlanExportFormat = (typeof SITE_PLAN_EXPORT_FORMATS)[number]

// Vercel serverless ESM requires the .js extension (F1b Gate C: FUNCTION_INVOCATION_FAILED
// without it — ERR_MODULE_NOT_FOUND for parcel-node-id).
import { isValidParcelNodeId, PARCEL_NODE_ID_RE } from './parcel-node-id.js'
export { isValidParcelNodeId, PARCEL_NODE_ID_RE }

export function parseSitePlanFormat(value: unknown): SitePlanExportFormat | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim() as SitePlanExportFormat
  return (SITE_PLAN_EXPORT_FORMATS as readonly string[]).includes(normalized)
    ? normalized
    : null
}

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

/** Inline bytes from MCP refresh (preferred — already gate-proxied + metered). */
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
  /** Present when MCP inlined artifact bytes (under 256 KiB). Prefer over downloadUrl. */
  inlineDownload?: SitePlanExportInlineDownload
  /** Honesty flags passed through verbatim from the engine — never hidden. */
  setbackDegenerate?: boolean
  setbackDegenerateReason?: string
  streetHonestAbsence?: boolean
  zoningHonestAbsence?: boolean
  floodZoneHonestUnavailable?: boolean
}

export function buildDownloadPath(
  parcelNodeId: string,
  format: SitePlanExportFormat,
): string {
  const qs = new URLSearchParams({
    parcelNodeId,
    format,
    action: 'download',
  })
  return `/api/pe-site-plan-export?${qs.toString()}`
}

export function extractInlineDownload(
  payload: Record<string, unknown>,
): SitePlanExportInlineDownload | undefined {
  const dataBlock = payload.data as Record<string, unknown> | undefined
  const download = (dataBlock?.download ?? payload.download) as
    | Record<string, unknown>
    | undefined
  if (!download || typeof download !== 'object') return undefined
  const base64 = typeof download.base64 === 'string' ? download.base64 : null
  const format = typeof download.format === 'string' ? download.format : null
  const contentType =
    typeof download.contentType === 'string'
      ? download.contentType
      : 'application/octet-stream'
  const byteCount =
    typeof download.byteCount === 'number' ? download.byteCount : undefined
  if (!base64 || !format || base64.length === 0) return undefined
  return {
    format,
    contentType,
    base64,
    byteCount: byteCount ?? Math.floor((base64.length * 3) / 4),
  }
}

export function mapMcpSitePlanPayload(
  payload: Record<string, unknown>,
  selectedFormat: SitePlanExportFormat,
  /** Request-path fallback when engine omits top-level id (QA-2 belt). */
  requestParcelNodeId?: string | null,
): SitePlanExportBffResponse | { ok: false; message: string } {
  if (payload.isError === true) {
    const msg =
      (typeof payload.message === 'string' && payload.message) ||
      (typeof payload.error === 'string' && payload.error) ||
      'MCP site-plan tool returned isError.'
    return { ok: false, message: msg }
  }
  const dataBlock = payload.data as Record<string, unknown> | undefined
  const atom = (payload.atom ?? dataBlock?.atom ?? payload) as Record<string, unknown>
  const parcelNodeId =
    (typeof payload.parcelNodeId === 'string' && payload.parcelNodeId) ||
    (typeof dataBlock?.parcelNodeId === 'string' && dataBlock.parcelNodeId) ||
    (typeof atom.parcelNodeId === 'string' && atom.parcelNodeId) ||
    (typeof atom.entityId === 'string' && atom.entityId) ||
    (typeof requestParcelNodeId === 'string' && requestParcelNodeId) ||
    null

  if (!parcelNodeId || !isValidParcelNodeId(parcelNodeId)) {
    return { ok: false, message: 'MCP response missing parcelNodeId.' }
  }

  const rawArtifacts =
    (atom.artifacts as Record<string, SitePlanArtifactMeta> | undefined) ??
    (dataBlock?.artifacts as Record<string, SitePlanArtifactMeta> | undefined) ??
    (payload.artifacts as Record<string, SitePlanArtifactMeta> | undefined) ??
    {}

  const downloads: Record<string, string | null> = {}
  for (const fmt of SITE_PLAN_EXPORT_FORMATS) {
    const meta = rawArtifacts[fmt]
    downloads[fmt] =
      meta && !meta.deferred && meta.ref && !String(meta.ref).startsWith('deferred:')
        ? buildDownloadPath(parcelNodeId, fmt)
        : null
  }

  const confidence = atom.confidence as SitePlanExportAtomView['confidence']
  const inlineDownload = extractInlineDownload(payload)

  const flagsSource = (dataBlock ?? payload) as Record<string, unknown>

  return {
    ok: true,
    parcelNodeId,
    selectedFormat,
    downloadUrl: downloads[selectedFormat] ?? buildDownloadPath(parcelNodeId, selectedFormat),
    downloads,
    ...(inlineDownload ? { inlineDownload } : {}),
    setbackDegenerate:
      typeof flagsSource.setbackDegenerate === 'boolean' ? flagsSource.setbackDegenerate : undefined,
    setbackDegenerateReason:
      typeof flagsSource.setbackDegenerateReason === 'string'
        ? flagsSource.setbackDegenerateReason
        : undefined,
    streetHonestAbsence:
      typeof flagsSource.streetHonestAbsence === 'boolean' ? flagsSource.streetHonestAbsence : undefined,
    zoningHonestAbsence:
      typeof flagsSource.zoningHonestAbsence === 'boolean' ? flagsSource.zoningHonestAbsence : undefined,
    floodZoneHonestUnavailable:
      typeof flagsSource.floodZoneHonestUnavailable === 'boolean'
        ? flagsSource.floodZoneHonestUnavailable
        : undefined,
    atom: {
      atomDid: typeof atom.atomDid === 'string' ? atom.atomDid : undefined,
      parcelNodeId,
      sourceCitation:
        typeof atom.sourceCitation === 'string' ? atom.sourceCitation : undefined,
      accessPolicy: typeof atom.accessPolicy === 'string' ? atom.accessPolicy : undefined,
      fetchedAt: typeof atom.fetchedAt === 'string' ? atom.fetchedAt : undefined,
      confidence,
      artifacts: rawArtifacts,
    },
  }
}

export function engineApiBaseUrl(): string {
  return (
    process.env.HAUSKA_ENGINE_API_URL?.trim() ||
    process.env.ENGINE_API_URL?.trim() ||
    'https://hauska-engine-api-h7gvu7rgcq-uc.a.run.app'
  ).replace(/\/$/, '')
}

export function engineApiGateToken(): string | null {
  const key =
    process.env.HAUSKA_ENGINE_API_KEY?.trim() ||
    process.env.ENGINE_API_GATE_TOKEN?.trim()
  return key && key.length > 0 ? key : null
}

/**
 * Gate-front headers engine-api requires on every non-health call.
 * Mirrors buildTerrainEngineGateHeaders with packageId `site-plan-export`
 * so gate-front logging can distinguish the two paid catalog exports.
 */
export function buildSitePlanEngineGateHeaders(opts?: {
  requestId?: string
  credentialId?: string
  tenantId?: string
}): Record<string, string> {
  const requestId =
    opts?.requestId?.trim() ||
    (typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `pe-site-plan-${Date.now()}`)
  return {
    'x-hauska-product': 'cortex',
    'x-hauska-tenant-id': opts?.tenantId?.trim() || 'public-catalog',
    'x-hauska-package-id': 'site-plan-export',
    'x-hauska-access-tier': 'public-paid',
    'x-hauska-gate-credential-id':
      opts?.credentialId?.trim() || 'property-explorer-site-plan-bff',
    'x-hauska-request-id': requestId,
  }
}

export function sitePlanFilename(parcelNodeId: string, format: SitePlanExportFormat): string {
  const stem = parcelNodeId.replace(':', '_')
  switch (format) {
    case 'dxf-site-plan':
      return `${stem}_site_plan.dxf`
    case 'ifc-site-plan':
      return `${stem}_site_plan.ifc`
    case 'pdf-site-plan':
      return `${stem}_site_plan.pdf`
    default:
      return `${stem}.bin`
  }
}

export type SitePlanExportAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 402 | 503; error: string; message?: string }

/** Mirrors BFF session + entitlement gate (testable without Vercel). Same
 * public-paid entitlement tier as terrain export — no new tier this wave. */
export function resolveSitePlanExportAuth(input: {
  sessionToken: string | null
  entitlement:
    | { ok: true; tier: 'free' | 'paid' }
    | { ok: false; status: 401 | 402 | 503; message?: string }
}): SitePlanExportAuthResult {
  if (!input.sessionToken) {
    return {
      ok: false,
      status: 401,
      error: 'authentication_required',
      message: 'Sign in to export the site plan.',
    }
  }
  if (!input.entitlement.ok) {
    return {
      ok: false,
      status: input.entitlement.status,
      error:
        input.entitlement.status === 401
          ? 'authentication_required'
          : input.entitlement.status === 402
            ? 'payment_required'
            : 'entitlement_unavailable',
      message: input.entitlement.message,
    }
  }
  if (input.entitlement.tier !== 'paid') {
    return {
      ok: false,
      status: 402,
      error: 'payment_required',
      message: 'Pro entitlement required.',
    }
  }
  return { ok: true }
}
