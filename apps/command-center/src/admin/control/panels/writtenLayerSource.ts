// writtenLayerSource.ts — where the WRITTEN layer comes from, and the rule that it can
// never be mislabelled or silently substituted.
//
// The written layer answers "what is actually in the store". The only live instrument
// the console can reach for that today is the retrieval-api node-graph tally, read
// through the shared client in api/atomTrace.ts (one read path — this module opens no
// second one).
//
// THREE THINGS ABOUT THIS INSTRUMENT ARE PART OF ITS CONTRACT AND ARE RENDERED, NOT
// REMEMBERED:
//
//   1. ITS COVERAGE SET IS SMALL. Probed 2026-08-19 it reported 10 counties of 254,
//      and its road rollup covers fewer still. A county outside that set is NOT an
//      empty store; it is an unmeasured one, and the console says which.
//   2. IT CARRIES ITS OWN generatedAt AND IT IS NOT NOW. Probed 2026-08-19 it returned
//      generatedAt 2026-08-04T13:02:36.327Z — TEN DAYS OLDER than the ledger it gets
//      compared against. Every figure taken from it travels with that timestamp.
//   3. IT IS SLOW AND IT FAILS. Two identical probes on 2026-08-19: one HTTP 200 with
//      6,177 bytes, one HTTP 000 after 240 seconds. So it is read ON DEMAND, never on
//      mount and never on the live-feed interval, and a failure is a named absence
//      carrying the URL and the status rather than an empty panel.
//
// There is a static tally artifact in this app's public/ directory. It is NOT used
// here. Node & Graph keeps it as a last-resort fallback for its own view; wiring it in
// behind a layer labelled WRITTEN would be the silent-fallback defect class this
// programme exists to hunt, and the PanelRegistry liveness contract forbids
// fixture-LIVE outright.

import { fetchCentralTxNodeGraphTally, type CentralTxNodeGraphTally } from '../../api/atomTrace'
import type { SpineConfig } from '../../api/spineClient'
import { writtenCoverageSet, type WrittenCoverageSet } from './threeLayerTypes'

export const WRITTEN_INSTRUMENT_PATH = '/stats/central-tx-node-graph'
export const WRITTEN_INSTRUMENT_NAME = 'retrieval-api node-graph tally'

/** Long, because this endpoint took over 90s to answer on a good day. Still bounded. */
export const WRITTEN_PROBE_TIMEOUT_MS = 120_000

export interface WrittenSourceState {
  origin: 'live-endpoint'
  tally: CentralTxNodeGraphTally | null
  coverage: WrittenCoverageSet
  locator: string
  httpStatus: number | null
  notServedReason: string | null
  /** When this console read it — distinct from the tally's own generatedAt. */
  readAt: string
}

function emptyCoverage(): WrittenCoverageSet {
  return writtenCoverageSet(null, WRITTEN_INSTRUMENT_NAME)
}

/**
 * Probe the written instrument.
 *
 * A failure returns a NAMED not-served reason carrying the path and the status, never
 * a bare empty tally: an empty tally would render as a store with nothing in it, which
 * is the single most misleading thing this console could show.
 */
export async function fetchWrittenLayer(config: SpineConfig): Promise<WrittenSourceState> {
  const readAt = new Date().toISOString()
  const base = (config.retrievalApiUrl || '').replace(/\/$/, '')
  if (!base) {
    return {
      origin: 'live-endpoint',
      tally: null,
      coverage: emptyCoverage(),
      locator: WRITTEN_INSTRUMENT_PATH,
      httpStatus: null,
      notServedReason: 'no retrieval API base is configured for this console',
      readAt,
    }
  }
  const locator = `${base}${WRITTEN_INSTRUMENT_PATH}`
  const res = await fetchCentralTxNodeGraphTally(config, WRITTEN_PROBE_TIMEOUT_MS)
  if (!res.ok || !res.json) {
    return {
      origin: 'live-endpoint',
      tally: null,
      coverage: emptyCoverage(),
      locator,
      httpStatus: res.status,
      notServedReason: res.error ?? `HTTP ${res.status}`,
      readAt,
    }
  }
  const tally = res.json
  const counties = tally.centralTx?.counties ?? []
  if (counties.length === 0 && (tally.roadRollup?.byCounty ?? []).length === 0) {
    return {
      origin: 'live-endpoint',
      tally: null,
      coverage: emptyCoverage(),
      locator,
      httpStatus: res.status,
      notServedReason:
        'the endpoint answered but reported no counties — an empty coverage set is not an empty store',
      readAt,
    }
  }
  return {
    origin: 'live-endpoint',
    tally,
    coverage: writtenCoverageSet(tally, WRITTEN_INSTRUMENT_NAME),
    locator,
    httpStatus: res.status,
    notServedReason: null,
    readAt,
  }
}

/** One sentence stating exactly what this instrument can and cannot see. */
export function describeWrittenCoverage(coverage: WrittenCoverageSet): string {
  if (coverage.countyFips.length === 0) {
    return 'no county has been measured by a written instrument in this session'
  }
  return `${coverage.countyFips.length} counties measured (${coverage.roadCountyFips.length} of them for road nodes), ${coverage.railKeys.length} rails carry a written signal; every other county and rail is UNMEASURED, which is not the same as empty`
}
