// servingSweepSource.ts — where a statewide serving sweep comes from, and the rule
// that it can never be mislabelled.
//
// Two origins, and the console always states which one it is looking at:
//
//   live-endpoint    GET from cortex-api. The probed URL and the HTTP status are
//                    recorded on the result and displayed, so a not-served state names
//                    the exact thing that was tried.
//   loaded-artifact  a StatewideServingSweep JSON the operator loaded into the console.
//                    Displayed with its filename and its OWN sweptAt / resolverVersion,
//                    never with the word live anywhere near it.
//
// WHY BOTH. Lane P-43 delivers the statewide report as a dated ARTIFACT first (its
// dispatch, work item 7), and as of 2026-08-18 no sweep route exists on the deployed
// cortex-api: /api/serving-sweep returns HTTP 200 text/html, the documented SPA
// fallthrough that means the route does not exist. Waiting for an endpoint would leave
// the console unable to show the operator a report that already exists; inventing one
// and quietly falling back to a fixture would be the silent-fallback defect class this
// program hunts, and the PanelRegistry liveness contract forbids fixture-LIVE outright.
// So: probe live, render an artifact when one is loaded, and label both.
//
// Command Center is a read and sandbox surface. Loading a report artifact into it to
// read is exactly that; it is not a second product and it stores nothing.

import { apiBase, getJson, type SpineConfig } from '../../api/spineClient'
import { parseStatewideSweep, type StatewideServingSweep } from './servingSweepTypes'

export const SERVING_SWEEP_PATH = '/api/serving-sweep'

export type SweepOrigin = 'live-endpoint' | 'loaded-artifact'

export interface SweepSourceState {
  origin: SweepOrigin
  sweep: StatewideServingSweep | null
  /** Validation problems. Non-empty with a sweep present means partial-parse. */
  problems: string[]
  /** For live-endpoint: the URL actually requested. For an artifact: the filename. */
  locator: string
  /** For live-endpoint only. 0 means the request never got a status. */
  httpStatus: number | null
  /** Present when the source produced nothing usable, stated in the console verbatim. */
  notServedReason: string | null
}

/**
 * Probe the live sweep endpoint.
 *
 * An HTML response is classified as "route does not exist", not as an auth or data
 * problem — `getJson` already detects the SPA fallthrough and returns that as an error
 * rather than treating a 200 as success. An empty result is not an absence: this
 * returns a NAMED not-served reason carrying the URL and the status, never a bare
 * empty sweep.
 */
export async function fetchServingSweep(config: SpineConfig): Promise<SweepSourceState> {
  const base = apiBase(config)
  if (!base) {
    return {
      origin: 'live-endpoint',
      sweep: null,
      problems: [],
      locator: SERVING_SWEEP_PATH,
      httpStatus: null,
      notServedReason: 'no cortex-api base is configured for this console',
    }
  }
  const url = `${base}${SERVING_SWEEP_PATH}`
  const res = await getJson<unknown>(url, config, 30_000)
  if (!res.ok) {
    return {
      origin: 'live-endpoint',
      sweep: null,
      problems: [],
      locator: url,
      httpStatus: res.status,
      notServedReason: res.error ?? `HTTP ${res.status}`,
    }
  }
  const parsed = parseStatewideSweep(res.json)
  return {
    origin: 'live-endpoint',
    sweep: parsed.sweep,
    problems: parsed.problems,
    locator: url,
    httpStatus: res.status,
    notServedReason: parsed.sweep ? null : 'the endpoint answered but the payload is not a StatewideServingSweep',
  }
}

/**
 * Parse a sweep artifact the operator loaded. The filename travels with the result so
 * the panel header can say which file it is reading, and the artifact's own sweptAt and
 * resolverVersion are rendered rather than the console's clock.
 */
export function loadSweepArtifact(text: string, filename: string): SweepSourceState {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (err) {
    return {
      origin: 'loaded-artifact',
      sweep: null,
      problems: [],
      locator: filename,
      httpStatus: null,
      notServedReason: `not valid JSON: ${(err as Error).message}`,
    }
  }
  const parsed = parseStatewideSweep(raw)
  return {
    origin: 'loaded-artifact',
    sweep: parsed.sweep,
    problems: parsed.problems,
    locator: filename,
    httpStatus: null,
    notServedReason: parsed.sweep ? null : 'the file parsed but is not a StatewideServingSweep',
  }
}

export const ORIGIN_COPY: Readonly<Record<SweepOrigin, string>> = Object.freeze({
  'live-endpoint': 'LIVE — read from cortex-api',
  'loaded-artifact': 'ARTIFACT — a report file loaded into the console, not a live read',
})
