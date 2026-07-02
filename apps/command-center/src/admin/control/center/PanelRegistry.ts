// apps/command-center/src/admin/control/center/PanelRegistry.ts
//
// The Spine Command Center panel registry. The shell (ControlCenterLayout /
// NavRail / useActivePanel) is driven entirely by PANELS — adding a panel here
// makes it appear in the nav rail and become routable via #panel=<id>.
//
// Phase 2 scope: the skeleton plus 3 live panels wired to OUR APIs (atom-inspector,
// run-monitor, surface-gate) and a live honest-empty calibration panel. The rest
// are registered as honest stubs for a later pass.

import React from 'react'
import { AtomInspector } from '../panels/AtomInspector'
import { RunMonitor } from '../panels/RunMonitor'
import { SurfaceGateInspector } from '../panels/SurfaceGateInspector'
import { CalibrationTracker } from '../panels/CalibrationTracker'
import { makeStub } from '../panels/StubPanel'

/** The three top-level groups of the substrate console, in display order. */
export type PanelGroup = 'Substrate' | 'Engines' | 'Governance'

export const PANEL_GROUPS: PanelGroup[] = ['Substrate', 'Engines', 'Governance']

/** A registered panel. `Component` is the inspector rendered in the center column. */
export interface PanelDef {
  /** Stable id; also the hash-route value (#panel=<id>). Used for links + persistence. */
  id: string
  /** Human label shown in the nav rail and inspector header. */
  label: string
  /** Which nav group this panel sits under. */
  group: PanelGroup
  /** The inspector component rendered in the center column. */
  Component: React.FC
  /** Wired to a live API. */
  live?: boolean
  /** Registered placeholder, not yet wired. */
  stub?: boolean
}

export const PANELS: PanelDef[] = [
  // Substrate
  { id: 'node-graph', label: 'Node & Graph', group: 'Substrate', stub: true,
    Component: makeStub('Node & Graph', 'retrieval-api /atoms/trace/:did graph traversal (uncapped)') },
  { id: 'atom-inspector', label: 'Atoms', group: 'Substrate', live: true, Component: AtomInspector },
  { id: 'calibration', label: 'Calibration', group: 'Substrate', live: true, Component: CalibrationTracker },
  { id: 'lineage-audit', label: 'Lineage & Audit', group: 'Substrate', stub: true,
    Component: makeStub('Lineage & Audit', 'retrieval-api atom lineage / supersession chain') },
  // Engines
  { id: 'resolver', label: 'Resolver', group: 'Engines', stub: true,
    Component: makeStub('Resolver', 'place/resolve + node resolution status') },
  { id: 'engine-console', label: 'Autonomous Engines', group: 'Engines', stub: true,
    Component: makeStub('Autonomous Engines', 'engine action-atom log + autonomy tiers') },
  { id: 'run-monitor', label: 'Runs', group: 'Engines', live: true, Component: RunMonitor },
  // Governance
  { id: 'surface-gate', label: 'Surface & Gate', group: 'Governance', live: true, Component: SurfaceGateInspector },
  { id: 'license-access', label: 'License & Access', group: 'Governance', stub: true,
    Component: makeStub('License & Access', 'atom accessPolicy ∩ license (most-restrictive-wins)') },
]

/** Default panel — open on a live panel, not a stub. */
export const DEFAULT_PANEL_ID = 'atom-inspector'

/** Lookup by id; falls back to the default panel. */
export function panelById(id: string | null | undefined): PanelDef {
  return PANELS.find((p) => p.id === id) ?? PANELS.find((p) => p.id === DEFAULT_PANEL_ID) ?? PANELS[0]
}
