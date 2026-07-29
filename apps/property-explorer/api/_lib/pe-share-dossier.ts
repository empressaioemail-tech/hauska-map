// Share-view DOSSIER projection (cortex #362 wiring).
//
// The cortex service-key route GET
// /api/property-explorer/v1/internal/share-dossier?tenantId&ownerUserId&parcelNodeId
// (Authorization: Bearer CORTEX_SERVICE_API_KEY) returns the SHARER's saved
// property row { parcelNodeId, label, updatedAt, snapshot } — the raw dossier
// jsonb. The share view must receive ONLY the share-appropriate subset:
//   - drawings (the saved map annotations, sanitized GeoJSON),
//   - the AI chat SUMMARY (labeled, with disclaimer) — NEVER the raw thread,
//   - notes,
//   - address / savedAt for the header.
// The chat THREAD, export entries (gated re-download paths), pin, and status
// stay private to the owner — a share viewer has no claim on them.
//
// Parse is DEFENSIVE (the snapshot is owner-written jsonb): malformed pieces
// drop, never throw; an empty projection means "no dossier to share".

type JsonRecord = Record<string, unknown>

const NOTES_MAX = 4_000
const SUMMARY_MAX = 4_000
const DISCLAIMER_MAX = 600
const DRAWINGS_MAX_FEATURES = 300

export interface ShareDossierFeature {
  type: 'Feature'
  geometry: { type: string; coordinates: unknown }
  properties: Record<string, unknown>
}

export interface ShareDossierDrawings {
  type: 'FeatureCollection'
  features: ShareDossierFeature[]
}

export interface ShareDossierChatSummary {
  summary: string
  savedAt: string
  disclaimer: string | null
}

export interface ShareDossierPayload {
  address: string | null
  savedAt: string | null
  drawings: ShareDossierDrawings | null
  chatSummary: ShareDossierChatSummary | null
  notes: string | null
}

function asRecord(v: unknown): JsonRecord | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as JsonRecord)
    : null
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null
}

function cap(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s
}

const GEOMETRY_TYPES = new Set([
  'Point',
  'MultiPoint',
  'LineString',
  'MultiLineString',
  'Polygon',
  'MultiPolygon',
])

function sanitizeFeature(value: unknown): ShareDossierFeature | null {
  const rec = asRecord(value)
  if (!rec || rec.type !== 'Feature') return null
  const geom = asRecord(rec.geometry)
  if (!geom || typeof geom.type !== 'string' || !GEOMETRY_TYPES.has(geom.type)) {
    return null
  }
  if (geom.coordinates === undefined || geom.coordinates === null) return null
  const props: Record<string, unknown> = {}
  const rawProps = asRecord(rec.properties) ?? {}
  for (const [k, v] of Object.entries(rawProps)) {
    if (typeof v === 'string') props[k] = cap(v, 200)
    else if (typeof v === 'number' || typeof v === 'boolean') props[k] = v
  }
  return {
    type: 'Feature',
    geometry: { type: geom.type, coordinates: geom.coordinates },
    properties: props,
  }
}

function sanitizeDrawings(value: unknown): ShareDossierDrawings | null {
  const rec = asRecord(value)
  if (!rec || rec.type !== 'FeatureCollection' || !Array.isArray(rec.features)) {
    return null
  }
  const features = rec.features
    .map(sanitizeFeature)
    .filter((f): f is ShareDossierFeature => f !== null)
    .slice(0, DRAWINGS_MAX_FEATURES)
  return features.length > 0 ? { type: 'FeatureCollection', features } : null
}

function sanitizeChatSummary(value: unknown): ShareDossierChatSummary | null {
  const rec = asRecord(value)
  if (!rec) return null
  const summary = str(rec.summary)
  const savedAt = str(rec.savedAt)
  if (!summary || !savedAt) return null
  const disclaimer = str(rec.disclaimer)
  return {
    summary: cap(summary, SUMMARY_MAX),
    savedAt,
    disclaimer: disclaimer ? cap(disclaimer, DISCLAIMER_MAX) : null,
  }
}

/**
 * Project a cortex saved-property snapshot into the share-safe dossier.
 * Returns null when NOTHING share-appropriate is present — the share view
 * then renders exactly as it does today (no dossier section, no error).
 */
export function buildShareDossierPayload(
  snapshot: unknown,
): ShareDossierPayload | null {
  const rec = asRecord(snapshot)
  if (!rec) return null
  const drawings = sanitizeDrawings(rec.drawings)
  const chatSummary = sanitizeChatSummary(rec.chatSummary)
  const rawNotes = str(rec.notes)
  const notes = rawNotes ? cap(rawNotes, NOTES_MAX) : null
  if (!drawings && !chatSummary && !notes) return null
  return {
    address: str(rec.address),
    savedAt: str(rec.savedAt),
    drawings,
    chatSummary,
    notes,
  }
}
