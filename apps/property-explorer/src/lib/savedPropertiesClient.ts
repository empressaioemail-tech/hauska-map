// Saved-properties client — the ONE save/list/remove flow (Workbench W4).
//
// Backend: cortex auth-gated routes through the DEEP proxy (user-session
// Bearer attached server-side by api/spine-deep.ts):
//   GET    /api/spine-deep/api/property-explorer/v1/saved-properties
//   PUT    /api/spine-deep/api/property-explorer/v1/saved-properties/:parcelNodeId
//   DELETE /api/spine-deep/api/property-explorer/v1/saved-properties/:parcelNodeId
//
// The SERVER IS THE TRUTH: this module keeps no store beyond notifying
// subscribers that a mutation landed so open UI (the My Properties tool)
// refetches. Both entry points — the InspectCard "Save property" button and
// the tool's own save/remove actions — go through these functions, so there
// is exactly one save flow.

import { CORTEX_DEEP_PROXY_BASE } from './auth'

const SAVED_PROPERTIES_PATH = 'api/property-explorer/v1/saved-properties'

export interface SavedPropertyRow {
  parcelNodeId: string
  label: string | null
  updatedAt: string | null
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

/** Upsert one saved property (label optional; server keeps the truth). */
export async function saveProperty(
  parcelNodeId: string,
  opts?: { label?: string | null },
  fetchImpl: FetchLike = fetch,
): Promise<SavedPropertyMutationOutcome> {
  try {
    const res = await fetchImpl(
      `${CORTEX_DEEP_PROXY_BASE}/${SAVED_PROPERTIES_PATH}/${encodeURIComponent(parcelNodeId)}`,
      {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts?.label ? { label: opts.label } : {}),
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
