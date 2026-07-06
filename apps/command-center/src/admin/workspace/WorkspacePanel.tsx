// apps/command-center/src/admin/workspace/WorkspacePanel.tsx
//
// Workspace panel shell — wraps the published CortexShell with the command
// center's tile registry, cortex client, presets, and saved-space persistence.
// Each preset space (Plan Review, Site Analysis, etc.) renders an instance of
// this shell with `initialPresetId` set.

import React from 'react'
import { CortexShell, EngagementProvider } from '@empressaio/tile-shell'
import { CortexProvider } from '@empressaio/cortex-tiles'
import { cortexClient } from './cortexClient'
import { ALL_TILES, TILE_CATEGORIES, getTile } from './tileRegistry'
import { PRESET_SPACES } from './presets'
import { savedSpacesApi } from './savedSpaces'
import '@empressaio/tile-shell/index.css'
import '@empressaio/design-tokens/tokens.css'

export function WorkspacePanel({ initialPresetId }: { initialPresetId: string }) {
  const fetchAdminFunctions = async () => {
    // The tile-shell expects an admin-functions live-status array; we stub it
    // here since the command center does not expose the cortex admin panel yet.
    return []
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <CortexProvider client={cortexClient}>
        <EngagementProvider>
          <CortexShell
            initialPresetId={initialPresetId}
            getTile={getTile}
            allTiles={ALL_TILES}
            categories={TILE_CATEGORIES}
            presets={PRESET_SPACES}
            fetchAdminFunctions={fetchAdminFunctions}
            savedSpaces={savedSpacesApi}
          />
        </EngagementProvider>
      </CortexProvider>
    </div>
  )
}
