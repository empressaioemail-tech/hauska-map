// apps/command-center/src/admin/control/center/useActivePanel.tsx
//
// Hash-route hook for the Command Center. The active panel id lives in
// location.hash as `#panel=<id>` with optional `&key=value` params so it
// persists across reloads and is linkable (e.g. `#panel=atom-inspector&id=…`).
// Falls back to DEFAULT_PANEL_ID when the hash is absent or names an unknown panel.
//
// PanelProvider holds a single shared panel state for the whole shell so child
// panels call selectPanel to switch the center inspector.
//
// Ported verbatim from the trading Control Tower (backend-agnostic).

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { DEFAULT_PANEL_ID, PANELS } from './PanelRegistry'
import { CONTEXT_PARAM_KEYS } from '../../workspace/activeContext'
import { PANEL_HASH_PREFIX, buildPanelHash } from './panelHash'

// Re-exported so existing importers keep their path. The implementation lives in
// panelHash.ts, which imports nothing — a leaf panel that only needs to WRITE a hash
// must not drag PanelRegistry (and map-renderer's stylesheet) in behind it.
export { buildPanelHash }

const PREFIX = PANEL_HASH_PREFIX

export interface PanelHash {
  panelId: string
  params: Record<string, string>
}

export function parseHash(): PanelHash {
  if (typeof window === 'undefined') {
    return { panelId: DEFAULT_PANEL_ID, params: {} }
  }
  const raw = window.location.hash || ''
  const body = raw.startsWith('#') ? raw.slice(1) : raw
  if (!body) return { panelId: DEFAULT_PANEL_ID, params: {} }

  const segments = body.split('&')
  const first = segments[0] ?? ''
  let panelId = DEFAULT_PANEL_ID
  if (first.startsWith(PREFIX)) {
    const id = first.slice(PREFIX.length)
    panelId = PANELS.some((p) => p.id === id) ? id : DEFAULT_PANEL_ID
  }

  const params: Record<string, string> = {}
  for (let i = 1; i < segments.length; i += 1) {
    const seg = segments[i]
    const eq = seg.indexOf('=')
    if (eq === -1) continue
    const k = decodeURIComponent(seg.slice(0, eq))
    const v = decodeURIComponent(seg.slice(eq + 1))
    params[k] = v
  }
  return { panelId, params }
}

type SelectPanel = (id: string, params?: Record<string, string>) => void

interface PanelContextValue {
  panelId: string
  params: Record<string, string>
  selectPanel: SelectPanel
}

const PanelContext = createContext<PanelContextValue | null>(null)

/** Mount once around the Command Center shell so all panels share one route. */
export const PanelProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [{ panelId, params }, setHashState] = useState<PanelHash>(parseHash)

  useEffect(() => {
    const syncFromHash = () => setHashState(parseHash())
    window.addEventListener('hashchange', syncFromHash)
    if (!window.location.hash.includes(PREFIX)) {
      window.location.hash = buildPanelHash(DEFAULT_PANEL_ID)
    }
    syncFromHash()
    return () => window.removeEventListener('hashchange', syncFromHash)
  }, [])

  const selectPanel = useCallback<SelectPanel>((id, nextParams) => {
    // Preserve reserved context params when switching panels
    const currentHash = parseHash()
    const preservedContextParams: Record<string, string> = {}
    for (const key of CONTEXT_PARAM_KEYS) {
      if (currentHash.params[key]) {
        preservedContextParams[key] = currentHash.params[key]
      }
    }
    
    // Merge preserved context params with new panel params
    const mergedParams = { ...preservedContextParams, ...(nextParams ?? {}) }
    
    const next = buildPanelHash(id, mergedParams)
    setHashState({ panelId: id, params: mergedParams })
    if (window.location.hash !== next) {
      window.location.hash = next
    }
  }, [])

  const value = useMemo(() => ({ panelId, params, selectPanel }), [panelId, params, selectPanel])

  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>
}

/**
 * Returns the active panel id, a setter that writes the hash (with optional
 * params), and the current hash params. Must be used under PanelProvider.
 */
export function useActivePanel(): [string, SelectPanel, Record<string, string>] {
  const ctx = useContext(PanelContext)
  if (!ctx) {
    throw new Error('useActivePanel must be used within PanelProvider')
  }
  return [ctx.panelId, ctx.selectPanel, ctx.params]
}
