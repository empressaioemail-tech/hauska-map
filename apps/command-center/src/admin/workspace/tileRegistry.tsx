// apps/command-center/src/admin/workspace/tileRegistry.tsx
//
// The command center's cortex tile registry — DERIVED from TILE_CAPABILITIES.
// For every capability entry, we register a TileDef with its contract id, label,
// category, status; we attach the real component from @hauska/cortex-tiles where
// one exists, otherwise a status-aware stub (planned/partial/degraded banner).

import React from 'react'
import type { TileDef, TileCategory } from '@empressaio/tile-shell'
import { TILE_CAPABILITIES } from '@empressaio/cortex-client'
import {
  IntakeQueueTile,
  IntakeTile,
  FindingsLibraryTile,
  ComplianceRunTile,
  DocumentViewerTile,
  DataroomTile,
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
  LetterTile,
} from '@empressaio/cortex-tiles'
// LOCAL-WORKSPACE OVERRIDE: the published @empressaio/cortex-tiles MapTile has
// no live-fetch wiring (fixture-only). LiveMapTile wraps the workspace
// @hauska/map-renderer with the viewport GIS loader + parcel click-through.
import { LiveMapTile } from './tiles/LiveMapTile'

/** Maps tile IDs to their React component implementations. */
export const TILE_COMPONENTS: Record<string, () => React.JSX.Element> = {
  'intake-queue': () => <IntakeQueueTile />,
  intake: () => <IntakeTile />,
  'findings-library': () => <FindingsLibraryTile />,
  'compliance-run': () => <ComplianceRunTile />,
  'document-viewer': () => <DocumentViewerTile />,
  dataroom: () => <DataroomTile />,
  map: () => <LiveMapTile />,
  topography: () => <TopographyTile />,
  drainage: () => <DrainageTile />,
  hydrology: () => <HydrologyTile />,
  subsurface: () => <SubsurfaceTile />,
  'property-brief': () => <PropertyBriefTile />,
  hazard: () => <HazardProfileTile />,
  encumbrances: () => <EncumbranceTile />,
  setbacks: () => <LocalSetbacksTile />,
  'sheet-extraction': () => <SheetExtractionTile />,
  'response-tasks': () => <ResponseTasksTile />,
  'doc-parsing': () => <DocumentParsingTile />,
  'product-spec': () => <ProductSpecReferenceTile />,
  letter: () => <LetterTile />,
}

/** Status-aware stub tile for planned/partial/degraded capabilities. */
function stubFor(cap: typeof TILE_CAPABILITIES[number]) {
  const statusLabel =
    cap.status === 'planned'
      ? 'Planned'
      : cap.status === 'partial'
        ? 'Partial'
        : cap.status === 'degraded'
          ? 'Degraded'
          : 'Unavailable'

  return () => (
    <div
      style={{
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        color: 'var(--h-text-muted, #768390)',
        fontSize: 12,
        fontFamily: 'var(--font-ui)',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color:
            cap.status === 'degraded'
              ? 'var(--h-warn, #f59e0b)'
              : 'var(--h-text-muted, #768390)',
        }}
      >
        {statusLabel}
      </div>
      <div>{cap.label}</div>
      {cap.degradedReason && (
        <div style={{ fontSize: 11, opacity: 0.8 }}>{cap.degradedReason}</div>
      )}
    </div>
  )
}

/** All tiles the command center knows about — derived from TILE_CAPABILITIES. */
export const ALL_TILES: TileDef[] = TILE_CAPABILITIES.map((cap) => ({
  id: cap.id,
  label: cap.label,
  category: cap.category as TileCategory,
  status: cap.status,
  degradedReason: cap.degradedReason,
  el: TILE_COMPONENTS[cap.id] ?? stubFor(cap),
}))

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
