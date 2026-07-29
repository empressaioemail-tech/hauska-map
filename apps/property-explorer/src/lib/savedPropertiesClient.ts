// Saved-properties client — the ONE save/list/remove flow (Workbench W4),
// extended in WB6 with the property DOSSIER carried in the server-side
// `snapshot` jsonb (drawings / chat summary + thread / notes / exports).
//
// Backend: cortex auth-gated routes through the DEEP proxy (user-session
// Bearer attached server-side by api/spine-deep.ts):
//   GET    /api/spine-deep/api/property-explorer/v1/saved-properties
//   PUT    /api/spine-deep/api/property-explorer/v1/saved-properties/:parcelNodeId
//   DELETE /api/spine-deep/api/property-explorer/v1/saved-properties/:parcelNodeId
//
// The SERVER IS THE TRUTH: this module keeps no store beyond notifying
// subscribers that a mutation landed so open UI (the My Properties tool)
// refetches. All entry points — the InspectCard "Save property" button, the
// tool's own save/remove actions, and every dossier write (drawings, chat,
// notes, export attachments) — go through these functions, so there is
// exactly one save flow. Dossier writes are read-modify-write against the
// server's current snapshot (list → merge → PUT), never a blind overwrite of
// fields the patch does not touch.

import { CORTEX_DEEP_PROXY_BASE } from './auth'
import {
  dossierFromSnapshot,
  sanitizeDossier,
  type PropertyDossier,
} from './propertyDossier'

const SAVED_PROPERTIES_PATH = 'api/property-explorer/v1/saved-properties'

export interface SavedPropertyRow {
  parcelNodeId: string
  label: string | null
  updatedAt: string | null
  /** The dossier parsed from the server `snapshot` jsonb; null when empty. */
  snapshot: PropertyDossier | null
}

export type SavedPropertiesListOutcome =
  | { kind: 'ready'; items: SavedPropertyRow[] }
  | { kind: 'sign-in' }
  | { kind: 'error'; message: string }
  | { kind: 'unreachable' }

export type SavedPropertyMutationOutcome =
  | { kind: 'ok' }
  | { kind: 'sign-in' }
  | { kind: 'error'; message: string }
  | { kind: 'unreachable' }

/** Dossier update adds one honest state: the property is not saved yet. */
export type DossierUpdateOutcome =
  | SavedPropertyMutationOutcome
  | { kind: 'not-saved' }

type FetchLike = typeof fetch

function rowFrom(value: unknown): SavedPropertyRow | null {
  if (value === null || typeof value !== 'object') return null
  const rec = value as Record<string, unknown>
  const parcelNodeId = rec.parcelNodeId
  if (typeof parcelNodeId !== 'string' || !parcelNodeId.trim()) return null
  return {
    parcelNodeId,
    label: typeof rec.label === 'string' && rec.label.trim() ? rec.label : null,
    updatedAt: typeof rec.updatedAt === 'string' ? rec.updatedAt : null,
    snapshot: dossierFromSnapshot(rec.snapshot),
  }
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as {
    message?: string
    error?: string
  }
  return body.message ?? body.error ?? fallback
}

/** List saved properties (server-ordered by updatedAt desc). */
export async function listSavedProperties(
  fetchImpl: FetchLike = fetch,
): Promise<SavedPropertiesListOutcome> {
  try {
    const res = await fetchImpl(`${CORTEX_DEEP_PROXY_BASE}/${SAVED_PROPERTIES_PATH}`, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    })
    if (res.status === 401) return { kind: 'sign-in' }
    if (!res.ok) {
      return {
        kind: 'error',
        message: await errorMessage(res, `Saved properties returned ${res.status}.`),
      }
    }
    const body = (await res.json().catch(() => null)) as unknown
    const items = Array.isArray(body)
      ? body.map(rowFrom).filter((r): r is SavedPropertyRow => r !== null)
      : []
    return { kind: 'ready', items }
  } catch {
    return { kind: 'unreachable' }
  }
}

