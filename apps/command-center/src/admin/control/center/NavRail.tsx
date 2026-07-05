// apps/command-center/src/admin/control/center/NavRail.tsx
//
// The persistent LEFT nav rail of the Command Center. Lists every registered
// panel grouped Substrate / Engines / Governance, highlights the active panel,
// and stays fixed (its own scroll) so it is never scrolled away with the
// inspector. Function-first, all-token styling.
//
// Ported from the trading Control Tower (backend-agnostic).

import React from 'react'
import { PANELS, PANEL_GROUPS, type PanelGroup, type PanelDef } from './PanelRegistry'
import { sectionHeader, Pill } from '../primitives'

const panelsByGroup = (group: PanelGroup): PanelDef[] => PANELS.filter((p) => p.group === group)

const NavItem: React.FC<{ panel: PanelDef; active: boolean; onSelect: (id: string) => void }> = ({
  panel,
  active,
  onSelect,
}) => (
  <button
    type="button"
    onClick={() => onSelect(panel.id)}
    aria-current={active ? 'page' : undefined}
    title={panel.label}
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 6,
      width: '100%',
      textAlign: 'left',
      padding: '6px 10px',
      borderRadius: 6,
      border: '0.5px solid transparent',
      borderLeft: active ? '2px solid var(--color-text-info)' : '2px solid transparent',
      background: active ? 'var(--color-background-info)' : 'transparent',
      color: active ? 'var(--color-text-info)' : 'var(--color-text-secondary)',
      fontFamily: 'var(--font-ui)',
      fontSize: 12,
      fontWeight: active ? 600 : 500,
      letterSpacing: '0.01em',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      cursor: 'pointer',
    }}
  >
    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{panel.label}</span>
    {panel.stub ? <Pill sev="info">stub</Pill> : panel.live ? <Pill sev="ok">live</Pill> : null}
  </button>
)

export const NavRail: React.FC<{ active: string; onSelect: (id: string) => void }> = ({ active, onSelect }) => (
  <nav
    aria-label="Command Center panels"
    style={{
      flex: 'none',
      width: 208,
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
      borderRight: '0.5px solid var(--color-border-tertiary)',
      background: 'var(--color-background-secondary)',
    }}
  >
    <div style={{ flex: 'none', padding: '12px 12px 8px' }}>
      <span style={{ ...sectionHeader, fontSize: 10, color: 'var(--color-text-tertiary)' }}>Command Center</span>
    </div>
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 8px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {PANEL_GROUPS.map((group) => (
        <div key={group} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ ...sectionHeader, padding: '0 6px 2px' }}>
            {group === 'Workspace' ? 'Cortex Workspace' : group}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {panelsByGroup(group).map((panel) => (
              <NavItem key={panel.id} panel={panel} active={panel.id === active} onSelect={onSelect} />
            ))}
          </div>
        </div>
      ))}
    </div>
  </nav>
)

export default NavRail
