// Bidirectional parcel ↔ node binding on the ONE canonical id (WDLL 4 / G6).
//
// Uses the Command Center hash bus (`#panel=…&node={fips}:{propId}`) so map
// click and Node & Graph ledger share one lock. `node` is a reserved context
// param (see activeContext CONTEXT_PARAM_KEYS) and survives panel switches.
//
// CC-A U1: `node=` also accepts road + boundary-edge ids for walkable inspect
// (Amendment 1). Map lock-on-map still requires a strict parcel id.

import { useCallback } from 'react'
import { useActivePanel } from './useActivePanel'
import {
  isCanonicalBoundaryEdgeNodeId,
  isCanonicalRoadNodeId,
  isStrictParcelNodeId,
} from '../../api/atomTrace'

export { isCanonicalBoundaryEdgeNodeId, isCanonicalRoadNodeId, isStrictParcelNodeId }

/** G6 parcel shape — excludes road + boundary-edge (CC-A U1). */
export function isCanonicalParcelNodeId(value: unknown): value is string {
  return isStrictParcelNodeId(value)
}

export function isCanonicalSpineNodeId(value: unknown): value is string {
  return (
    isCanonicalParcelNodeId(value) ||
    isCanonicalRoadNodeId(value) ||
    isCanonicalBoundaryEdgeNodeId(value)
  )
}

/**
 * Read/write the locked spine node id from the shared panel hash.
 * Map → ledger: lockParcelNode(id) after a parcel click.
 * Ledger → map: lockParcelNode(parcelId) then open a map workspace panel.
 * Walkable inspect (U1): lockInspectNode accepts parcel / road / boundary-edge.
 */
export function useParcelNodeBinding(): {
  parcelNodeId: string | null
  inspectNodeId: string | null
  lockParcelNode: (id: string | null, opts?: { panelId?: string }) => void
  lockInspectNode: (id: string | null, opts?: { panelId?: string }) => void
} {
  const [panelId, selectPanel, params] = useActivePanel()
  const raw = params.node ?? null
  const inspectNodeId = raw && isCanonicalSpineNodeId(raw) ? raw.trim() : null
  const parcelNodeId = raw && isCanonicalParcelNodeId(raw) ? raw.trim() : null

  const lockInspectNode = useCallback(
    (id: string | null, opts?: { panelId?: string }) => {
      const next = id && isCanonicalSpineNodeId(id) ? id.trim() : null
      const nextParams: Record<string, string> = { ...params }
      if (next) nextParams.node = next
      else delete nextParams.node
      selectPanel(opts?.panelId ?? panelId, nextParams)
    },
    [params, panelId, selectPanel],
  )

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

  return { parcelNodeId, inspectNodeId, lockParcelNode, lockInspectNode }
}
