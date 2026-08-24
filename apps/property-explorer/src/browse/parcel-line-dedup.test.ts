/**
 * P-60e parcel-line dedup — the pure suppress-vs-keep decision for the PMTiles
 * baked parcel LINE layer against the live county-GIS mesh state.
 *
 * The load-bearing direction is the VIOLATION direction: any state in which
 * the live mesh is NOT actually drawing exact boundaries (empty, failed,
 * no-coverage, zoom-gated, still loading, truncated partial coverage) MUST
 * keep the tile lines on. Suppressing there would leave the map with no
 * parcel lines where it used to have them.
 */

import { describe, expect, it } from 'vitest'
import { shouldSuppressTileParcelLines } from './liveGis'
import type { FeatureCollectionLike, LiveLayerState } from './liveGis'

function fc(featureCount: number): FeatureCollectionLike {
  return {
    type: 'FeatureCollection',
    features: Array.from({ length: featureCount }, (_, i) => ({
      type: 'Feature' as const,
      geometry: { type: 'Polygon', coordinates: [] },
      properties: { apn: `apn-${i}` },
    })),
  }
}

function okState(featureCount: number, truncated?: boolean): LiveLayerState {
  return {
    status: 'ok',
    response: { layer: 'parcels', geojson: fc(featureCount), truncated },
  }
}

describe('shouldSuppressTileParcelLines', () => {
  it('suppresses when the live mesh has >= 1 feature for the viewport', () => {
    expect(shouldSuppressTileParcelLines(okState(1))).toBe(true)
    expect(shouldSuppressTileParcelLines(okState(180))).toBe(true)
  })

  it('suppresses when truncated is absent or explicitly false', () => {
    expect(shouldSuppressTileParcelLines(okState(3, undefined))).toBe(true)
    expect(shouldSuppressTileParcelLines(okState(3, false))).toBe(true)
  })

  // --- VIOLATION DIRECTION: every one of these must keep the tile lines ---

  it('keeps tile lines when the live mesh resolved ok but EMPTY', () => {
    expect(shouldSuppressTileParcelLines(okState(0))).toBe(false)
  })

  it('keeps tile lines when the ok response carries no geojson at all', () => {
    expect(
      shouldSuppressTileParcelLines({
        status: 'ok',
        response: { layer: 'parcels' },
      }),
    ).toBe(false)
  })

  it('keeps tile lines when the fetch FAILED', () => {
    expect(
      shouldSuppressTileParcelLines({
        status: 'error',
        message: 'parcels: HTTP 502',
      }),
    ).toBe(false)
  })

  it('keeps tile lines on an uncovered county (no-coverage)', () => {
    expect(
      shouldSuppressTileParcelLines({
        status: 'no-coverage',
        detail: 'no adapter for this county',
      }),
    ).toBe(false)
  })

  it('keeps tile lines below the live-gis fetch zoom (zoom-gated)', () => {
    expect(shouldSuppressTileParcelLines({ status: 'zoom-gated' })).toBe(false)
  })

  it('keeps tile lines in the interval before a fetch resolves (loading/idle)', () => {
    expect(shouldSuppressTileParcelLines({ status: 'loading' })).toBe(false)
    expect(shouldSuppressTileParcelLines({ status: 'idle' })).toBe(false)
  })

  it('keeps tile lines when the live fetch is TRUNCATED (partial viewport coverage)', () => {
    // The upstream bbox cap (~200 features) hit: the mesh draws only PART of
    // the viewport, so suppressing every tile line would strip boundaries from
    // the parcels the capped fetch left out.
    expect(shouldSuppressTileParcelLines(okState(200, true))).toBe(false)
  })
})
