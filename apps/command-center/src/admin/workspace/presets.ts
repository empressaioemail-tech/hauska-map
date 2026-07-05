// apps/command-center/src/admin/workspace/presets.ts
//
// The four preset workspace spaces ratified by the operator for the ICC
// walkthrough: Plan Review (queue + case detail), Site Analysis (map + terrain
// profiles), Property Intel (brief + hazards + encumbrances + setbacks), and
// Design Accelerator (sheets + tasks + specs). Layout presets match the
// reference implementation in legacy-design-tools.

import type { PresetSpace } from '@hauska/tile-shell'

export const PRESET_SPACES: PresetSpace[] = [
  {
    id: 'plan-review',
    label: 'Plan Review',
    tiles: ['intake-queue', 'intake', 'findings-library', 'document-parsing'],
    layoutId: '2x2',
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
    tiles: ['property-brief', 'hazard-profile', 'encumbrances', 'local-setbacks'],
    layoutId: '2x2',
  },
  {
    id: 'design-accelerator',
    label: 'Design Accelerator',
    tiles: ['sheet-extraction', 'response-tasks', 'product-spec-reference'],
    layoutId: '2x2',
  },
]
