// apps/command-center/src/admin/workspace/SpacePanel.tsx
//
// Native space panel — renders a workspace space's tiles DIRECTLY in the command
// center's own panel chrome, without the nested CortexShell (no inner spaces bar,
// no View/Edit mode toggles, no "Cortex Workspace" title). Each tile gets the
// theme from @empressaio/design-tokens, and layout editing lives behind a single
// compact "Edit layout" button styled like the command center's own controls.
//
// Edit mode (behind that button) provides per-tile controls — maximize/restore,
// minimize (header-only), remove, column-span widen/narrow, drag-to-reorder —
// plus an Add-tile picker over the tile registry and named layout persistence
// (save / load / duplicate / delete / reset) backed by localStorage per space.
// The working layout survives reload; a `layout=<name>` hash param selects a
// saved layout. Non-edit mode renders the preset default unchanged by default.

import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { CortexProvider } from '@empressaio/cortex-tiles'
import {
  SpatialProvider,
  CodeProvider,
  AnnotationSelectionProvider,
  DocumentViewerNavigationProvider,
} from '@empressaio/tile-shell'
import { cortexClient } from './cortexClient'
import { getTile, ALL_TILES, TILE_CATEGORIES } from './tileRegistry'
import {
  COMPONENT_LIBRARY,
  componentParamsFor,
  reportParamsFor,
  resolveTile,
} from './dynamicTiles'
import { useReportRegistry } from './reportRegistry'
import {
  COMPONENT_TILE_KIND,
  REPORT_TILE_KIND,
  MAX_COLUMNS,
  MIN_COLUMNS,
  clearWorking,
  defaultLayoutFor,
  deleteLayout,
  duplicateLayout,
  layoutNameFromHash,
  layoutReducer,
  listLayoutNames,
  loadLayoutByName,
  persistWorking,
  resolveInitialLayout,
  rowsFor,
  saveLayout,
  writeLayoutNameToHash,
} from './layoutModel'
import type { PresetSpace, TileDef } from '@empressaio/tile-shell'
import type { TileLayout } from './layoutModel'
import '@empressaio/design-tokens/tokens.css'

interface SpacePanelProps {
  space: PresetSpace
}

const editButtonStyle = (active: boolean): React.CSSProperties => ({
  padding: '4px 8px',
  fontSize: 11,
  fontFamily: 'var(--font-ui)',
  fontWeight: 500,
  color: active ? 'var(--color-text-info)' : 'var(--color-text-secondary)',
  background: active ? 'var(--color-background-info)' : 'transparent',
  border: '0.5px solid var(--color-border-secondary)',
  borderRadius: 4,
  cursor: 'pointer',
})

const toolButtonStyle: React.CSSProperties = {
  padding: '2px 6px',
  fontSize: 10,
  fontFamily: 'var(--font-ui)',
  fontWeight: 500,
  color: 'var(--color-text-secondary)',
  background: 'transparent',
  border: '0.5px solid var(--color-border-secondary)',
  borderRadius: 4,
  cursor: 'pointer',
  lineHeight: 1.4,
}

const toolbarInputStyle: React.CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 11,
  padding: '3px 8px',
  borderRadius: 4,
  color: 'var(--color-text-primary)',
  background: 'var(--color-background-secondary)',
  border: '0.5px solid var(--color-border-secondary)',
  width: 140,
}

/** Grouped picker section with a heading (This panel's tiles / All console tiles / Report library / Components). */
function PickerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={title} style={{ marginBottom: 10 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          fontFamily: 'var(--font-ui)',
          color: 'var(--color-text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: 6,
          paddingBottom: 2,
          borderBottom: '0.5px solid var(--color-border-tertiary)',
        }}
      >
        {title}
      </div>
      {children}
    </div>
  )
}

function PickerCategoryLabel({ text }: { text: string }) {
  return (
    <div
      style={{
        fontSize: 9,
        fontWeight: 600,
        fontFamily: 'var(--font-ui)',
        color: 'var(--color-text-tertiary)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: 4,
      }}
    >
      {text}
    </div>
  )
}

function PickerEmpty({ text }: { text: string }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontFamily: 'var(--font-ui)',
        color: 'var(--color-text-tertiary)',
      }}
    >
      {text}
    </span>
  )
}

