/**
 * P-60e parcel-line dedup — withdrawn 2026-08-24.
 *
 * Operator visual: zoom-in hid most lot lines. The old predicate (mesh ok,
 * >=1 feature, not truncated) is not "the mesh is painted." Fail-open is
 * now unconditional. These tests lock that: no fetch state may hide tiles.
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
  it('never hides tile lines on a live-mesh ok (operator visual 2026-08-24)', () => {
    expect(shouldSuppressTileParcelLines(okState(1))).toBe(false)
    expect(shouldSuppressTileParcelLines(okState(180))).toBe(false)
  })

  it('keeps tile lines when truncated is absent or explicitly false', () => {
    expect(shouldSuppressTileParcelLines(okState(3, undefined))).toBe(false)
    expect(shouldSuppressTileParcelLines(okState(3, false))).toBe(false)
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
