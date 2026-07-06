// apps/command-center/src/admin/workspace/presets.ts
//
// The five preset workspace spaces: Plan Review, Site Analysis, Property Intel,
// Design Accelerator, and Print View. Restored to match the original ldt presets
// exactly, with CONTRACT tile IDs (not the renamed versions).

import type { PresetSpace } from '@empressaio/tile-shell'

export const PRESET_SPACES: PresetSpace[] = [
  {
    id: 'plan-review',
    label: 'Plan Review',
    tiles: [
      'intake',
      'intake-queue',
      'document-viewer',
      'compliance-run',
      'letter',
      'map',
    ],
    layoutId: '3x2',
  },
  {
    id: 'site-analysis',
    label: 'Site Analysis',
    tiles: ['map', 'topography', 'drainage', 'hydrology', 'subsurface'],
    layoutId: '3x2',
  },
  {
    id: 'property-intel',
    label: 'Property Intel',
    tiles: ['property-brief', 'hazard', 'encumbrances', 'setbacks'],
    layoutId: '2x2',
  },
  {
    id: 'design-accelerator',
    label: 'Design Accelerator',
    tiles: ['sheet-extraction', 'response-tasks', 'product-spec'],
    layoutId: '2x2',
  },
  {
    id: 'print-view',
    label: 'Print View',
    tiles: ['compliance-run', 'letter'],
    layoutId: '2x1',
  },
]