/** Per-tile control cluster shown in tile headers while editing. */
function TileEditControls({
  tile,
  entry,
  columns,
  onMaximize,
  onMinimize,
  onRemove,
  onSpan,
}: {
  tile: TileDef
  entry: TileLayout
  columns: number
  onMaximize: () => void
  onMinimize: () => void
  onRemove: () => void
  onSpan: (delta: number) => void
}) {
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      <button
        type="button"
        style={toolButtonStyle}
        aria-label={`Narrow ${tile.label}`}
        title="Narrow (span −1)"
        disabled={entry.span <= 1}
        onClick={onSpan.bind(null, -1)}
      >
        ‹
      </button>
      <span
        style={{
          fontSize: 9,
          fontFamily: 'var(--font-mono, monospace)',
          color: 'var(--color-text-tertiary)',
        }}
      >
        {Math.min(entry.span, columns)}w
      </span>
      <button
        type="button"
        style={toolButtonStyle}
        aria-label={`Widen ${tile.label}`}
        title="Widen (span +1)"
        disabled={entry.span >= columns}
        onClick={onSpan.bind(null, 1)}
      >
        ›
      </button>
      <button
        type="button"
        style={toolButtonStyle}
        aria-label={entry.minimized ? `Restore ${tile.label}` : `Minimize ${tile.label}`}
        title={entry.minimized ? 'Restore content' : 'Minimize to header'}
        onClick={onMinimize}
      >
        {entry.minimized ? '▾' : '▴'}
      </button>
      <button
        type="button"
        style={toolButtonStyle}
        aria-label={`Maximize ${tile.label}`}
        title="Maximize to full workspace"
        onClick={onMaximize}
      >
        ⛶
      </button>
      <button
        type="button"
        style={toolButtonStyle}
        aria-label={`Remove ${tile.label}`}
        title="Remove tile"
        onClick={onRemove}
      >
        ×
      </button>
    </span>
  )
}

