// Shared terrain-export BFF logic (testable; WDLL item 9).

export const TERRAIN_EXPORT_FORMATS = [
  'glb',
  'ifc',
  'dxf-3dface',
  'dxf-contour',
] as const

export type TerrainExportFormat = (typeof TERRAIN_EXPORT_FORMATS)[number]

export const DEFERRED_TERRAIN_FORMAT = 'landxml-tin' as const

const PARCEL_NODE_ID_RE = /^\d{5}:[^/]+$/

export function isValidParcelNodeId(value: unknown): value is string {
  return typeof value === 'string' && PARCEL_NODE_ID_RE.test(value.trim())
}

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

export interface TerrainExportBffResponse {
  ok: true
  parcelNodeId: string
  atom: TerrainExportAtomView
  selectedFormat: TerrainExportFormat
  downloadUrl: string
  downloads: Record<string, string | null>
}

export function buildDownloadPath(parcelNodeId: string, format: TerrainExportFormat): string {
  const qs = new URLSearchParams({
    parcelNodeId,
    format,
    action: 'download',
  })
  return `/api/pe-terrain-export?${qs.toString()}`
}

export function mapMcpTerrainPayload(
  payload: Record<string, unknown>,
  selectedFormat: TerrainExportFormat,
): TerrainExportBffResponse | { ok: false; message: string } {
  const dataBlock = payload.data as Record<string, unknown> | undefined
  const atom = (payload.atom ?? dataBlock?.atom ?? payload) as Record<string, unknown>
  const parcelNodeId =
    (typeof payload.parcelNodeId === 'string' && payload.parcelNodeId) ||
    (typeof atom.parcelNodeId === 'string' && atom.parcelNodeId) ||
    (typeof atom.entityId === 'string' && atom.entityId) ||
    null

  if (!parcelNodeId || !isValidParcelNodeId(parcelNodeId)) {
    return { ok: false, message: 'MCP response missing parcelNodeId.' }
  }

  const rawArtifacts =
    (atom.artifacts as Record<string, TerrainArtifactMeta> | undefined) ??
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

  return {
    ok: true,
    parcelNodeId,
    selectedFormat,
    downloadUrl: downloads[selectedFormat] ?? buildDownloadPath(parcelNodeId, selectedFormat),
    downloads,
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

export type TerrainExportAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 402 | 503; error: string; message?: string }

/** Mirrors BFF session + entitlement gate (testable without Vercel). */
export function resolveTerrainExportAuth(input: {
  sessionToken: string | null
  entitlement:
    | { ok: true; tier: 'free' | 'paid' }
    | { ok: false; status: 401 | 402 | 503; message?: string }
}): TerrainExportAuthResult {
  if (!input.sessionToken) {
    return {
      ok: false,
      status: 401,
      error: 'authentication_required',
      message: 'Sign in to export parcel terrain.',
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
