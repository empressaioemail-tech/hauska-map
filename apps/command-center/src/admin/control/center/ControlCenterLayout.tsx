// apps/command-center/src/admin/control/center/ControlCenterLayout.tsx
//
// The Spine Command Center — the operator console's 3-column shell:
//
//   [ NavRail ]   [ active inspector (center) ]   [ StateLegend ]
//
// The center column renders the panel selected in the nav rail (driven by the
// PanelRegistry + the #panel= hash route). The nav rail (left) and the state
// legend (right) are persistent and scroll independently; only the center
// inspector changes. The active panel persists across reload and is linkable.
//
// Ported from the trading Control Tower (backend-agnostic).

import React from 'react'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import { panelById } from './PanelRegistry'
import { PanelProvider, useActivePanel } from './useActivePanel'
import { NavRail } from './NavRail'
import { StateLegend } from './StateLegend'

const ControlCenterShell: React.FC = () => {
  const [activeId, setActive] = useActivePanel()
  const panel = panelById(activeId)
  const Inspector = panel.Component

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', background: 'var(--color-background-primary)' }}>
      <NavRail active={panel.id} onSelect={setActive} />

      {/* Center inspector. Padded so each panel's own bordered Panel shell breathes. */}
      <main style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', padding: 14 }}>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {/* Re-key on panel id so a thrown panel resets its boundary on navigation. */}
          <ErrorBoundary key={panel.id} tabName={`cc/${panel.id}`}>
            <Inspector />
          </ErrorBoundary>
        </div>
      </main>

      <StateLegend />
    </div>
  )
}

export const ControlCenterLayout: React.FC = () => (
  <PanelProvider>
    <ControlCenterShell />
  </PanelProvider>
)

export default ControlCenterLayout
