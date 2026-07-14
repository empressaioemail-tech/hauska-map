// apps/command-center/src/admin/workspace/layoutModel.ts
//
// Workspace layout model — the editable per-space tile layout behind SpacePanel's
// edit mode. Pure reducer + localStorage persistence (the Settings-panel pattern:
// same-origin localStorage, resolved synchronously, guarded try/catch).
//
// Concepts:
//   SpaceLayout   — columns + ordered tile list (id, column span, minimized flag).
//   Named layouts — per-space saved layouts (save / load / duplicate / delete /
//                   reset-to-default) under one storage key.
//   Working copy  — the current (possibly unsaved) layout, persisted on every
//                   change so the active layout survives reload.
//   URL hash      — an optional `layout=<name>` hash param selects a named layout
//                   at mount (same pattern as the reserved context params).
//
// The model is registry-agnostic: unknown tile ids are preserved here and simply
// skipped at render time by SpacePanel (getTile returns undefined).

import type { PresetSpace } from '@empressaio/tile-shell'

// ---------------------------------------------------------------------------
// Types + defaults
// ---------------------------------------------------------------------------

export interface TileLayout {
  /** Tile registry id. */
  id: string
  /** Column span within the grid, clamped to [1, columns]. */
  span: number
  /** Header-only collapsed state. */
  minimized: boolean
}

export interface SpaceLayout {
  /** Grid column count, clamped to [MIN_COLUMNS, MAX_COLUMNS]. */
  columns: number
  /** Ordered tiles. */
  tiles: TileLayout[]
}

export interface LayoutState {
  layout: SpaceLayout
  /** Active named layout, or null when on the (possibly modified) default. */
  activeName: string | null
}

export const MIN_COLUMNS = 1
export const MAX_COLUMNS = 6

/** Preset layoutId → column count (rows derive from tile count at render). */
const LAYOUT_COLUMNS: Record<string, number> = {
  '2x1': 2,
  '2x2': 2,
  '3x2': 3,
}

/** The untouched default layout for a preset space: all tiles, span 1, expanded. */
export function defaultLayoutFor(space: PresetSpace): SpaceLayout {
  return {
    columns: LAYOUT_COLUMNS[space.layoutId] ?? 3,
    tiles: space.tiles.map((id) => ({ id, span: 1, minimized: false })),
  }
}

