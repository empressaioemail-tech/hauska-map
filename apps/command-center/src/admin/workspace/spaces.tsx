// apps/command-center/src/admin/workspace/spaces.tsx
//
// The four workspace space panels: Plan Review, Site Analysis, Property Intel,
// and Design Accelerator. Each is a thin wrapper around WorkspacePanel that
// passes the preset id.

import React from 'react'
import { WorkspacePanel } from './WorkspacePanel'

export function PlanReviewSpace() {
  return <WorkspacePanel initialPresetId="plan-review" />
}

export function SiteAnalysisSpace() {
  return <WorkspacePanel initialPresetId="site-analysis" />
}

export function PropertyIntelSpace() {
  return <WorkspacePanel initialPresetId="property-intel" />
}

export function DesignAcceleratorSpace() {
  return <WorkspacePanel initialPresetId="design-accelerator" />
}
