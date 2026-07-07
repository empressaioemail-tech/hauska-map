// apps/command-center/src/admin/workspace/SpacePanel.tsx
//
// Native space panel — renders a workspace space's tiles DIRECTLY in the command
// center's own panel chrome, without the nested CortexShell (no inner spaces bar,
// no View/Edit mode toggles, no "Cortex Workspace" title). Each tile gets the
// theme from @empressaio/design-tokens, and layout editing lives behind a single
// compact "Edit layout" button styled like the command center's own controls.

import React, { useState } from 'react'
import { CortexProvider } from '@empressaio/cortex-tiles'
import {
  SpatialProvider,
  CodeProvider,
  AnnotationSelectionProvider,
  DocumentViewerNavigationProvider,
} from '@empressaio/tile-shell'
import { cortexClient } from './cortexClient'
import { getTile } from './tileRegistry'
import type { PresetSpace } from '@empressaio/tile-shell'
import '@empressaio/design-tokens/tokens.css'

interface SpacePanelProps {
  space: PresetSpace
}

interface LayoutConfig {
  columns: number
  rows: number
}

const LAYOUT_CONFIGS: Record<string, LayoutConfig> = {
  '2x1': { columns: 2, rows: 1 },
  '2x2': { columns: 2, rows: 2 },
  '3x2': { columns: 3, rows: 2 },
}

export function SpacePanel({ space }: SpacePanelProps) {
  const [editMode, setEditMode] = useState(false)
  const layout = LAYOUT_CONFIGS[space.layoutId] || { columns: 3, rows: 2 }

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
            </span>
            <button
              type="button"
              onClick={() => setEditMode(!editMode)}
              style={{
                padding: '4px 8px',
                fontSize: 11,
                fontFamily: 'var(--font-ui)',
                fontWeight: 500,
                color: editMode ? 'var(--color-text-info)' : 'var(--color-text-secondary)',
                background: editMode ? 'var(--color-background-info)' : 'transparent',
                border: '0.5px solid var(--color-border-secondary)',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              {editMode ? 'Done editing' : 'Edit layout'}
            </button>
          </div>

          {/* Tile grid — native command center styling */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'grid',
              gridTemplateColumns: `repeat(${layout.columns}, 1fr)`,
              gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
              gap: 12,
              padding: 12,
            }}
          >
            {space.tiles.map((tileId) => {
              const tile = getTile(tileId)
              if (!tile) return null

              return (
                <div
                  key={tileId}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: 0,
                    background: 'var(--color-background-secondary)',
                    border: '0.5px solid var(--color-border-tertiary)',
                    borderRadius: 6,
                    overflow: 'hidden',
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
                      {tile.label}
                    </span>
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
                  </div>

                  {/* Tile content */}
                  <div
                    style={{
                      flex: 1,
                      minHeight: 0,
                      overflow: 'auto',
                    }}
                  >
                    {tile.el()}
                  </div>
                </div>
              )
            })}
          </div>

          {editMode && (
            <div
              style={{
                flex: 'none',
                padding: '8px 12px',
                borderTop: '0.5px solid var(--color-border-tertiary)',
                background: 'var(--color-background-info)',
                fontSize: 11,
                fontFamily: 'var(--font-ui)',
                color: 'var(--color-text-info)',
              }}
            >
              Edit mode: tile add/remove and layout persistence coming soon
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