/** Upsert one saved property (label/snapshot optional; server keeps the truth). */
export async function saveProperty(
  parcelNodeId: string,
  opts?: { label?: string | null; snapshot?: PropertyDossier | null },
  fetchImpl: FetchLike = fetch,
): Promise<SavedPropertyMutationOutcome> {
  try {
    const body: Record<string, unknown> = {}
    if (opts?.label) body.label = opts.label
    if (opts?.snapshot) body.snapshot = sanitizeDossier(opts.snapshot)
    const res = await fetchImpl(
      `${CORTEX_DEEP_PROXY_BASE}/${SAVED_PROPERTIES_PATH}/${encodeURIComponent(parcelNodeId)}`,
      {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    )
    if (res.status === 401) return { kind: 'sign-in' }
    if (!res.ok) {
      return {
        kind: 'error',
        message: await errorMessage(res, `Save returned ${res.status}.`),
      }
    }
    notifySavedPropertiesChanged()
    return { kind: 'ok' }
  } catch {
    return { kind: 'unreachable' }
  }
}

/** Remove one saved property. A 404 (already gone) counts as ok. */
export async function removeSavedProperty(
  parcelNodeId: string,
  fetchImpl: FetchLike = fetch,
): Promise<SavedPropertyMutationOutcome> {
  try {
    const res = await fetchImpl(
      `${CORTEX_DEEP_PROXY_BASE}/${SAVED_PROPERTIES_PATH}/${encodeURIComponent(parcelNodeId)}`,
      {
        method: 'DELETE',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      },
    )
    if (res.status === 401) return { kind: 'sign-in' }
    if (!res.ok && res.status !== 404) {
      return {
        kind: 'error',
        message: await errorMessage(res, `Remove returned ${res.status}.`),
      }
    }
    notifySavedPropertiesChanged()
    return { kind: 'ok' }
  } catch {
    return { kind: 'unreachable' }
  }
}

// ---------------------------------------------------------------------------
// WB6 dossier update — read-modify-write against the server's snapshot.
// ---------------------------------------------------------------------------

/** A dossier patch: a partial object, or a function of the CURRENT dossier
 *  (use the function form when the patch depends on existing content, e.g.
 *  the exports[] dedupe-by-kind+format upsert). */
export type DossierPatch =
  | Partial<PropertyDossier>
  | ((current: PropertyDossier) => Partial<PropertyDossier>)

/**
 * Merge a patch into the saved property's dossier and PUT the result.
 * The property must already be saved — an unsaved property returns the honest
 * `not-saved` outcome (callers offer "save the property first").
 */
export async function updatePropertyDossier(
  parcelNodeId: string,
  patch: DossierPatch,
  fetchImpl: FetchLike = fetch,
): Promise<DossierUpdateOutcome> {
  const listed = await listSavedProperties(fetchImpl)
  if (listed.kind !== 'ready') return listed
  const row = listed.items.find((r) => r.parcelNodeId === parcelNodeId)
  if (!row) return { kind: 'not-saved' }

  const current = row.snapshot ?? {}
  const partial = typeof patch === 'function' ? patch(current) : patch
  const merged = sanitizeDossier({ ...current, ...partial })
  return saveProperty(
    parcelNodeId,
    { label: row.label, snapshot: merged },
    fetchImpl,
  )
}

/**
 * Save a property SEEDING the dossier (savedAt / address / current map
 * drawings) without clobbering an existing dossier: if the property is
 * already saved, the seed merges INTO the existing snapshot (existing
 * notes / chat / exports survive; drawings and address update when provided).
 * Falls back to a plain save when the list read cannot resolve current state
 * — never blocks the save, never blind-overwrites a known dossier.
 */
export async function savePropertyWithDossier(
  parcelNodeId: string,
  seed: {
    label?: string | null
    address?: string | null
    drawings?: PropertyDossier['drawings']
  },
  fetchImpl: FetchLike = fetch,
): Promise<SavedPropertyMutationOutcome> {
  const listed = await listSavedProperties(fetchImpl)
  if (listed.kind === 'sign-in') return listed
  const existing =
    listed.kind === 'ready'
      ? (listed.items.find((r) => r.parcelNodeId === parcelNodeId) ?? null)
      : null
  if (listed.kind !== 'ready') {
    // Current snapshot unknowable — save WITHOUT a snapshot so an existing
    // dossier is never overwritten blind (server keeps whatever it has).
    return saveProperty(parcelNodeId, { label: seed.label }, fetchImpl)
  }
  const current = existing?.snapshot ?? {}
  const merged = sanitizeDossier({
    ...current,
    savedAt: current.savedAt ?? new Date().toISOString(),
    address: seed.address ?? current.address,
    drawings: seed.drawings ?? current.drawings,
  })
  return saveProperty(
    parcelNodeId,
    { label: seed.label ?? existing?.label ?? null, snapshot: merged },
    fetchImpl,
  )
}

/** One saved row (with its dossier) by parcel node id; null when not saved. */
export async function getSavedProperty(
  parcelNodeId: string,
  fetchImpl: FetchLike = fetch,
): Promise<
  | { kind: 'found'; row: SavedPropertyRow }
  | { kind: 'not-saved' }
  | { kind: 'sign-in' }
  | { kind: 'error'; message: string }
  | { kind: 'unreachable' }
> {
  const listed = await listSavedProperties(fetchImpl)
  if (listed.kind !== 'ready') return listed
  const row = listed.items.find((r) => r.parcelNodeId === parcelNodeId)
  return row ? { kind: 'found', row } : { kind: 'not-saved' }
}

// ---------------------------------------------------------------------------
// Change notification — so the tool refetches after a save from ANY entry
// point (InspectCard button or the tool itself). Not a cache: the server
// remains the only source of truth.
// ---------------------------------------------------------------------------

const listeners = new Set<() => void>()

export function subscribeSavedPropertiesChanged(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function notifySavedPropertiesChanged(): void {
  for (const fn of [...listeners]) fn()
}
