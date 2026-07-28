// Shared terrain-export BFF logic (testable; WDLL item 9).

export const TERRAIN_EXPORT_FORMATS = [
  'glb',
  'ifc',
  'dxf-3dface',
  'dxf-contour',
] as const

export type TerrainExportFormat = (typeof TERRAIN_EXPORT_FORMATS)[number]

export const DEFERRED_TERRAIN_FORMAT = 'landxml-tin' as const

// Vercel serverless ESM requires the .js extension (F1b Gate C: FUNCTION_INVOCATION_FAILED
// without it — ERR_MODULE_NOT_FOUND for parcel-node-id).
import { isValidParcelNodeId, PARCEL_NODE_ID_RE } from './parcel-node-id.js'
export { isValidParcelNodeId, PARCEL_NODE_ID_RE }

export function parseTerrainFormat(value: unknown): TerrainExportFormat | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim() as TerrainExportFormat
  return (TERRAIN_EXPORT_FORMATS as readonly string[]).includes(normalized)
    ? normalized
    : null
}

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

/** Inline bytes from MCP refresh (preferred — already gate-proxied + metered). */
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
  /** Present when MCP inlined artifact bytes (under 256 KiB). Prefer over downloadUrl. */
  inlineDownload?: TerrainExportInlineDownload
}

export function buildDownloadPath(parcelNodeId: string, format: TerrainExportFormat): string {
  const qs = new URLSearchParams({
    parcelNodeId,
    format,
    action: 'download',
  })
  return `/api/pe-terrain-export?${qs.toString()}`
}

