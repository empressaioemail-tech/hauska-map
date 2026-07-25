// Bidirectional parcel ↔ node binding on the ONE canonical id (WDLL 4 / G6).
//
// Uses the Command Center hash bus (`#panel=…&node={fips}:{propId}`) so map
// click and Node & Graph ledger share one lock. `node` is a reserved context
// param (see activeContext CONTEXT_PARAM_KEYS) and survives panel switches.

import { useCallback } from 'react'
import { useActivePanel } from './useActivePanel'

/** G6 shape — keep in sync with PE/MCP PARCEL_NODE_ID_SOURCE. */
const PARCEL_NODE_ID_RE = /^\d{5}:[^/\s]+$/

export function isCanonicalParcelNodeId(value: unknown): value is string {
  return typeof value === 'string' && PARCEL_NODE_ID_RE.test(value.trim())
}

/** R1 — road spine node id on the same substrate. */
export function isCanonicalRoadNodeId(value: unknown): value is string {
  return typeof value === 'string' && /^\d{5}:road:\d+$/.test(value.trim())
}

export function isCanonicalSpineNodeId(value: unknown): value is string {
  return isCanonicalParcelNodeId(value) || isCanonicalRoadNodeId(value)
}

/**
 * Read/write the locked parcel node id from the shared panel hash.
 * Map → ledger: lockParcelNode(id) after a parcel click.
 * Ledger → map: lockParcelNode(id) then open a map workspace panel.
 */
export function useParcelNodeBinding(): {
  parcelNodeId: string | null
  lockParcelNode: (id: string | null, opts?: { panelId?: string }) => void
} {
  const [panelId, selectPanel, params] = useActivePanel()
  const raw = params.node ?? null
  const parcelNodeId = raw && isCanonicalParcelNodeId(raw) ? raw.trim() : null

  const lockParcelNode = useCallback(
    (id: string | null, opts?: { panelId?: string }) => {
      const next = id && isCanonicalParcelNodeId(id) ? id.trim() : null
      const nextParams: Record<string, string> = { ...params }
      if (next) nextParams.node = next
      else delete nextParams.node
      selectPanel(opts?.panelId ?? panelId, nextParams)
    },
    [params, panelId, selectPanel],
  )

  return { parcelNodeId, lockParcelNode }
}
