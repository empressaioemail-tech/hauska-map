// apps/command-center/src/admin/control/center/NavRail.tsx
//
// The persistent LEFT nav rail of the Command Center. Lists every registered
// panel grouped Substrate / Engines / Governance, highlights the active panel,
// and stays fixed (its own scroll) so it is never scrolled away with the
// inspector. F1c: badges are COMPUTED from usePanelHealth (WDLL 7).

import React from 'react'
import { PANELS, PANEL_GROUPS, type PanelGroup, type PanelDef } from './PanelRegistry'
import { sectionHeader, Pill } from '../primitives'
import { usePanelHealth } from './usePanelHealth'
import type { PanelBadge } from './panelProbes'

const panelsByGroup = (group: PanelGroup): PanelDef[] => PANELS.filter((p) => p.group === group)

function BadgePill({ badge }: { badge: PanelBadge }) {
  if (badge === 'stub') return <Pill sev="info">stub</Pill>
  if (badge === 'live') return <Pill sev="ok">live</Pill>
  if (badge === 'degraded') return <Pill sev="danger">degraded</Pill>
  return <Pill sev="warn">…</Pill>
}

const NavItem: React.FC<{
  panel: PanelDef
  active: boolean
  badge: PanelBadge
  onSelect: (id: string) => void
}> = ({ panel, active, badge, onSelect }) => (
  <button
    type="button"
    onClick={() => onSelect(panel.id)}
    aria-current={active ? 'page' : undefined}
    title={`${panel.label} (${badge})`}
    data-testid={`nav-panel-${panel.id}`}
    data-badge={badge}
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
    <BadgePill badge={badge} />
  </button>
)

export const NavRail: React.FC<{ active: string; onSelect: (id: string) => void }> = ({ active, onSelect }) => {
  const { badgeFor } = usePanelHealth()

  return (
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
                <NavItem
                  key={panel.id}
                  panel={panel}
                  active={panel.id === active}
                  badge={badgeFor(panel)}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </nav>
  )
}
