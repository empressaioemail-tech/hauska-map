/**
 * Share-view R1 brief projection (Workbench W4) — mirrors cortex buildR1Brief.
 * Pins the section mapping, runId derivation, disclosure verbatims, and that
 * the output renders through the SAME client view-model without crashing.
 */

import { describe, expect, it } from 'vitest'
import {
  buildShareBriefPayload,
  buildShareR1RunId,
  sharePropertyHeader,
} from '../../api/_lib/pe-share-brief.js'
import { deriveBriefViewModel } from '../browse/brief-view-model'
import { FIXTURE_NOW_MS } from '../browse/__fixtures__/research-brief.fixture'

/** Bastrop-shaped anonymous facet snapshot (the share-view upstream input). */
const FACETS = {
  bakedAt: '2026-07-21T09:00:00.000Z',
  countyName: 'Bastrop',
  countyFips: '48021',
  baseFacts: {
    apn: '000123',
    situsAddress: '104 Main St, Bastrop, TX',
    landUse: {
      code: 'A1',
      description: 'Single family residence',
      source: 'bastrop-cad',
      vintage: '2025-11-02',
    },
  },
  zoning: {
    district: 'P-2',
    jurisdictionKey: 'bastrop-city-tx',
    provenance: {
      sourceUrl: 'https://services.arcgis.com/abc/FeatureServer/0',
      cityKey: 'bastrop-city-tx',
      layerName: 'Zoning_Districts',
      stampedAt: '2026-07-10T00:00:00.000Z',
    },
  },
  envelope: {
    status: 'ok',
    district: 'P-2',
    setbacks: { front_ft: 10, side_ft: 0, rear_ft: 0 },
    buildableAreaPct: 70,
    citationUrl: 'https://library.municode.com/tx/bastrop/codes/code_of_ordinances',
    disclosure: 'One or more scalar setbacks are not specified in the code.',
  },
}

const TIER2 = {
  flood: {
    status: 'in-sfha',
    floodZone: 'AE',
    provenance: { source: 'fema-nfhl', vintage: '2026-07-20T04:12:00.000Z' },
  },
}

describe('buildShareBriefPayload (cortex buildR1Brief mirror)', () => {
  const payload = buildShareBriefPayload({
    parcelNodeId: '48021:123',
    facets: FACETS,
    tier2: TIER2,
    snapshotAt: '2026-07-22T00:00:00.000Z',
  })

  it('produces the R1 shape with the four sections in order', () => {
    expect(payload.reportFamily).toBe('R1')
    expect(payload.mode).toBe('baked-facet-intel-v1')
    expect(payload.source).toBe('baked-snapshot')
    expect(payload.brief.sections.map((s) => s.id)).toEqual([
      'zoning',
      'setbacks-envelope',
      'flood',
      'land-use',
    ])
    expect(payload.brief.sections[0].data).toBe(FACETS.zoning)
    expect(payload.brief.sections[1].data).toBe(FACETS.envelope)
    expect(payload.brief.sections[2].data).toBe(TIER2.flood)
    expect(payload.brief.sections[3].data).toBe(FACETS.baseFacts.landUse)
  })

  it('prefers facets.bakedAt over snapshotAt and derives the cortex runId format', () => {
    expect(payload.bakedAt).toBe('2026-07-21T09:00:00.000Z')
    expect(payload.runId).toBe(
      buildShareR1RunId('48021:123', '2026-07-21T09:00:00.000Z'),
    )
    expect(payload.runId).toMatch(/^pe-r1-[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
  })

  it('collects citation URLs and verbatim disclosures', () => {
    expect(payload.citations).toContain(
      'https://services.arcgis.com/abc/FeatureServer/0',
    )
    expect(payload.citations).toContain(
      'https://library.municode.com/tx/bastrop/codes/code_of_ordinances',
    )
    expect(payload.brief.disclosure).toContain(
      'One or more scalar setbacks are not specified in the code.',
    )
  })

  it('renders through the client view-model — facts + citations, no crash', () => {
    const vm = deriveBriefViewModel(payload, FIXTURE_NOW_MS)
    expect(vm.sections).toHaveLength(4)
    const zoning = vm.sections.find((s) => s.id === 'zoning')
    expect(zoning?.kind).toBe('facts')
    expect(zoning?.facts.some((f) => f.value === 'P-2')).toBe(true)
    expect(vm.citations.length).toBeGreaterThan(0)
  })

  it('honest absences: empty snapshot yields absent sections, not fabrications', () => {
    const empty = buildShareBriefPayload({
      parcelNodeId: '48055:9',
      facets: {},
      tier2: null,
      snapshotAt: null,
    })
    expect(empty.bakedAt).toBeNull()
    expect(empty.citations).toEqual([])
    const vm = deriveBriefViewModel(empty, FIXTURE_NOW_MS)
    expect(vm.sections.every((s) => s.kind === 'absent')).toBe(true)
  })
})

describe('sharePropertyHeader', () => {
  it('extracts address + county from the facet snapshot', () => {
    expect(sharePropertyHeader('48021:123', FACETS)).toEqual({
      parcelNodeId: '48021:123',
      situsAddress: '104 Main St, Bastrop, TX',
      countyName: 'Bastrop',
    })
  })
  it('nulls honestly when the snapshot has no header facts', () => {
    expect(sharePropertyHeader('48021:123', {})).toEqual({
      parcelNodeId: '48021:123',
      situsAddress: null,
      countyName: null,
    })
  })
})
