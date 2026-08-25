/**
 * Browser client for the who-serves BFF (P-75).
 *
 * Uses parcel centroid lat/lng only — never a situs address geocode.
 */

import {
  assertWhoServesSection,
  formatWhoServesDisplay,
  type WhoServesSection,
} from '../../api/_lib/pe-who-serves-core'

export type WhoServesCardPresentation = {
  state: 'loading' | 'present' | 'absent' | 'error'
  summary: string | null
  residual: string | null
  error: string | null
}

export function whoServesQueryPointFromCentroid(
  centroid: { lat: number; lng: number } | null | undefined,
): { lat: number; lng: number } | null {
  if (!centroid) return null
  const { lat, lng } = centroid
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat === 0 && lng === 0) return null
  return { lat, lng }
}

export function whoServesPresentationFromSection(
  section: WhoServesSection,
): Omit<WhoServesCardPresentation, 'state' | 'error'> {
  const formatted = formatWhoServesDisplay(section)
  return {
    summary: formatted.summary,
    residual: formatted.residual,
  }
}

export async function fetchWhoServesAtPoint(
  lat: number,
  lng: number,
  opts?: {
    fetchImpl?: typeof fetch
    basePath?: string
  },
): Promise<WhoServesSection> {
  const fetchImpl = opts?.fetchImpl ?? fetch
  const basePath = opts?.basePath ?? '/api/pe-who-serves'
  const qs = new URLSearchParams({ lat: String(lat), lng: String(lng) })
  const res = await fetchImpl(`${basePath}?${qs.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { message?: string }
      | null
    throw new Error(body?.message ?? `who-serves BFF ${res.status}`)
  }
  const json = (await res.json().catch(() => null)) as unknown
  return assertWhoServesSection(json)
}

export async function loadWhoServesPresentation(
  lat: number,
  lng: number,
  opts?: {
    fetchImpl?: typeof fetch
    basePath?: string
  },
): Promise<WhoServesCardPresentation> {
  try {
    const section = await fetchWhoServesAtPoint(lat, lng, opts)
    const formatted = formatWhoServesDisplay(section)
    return {
      state: formatted.state,
      summary: formatted.summary,
      residual: formatted.residual,
      error: null,
    }
  } catch (err) {
    return {
      state: 'error',
      summary: null,
      residual: null,
      error: err instanceof Error ? err.message : 'who-serves read failed',
    }
  }
}
