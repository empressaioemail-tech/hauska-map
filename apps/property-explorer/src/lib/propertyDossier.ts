// Property DOSSIER model (Workbench WB6) — the shape of the server-side
// `snapshot` jsonb on a saved property. The SERVER IS THE TRUTH: this module
// only defines the client's view of that jsonb (parse defensively, write
// sanitized) — it never caches anything.
//
// SIZE DISCIPLINE (the list endpoint returns snapshots — rows stay lean):
//   - NO images / base64 blobs anywhere in the snapshot. Exports store the
//     gated re-download PATH, never bytes.
//   - notes capped at 4k chars; chat thread capped to the last 20 turns with
//     per-turn content caps; drawings capped by feature count with coordinate
//     precision trimmed to ~11 cm (6 decimals).
//   - Everything is plain JSON — unknown/malformed fields are dropped on
//     parse, never thrown.

// ---------------------------------------------------------------------------
// Caps.
// ---------------------------------------------------------------------------

export const DOSSIER_NOTES_MAX_CHARS = 4_000;
export const DOSSIER_CHAT_MAX_TURNS = 20;
export const DOSSIER_CHAT_TURN_MAX_CHARS = 4_000;
export const DOSSIER_SUMMARY_MAX_CHARS = 4_000;
export const DOSSIER_DRAWINGS_MAX_FEATURES = 300;
/** ~11 cm at the equator — plenty for annotation geometry, keeps rows lean. */
const COORD_DECIMALS = 6;

// ---------------------------------------------------------------------------
// Minimal GeoJSON types (structural — no @types/geojson dependency).
// ---------------------------------------------------------------------------

export interface DossierFeature {
  type: "Feature";
  geometry: { type: string; coordinates: unknown };
  properties: Record<string, unknown>;
}

export interface DossierFeatureCollection {
  type: "FeatureCollection";
  features: DossierFeature[];
}

// ---------------------------------------------------------------------------
// The dossier shape.
// ---------------------------------------------------------------------------

export interface DossierChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface DossierChatSummary {
  /** AI-generated — ALWAYS labeled "AI summary" in UI, never verified fact. */
  summary: string;
  savedAt: string;
  turnCount: number;
  /** The standing research disclaimer that rode with the summary answer. */
  disclaimer?: string | null;
}

export type DossierExportKind = "site-plan" | "terrain";

export interface DossierExportEntry {
  kind: DossierExportKind;
  format: string;
  savedAt: string;
  /** The EXISTING gated re-download path (BFF GET) — never bytes. */
  downloadPath?: string | null;
}

export interface PropertyDossier {
  savedAt?: string | null;
  address?: string | null;
  drawings?: DossierFeatureCollection | null;
  chatSummary?: DossierChatSummary | null;
  chatThread?: DossierChatTurn[] | null;
  notes?: string | null;
  exports?: DossierExportEntry[];
}

// ---------------------------------------------------------------------------
// Small guards.
// ---------------------------------------------------------------------------

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function cap(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

// ---------------------------------------------------------------------------
// Display-label fallback chain (WB6 polish bug): label → address → parcel id.
// A saved row must NEVER render an empty-comma artifact like ", ," — a string
// with no letters or digits carries no information and is treated as absent.
// ---------------------------------------------------------------------------

/** Null unless the string carries at least one letter or digit. */
export function cleanDisplayString(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || !/[\p{L}\p{N}]/u.test(trimmed)) return null;
  return trimmed;
}

/** label → dossier address → parcel id — never empty, never ", ,". */
export function savedRowDisplayLabel(row: {
  parcelNodeId: string;
  label: string | null;
  snapshot?: PropertyDossier | null;
}): string {
  return (
    cleanDisplayString(row.label) ??
    cleanDisplayString(row.snapshot?.address ?? null) ??
    row.parcelNodeId
  );
}

// ---------------------------------------------------------------------------
// Drawings sanitizer — bounded feature count, rounded coordinates, plain
// properties only. Anything malformed is dropped, never thrown.
// ---------------------------------------------------------------------------

function roundCoords(value: unknown, depth = 0): unknown {
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? Number(value.toFixed(COORD_DECIMALS))
      : null;
  }
  if (Array.isArray(value) && depth < 6) {
    return value.map((v) => roundCoords(v, depth + 1));
  }
  return null;
}

const GEOMETRY_TYPES = new Set([
  "Point",
  "MultiPoint",
  "LineString",
  "MultiLineString",
  "Polygon",
  "MultiPolygon",
]);

function sanitizeFeature(value: unknown): DossierFeature | null {
  const rec = asRecord(value);
  if (!rec || rec.type !== "Feature") return null;
  const geom = asRecord(rec.geometry);
  if (!geom || typeof geom.type !== "string" || !GEOMETRY_TYPES.has(geom.type)) {
    return null;
  }
  const coordinates = roundCoords(geom.coordinates);
  if (coordinates === null) return null;
  // Keep only small primitive properties (tool tags etc.) — no blobs.
  const props: Record<string, unknown> = {};
  const rawProps = asRecord(rec.properties) ?? {};
  for (const [k, v] of Object.entries(rawProps)) {
    if (typeof v === "string") props[k] = cap(v, 200);
    else if (typeof v === "number" || typeof v === "boolean") props[k] = v;
  }
  return {
    type: "Feature",
    geometry: { type: geom.type, coordinates },
    properties: props,
  };
}

