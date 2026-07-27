/**
 * F1c / WDLL 7 — mechanical panel liveness probes.
 *
 * Registry may declare intent (stub / local / probed). Runtime health is
 * computed from live GETs — a LIVE panel whose backend is down becomes
 * degraded. Fixture-LIVE (hardcoded zeros claiming live) is forbidden.
 */

import type { SpineConfig } from '../../api/spineClient'
import { getJson, mcpIntrospectionBase } from '../../api/spineClient'

export type PanelBadge = 'live' | 'stub' | 'degraded' | 'checking'

export type PanelProbeId =
  | 'retrieval-healthz'
  | 'retrieval-atom-chain'
  | 'retrieval-spine-health'
  | 'mcp-introspection'
  | 'mcp-metering'
  | 'cortex-coverage'
  | 'local'

export interface PanelProbeResult {
  ok: boolean
  status: number
  error?: string
  checkedAt: string
}

const GOLD_PARCEL = '48209:156346'

export async function runPanelProbe(
  probeId: PanelProbeId,
  config: SpineConfig,
): Promise<PanelProbeResult> {
  const checkedAt = new Date().toISOString()
  if (probeId === 'local') {
    return { ok: true, status: 200, checkedAt }
  }

  if (probeId === 'retrieval-healthz') {
    // Live retrieval serves GET /health (200). /healthz and /healthz/ 404 via
    // BFF→upstream (Phase 0 CC-A). Probe the working path so badge matches
    // geocode/resolve reality — never lie LIVE on a 404 probe.
    const base = (config.retrievalApiUrl || '').replace(/\/$/, '')
    const res = await getJson<{ status?: string; corpus?: { ok?: boolean }; service?: string }>(
      `${base}/health`,
      config,
      12_000,
    )
    const ok =
      res.ok &&
      (res.json?.status === 'ok' || res.json?.status === 'warn') &&
      res.json?.corpus?.ok !== false
    return {
      ok,
      status: res.status,
      error: res.error ?? (ok ? undefined : `retrieval /health not ok (status=${res.status})`),
      checkedAt,
    }
  }

  if (probeId === 'retrieval-atom-chain') {
    const base = (config.retrievalApiUrl || '').replace(/\/$/, '')
    const res = await getJson<{ parcelNodeId?: string }>(
      `${base}/property-nodes/${encodeURIComponent(GOLD_PARCEL)}/atom-chain`,
      config,
      20_000,
    )
    const ok = res.ok && res.json?.parcelNodeId === GOLD_PARCEL
    return { ok, status: res.status, error: res.error, checkedAt }
  }

  if (probeId === 'retrieval-spine-health') {
    const base = (config.retrievalApiUrl || '').replace(/\/$/, '')
    const res = await getJson<{ pack?: string; rows?: unknown[] }>(
      `${base}/health/spine`,
      config,
      20_000,
    )
    const ok = res.ok && typeof res.json?.pack === 'string'
    return {
      ok,
      status: res.status,
      error: res.error ?? (ok ? undefined : 'spine health summary missing pack'),
      checkedAt,
    }
  }

  if (probeId === 'mcp-introspection') {
    const base = mcpIntrospectionBase(config).replace(/\/$/, '')
    const res = await getJson<{ tools?: unknown[] }>(`${base}/tools`, config, 15_000)
    const ok = res.ok && Array.isArray(res.json?.tools)
    return { ok, status: res.status, error: res.error, checkedAt }
  }

  if (probeId === 'mcp-metering') {
    const base = (config.mcpUrl || '').replace(/\/$/, '')
    // Proxy segment for metering is /api/spine/mcp-metering/summary
    const url = config.mcpUrl?.startsWith('/api/')
      ? '/api/spine/mcp-metering/summary'
      : `${base.replace(/\/mcp\/?$/, '')}/metering/summary`
    const res = await getJson(url, config, 15_000)
    return { ok: res.ok, status: res.status, error: res.error, checkedAt }
  }

  if (probeId === 'cortex-coverage') {
    const base = (config.cortexApiUrl || '').replace(/\/$/, '')
    const res = await getJson(`${base}/api/brokerage/v1/coverage`, config, 15_000)
    return { ok: res.ok, status: res.status, error: res.error, checkedAt }
  }

  return { ok: false, status: 0, error: `unknown probe ${probeId}`, checkedAt }
}

/** Pure badge derivation — unit-tested; NavRail uses this. */
export function derivePanelBadge(input: {
  stub?: boolean
  local?: boolean
  probeId?: PanelProbeId
  probe?: PanelProbeResult | null
  probing?: boolean
}): PanelBadge {
  if (input.stub) return 'stub'
  if (input.local || input.probeId === 'local') return 'live'
  if (!input.probeId) return 'stub' // undeclared liveness = honest stub
  if (input.probing && !input.probe) return 'checking'
  if (!input.probe) return 'checking'
  return input.probe.ok ? 'live' : 'degraded'
}
