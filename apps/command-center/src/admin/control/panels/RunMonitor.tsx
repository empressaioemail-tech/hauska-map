// apps/command-center/src/admin/control/panels/RunMonitor.tsx
//
// Command Center · Run Monitor (panel id: run-monitor).  LIVE.
//
// Probes OUR operator run-state endpoints (first that returns usable data wins),
// normalizes like the root JS console's spine-api.js normalizeRunMonitorPayload,
// and polls every 5s with a plain setInterval (no @tanstack/react-query — not a
// dependency here). Honest empty when no endpoint responds, listing the URLs
// attempted. Never mock data.
//
//   GET {cortexApiUrl}/api/brokerage/v1/operator/warming/status
//   GET {cortexApiUrl}/api/internal/qa/run-state
//   GET {mcpAdminBase}/admin/operator/run-state

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { loadConfig, apiBase, mcpAdminBase, getJson, type SpineConfig } from '../../api/spineClient'
import { Panel, Pill, Loading, ErrorState, sectionHeader, mono, fmtNum } from '../primitives'

interface RunRow {
  id?: string | number
  runId?: string
  status?: string | null
  outcome?: string | null
  startedAt?: string | null
}

interface RunState {
  status: 'ok' | 'empty' | 'error'
  source?: string
  runId?: string
  parcelsWarmed: number | null
  parcelsTracked: number | null
  parcelsWarmedPct: number | null
  coverageHoles: unknown
  adapterFailures: unknown
  contestedGround: unknown
  triageCounts: unknown
  computeCostUsd: number | null
  computeBudgetUsd: number | null
  recentRuns: RunRow[]
  attempts: { url: string; httpStatus?: number; ok?: boolean; error?: string }[]
  message?: string
}