export function sanitizeDrawings(
  value: unknown,
): DossierFeatureCollection | null {
  const rec = asRecord(value);
  if (!rec || rec.type !== "FeatureCollection" || !Array.isArray(rec.features)) {
    return null;
  }
  const features = rec.features
    .map(sanitizeFeature)
    .filter((f): f is DossierFeature => f !== null)
    .slice(0, DOSSIER_DRAWINGS_MAX_FEATURES);
  if (features.length === 0) return null;
  return { type: "FeatureCollection", features };
}

// ---------------------------------------------------------------------------
// Full-dossier sanitizer + defensive parser.
// ---------------------------------------------------------------------------

function sanitizeChatTurns(value: unknown): DossierChatTurn[] | null {
  if (!Array.isArray(value)) return null;
  const turns: DossierChatTurn[] = [];
  for (const raw of value) {
    const rec = asRecord(raw);
    if (!rec) continue;
    const role = rec.role === "user" || rec.role === "assistant" ? rec.role : null;
    const content = str(rec.content);
    if (!role || !content) continue;
    turns.push({ role, content: cap(content, DOSSIER_CHAT_TURN_MAX_CHARS) });
  }
  if (turns.length === 0) return null;
  // Keep the LAST N turns — the tail of the conversation is the live context.
  return turns.slice(-DOSSIER_CHAT_MAX_TURNS);
}

function sanitizeChatSummary(value: unknown): DossierChatSummary | null {
  const rec = asRecord(value);
  if (!rec) return null;
  const summary = str(rec.summary);
  const savedAt = str(rec.savedAt);
  if (!summary || !savedAt) return null;
  return {
    summary: cap(summary, DOSSIER_SUMMARY_MAX_CHARS),
    savedAt,
    turnCount:
      typeof rec.turnCount === "number" && Number.isFinite(rec.turnCount)
        ? Math.max(0, Math.floor(rec.turnCount))
        : 0,
    disclaimer: str(rec.disclaimer),
  };
}

function sanitizeExports(value: unknown): DossierExportEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: DossierExportEntry[] = [];
  for (const raw of value) {
    const rec = asRecord(raw);
    if (!rec) continue;
    const kind = rec.kind === "site-plan" || rec.kind === "terrain" ? rec.kind : null;
    const format = str(rec.format);
    const savedAt = str(rec.savedAt);
    if (!kind || !format || !savedAt) continue;
    const downloadPath = str(rec.downloadPath);
    // Paths only — a data:/base64 payload is a blob smuggle; drop the path.
    entries.push({
      kind,
      format,
      savedAt,
      downloadPath:
        downloadPath && !downloadPath.startsWith("data:") && downloadPath.length <= 2_000
          ? downloadPath
          : null,
    });
  }
  return entries;
}

/**
 * Enforce every cap on a dossier about to be WRITTEN. Input may be partial /
 * hostile; output is a lean, serializable dossier.
 */
export function sanitizeDossier(input: PropertyDossier): PropertyDossier {
  const out: PropertyDossier = {};
  if (str(input.savedAt ?? null)) out.savedAt = input.savedAt ?? null;
  const address = cleanDisplayString(input.address ?? null);
  if (address) out.address = address;
  const drawings = input.drawings ? sanitizeDrawings(input.drawings) : null;
  if (drawings) out.drawings = drawings;
  const chatSummary = input.chatSummary
    ? sanitizeChatSummary(input.chatSummary)
    : null;
  if (chatSummary) out.chatSummary = chatSummary;
  const chatThread = input.chatThread ? sanitizeChatTurns(input.chatThread) : null;
  if (chatThread) out.chatThread = chatThread;
  const notes = str(input.notes ?? null);
  if (notes) out.notes = cap(notes, DOSSIER_NOTES_MAX_CHARS);
  const exports = sanitizeExports(input.exports);
  if (exports.length > 0) out.exports = exports;
  return out;
}

/** Parse a server snapshot jsonb defensively — never throws, never trusts. */
export function dossierFromSnapshot(value: unknown): PropertyDossier | null {
  const rec = asRecord(value);
  if (!rec) return null;
  const dossier = sanitizeDossier(rec as PropertyDossier);
  return Object.keys(dossier).length > 0 ? dossier : null;
}

// ---------------------------------------------------------------------------
// Exports upsert — dedupe by kind+format, LATEST WINS (auto-attach rule).
// ---------------------------------------------------------------------------

export function upsertExportEntry(
  current: DossierExportEntry[] | undefined,
  entry: DossierExportEntry,
): DossierExportEntry[] {
  const kept = (current ?? []).filter(
    (e) => !(e.kind === entry.kind && e.format === entry.format),
  );
  return [...kept, entry];
}
