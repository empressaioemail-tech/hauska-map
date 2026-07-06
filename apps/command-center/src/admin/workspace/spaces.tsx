// apps/command-center/src/admin/workspace/spaces.tsx
//
// The four workspace space panels: Plan Review, Site Analysis, Property Intel,
// and Design Accelerator. Each renders a native SpacePanel with its preset
// configuration — NO nested CortexShell, NO inner spaces bar, NO View/Edit chrome.
// The tiles render directly in the command center's own panel style.

import React from 'react'
import { SpacePanel } from './SpacePanel'
import { PRESET_SPACES } from './presets'

export function PlanReviewSpace() {
  const space = PRESET_SPACES.find((s) => s.id === 'plan-review')!
  return <SpacePanel space={space} />
}

export function SiteAnalysisSpace() {
  const space = PRESET_SPACES.find((s) => s.id === 'site-analysis')!
  return <SpacePanel space={space} />
}

export function PropertyIntelSpace() {
  const space = PRESET_SPACES.find((s) => s.id === 'property-intel')!
  return <SpacePanel space={space} />
}

export function DesignAcceleratorSpace() {
  const space = PRESET_SPACES.find((s) => s.id === 'design-accelerator')!
  return <SpacePanel space={space} />
}
