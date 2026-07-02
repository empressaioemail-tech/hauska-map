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

const PREFIX = 'panel='

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

/** Build a canonical hash string for a panel + optional params. */
export function buildPanelHash(panelId: string, params?: Record<string, string>): string {
  let hash = `#${PREFIX}${panelId}`
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') {
        hash += `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`
      }
    }
  }
  return hash
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
    const next = buildPanelHash(id, nextParams)
    setHashState({ panelId: id, params: nextParams ?? {} })
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
