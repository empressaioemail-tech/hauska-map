/**
 * F1c / WDLL 8 — end-to-end live smoke: known nodes are true AND available
 * through the same retrieval path the CC ledger + map lock use.
 *
 * GREEN: live atom-chain for gold parcels returns parcelNodeId + chain slots
 *   (gated by RUN_LIVE_SMOKE=1).
 * RED: unavailable / failed reads fail loudly — the class of failure that
 *   would have caught OOM outage and node-inspect MISSING.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const KNOWN_PRESENT = ['48209:156346', '48021:34169'] as const
const KNOWN_HONEST_OR_PRESENT = ['48029:410119'] as const

const LIVE_BASE =
  process.env.SMOKE_RETRIEVAL_URL?.replace(/\/$/, '') ||
  'https://hauska-retrieval-api-h7gvu7rgcq-uc.a.run.app'

const LIVE_KEY = process.env.SMOKE_RETRIEVAL_API_KEY || process.env.RETRIEVAL_API_KEY || ''

export type SmokeChainResult = {
  parcelNodeId: string
  status: number
  body: Record<string, unknown> | null
  error?: string
}

/** Fail-loud assertion used by green + red smoke. */
export function assertParcelAvailable(result: SmokeChainResult): void {
  if (result.status === 0 || result.error) {
    throw new Error(
      `SMOKE RED: parcel ${result.parcelNodeId} unreachable — ${result.error ?? 'network'}`,
    )
  }
  if (result.status >= 500) {
    throw new Error(
      `SMOKE RED: parcel ${result.parcelNodeId} backend unavailable (HTTP ${result.status})`,
    )
  }
  if (result.status === 401 || result.status === 403) {
    throw new Error(
      `SMOKE RED: parcel ${result.parcelNodeId} auth failed (HTTP ${result.status}) — smoke key missing/wrong`,
    )
  }
  if (result.status !== 200 || !result.body) {
    throw new Error(
      `SMOKE RED: parcel ${result.parcelNodeId} not available (HTTP ${result.status})`,
    )
  }
  if (result.body.parcelNodeId !== result.parcelNodeId) {
    throw new Error(
      `SMOKE RED: parcel ${result.parcelNodeId} response missing matching parcelNodeId`,
    )
  }
}

async function fetchAtomChain(
  base: string,
  parcelNodeId: string,
  headers: Record<string, string> = {},
): Promise<SmokeChainResult> {
  try {
    const res = await fetch(
      `${base}/property-nodes/${encodeURIComponent(parcelNodeId)}/atom-chain`,
      { headers: { Accept: 'application/json', ...headers } },
    )
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
    return { parcelNodeId, status: res.status, body }
  } catch (err) {
    return {
      parcelNodeId,
      status: 0,
      body: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

describe('WDLL 8 live smoke — RED when data unavailable', () => {
  it('fails loudly when atom-chain is unreachable (simulated OOM / DNS)', async () => {
    const result = await fetchAtomChain(
      'https://retrieval-smoke-unavailable.invalid',
      KNOWN_PRESENT[0],
    )
    expect(() => assertParcelAvailable(result)).toThrow(/SMOKE RED.*unreachable/i)
  })

  it('fails loudly on HTTP 502 (simulated backend down)', () => {
    expect(() =>
      assertParcelAvailable({
        parcelNodeId: KNOWN_PRESENT[0],
        status: 502,
        body: null,
      }),
    ).toThrow(/SMOKE RED.*502/)
  })

  it('fails loudly on HTML fallthrough / missing body', () => {
    expect(() =>
      assertParcelAvailable({
        parcelNodeId: KNOWN_PRESENT[0],
        status: 200,
        body: null,
      }),
    ).toThrow(/SMOKE RED/)
  })
})

describe('WDLL 8 live smoke — GREEN path (gated)', () => {
  const runLive = process.env.RUN_LIVE_SMOKE === '1'

  it.skipIf(!runLive)(
    'known nodes return atom-chain through retrieval (ledger path)',
    async () => {
      expect(LIVE_KEY, 'SMOKE_RETRIEVAL_API_KEY required for live green smoke').toBeTruthy()
      for (const id of [...KNOWN_PRESENT, ...KNOWN_HONEST_OR_PRESENT]) {
        const result = await fetchAtomChain(LIVE_BASE, id, {
          Authorization: `Bearer ${LIVE_KEY}`,
        })
        assertParcelAvailable(result)
      }
    },
    60_000,
  )
})

describe('WDLL 8 source guard (always on)', () => {
  it('NodeGraph prefers live tally via shared retrieval client (not raw fetch)', () => {
    const path = resolve(import.meta.dirname, '../control/panels/NodeGraph.tsx')
    const src = readFileSync(path, 'utf8')
    expect(src).toContain('fetchCentralTxNodeGraphTally')
    expect(src).toContain("setTallySource('live')")
    expect(src).not.toMatch(/fetch\(.*stats\/central-tx-node-graph/)
  })

  it('NavRail uses computed badges (not hand-set live flags)', () => {
    const path = resolve(import.meta.dirname, '../control/center/NavRail.tsx')
    const src = readFileSync(path, 'utf8')
    expect(src).toContain('usePanelHealth')
    expect(src).toContain('badgeFor')
    expect(src).not.toMatch(/panel\.live \? <Pill sev="ok">live<\/Pill>/)
  })
})