/** Rows needed to place the layout's tiles (matches the preset row counts for defaults). */
export function rowsFor(layout: SpaceLayout): number {
  const units = layout.tiles.reduce(
    (sum, t) => sum + Math.min(Math.max(1, t.span), layout.columns),
    0,
  )
  return Math.max(1, Math.ceil(units / layout.columns))
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export type LayoutAction =
  | { type: 'add-tile'; tileId: string }
  | { type: 'remove-tile'; tileId: string }
  | { type: 'toggle-minimize'; tileId: string }
  | { type: 'adjust-span'; tileId: string; delta: number }
  | { type: 'move-tile'; fromId: string; toId: string }
  | { type: 'adjust-columns'; delta: number }
  /** Load a named layout, reset to default (activeName null), etc. */
  | { type: 'apply'; layout: SpaceLayout; activeName: string | null }

function clampSpan(span: number, columns: number): number {
  return Math.min(Math.max(1, Math.round(span)), columns)
}

export function layoutReducer(state: LayoutState, action: LayoutAction): LayoutState {
  const { layout } = state
  switch (action.type) {
    case 'add-tile': {
      if (layout.tiles.some((t) => t.id === action.tileId)) return state
      return {
        ...state,
        layout: {
          ...layout,
          tiles: [...layout.tiles, { id: action.tileId, span: 1, minimized: false }],
        },
      }
    }
    case 'remove-tile': {
      const tiles = layout.tiles.filter((t) => t.id !== action.tileId)
      if (tiles.length === layout.tiles.length) return state
      return { ...state, layout: { ...layout, tiles } }
    }
    case 'toggle-minimize': {
      return {
        ...state,
        layout: {
          ...layout,
          tiles: layout.tiles.map((t) =>
            t.id === action.tileId ? { ...t, minimized: !t.minimized } : t,
          ),
        },
      }
    }
    case 'adjust-span': {
      return {
        ...state,
        layout: {
          ...layout,
          tiles: layout.tiles.map((t) =>
            t.id === action.tileId
              ? { ...t, span: clampSpan(t.span + action.delta, layout.columns) }
              : t,
          ),
        },
      }
    }
    case 'move-tile': {
      if (action.fromId === action.toId) return state
      const fromIdx = layout.tiles.findIndex((t) => t.id === action.fromId)
      const toIdx = layout.tiles.findIndex((t) => t.id === action.toId)
      if (fromIdx === -1 || toIdx === -1) return state
      const tiles = [...layout.tiles]
      const [moved] = tiles.splice(fromIdx, 1)
      tiles.splice(toIdx, 0, moved)
      return { ...state, layout: { ...layout, tiles } }
    }
    case 'adjust-columns': {
      const columns = Math.min(
        Math.max(MIN_COLUMNS, layout.columns + action.delta),
        MAX_COLUMNS,
      )
      if (columns === layout.columns) return state
      return {
        ...state,
        layout: {
          columns,
          tiles: layout.tiles.map((t) => ({ ...t, span: clampSpan(t.span, columns) })),
        },
      }
    }
    case 'apply': {
      return { layout: action.layout, activeName: action.activeName }
    }
    default:
      return state
  }
}

// ---------------------------------------------------------------------------
// Persistence (localStorage, Settings-panel pattern)
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'cc-workspace-layouts'

interface SpaceLayoutStore {
  /** Active named layout, null when on default. */
  active: string | null
  /** Current working copy (possibly unsaved edits) — survives reload. */
  working: SpaceLayout | null
  /** Named layouts. */
  layouts: Record<string, SpaceLayout>
}

type LayoutStorage = Record<string, SpaceLayoutStore>

function readStorage(): LayoutStorage {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

function writeStorage(storage: LayoutStorage): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storage))
  } catch (err) {
    console.error('[layoutModel] localStorage write failed:', err)
  }
}

function spaceStore(storage: LayoutStorage, spaceId: string): SpaceLayoutStore {
  const s = storage[spaceId]
  return {
    active: typeof s?.active === 'string' ? s.active : null,
    working: s?.working ?? null,
    layouts: typeof s?.layouts === 'object' && s?.layouts !== null ? s.layouts : {},
  }
}

/** Validate + clamp a stored layout; returns null when structurally unusable. */
export function sanitizeLayout(raw: unknown): SpaceLayout | null {
  if (typeof raw !== 'object' || raw === null) return null
  const candidate = raw as { columns?: unknown; tiles?: unknown }
  if (!Array.isArray(candidate.tiles)) return null
  const columns =
    typeof candidate.columns === 'number' && Number.isFinite(candidate.columns)
      ? Math.min(Math.max(MIN_COLUMNS, Math.round(candidate.columns)), MAX_COLUMNS)
      : 3
  const seen = new Set<string>()
  const tiles: TileLayout[] = []
  for (const t of candidate.tiles) {
    const entry = t as { id?: unknown; span?: unknown; minimized?: unknown }
    if (typeof entry?.id !== 'string' || entry.id === '' || seen.has(entry.id)) continue
    seen.add(entry.id)
    tiles.push({
      id: entry.id,
      span:
        typeof entry.span === 'number' && Number.isFinite(entry.span)
          ? clampSpan(entry.span, columns)
          : 1,
      minimized: entry.minimized === true,
    })
  }
  return { columns, tiles }
}

/** Saved layout names for a space, sorted. */
export function listLayoutNames(spaceId: string): string[] {
  return Object.keys(spaceStore(readStorage(), spaceId).layouts).sort()
}

export function loadLayoutByName(spaceId: string, name: string): SpaceLayout | null {
  return sanitizeLayout(spaceStore(readStorage(), spaceId).layouts[name])
}

export function saveLayout(spaceId: string, name: string, layout: SpaceLayout): void {
  const storage = readStorage()
  const store = spaceStore(storage, spaceId)
  store.layouts = { ...store.layouts, [name]: layout }
  store.active = name
  store.working = layout
  storage[spaceId] = store
  writeStorage(storage)
}

