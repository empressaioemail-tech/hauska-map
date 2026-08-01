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
/** Multi-thread revisit: how many named/dated threads a property keeps. */
export const DOSSIER_CHAT_THREADS_MAX = 20;
/** Auto-title / operator-name cap for a saved thread. */
export const DOSSIER_CHAT_THREAD_TITLE_MAX_CHARS = 80;
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

/**
 * A saved chat THREAD — the durable, cross-device half of the property's
 * multi-thread revisit. Each thread is anchored to THIS property (the dossier
 * it lives on); the id matches the client session id so re-saving updates in
 * place and opening a saved thread continues the same session. Turns are
 * capped exactly like the single-thread field. Attachments are NOT persisted
 * here (tenant-private client context, not stored server-side in v1).
 */
export interface DossierChatThread {
  id: string;
  /** Auto-title (first user question) or an operator name; null = untitled. */
  title: string | null;
  savedAt: string;
  turnCount: number;
  turns: DossierChatTurn[];
}

export type DossierExportKind = "site-plan" | "terrain" | "flood-drainage";

/**
 * WB7c: the property's map-pin coordinate, captured ONCE at save time from the
 * inspect-card / facets center (or the #104 center-resolution chain when the
 * card carried none). Absent stays absent — a saved property with no resolvable
 * center honestly renders no pin, never a fabricated location.
 */
export interface DossierPin {
  lat: number;
  lng: number;
}

/**
 * WB7d: single-select pipeline status (v1). No freeform tags yet — flagged as
 * a follow-up; adding a `tags?: string[]` later is additive under the same
 * defensive-parse rules.
 */
export type DossierStatus = "researching" | "offer" | "passed";
export const DOSSIER_STATUSES: readonly DossierStatus[] = [
  "researching",
  "offer",
  "passed",
];

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
  /** WB7c — save-time map-pin coordinate; null/absent = honestly no pin. */
  pin?: DossierPin | null;
  /** WB7d — single-select status; null/absent = unset. */
  status?: DossierStatus | null;
  drawings?: DossierFeatureCollection | null;
  chatSummary?: DossierChatSummary | null;
  chatThread?: DossierChatTurn[] | null;
  /** Multi-thread revisit — a property's list of saved chat threads. */
  chatThreads?: DossierChatThread[] | null;
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

function sanitizeChatThread(value: unknown): DossierChatThread | null {
  const rec = asRecord(value);
  if (!rec) return null;
  const id = str(rec.id);
  if (!id) return null;
  const turns = sanitizeChatTurns(rec.turns);
  if (!turns) return null;
  const rawTitle = str(rec.title);
  const title = rawTitle ? cap(rawTitle, DOSSIER_CHAT_THREAD_TITLE_MAX_CHARS) : null;
  return {
    id: cap(id, 200),
    title,
    savedAt: str(rec.savedAt) ?? "",
    turnCount:
      typeof rec.turnCount === "number" && Number.isFinite(rec.turnCount)
        ? Math.max(0, Math.floor(rec.turnCount))
        : turns.length,
    turns,
  };
}

/** Sanitize the saved-threads list — drop malformed threads, keep the most
 *  recent DOSSIER_CHAT_THREADS_MAX (by savedAt desc), never throw. */
export function sanitizeChatThreads(value: unknown): DossierChatThread[] | null {
  if (!Array.isArray(value)) return null;
  const threads = value
    .map(sanitizeChatThread)
    .filter((t): t is DossierChatThread => t !== null);
  if (threads.length === 0) return null;
  // Dedupe by id (last wins), then keep the most recent N by savedAt.
  const byId = new Map<string, DossierChatThread>();
  for (const t of threads) byId.set(t.id, t);
  return [...byId.values()]
    .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1))
    .slice(0, DOSSIER_CHAT_THREADS_MAX);
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

/** Valid pin = finite lat/lng inside world bounds, rounded to ~11 cm. */
export function sanitizePin(value: unknown): DossierPin | null {
  const rec = asRecord(value);
  if (!rec) return null;
  const lat = rec.lat;
  const lng = rec.lng;
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    return null;
  }
  return {
    lat: Number(lat.toFixed(COORD_DECIMALS)),
    lng: Number(lng.toFixed(COORD_DECIMALS)),
  };
}

/** Single-select status — anything outside the union is dropped, never thrown. */
export function sanitizeStatus(value: unknown): DossierStatus | null {
  return typeof value === "string" &&
    (DOSSIER_STATUSES as readonly string[]).includes(value)
    ? (value as DossierStatus)
    : null;
}

function sanitizeExports(value: unknown): DossierExportEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: DossierExportEntry[] = [];
  for (const raw of value) {
    const rec = asRecord(raw);
    if (!rec) continue;
    const kind =
      rec.kind === "site-plan" ||
      rec.kind === "terrain" ||
      rec.kind === "flood-drainage"
        ? rec.kind
        : null;
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
  const pin = input.pin ? sanitizePin(input.pin) : null;
  if (pin) out.pin = pin;
  const status = sanitizeStatus(input.status ?? null);
  if (status) out.status = status;
  const drawings = input.drawings ? sanitizeDrawings(input.drawings) : null;
  if (drawings) out.drawings = drawings;
  const chatSummary = input.chatSummary
    ? sanitizeChatSummary(input.chatSummary)
    : null;
  if (chatSummary) out.chatSummary = chatSummary;
  const chatThread = input.chatThread ? sanitizeChatTurns(input.chatThread) : null;
  if (chatThread) out.chatThread = chatThread;
  const chatThreads = input.chatThreads ? sanitizeChatThreads(input.chatThreads) : null;
  if (chatThreads) out.chatThreads = chatThreads;
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

// ---------------------------------------------------------------------------
// Chat-threads upsert — dedupe by thread id, LATEST WINS (re-saving a thread
// updates it in place rather than piling duplicates). Keeps the list bounded.
// ---------------------------------------------------------------------------

export function upsertChatThread(
  current: DossierChatThread[] | undefined,
  thread: DossierChatThread,
): DossierChatThread[] {
  const kept = (current ?? []).filter((t) => t.id !== thread.id);
  return [thread, ...kept].slice(0, DOSSIER_CHAT_THREADS_MAX);
}
