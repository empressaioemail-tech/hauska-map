// apps/command-center/src/admin/control/center/PanelRegistry.ts
//
// The Spine Command Center panel registry. The shell (ControlCenterLayout /
// NavRail / useActivePanel) is driven entirely by PANELS — adding a panel here
// makes it appear in the nav rail and become routable via #panel=<id>.
//
// F1c / WDLL 7: LIVE/STUB badges are COMPUTED from panelProbes at runtime.
// `stub` / `local` / `probe` declare intent; NavRail never trusts a bare
// `live: true` flag alone (fixture-LIVE is forbidden).

import React from 'react'
import { AtomInspector } from '../panels/AtomInspector'
import { RunMonitor } from '../panels/RunMonitor'
import { SurfaceGateInspector } from '../panels/SurfaceGateInspector'
import { CalibrationTracker } from '../panels/CalibrationTracker'
import { McpInspector } from '../panels/McpInspector'
import { AgentView } from '../panels/AgentView'
import { LayerRegistryView } from '../panels/LayerRegistryView'
import { ParcelTrace } from '../panels/ParcelTrace'
import { NodeGraph } from '../panels/NodeGraph'
import { Settings } from '../panels/Settings'
import { RevenueMeter } from '../panels/RevenueMeter'
import { SpineHealth } from '../panels/SpineHealth'
import { makeStub } from '../panels/StubPanel'
import {
  PlanReviewSpace,
  SiteAnalysisSpace,
  PropertyIntelSpace,
  DesignAcceleratorSpace,
  LensReviewerSpace,
  LensInvestorSpace,
  LensArchitectSpace,
} from '../../workspace/spaces'
import {
  assertPanelLivenessContract,
  type PanelDef,
  type PanelGroup,
} from './PanelRegistry.contract'

export type { PanelDef, PanelGroup }
export { assertPanelLivenessContract }
export const PANEL_GROUPS: PanelGroup[] = ['Workspace', 'Substrate', 'Engines', 'Governance']

export const PANELS: PanelDef[] = [
  // Workspace — cortex coverage is the shared browse signal
  { id: 'plan-review', label: 'Plan Review', group: 'Workspace', probe: 'cortex-coverage', Component: PlanReviewSpace },
  { id: 'site-analysis', label: 'Site Analysis', group: 'Workspace', probe: 'cortex-coverage', Component: SiteAnalysisSpace },
  { id: 'property-intel', label: 'Property Intel', group: 'Workspace', probe: 'cortex-coverage', Component: PropertyIntelSpace },
  { id: 'design-accelerator', label: 'Design Accelerator', group: 'Workspace', probe: 'cortex-coverage', Component: DesignAcceleratorSpace },
  { id: 'lens-reviewer', label: 'Plan Reviewer', group: 'Workspace', probe: 'cortex-coverage', Component: LensReviewerSpace },
  { id: 'lens-investor', label: 'Property Investor', group: 'Workspace', probe: 'cortex-coverage', Component: LensInvestorSpace },
  { id: 'lens-architect', label: 'Architect', group: 'Workspace', probe: 'cortex-coverage', Component: LensArchitectSpace },
  // Substrate
  { id: 'node-graph', label: 'Node & Graph', group: 'Substrate', probe: 'retrieval-atom-chain', Component: NodeGraph },
  { id: 'spine-health', label: 'Spine Health', group: 'Substrate', probe: 'retrieval-spine-health', Component: SpineHealth },
  { id: 'atom-inspector', label: 'Atoms', group: 'Substrate', probe: 'mcp-introspection', Component: AtomInspector },
  { id: 'parcel-trace', label: 'Parcel Trace', group: 'Substrate', probe: 'retrieval-healthz', Component: ParcelTrace },
  { id: 'mcp-inspector', label: 'MCP Tools', group: 'Substrate', probe: 'mcp-introspection', Component: McpInspector },
  { id: 'layer-registry', label: 'GIS Layers', group: 'Substrate', probe: 'cortex-coverage', Component: LayerRegistryView },
  // Fixture zeros are not a live probe — honest STUB until a real calibration endpoint.
  { id: 'calibration', label: 'Calibration', group: 'Substrate', stub: true, Component: CalibrationTracker },
  { id: 'lineage-audit', label: 'Lineage & Audit', group: 'Substrate', stub: true,
    Component: makeStub('Lineage & Audit', 'retrieval-api atom lineage / supersession chain') },
  // Engines
  { id: 'resolver', label: 'Resolver', group: 'Engines', stub: true,
    Component: makeStub('Resolver', 'place/resolve + node resolution status') },
  { id: 'engine-console', label: 'Autonomous Engines', group: 'Engines', stub: true,
    Component: makeStub('Autonomous Engines', 'engine action-atom log + autonomy tiers') },
  { id: 'run-monitor', label: 'Runs', group: 'Engines', probe: 'cortex-coverage', Component: RunMonitor },
  { id: 'agent-view', label: 'Agent Surface', group: 'Engines', probe: 'mcp-introspection', Component: AgentView },
  // Governance
  { id: 'surface-gate', label: 'Surface & Gate', group: 'Governance', probe: 'mcp-introspection', Component: SurfaceGateInspector },
  { id: 'revenue-meter', label: 'Revenue Meter', group: 'Governance', probe: 'mcp-metering', Component: RevenueMeter },
  { id: 'settings', label: 'Settings', group: 'Governance', local: true, Component: Settings },
  { id: 'license-access', label: 'License & Access', group: 'Governance', stub: true,
    Component: makeStub('License & Access', 'atom accessPolicy ∩ license (most-restrictive-wins)') },
]

export const DEFAULT_PANEL_ID = 'plan-review'

/** Lookup by id; falls back to the default panel. */
export function panelById(id: string | null | undefined): PanelDef {
  return PANELS.find((p) => p.id === id) ?? PANELS.find((p) => p.id === DEFAULT_PANEL_ID) ?? PANELS[0]
}