export function extractInlineDownload(
  payload: Record<string, unknown>,
): TerrainExportInlineDownload | undefined {
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

export function mapMcpTerrainPayload(
  payload: Record<string, unknown>,
  selectedFormat: TerrainExportFormat,
  requestParcelNodeId?: string | null,
): TerrainExportBffResponse | { ok: false; message: string } {
  if (payload.isError === true) {
    const msg =
      (typeof payload.message === 'string' && payload.message) ||
      (typeof payload.error === 'string' && payload.error) ||
      'MCP terrain tool returned isError.'
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
    (atom.artifacts as Record<string, TerrainArtifactMeta> | undefined) ??
    (dataBlock?.artifacts as Record<string, TerrainArtifactMeta> | undefined) ??
    (payload.artifacts as Record<string, TerrainArtifactMeta> | undefined) ??
    {}

  const downloads: Record<string, string | null> = {}
  for (const fmt of TERRAIN_EXPORT_FORMATS) {
    const meta = rawArtifacts[fmt]
    downloads[fmt] =
      meta && !meta.deferred && meta.ref && !String(meta.ref).startsWith('deferred:')
        ? buildDownloadPath(parcelNodeId, fmt)
        : null
  }

  const confidence = atom.confidence as TerrainExportAtomView['confidence']
  const inlineDownload = extractInlineDownload(payload)

  return {
    ok: true,
    parcelNodeId,
    selectedFormat,
    downloadUrl: downloads[selectedFormat] ?? buildDownloadPath(parcelNodeId, selectedFormat),
    downloads,
    ...(inlineDownload ? { inlineDownload } : {}),
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
 * Header names/values mirror hauska-mcp-server gate-front seam
 * (`x-hauska-package-id`, product enum, etc.). PE BFF holds the
 * service token and only reaches engine after session+paid entitlement.
 */
export function buildTerrainEngineGateHeaders(opts?: {
  requestId?: string
  credentialId?: string
  tenantId?: string
}): Record<string, string> {
  const requestId =
    opts?.requestId?.trim() ||
    (typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `pe-terrain-${Date.now()}`)
  return {
    'x-hauska-product': 'cortex',
    'x-hauska-tenant-id': opts?.tenantId?.trim() || 'public-catalog',
    'x-hauska-package-id': 'terrain-export',
    'x-hauska-access-tier': 'public-paid',
    'x-hauska-gate-credential-id':
      opts?.credentialId?.trim() || 'property-explorer-terrain-bff',
    'x-hauska-request-id': requestId,
  }
}

/**
 * Classify an engine-api / upstream failure so the BFF surfaces an HONEST
 * user-visible message instead of mislabelling a 401 gate/auth rejection as
 * "Engine API unreachable". Mirrors pe-site-plan-export-core.classifyEngineFailure.
 */
export type EngineFailureKind =
  | 'gate'
  | 'payment'
  | 'engine_timeout'
  | 'unreachable'
  | 'other'

export function classifyEngineFailure(input: {
  status?: number | null
  message?: string | null
}): EngineFailureKind {
  const status = input.status ?? null
  const message = (input.message ?? '').toLowerCase()

  if (status === 402 || /payment_required|paid x-hauska-key|public-paid|anonymous and free|upgrade or retry after quota|metering denied/.test(message)) {
    return 'payment'
  }
  if (status === 401 || status === 403) {
    return 'gate'
  }
  // Timeout-shaped messages are checked BEFORE the gate patterns so no
  // timeout text can ever classify as a gate/auth failure.
  if (/timed out|timeout\b|aborted|aborterror/.test(message)) {
    return 'engine_timeout'
  }
  // Connect/network failures — including the old MCP "Engine API
  // unreachable ... requires engine-api" suffix, which must NOT read as
  // a gate failure (it is usually a timeout wearing an unreachable coat).
  if (
    /unreachable|econnrefused|econnreset|etimedout|enotfound|eai_again|fetch failed|network|socket hang up|requires engine-api/.test(
      message,
    )
  ) {
    return 'unreachable'
  }
  if (
    /gate_front_context_required|gate-front|missing or invalid gate|unauthorized|forbidden|invalid.*(gate|credential|token|key)/.test(
      message,
    )
  ) {
    return 'gate'
  }
  return 'other'
}

/** Honest, actionable message for a gate/auth failure reaching engine-api. */
export const ENGINE_GATE_TOKEN_MESSAGE =
  'Terrain export needs an engine-api gate token (server config) — HAUSKA_ENGINE_API_KEY / gate-front context not set or not accepted.'

/** Honest customer message for an engine timeout (usually a cold start). */
export const ENGINE_TIMEOUT_RETRY_MESSAGE =
  'Terrain export engine timed out — this usually means a cold start. Try the export again in a moment.'

/** Honest customer message for a genuine connect failure. */
export const ENGINE_UNREACHABLE_RETRY_MESSAGE =
  'Terrain export engine did not respond — it may be restarting. Try the export again in a moment.'

/**
 * 503 + retryable body for the transient engine failure classes
 * (timeout / unreachable); null for everything else so callers keep
 * their existing gate/payment/other handling.
 */
export function retryableEngineFailureResponse(
  kind: EngineFailureKind,
  detail: string,
): {
  status: 503
  body: { error: string; message: string; retryable: true; detail: string }
} | null {
  if (kind === 'engine_timeout') {
    return {
      status: 503,
      body: {
        error: 'engine_timeout',
        message: ENGINE_TIMEOUT_RETRY_MESSAGE,
        retryable: true,
        detail,
      },
    }
  }
  if (kind === 'unreachable') {
    return {
      status: 503,
      body: {
        error: 'engine_unreachable',
        message: ENGINE_UNREACHABLE_RETRY_MESSAGE,
        retryable: true,
        detail,
      },
    }
  }
  return null
}

/** Honest message when the gate token env is entirely absent at request time. */
export const ENGINE_GATE_TOKEN_MISSING_MESSAGE =
  'Terrain export is not configured: engine-api gate token missing (set HAUSKA_ENGINE_API_KEY or ENGINE_API_GATE_TOKEN).'

export function terrainFilename(parcelNodeId: string, format: TerrainExportFormat): string {
  const stem = parcelNodeId.replace(':', '_')
  switch (format) {
    case 'glb':
      return `${stem}.glb`
    case 'ifc':
      return `${stem}.ifc`
    case 'dxf-3dface':
      return `${stem}_3dface.dxf`
    case 'dxf-contour':
      return `${stem}_contour.dxf`
    default:
      return `${stem}.bin`
  }
}

export type TerrainExportAuthResult =
  | { ok: true; devBypass?: boolean }
  | { ok: false; status: 401 | 402 | 503; error: string; message?: string }

/** Mirrors BFF session + entitlement gate (testable without Vercel). */
export function resolveTerrainExportAuth(input: {
  sessionToken: string | null
  entitlement:
    | { ok: true; tier: 'free' | 'paid' }
    | { ok: false; status: 401 | 402 | 503; message?: string }
  /** Operator/dev bypass — session still required; skips paid check. */
  devBypass?: boolean
}): TerrainExportAuthResult {
  if (!input.sessionToken) {
    return {
      ok: false,
      status: 401,
      error: 'authentication_required',
      message: 'Sign in to export parcel terrain.',
    }
  }
  if (input.devBypass) {
    return { ok: true, devBypass: true }
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