export function deleteLayout(spaceId: string, name: string): void {
  const storage = readStorage()
  const store = spaceStore(storage, spaceId)
  const { [name]: _removed, ...rest } = store.layouts
  store.layouts = rest
  if (store.active === name) {
    store.active = null
    store.working = null
  }
  storage[spaceId] = store
  writeStorage(storage)
}

/** Copy layout `from` to `to`; returns false when the source does not exist. */
export function duplicateLayout(spaceId: string, from: string, to: string): boolean {
  const source = loadLayoutByName(spaceId, from)
  if (!source) return false
  saveLayout(spaceId, to, source)
  return true
}

/** Persist the working copy + active name (called on every layout change). */
export function persistWorking(
  spaceId: string,
  layout: SpaceLayout,
  activeName: string | null,
): void {
  const storage = readStorage()
  const store = spaceStore(storage, spaceId)
  store.working = layout
  store.active = activeName
  storage[spaceId] = store
  writeStorage(storage)
}

/** Drop the working copy + active pointer (reset to default). */
export function clearWorking(spaceId: string): void {
  const storage = readStorage()
  const store = spaceStore(storage, spaceId)
  store.working = null
  store.active = null
  storage[spaceId] = store
  writeStorage(storage)
}

/**
 * Resolve the layout to mount with, in precedence order:
 *   1. `layout=<name>` hash param naming a saved layout for this space
 *   2. the persisted working copy (active layout + unsaved edits survive reload)
 *   3. the persisted active named layout
 *   4. the preset default
 */
export function resolveInitialLayout(
  space: PresetSpace,
  hashName: string | null,
): LayoutState {
  const fallback: LayoutState = { layout: defaultLayoutFor(space), activeName: null }
  let store: SpaceLayoutStore
  try {
    store = spaceStore(readStorage(), space.id)
  } catch {
    return fallback
  }

  if (hashName) {
    const named = sanitizeLayout(store.layouts[hashName])
    if (named) return { layout: named, activeName: hashName }
  }

  const working = sanitizeLayout(store.working)
  if (working) {
    const activeName =
      store.active && store.layouts[store.active] !== undefined ? store.active : null
    return { layout: working, activeName }
  }

  if (store.active) {
    const named = sanitizeLayout(store.layouts[store.active])
    if (named) return { layout: named, activeName: store.active }
  }

  return fallback
}

// ---------------------------------------------------------------------------
// URL hash param (`layout=<name>`) — follows the activeContext hash pattern
// ---------------------------------------------------------------------------

export const LAYOUT_PARAM_KEY = 'layout'

/** Read the `layout=<name>` hash param, if present. */
export function layoutNameFromHash(): string | null {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash || ''
  const body = hash.startsWith('#') ? hash.slice(1) : hash
  if (!body) return null
  for (const seg of body.split('&')) {
    const eq = seg.indexOf('=')
    if (eq === -1) continue
    const k = decodeURIComponent(seg.slice(0, eq))
    if (k !== LAYOUT_PARAM_KEY) continue
    const v = decodeURIComponent(seg.slice(eq + 1).replace(/\+/g, ' '))
    return v || null
  }
  return null
}

/** Write (or remove, when null) the `layout` hash param, preserving other params. */
export function writeLayoutNameToHash(name: string | null): void {
  if (typeof window === 'undefined') return
  const hash = window.location.hash || ''
  const body = hash.startsWith('#') ? hash.slice(1) : hash
  const segments = body ? body.split('&') : []
  const kept = segments.filter((seg) => {
    const eq = seg.indexOf('=')
    if (eq === -1) return seg !== ''
    return decodeURIComponent(seg.slice(0, eq)) !== LAYOUT_PARAM_KEY
  })
  if (name) {
    kept.push(`${LAYOUT_PARAM_KEY}=${encodeURIComponent(name)}`)
  }
  const next = kept.length > 0 ? `#${kept.join('&')}` : ''
  if (window.location.hash !== next) {
    window.location.hash = next
  }
}