function num(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function normalize(json: Record<string, unknown>, source: string): Omit<RunState, 'attempts' | 'status'> & { status: 'ok' } {
  const j = json as Record<string, unknown>
  const warmed = num(j.parcelsWarmed ?? j.parcels_warmed ?? (j.warmed as { count?: unknown })?.count)
  const tracked = num(
    j.parcelsTracked ?? j.parcels_tracked ?? (j.warmed as { total?: unknown })?.total ?? (j.universe as { total?: unknown })?.total,
  )
  const pct =
    num(j.parcelsWarmedPct ?? j.warmed_pct) ??
    (warmed != null && tracked ? Math.round((warmed / tracked) * 1000) / 10 : null)
  return {
    status: 'ok',
    source,
    runId: String(j.runId ?? j.run_id ?? j.id ?? 'current'),
    parcelsWarmed: warmed,
    parcelsTracked: tracked,
    parcelsWarmedPct: pct,
    coverageHoles: j.coverageHoles ?? j.coverage_holes ?? j.holes ?? null,
    adapterFailures: j.adapterFailures ?? j.adapter_failures ?? j.failures ?? null,
    contestedGround: j.contestedGround ?? j.contested_ground ?? j.contested ?? null,
    triageCounts: j.triageCounts ?? j.triage_counts ?? j.triage ?? null,
    computeCostUsd: num(j.computeCostUsd ?? j.compute_cost_usd ?? (j.cost as { usd?: unknown })?.usd),
    computeBudgetUsd: num(j.computeBudgetUsd ?? j.compute_budget_usd ?? (j.cost as { budget_usd?: unknown })?.budget_usd),
    recentRuns: (j.recentRuns ?? j.recent_runs ?? j.history ?? []) as RunRow[],
  }
}

async function fetchRunState(config: SpineConfig): Promise<RunState> {
  const api = apiBase(config)
  const admin = mcpAdminBase(config)
  // The MCP /admin/operator/run-state probe can never resolve through the
  // /api/spine proxy (admin paths are not proxied and no such endpoint exists
  // on the deployed MCP server yet) — skip it in proxy mode so the honest-empty
  // state lists only endpoints that were genuinely attempted upstream.
  const mcpAdminProbe = admin && !admin.startsWith('/api/') ? `${admin}/admin/operator/run-state` : null
  const urls = [
    api ? `${api}/api/brokerage/v1/operator/warming/status` : null,
    api ? `${api}/api/internal/qa/run-state` : null,
    mcpAdminProbe,
  ].filter(Boolean) as string[]

  const attempts: RunState['attempts'] = []
  for (const url of urls) {
    const res = await getJson<Record<string, unknown>>(url, config, 12_000)
    attempts.push({ url, httpStatus: res.status, ok: res.ok, error: res.error })
    if (res.ok && res.json && typeof res.json === 'object') {
      const n = normalize(res.json, url)
      if (n.parcelsWarmed != null || n.computeCostUsd != null || n.adapterFailures != null || n.recentRuns.length) {
        return { ...n, attempts }
      }
    }
  }
  return {
    status: 'empty',
    parcelsWarmed: null,
    parcelsTracked: null,
    parcelsWarmedPct: null,
    coverageHoles: null,
    adapterFailures: null,
    contestedGround: null,
    triageCounts: null,
    computeCostUsd: null,
    computeBudgetUsd: null,
    recentRuns: [],
    attempts,
    message: 'W1 warming harness (W1–W5) not running — no run-state endpoint responded',
  }
}

function fmtUsd(n: number | null): string {
  if (n == null) return '—'
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
}

const MetricBlock: React.FC<{ val: unknown }> = ({ val }) => {
  if (val == null) return <em style={{ color: 'var(--color-text-tertiary)' }}>no data</em>
  if (typeof val === 'number') return <strong>{fmtNum(val)}</strong>
  if (Array.isArray(val)) return <strong>{val.length} entries</strong>
  if (typeof val === 'object') {
    const entries = Object.entries(val as Record<string, unknown>)
    if (!entries.length) return <em style={{ color: 'var(--color-text-tertiary)' }}>no data</em>
    return (
      <ul style={{ margin: 0, paddingLeft: 16 }}>
        {entries.map(([k, v]) => (
          <li key={k} style={{ ...mono, fontSize: 10 }}>
            {k}: <strong>{fmtNum(num(v))}</strong>
          </li>
        ))}
      </ul>
    )
  }
  return <strong>{String(val)}</strong>
}

export const RunMonitor: React.FC = () => {
  const config = useMemo<SpineConfig>(() => loadConfig(), [])
  const [state, setState] = useState<RunState | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const s = await fetchRunState(config)
        if (!cancelled) {
          setState(s)
          setErr(null)
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    timer.current = setInterval(run, 5_000)
    return () => {
      cancelled = true
      if (timer.current) clearInterval(timer.current)
    }
  }, [config])

  const live = state?.status === 'ok'

  return (
    <Panel
      title="Run Monitor"
      subtitle="Live · warming / QA run-state · polling 5s"
      right={<Pill sev={live ? 'ok' : 'warn'}>{live ? 'run live' : 'no run'}</Pill>}
    >
      {loading && !state ? (
        <Loading />
      ) : err ? (
        <ErrorState msg={err} />
      ) : !state ? (
        <Loading />
      ) : !live ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 8,
              border: '0.5px dashed var(--color-border-secondary)',
              fontSize: 11.5,
              color: 'var(--color-text-tertiary)',
              fontFamily: 'var(--font-ui)',
            }}
          >
            {state.message}
          </div>
          <span style={sectionHeader}>Endpoints attempted</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {state.attempts.map((a) => (
              <div key={a.url} style={{ ...mono, fontSize: 10, color: 'var(--color-text-tertiary)', display: 'flex', gap: 8 }}>
                <Pill sev={a.ok ? 'ok' : 'warn'}>{a.httpStatus || a.error || '—'}</Pill>
                <span style={{ wordBreak: 'break-all' }}>{a.url}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ ...mono, fontSize: 10, color: 'var(--color-text-tertiary)', margin: 0, wordBreak: 'break-all' }}>{state.source}</p>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-ui)' }}>
            <li>
              Parcels warmed:{' '}
              <strong>
                {fmtNum(state.parcelsWarmed)}
                {state.parcelsWarmedPct != null ? ` (${state.parcelsWarmedPct}%)` : ''}
                {state.parcelsTracked != null ? ` of ${fmtNum(state.parcelsTracked)}` : ''}
              </strong>
            </li>
            <li>Coverage holes: <MetricBlock val={state.coverageHoles} /></li>
            <li>Adapter failures: <MetricBlock val={state.adapterFailures} /></li>
            <li>Contested ground: <MetricBlock val={state.contestedGround} /></li>
            <li>Triage counts: <MetricBlock val={state.triageCounts} /></li>
            <li>
              Compute cost vs budget: <strong>{fmtUsd(state.computeCostUsd)}</strong> / {fmtUsd(state.computeBudgetUsd)}
            </li>
          </ul>
          {state.recentRuns.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={sectionHeader}>Recent runs · {state.recentRuns.length}</span>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {state.recentRuns.slice(0, 12).map((r, i) => (
                  <li key={String(r.id ?? r.runId ?? i)} style={{ ...mono, fontSize: 10, color: 'var(--color-text-secondary)' }}>
                    {String(r.id ?? r.runId ?? '—')} · {r.status ?? r.outcome ?? r.startedAt ?? '—'}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Panel>
  )
}

export default RunMonitor
