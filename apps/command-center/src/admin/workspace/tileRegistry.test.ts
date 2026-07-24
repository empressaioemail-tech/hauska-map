// apps/command-center/src/admin/workspace/tileRegistry.test.ts
//
// Ensures parcel-terrain-model from @empressaio/cortex-client@>=0.1.3 surfaces
// in ALL_TILES (WDLL terrain-ifc item 8).

import { describe, it, expect, vi } from 'vitest'

vi.mock('@empressaio/design-tokens/tokens.css', () => ({}))
vi.mock('@hauska/map-renderer/styles.css', () => ({}))
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}))

vi.mock('@empressaio/cortex-tiles', () => {
  const stub = () => null
  return {
    IntakeQueueTile: stub,
    IntakeTile: stub,
    FindingsLibraryTile: stub,
    ComplianceRunTile: stub,
    DocumentViewerTile: stub,
    DataroomTile: stub,
    TopographyTile: stub,
    DrainageTile: stub,
    HydrologyTile: stub,
    SubsurfaceTile: stub,
    PropertyBriefTile: stub,
    HazardProfileTile: stub,
    EncumbranceTile: stub,
    LocalSetbacksTile: stub,
    SheetExtractionTile: stub,
    ResponseTasksTile: stub,
    DocumentParsingTile: stub,
    ProductSpecReferenceTile: stub,
    LetterTile: stub,
    TileErrorBoundary: ({ children }: { children: unknown }) => children,
  }
})

vi.mock('./tiles/LiveMapTile', () => ({ LiveMapTile: () => null }))
vi.mock('./tiles/ParcelTerrainTile', () => ({ ParcelTerrainTile: () => null }))

import { ALL_TILES } from './tileRegistry'

describe('tileRegistry ALL_TILES', () => {
  it('includes parcel-terrain-model from cortex-client TILE_CAPABILITIES', () => {
    const tile = ALL_TILES.find((t) => t.id === 'parcel-terrain-model')
    expect(tile).toBeDefined()
    expect(tile?.label).toMatch(/terrain/i)
    expect(tile?.status).toBe('live')
  })
})
