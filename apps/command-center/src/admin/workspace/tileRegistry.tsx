// apps/command-center/src/admin/workspace/tileRegistry.tsx
//
// The command center's cortex tile registry. Mirrors the published tile set
// (@hauska/cortex-tiles 0.1.0) and marks graceful gaps where a tile landed
// after the 0.1.0 cut (e.g. Dataroom). Every tile's React element is imported
// from the published package; the registry wires their `el` factory, capability
// flags, and status.

import React from 'react'
import type { TileDef, TileCategory } from '@hauska/tile-shell'
import {
  IntakeQueueTile,
  IntakeTile,
  FindingsLibraryTile,
  MapTile,
  TopographyTile,
  DrainageTile,
  HydrologyTile,
  SubsurfaceTile,
  PropertyBriefTile,
  HazardProfileTile,
  EncumbranceTile,
  LocalSetbacksTile,
  SheetExtractionTile,
  ResponseTasksTile,
  DocumentParsingTile,
  ProductSpecReferenceTile,
} from '@hauska/cortex-tiles'

function GapStubTile({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--h-text-muted, #768390)',
        fontSize: 12,
        fontFamily: 'var(--font-ui)',
      }}
    >
      {label} — available in the next package release
    </div>
  )
}

/** All tiles the command center knows about (union of live + gaps). */
export const ALL_TILES: TileDef[] = [
  // Compliance (Plan Review)
  {
    id: 'intake-queue',
    label: 'Intake Queue',
    category: 'Compliance',
    status: 'live',
    el: () => <IntakeQueueTile />,
  },
  {
    id: 'intake',
    label: 'Intake',
    category: 'Compliance',
    status: 'live',
    el: () => <IntakeTile />,
  },
  {
    id: 'findings-library',
    label: 'Findings Library',
    category: 'Compliance',
    status: 'live',
    el: () => <FindingsLibraryTile />,
  },
  {
    id: 'document-parsing',
    label: 'Document Parsing',
    category: 'Compliance',
    status: 'live',
    el: () => <DocumentParsingTile />,
  },
  {
    id: 'dataroom',
    label: 'Dataroom',
    category: 'Compliance',
    status: 'planned',
    degradedReason: 'available in @hauska/cortex-tiles 0.1.1',
    el: () => <GapStubTile label="Dataroom" />,
  },

  // Site Analysis
  {
    id: 'map',
    label: 'Map',
    category: 'Site Analysis',
    status: 'live',
    el: () => <MapTile />,
  },
  {
    id: 'topography',
    label: 'Topography',
    category: 'Site Analysis',
    status: 'live',
    el: () => <TopographyTile />,
  },
  {
    id: 'drainage',
    label: 'Drainage',
    category: 'Site Analysis',
    status: 'live',
    el: () => <DrainageTile />,
  },
  {
    id: 'hydrology',
    label: 'Hydrology',
    category: 'Site Analysis',
    status: 'live',
    el: () => <HydrologyTile />,
  },
  {
    id: 'subsurface',
    label: 'Subsurface',
    category: 'Site Analysis',
    status: 'live',
    el: () => <SubsurfaceTile />,
  },

  // Property Intel
  {
    id: 'property-brief',
    label: 'Property Brief',
    category: 'Property Intel',
    status: 'live',
    el: () => <PropertyBriefTile />,
  },
  {
    id: 'hazard-profile',
    label: 'Hazard Profile',
    category: 'Property Intel',
    status: 'live',
    el: () => <HazardProfileTile />,
  },
  {
    id: 'encumbrances',
    label: 'Encumbrances',
    category: 'Property Intel',
    status: 'live',
    el: () => <EncumbranceTile />,
  },
  {
    id: 'local-setbacks',
    label: 'Local Setbacks',
    category: 'Property Intel',
    status: 'live',
    el: () => <LocalSetbacksTile />,
  },

  // Design Accelerator
  {
    id: 'sheet-extraction',
    label: 'Sheet Extraction',
    category: 'Design Accelerator',
    status: 'live',
    el: () => <SheetExtractionTile />,
  },
  {
    id: 'response-tasks',
    label: 'Response Tasks',
    category: 'Design Accelerator',
    status: 'live',
    el: () => <ResponseTasksTile />,
  },
  {
    id: 'product-spec-reference',
    label: 'Product Spec Reference',
    category: 'Design Accelerator',
    status: 'live',
    el: () => <ProductSpecReferenceTile />,
  },
]

export const TILE_CATEGORIES: readonly TileCategory[] = [
  'Compliance',
  'Site Analysis',
  'Property Intel',
  'Design Accelerator',
  'Deliverable',
  'Market',
]

/** Fast id → tile lookup. */
export function getTile(id: string): TileDef | undefined {
  return ALL_TILES.find((t) => t.id === id)
}
