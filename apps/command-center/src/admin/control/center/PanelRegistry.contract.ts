/**
 * Liveness contract helpers without importing panel Components
 * (avoids map-renderer CSS in unit tests).
 */

import type { FC } from 'react'
import type { PanelProbeId } from './panelProbes'

export type PanelGroup = 'Workspace' | 'Substrate' | 'Engines' | 'Governance'

export interface PanelDef {
  id: string
  label: string
  group: PanelGroup
  Component: FC
  stub?: boolean
  local?: boolean
  probe?: PanelProbeId
  live?: boolean
}

/** WDLL 7 invariant: stub panels must not also declare a live probe / local. */
export function assertPanelLivenessContract(panels: PanelDef[]): string[] {
  const errors: string[] = []
  for (const p of panels) {
    if (p.stub && (p.probe || p.local || p.live)) {
      errors.push(`${p.id}: stub must not set probe/local/live`)
    }
    if (!p.stub && !p.local && !p.probe) {
      errors.push(`${p.id}: non-stub panel requires probe or local`)
    }
  }
  return errors
}