export function SpacePanel({ space }: SpacePanelProps) {
  const [editMode, setEditMode] = useState(false)
  const [state, dispatch] = useReducer(
    layoutReducer,
    space,
    (s: PresetSpace) => resolveInitialLayout(s, layoutNameFromHash()),
  )
  // Transient view state — never persisted.
  const [maximizedId, setMaximizedId] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [layoutName, setLayoutName] = useState('')
  const [savedNames, setSavedNames] = useState<string[]>(() => listLayoutNames(space.id))
  const draggingId = useRef<string | null>(null)

  const { layout, activeName } = state
  const defaultLayout = useMemo(() => defaultLayoutFor(space), [space])

  // The active layout (named or unsaved working copy) survives reload.
  useEffect(() => {
    persistWorking(space.id, layout, activeName)
  }, [space.id, layout, activeName])

  const refreshNames = () => setSavedNames(listLayoutNames(space.id))

  const handleApply = (nextLayout: typeof layout, nextName: string | null) => {
    dispatch({ type: 'apply', layout: nextLayout, activeName: nextName })
    setMaximizedId(null)
    writeLayoutNameToHash(nextName)
  }

  const handleLoad = (name: string) => {
    if (!name) {
      clearWorking(space.id)
      handleApply(defaultLayout, null)
      return
    }
    const named = loadLayoutByName(space.id, name)
    if (named) handleApply(named, name)
  }

  const handleSaveAs = () => {
    const name = layoutName.trim()
    if (!name) return
    saveLayout(space.id, name, layout)
    dispatch({ type: 'apply', layout, activeName: name })
    writeLayoutNameToHash(name)
    setLayoutName('')
    refreshNames()
  }

  const handleSave = () => {
    if (!activeName) return
    saveLayout(space.id, activeName, layout)
    refreshNames()
  }

  const handleDuplicate = () => {
    if (!activeName) return
    const copy = `${activeName} copy`
    if (duplicateLayout(space.id, activeName, copy)) {
      dispatch({ type: 'apply', layout, activeName: copy })
      writeLayoutNameToHash(copy)
      refreshNames()
    }
  }

  const handleDelete = () => {
    if (!activeName) return
    deleteLayout(space.id, activeName)
    handleApply(defaultLayout, null)
    refreshNames()
  }

  const handleReset = () => {
    clearWorking(space.id)
    handleApply(defaultLayout, null)
  }

  const maximizedEntry = maximizedId
    ? layout.tiles.find((t) => t.id === maximizedId)
    : undefined
  const maximizedTile = maximizedEntry ? resolveTile(maximizedEntry) : undefined

  // ---- Add-tile picker data (grouped sections + search) ----
  const registry = useReportRegistry(editMode && pickerOpen)
  const inLayout = (id: string) => layout.tiles.some((entry) => entry.id === id)
  const query = pickerSearch.trim().toLowerCase()
  const matches = (label: string, id?: string) =>
    query === '' ||
    label.toLowerCase().includes(query) ||
    (id !== undefined && id.toLowerCase().includes(query))

  const panelTiles = space.tiles
    .filter((id, idx) => space.tiles.indexOf(id) === idx && !inLayout(id))
    .map((id) => getTile(id))
    .filter((t): t is NonNullable<typeof t> => t !== undefined)
    .filter((t) => matches(t.label, t.id))
  const consoleTiles = ALL_TILES.filter((t) => !inLayout(t.id) && matches(t.label, t.id))
  const reportEntries = (registry.entries ?? []).filter(
    (e) => !inLayout(`report:${e.id}`) && matches(e.label, e.id),
  )
  const reportCategories = [...new Set(reportEntries.map((e) => e.category))]
  const componentEntries = COMPONENT_LIBRARY.filter(
    (c) => !inLayout(`component:${c.name}`) && matches(c.label, c.name),
  )

  return (
    <CortexProvider client={cortexClient}>
      {/* Full provider stack in CortexShell's order — tiles consume these contexts
          (useSpatial etc.); the dissolved shell used to mount them.
          NOTE: EngagementProvider is now mounted at the app root in main.tsx. */}
      <SpatialProvider>
      <CodeProvider>
      <AnnotationSelectionProvider>
      <DocumentViewerNavigationProvider>
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--color-background-primary)',
          }}
        >
          {/* Compact header with Edit layout button */}
          <div
            style={{
              flex: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              borderBottom: '0.5px solid var(--color-border-tertiary)',
              background: 'var(--color-background-secondary)',
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                fontFamily: 'var(--font-ui)',
                color: 'var(--color-text-primary)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {space.label}
              {activeName && (
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 10,
                    fontWeight: 500,
                    textTransform: 'none',
                    letterSpacing: 0,
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  · {activeName}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => {
                setEditMode(!editMode)
                setPickerOpen(false)
                setPickerSearch('')
              }}
              style={editButtonStyle(editMode)}
            >
              {editMode ? 'Done editing' : 'Edit layout'}
            </button>
          </div>

          {/* Edit toolbar — add tile + named layout persistence */}
          {editMode && (
            <div
              style={{
                flex: 'none',
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 6,
                padding: '6px 12px',
                borderBottom: '0.5px solid var(--color-border-tertiary)',
                background: 'var(--color-background-info)',
                fontSize: 11,
                fontFamily: 'var(--font-ui)',
                color: 'var(--color-text-info)',
              }}
            >
              <button
                type="button"
                style={{ ...toolButtonStyle, fontWeight: 600 }}
                aria-expanded={pickerOpen}
                onClick={() => setPickerOpen(!pickerOpen)}
              >
                {pickerOpen ? 'Close picker' : 'Add tile'}
              </button>

              <span aria-hidden="true" style={{ opacity: 0.4 }}>|</span>

              <button
                type="button"
                style={toolButtonStyle}
                aria-label="Fewer columns"
                title="Fewer columns"
                disabled={layout.columns <= MIN_COLUMNS}
                onClick={() => dispatch({ type: 'adjust-columns', delta: -1 })}
              >
                −
              </button>
              <span>{layout.columns} col</span>
              <button
                type="button"
                style={toolButtonStyle}
                aria-label="More columns"
                title="More columns"
                disabled={layout.columns >= MAX_COLUMNS}
                onClick={() => dispatch({ type: 'adjust-columns', delta: 1 })}
              >
                +
              </button>

              <span aria-hidden="true" style={{ opacity: 0.4 }}>|</span>

              <select
                aria-label="Saved layouts"
                style={{ ...toolbarInputStyle, width: 130 }}
                value={activeName ?? ''}
                onChange={(e) => handleLoad(e.target.value)}
              >
                <option value="">Default</option>
                {savedNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <input
                aria-label="Layout name"
                style={toolbarInputStyle}
                placeholder="Layout name"
                value={layoutName}
                onChange={(e) => setLayoutName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveAs()
                }}
              />
              <button
                type="button"
                style={toolButtonStyle}
                disabled={!layoutName.trim()}
                onClick={handleSaveAs}
              >
                Save as
              </button>
              <button
                type="button"
                style={toolButtonStyle}
                disabled={!activeName}
                onClick={handleSave}
              >
                Save
              </button>
              <button
                type="button"
                style={toolButtonStyle}
                disabled={!activeName}
                onClick={handleDuplicate}
              >
                Duplicate
              </button>
              <button
                type="button"
                style={toolButtonStyle}
                disabled={!activeName}
                onClick={handleDelete}
              >
                Delete
              </button>
              <button type="button" style={toolButtonStyle} onClick={handleReset}>
                Reset to default
              </button>
            </div>
          )}

          {/* Add-tile picker — grouped library sections, searchable by name */}
          {editMode && pickerOpen && (
            <div
              role="menu"
              aria-label="Add tile picker"
              style={{
                flex: 'none',
                maxHeight: 260,
                overflow: 'auto',
                padding: '8px 12px',
                borderBottom: '0.5px solid var(--color-border-tertiary)',
                background: 'var(--color-background-secondary)',
              }}
            >
              <input
                aria-label="Search tiles"
                style={{ ...toolbarInputStyle, width: 220, marginBottom: 8 }}
                placeholder="Search tiles, reports, components…"
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
              />

              {/* Section 1: this panel's preset tiles */}
              <PickerSection title="This panel's tiles">
                {panelTiles.length === 0 ? (
                  <PickerEmpty text="All of this panel's preset tiles are in the layout." />
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {panelTiles.map((tile) => (
                      <button
                        key={tile.id}
                        type="button"
                        style={toolButtonStyle}
                        aria-label={`Add ${tile.label} (preset)`}
                        onClick={() => dispatch({ type: 'add-tile', tileId: tile.id })}
                      >
                        {tile.label}
                        {tile.status !== 'live' ? ` (${tile.status})` : ''}
                      </button>
                    ))}
                  </div>
                )}
              </PickerSection>

              {/* Section 2: every console registry tile */}
              <PickerSection title="All console tiles">
                {consoleTiles.length === 0 ? (
                  <PickerEmpty text="All registry tiles are already in this layout." />
                ) : (
                  TILE_CATEGORIES.map((category) => {
                    const tiles = consoleTiles.filter((t) => t.category === category)
                    if (tiles.length === 0) return null
                    return (
                      <div key={category} style={{ marginBottom: 8 }}>
                        <PickerCategoryLabel text={category} />
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {tiles.map((tile) => (
                            <button
                              key={tile.id}
                              type="button"
                              style={toolButtonStyle}
                              aria-label={`Add ${tile.label}`}
                              onClick={() =>
                                dispatch({ type: 'add-tile', tileId: tile.id })
                              }
                            >
                              {tile.label}
                              {tile.status !== 'live' ? ` (${tile.status})` : ''}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })
                )}
              </PickerSection>

              {/* Section 3: cortex report/capability registry (live-fetched) */}
              <PickerSection title="Report library">
                {registry.status === 'loading' || registry.status === 'idle' ? (
                  <PickerEmpty text="Loading report library from cortex…" />
                ) : registry.status === 'error' ? (
                  <div
                    role="alert"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 11,
                      fontFamily: 'var(--font-ui)',
                      color: 'var(--color-text-warning, #f59e0b)',
                    }}
                  >
                    <span>
                      Report library unreachable — {registry.error ?? 'fetch failed'}
                    </span>
                    <button
                      type="button"
                      style={toolButtonStyle}
                      aria-label="Retry report library"
                      onClick={registry.retry}
                    >
                      Retry
                    </button>
                  </div>
                ) : reportEntries.length === 0 ? (
                  <PickerEmpty text="No matching report capabilities (or all are already in this layout)." />
                ) : (
                  reportCategories.map((category) => {
                    const entries = reportEntries.filter((e) => e.category === category)
                    return (
                      <div key={category} style={{ marginBottom: 8 }}>
                        <PickerCategoryLabel text={category} />
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {entries.map((cap) => (
                            <button
                              key={cap.id}
                              type="button"
                              style={toolButtonStyle}
                              aria-label={`Add report ${cap.label}`}
                              title={cap.degradedReason ?? cap.id}
                              onClick={() =>
                                dispatch({
                                  type: 'add-tile',
                                  tileId: REPORT_TILE_KIND,
                                  params: reportParamsFor(cap),
                                })
                              }
                            >
                              {cap.label}
                              {cap.status !== 'live' ? ` (${cap.status})` : ''}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })
                )}
              </PickerSection>

              {/* Section 4: published @empressaio/cortex-tiles components */}
              <PickerSection title="Components">
                {componentEntries.length === 0 ? (
                  <PickerEmpty text="No matching components (or all are already in this layout)." />
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {componentEntries.map((c) => (
                      <button
                        key={c.name}
                        type="button"
                        style={toolButtonStyle}
                        aria-label={`Add component ${c.name}`}
                        onClick={() =>
                          dispatch({
                            type: 'add-tile',
                            tileId: COMPONENT_TILE_KIND,
                            params: componentParamsFor(c),
                          })
                        }
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                )}
              </PickerSection>
            </div>
          )}

          {/* Maximized tile — fills the workspace with a restore affordance */}
          {maximizedEntry && maximizedTile ? (
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                padding: 12,
              }}
            >
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  background: 'var(--color-background-secondary)',
                  border: '0.5px solid var(--color-border-tertiary)',
                  borderRadius: 6,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    flex: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    borderBottom: '0.5px solid var(--color-border-tertiary)',
                    background: 'var(--color-background-tertiary)',
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      fontFamily: 'var(--font-ui)',
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    {maximizedTile.label}
                  </span>
                  <button
                    type="button"
                    style={toolButtonStyle}
                    aria-label="Restore layout"
                    onClick={() => setMaximizedId(null)}
                  >
                    Restore layout
                  </button>
                </div>
                <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                  {maximizedTile.el()}
                </div>
              </div>
            </div>
          ) : (
            /* Tile grid — native command center styling */
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'grid',
                gridTemplateColumns: `repeat(${layout.columns}, 1fr)`,
                gridTemplateRows: `repeat(${rowsFor(layout)}, 1fr)`,
                gridAutoRows: 'minmax(0, 1fr)',
                gap: 12,
                padding: 12,
                overflow: 'auto',
              }}
            >
              {layout.tiles.map((entry) => {
                const tile = resolveTile(entry)
                if (!tile) return null

                return (
                  <div
                    key={entry.id}
                    draggable={editMode}
                    onDragStart={() => {
                      draggingId.current = entry.id
                    }}
                    onDragOver={(e) => {
                      if (editMode && draggingId.current) e.preventDefault()
                    }}
                    onDrop={() => {
                      if (editMode && draggingId.current) {
                        dispatch({
                          type: 'move-tile',
                          fromId: draggingId.current,
                          toId: entry.id,
                        })
                      }
                      draggingId.current = null
                    }}
                    onDragEnd={() => {
                      draggingId.current = null
                    }}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      minHeight: 0,
                      gridColumn: `span ${Math.min(entry.span, layout.columns)}`,
                      alignSelf: entry.minimized ? 'start' : 'stretch',
                      background: 'var(--color-background-secondary)',
                      border: '0.5px solid var(--color-border-tertiary)',
                      borderRadius: 6,
                      overflow: 'hidden',
                      cursor: editMode ? 'grab' : undefined,
                    }}
                  >
                    {/* Tile header */}
                    <div
                      style={{
                        flex: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 10px',
                        borderBottom: entry.minimized
                          ? 'none'
                          : '0.5px solid var(--color-border-tertiary)',
                        background: 'var(--color-background-tertiary)',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          fontFamily: 'var(--font-ui)',
                          color: 'var(--color-text-primary)',
                        }}
                      >
                        {tile.label}
                      </span>
                      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        {tile.status !== 'live' && (
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 600,
                              fontFamily: 'var(--font-ui)',
                              color:
                                tile.status === 'degraded'
                                  ? 'var(--color-text-warning)'
                                  : 'var(--color-text-tertiary)',
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                            }}
                          >
                            {tile.status}
                          </span>
                        )}
                        {editMode && (
                          <TileEditControls
                            tile={tile}
                            entry={entry}
                            columns={layout.columns}
                            onMaximize={() => setMaximizedId(entry.id)}
                            onMinimize={() =>
                              dispatch({ type: 'toggle-minimize', tileId: entry.id })
                            }
                            onRemove={() =>
                              dispatch({ type: 'remove-tile', tileId: entry.id })
                            }
                            onSpan={(delta) =>
                              dispatch({ type: 'adjust-span', tileId: entry.id, delta })
                            }
                          />
                        )}
                      </span>
                    </div>

                    {/* Tile content (hidden while minimized) */}
                    {!entry.minimized && (
                      <div
                        style={{
                          flex: 1,
                          minHeight: 0,
                          overflow: 'auto',
                        }}
                      >
                        {tile.el()}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </DocumentViewerNavigationProvider>
      </AnnotationSelectionProvider>
      </CodeProvider>
      </SpatialProvider>
    </CortexProvider>
  )
}
