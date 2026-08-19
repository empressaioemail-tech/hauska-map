// writtenLayerSource.test.ts — the WRITTEN probe cannot mislabel and cannot invent.
//
// The failure this guards is specific: an instrument that answers with nothing, or
// fails outright, must never leave the console rendering a layer called WRITTEN that
// reads as an empty store. An unread store and an empty store are different facts.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SpineConfig } from '../../api/spineClient'

vi.mock('../../api/atomTrace', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/atomTrace')>()
  return { ...actual, fetchCentralTxNodeGraphTally: vi.fn() }
})

import * as atomTrace from '../../api/atomTrace'
import {
  WRITTEN_INSTRUMENT_PATH,
  WRITTEN_PROBE_TIMEOUT_MS,
  describeWrittenCoverage,
  fetchWrittenLayer,
} from './writtenLayerSource'

const CONFIG: SpineConfig = {
  cortexApiUrl: '/api/spine/cortex',
  mcpUrl: '/api/spine/mcp',
  retrievalApiUrl: '/api/spine/retrieval',
  hauskaKey: '',
  installId: 'test',
}

const mockFetch = vi.mocked(atomTrace.fetchCentralTxNodeGraphTally)

function tallyPayload() {
  return {
    generatedAt: '2026-08-04T13:02:36.327Z',
    centralTx: {
      counties: [
        {
          fips: '48453',
          county: 'Travis',
          nodes: 380920,
          zoning_present: 233249,
          zoning_honest_absent_or_empty: 0,
          zoning_slot_missing: 0,
          setback_present: 172713,
          envelope_present: 172713,
          full_chain_nodes: 172713,
          references: 0,
          depth_warm_promoted: 0,
          zoning_place_type: 0,
          depth_ratio_place_type: 0,
          zoning_present_pct: 61.2,
        },
      ],
    },
    roadRollup: { byCounty: [{ fips: '48021', county: 'Bastrop', road_nodes: 17551, named_roads: 13778 }] },
  }
}

describe('fetchWrittenLayer', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads through the SHARED retrieval client, with a bounded timeout', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: tallyPayload() })
    const state = await fetchWrittenLayer(CONFIG)
    expect(mockFetch).toHaveBeenCalledWith(CONFIG, WRITTEN_PROBE_TIMEOUT_MS)
    expect(WRITTEN_PROBE_TIMEOUT_MS).toBeLessThanOrEqual(120_000)
    expect(state.tally).not.toBeNull()
    expect(state.notServedReason).toBeNull()
    expect(state.locator).toBe(`/api/spine/retrieval${WRITTEN_INSTRUMENT_PATH}`)
  })

  it('carries the instrument OWN observedAt, not the console clock', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: tallyPayload() })
    const state = await fetchWrittenLayer(CONFIG)
    expect(state.coverage.observedAt).toBe('2026-08-04T13:02:36.327Z')
    expect(state.readAt).not.toBe(state.coverage.observedAt)
  })

  it('names the coverage set, including the SMALLER road subset', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: tallyPayload() })
    const state = await fetchWrittenLayer(CONFIG)
    expect(state.coverage.countyFips).toEqual(['48453'])
    expect(state.coverage.roadCountyFips).toEqual(['48021'])
    const copy = describeWrittenCoverage(state.coverage)
    expect(copy).toContain('1 counties measured')
    expect(copy).toContain('1 of them for road nodes')
    expect(copy).toContain('UNMEASURED, which is not the same as empty')
  })

  it('a failed probe is a NAMED absence carrying the URL and status, never an empty tally', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 0, json: null, error: 'timed out after 120000ms' })
    const state = await fetchWrittenLayer(CONFIG)
    expect(state.tally).toBeNull()
    expect(state.httpStatus).toBe(0)
    expect(state.notServedReason).toBe('timed out after 120000ms')
    expect(state.locator).toContain(WRITTEN_INSTRUMENT_PATH)
    expect(state.coverage.countyFips).toEqual([])
  })

  it('an answer with no counties is refused rather than rendered as an empty store', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: { generatedAt: 'x', centralTx: { counties: [] } } })
    const state = await fetchWrittenLayer(CONFIG)
    expect(state.tally).toBeNull()
    expect(state.notServedReason).toMatch(/an empty coverage set is not an empty store/)
  })

  it('says so when no retrieval base is configured instead of probing nothing', async () => {
    const state = await fetchWrittenLayer({ ...CONFIG, retrievalApiUrl: '' })
    expect(mockFetch).not.toHaveBeenCalled()
    expect(state.notServedReason).toMatch(/no retrieval API base is configured/)
  })

  it('describes an unread instrument without implying an empty store', () => {
    expect(describeWrittenCoverage({ observedAt: null, instrument: 'x', countyFips: [], roadCountyFips: [], railKeys: [] })).toBe(
      'no county has been measured by a written instrument in this session',
    )
  })
})
