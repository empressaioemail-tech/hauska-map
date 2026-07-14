// apps/command-center/src/admin/workspace/dynamicTiles.tsx
//
// Dynamic tile resolution for the component-library picker. Two parameterized
// tile kinds ride the layout model's {tileId, params} serialization:
//
//   report:<capabilityId>    — a cortex report/capability registry entry.
//     Where a real @empressaio/cortex-tiles component exists for that
//     capability id (TILE_COMPONENTS), the real component is reused; otherwise
//     the generic ReportTile renders status / result / run / honest states
//     from the capability descriptor snapshot persisted in params.
//
//   component:<ExportName>   — a published @empressaio/cortex-tiles@0.1.4
//     export, registered directly from the package's component library.
//     Exports that need props the workspace cannot supply are listed in
//     COMPONENT_LIBRARY_SKIPS (surfaced in the PR, not silently dropped).
//
// resolveTile() is the render-time lookup SpacePanel uses in place of the
// bare getTile(): plain registry ids resolve exactly as before.

import React from 'react'
import type { TileDef, TileCategory, TileStatus } from '@empressaio/tile-shell'
import {
  ComplianceRunTile,
  DataroomTile,
  DocumentParsingTile,
  DocumentViewerTile,
  DrainageTile,
  EncumbranceTile,
  FindingsLibraryTile,
  HazardProfileTile,
  HydrologyTile,
  IntakeQueueTile,
  IntakeTile,
  LetterTile,
  LocalSetbacksTile,
  MapTile,
  ProductSpecReferenceTile,
  PropertyBriefTile,
  ResponseTasksTile,
  SheetExtractionTile,
  SubsurfaceTile,
  TopographyTile,
} from '@empressaio/cortex-tiles'
import { getTile, TILE_COMPONENTS, TILE_CATEGORIES } from './tileRegistry'
import {
  COMPONENT_TILE_KIND,
  REPORT_TILE_KIND,
} from './layoutModel'
import type { TileLayout, TileParams } from './layoutModel'
import { ReportTile } from './tiles/ReportTile'
import type { ReportTileCapability } from './tiles/ReportTile'
import type { ReportCapability } from './reportRegistry'

// ---------------------------------------------------------------------------
// Published component library (@empressaio/cortex-tiles@0.1.4 exports)
// ---------------------------------------------------------------------------

export interface ComponentLibraryEntry {
  /** The package export name — doubles as the instance identifier. */
  name: string
  label: string
  el: () => React.JSX.Element
}

/**
 * Every standalone-viable component export of @empressaio/cortex-tiles@0.1.4.
 * All 20 tile components render without required props (PropertyBriefTile's
 * props are optional). MapTile here is the PUBLISHED fixture-only map, distinct
 * from the workspace 'map' console tile (LiveMapTile override).
 */
export const COMPONENT_LIBRARY: ComponentLibraryEntry[] = [
  { name: 'ComplianceRunTile', label: 'ComplianceRunTile', el: () => <ComplianceRunTile /> },
  { name: 'DataroomTile', label: 'DataroomTile', el: () => <DataroomTile /> },
  { name: 'DocumentParsingTile', label: 'DocumentParsingTile', el: () => <DocumentParsingTile /> },
  { name: 'DocumentViewerTile', label: 'DocumentViewerTile', el: () => <DocumentViewerTile /> },
  { name: 'DrainageTile', label: 'DrainageTile', el: () => <DrainageTile /> },
  { name: 'EncumbranceTile', label: 'EncumbranceTile', el: () => <EncumbranceTile /> },
  { name: 'FindingsLibraryTile', label: 'FindingsLibraryTile', el: () => <FindingsLibraryTile /> },
  { name: 'HazardProfileTile', label: 'HazardProfileTile', el: () => <HazardProfileTile /> },
  { name: 'HydrologyTile', label: 'HydrologyTile', el: () => <HydrologyTile /> },
  { name: 'IntakeQueueTile', label: 'IntakeQueueTile', el: () => <IntakeQueueTile /> },
  { name: 'IntakeTile', label: 'IntakeTile', el: () => <IntakeTile /> },
  { name: 'LetterTile', label: 'LetterTile', el: () => <LetterTile /> },
  { name: 'LocalSetbacksTile', label: 'LocalSetbacksTile', el: () => <LocalSetbacksTile /> },
  { name: 'MapTile', label: 'MapTile (published, fixture-only)', el: () => <MapTile /> },
  { name: 'ProductSpecReferenceTile', label: 'ProductSpecReferenceTile', el: () => <ProductSpecReferenceTile /> },
  { name: 'PropertyBriefTile', label: 'PropertyBriefTile', el: () => <PropertyBriefTile /> },
  { name: 'ResponseTasksTile', label: 'ResponseTasksTile', el: () => <ResponseTasksTile /> },
  { name: 'SheetExtractionTile', label: 'SheetExtractionTile', el: () => <SheetExtractionTile /> },
  { name: 'SubsurfaceTile', label: 'SubsurfaceTile', el: () => <SubsurfaceTile /> },
  { name: 'TopographyTile', label: 'TopographyTile', el: () => <TopographyTile /> },
]

