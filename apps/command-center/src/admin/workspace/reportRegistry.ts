// apps/command-center/src/admin/workspace/reportRegistry.ts
//
// Cortex report/capability registry — the FULL report library behind the
// Add-tile picker. Fetched live from cortex-api's admin tile-registry
// (GET /api/plan-review/admin/tile-registry, served through the same-origin
// proxy at /api/spine/cortex/api/... — the cortexClient base). Cached at
// module level with a TTL + in-flight dedupe so opening the picker repeatedly
// does not refetch, and exposed through a hook with honest loading / error
// states (registry unreachable is a rendered state, never a silent empty).

import { useCallback, useEffect, useRef, useState } from 'react'
import { cortexClient } from './cortexClient'

export interface ReportCapabilityRequires {
  engagementId?: boolean
  apn?: boolean
  jurisdiction?: boolean
  uploadedDocuments?: boolean
  completedFindings?: boolean
}

/** A capability entry from cortex-api's tile registry (TileDefWire + extras). */
export interface ReportCapability {
  id: string
  label: string
  category: string
  status: string
  degradedReason?: string
  engine?: string
  requires: ReportCapabilityRequires
}

export const REPORT_REGISTRY_PATH = '/plan-review/admin/tile-registry'

const CACHE_TTL_MS = 5 * 60_000

let cache: { entries: ReportCapability[]; at: number } | null = null
let inflight: Promise<ReportCapability[]> | null = null

const REQUIRES_KEYS: Array<keyof ReportCapabilityRequires> = [
  'engagementId',
  'apn',
  'jurisdiction',
  'uploadedDocuments',
  'completedFindings',
]

function sanitizeEntry(raw: unknown): ReportCapability | null {
  if (typeof raw !== 'object' || raw === null) return null
  const e = raw as Record<string, unknown>
  if (typeof e.id !== 'string' || e.id === '') return null
  const requires: ReportCapabilityRequires = {}
  if (typeof e.requires === 'object' && e.requires !== null) {
    for (const key of REQUIRES_KEYS) {
      const v = (e.requires as Record<string, unknown>)[key]
      if (typeof v === 'boolean') requires[key] = v
    }
  }
  return {
    id: e.id,
    label: typeof e.label === 'string' && e.label !== '' ? e.label : e.id,
    category: typeof e.category === 'string' ? e.category : 'Uncategorized',
    status: typeof e.status === 'string' ? e.status : 'live',
    degradedReason: typeof e.degradedReason === 'string' ? e.degradedReason : undefined,
    engine: typeof e.engine === 'string' ? e.engine : undefined,
    requires,
  }
}

/** Fetch the registry (module-cached with TTL; in-flight calls are deduped). */
export function fetchReportRegistry(force = false): Promise<ReportCapability[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return Promise.resolve(cache.entries)
  }
  if (!force && inflight) return inflight
  const req = (async () => {
    try {
      const raw = await cortexClient.fetch<unknown>(REPORT_REGISTRY_PATH)
      if (!Array.isArray(raw)) {
        // The cortex SPA fallthrough returns HTML with HTTP 200 for unknown
        // paths — res.json() throws there, but guard the shape regardless.
        throw new Error('tile-registry response is not an array')
      }
      const entries = raw
        .map(sanitizeEntry)
        .filter((e): e is ReportCapability => e !== null)
      cache = { entries, at: Date.now() }
      return entries
    } finally {
      inflight = null
    }
  })()
  inflight = req
  return req
}

/** Test hook: drop the module cache between tests. */
export function __resetReportRegistryForTests(): void {
  cache = null
  inflight = null
}

export interface ReportRegistryState {
  status: 'idle' | 'loading' | 'ok' | 'error'
  entries: ReportCapability[] | null
  error: string | null
  /** Re-fetch, bypassing the cache (the picker's Retry affordance). */
  retry: () => void
}

/**
 * Live registry hook for the picker. `enabled` gates the fetch so the registry
 * is only hit when the picker actually opens.
 */
export function useReportRegistry(enabled: boolean): ReportRegistryState {
  const [state, setState] = useState<Omit<ReportRegistryState, 'retry'>>({
    status: 'idle',
    entries: null,
    error: null,
  })
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const load = useCallback((force = false) => {
    setState((s) => ({ ...s, status: 'loading', error: null }))
    fetchReportRegistry(force)
      .then((entries) => {
        if (mounted.current) setState({ status: 'ok', entries, error: null })
      })
      .catch((err: unknown) => {
        if (mounted.current) {
          setState({
            status: 'error',
            entries: null,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      })
  }, [])

  useEffect(() => {
    if (enabled && state.status === 'idle') load()
  }, [enabled, state.status, load])

  return { ...state, retry: () => load(true) }
}