/** Exports NOT registered as standalone picker entries, with reasons. */
export const COMPONENT_LIBRARY_SKIPS: ReadonlyArray<{ name: string; reason: string }> = [
  {
    name: 'CortexProvider',
    reason: 'context provider — requires a client prop and children, not a standalone tile',
  },
  {
    name: 'ReportTileShell',
    reason:
      'presentational shell requiring label/engagementId/busy/error/onRun/result props the workspace cannot supply standalone; reused internally by the generic ReportTile',
  },
  {
    name: 'TileErrorBoundary',
    reason: 'error-boundary wrapper — requires children, renders nothing on its own',
  },
  {
    name: 'useCortexClient',
    reason: 'hook, not a component',
  },
]

// ---------------------------------------------------------------------------
// Parameterized tile resolution
// ---------------------------------------------------------------------------

/** The params snapshot persisted when a report tile is added from the picker. */
export function reportParamsFor(cap: ReportCapability): TileParams {
  return {
    capabilityId: cap.id,
    label: cap.label,
    category: cap.category,
    status: cap.status,
    ...(cap.degradedReason !== undefined ? { degradedReason: cap.degradedReason } : {}),
    ...(cap.engine !== undefined ? { engine: cap.engine } : {}),
    requires: cap.requires,
  }
}

export function componentParamsFor(entry: ComponentLibraryEntry): TileParams {
  return { component: entry.name, label: entry.label }
}

const VALID_STATUSES: readonly TileStatus[] = ['live', 'degraded', 'partial', 'planned']

function asStatus(v: unknown): TileStatus {
  return VALID_STATUSES.includes(v as TileStatus) ? (v as TileStatus) : 'live'
}

function asCategory(v: unknown): TileCategory {
  return (TILE_CATEGORIES as readonly string[]).includes(v as string)
    ? (v as TileCategory)
    : 'Property Intel'
}

function capabilityFromParams(params: TileParams): ReportTileCapability | null {
  const id = params.capabilityId
  if (typeof id !== 'string' || id === '') return null
  const requires =
    typeof params.requires === 'object' && params.requires !== null && !Array.isArray(params.requires)
      ? (params.requires as ReportTileCapability['requires'])
      : {}
  return {
    id,
    label: typeof params.label === 'string' && params.label !== '' ? params.label : id,
    status: typeof params.status === 'string' ? params.status : 'live',
    degradedReason:
      typeof params.degradedReason === 'string' ? params.degradedReason : undefined,
    engine: typeof params.engine === 'string' ? params.engine : undefined,
    requires,
  }
}

function reportTileDef(instanceId: string, params?: TileParams): TileDef | undefined {
  if (!params) return undefined
  const cap = capabilityFromParams(params)
  if (!cap) return undefined
  // Reuse the real cortex-tiles component where one exists for this capability
  // (it already handles its own context/empty states); otherwise the generic
  // parameterized ReportTile.
  const impl = TILE_COMPONENTS[cap.id]
  return {
    id: instanceId,
    label: cap.label,
    category: asCategory(params.category),
    status: asStatus(cap.status),
    degradedReason: cap.degradedReason,
    el: impl ?? (() => <ReportTile capability={cap} />),
  }
}

function componentTileDef(instanceId: string, params?: TileParams): TileDef | undefined {
  const name = params?.component
  if (typeof name !== 'string') return undefined
  const entry = COMPONENT_LIBRARY.find((c) => c.name === name)
  if (!entry) return undefined
  return {
    id: instanceId,
    label: entry.label,
    category: 'Property Intel',
    status: 'live',
    el: entry.el,
  }
}

/**
 * Render-time tile lookup: plain registry ids resolve via getTile exactly as
 * before; parameterized entries resolve from their {tileId, params} snapshot.
 * Unknown / unusable entries return undefined and are skipped by SpacePanel
 * (the registry-agnostic contract layoutModel documents).
 */
export function resolveTile(
  entry: Pick<TileLayout, 'id' | 'tileId' | 'params'>,
): TileDef | undefined {
  if (entry.tileId === REPORT_TILE_KIND) return reportTileDef(entry.id, entry.params)
  if (entry.tileId === COMPONENT_TILE_KIND) return componentTileDef(entry.id, entry.params)
  return getTile(entry.tileId ?? entry.id)
}
