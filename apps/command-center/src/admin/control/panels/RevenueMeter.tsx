// apps/command-center/src/admin/control/panels/RevenueMeter.tsx
//
// Command Center · Revenue Meter (panel id: revenue-meter).  LIVE.
//
// Displays layer-2 call volume, billed vs unbilled splits, per-day sparkline,
// byProduct and top-5 byTool breakdowns via GET /api/spine/mcp-metering/summary?days=N.
// Honest states: loading, real backend error shown (never blank fake), and an
// explicit "unbilled: Stripe key not mounted" hint when totals.billed is 0 and
// unbilled > 0. Inline SVG sparkline (no chart dependency). A3 shell-dissolution
// pattern: command-center design tokens.

import React, { useEffect, useMemo, useState } from 'react'
import { loadConfig, fetchMeteringSummary, type SpineConfig, type MeteringSummary } from '../../api/spineClient'
import { Panel, Pill, Loading, ErrorState, sectionHeader, mono, fmtNum } from '../primitives'

type DaysOption = 7 | 14 | 30

function Sparkline({ days }: { days: MeteringSummary['days'] }) {
  if (!days.length) return null
  const max = Math.max(...days.map((d) => d.layer2Calls), 1)
  const w = 240
  const h = 40
  const barW = w / days.length
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      {days.map((d, i) => {
        const barH = (d.layer2Calls / max) * h
        return (
          <rect
            key={d.date}
            x={i * barW}
            y={h - barH}
            width={barW - 1}
            height={barH}
            fill="var(--color-text-info)"
            opacity={0.8}
          >
            <title>
              {d.date}: {fmtNum(d.layer2Calls)} calls
            </title>
          </rect>
        )
      })}
    </svg>
  )
}

function BreakdownList({ items, label }: { items: [string, number][]; label: string }) {
  if (!items.length) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={sectionHeader}>{label}</span>
      <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: 'var(--color-text-secondary)' }}>
        {items.map(([k, v]) => (
          <li key={k} style={{ ...mono }}>
            {k}: <strong>{fmtNum(v)}</strong>
          </li>
        ))}
      </ul>
    </div>
  )
}

export const RevenueMeter: React.FC = () => {
  const config = useMemo<SpineConfig>(() => loadConfig(), [])
  const [summary, setSummary] = useState<MeteringSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [days, setDays] = useState<DaysOption>(7)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        const res = await fetchMeteringSummary(config, days)
        if (!cancelled) {
          if (res.status === 'error') {
            setErr(res.message || 'Unknown error')
            setSummary(null)
          } else {
            setSummary(res.summary || null)
            setErr(null)
          }
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [config, days])

  const byProduct = useMemo(() => {
    if (!summary) return []
    const map = new Map<string, number>()
    for (const d of summary.days) {
      for (const [k, v] of Object.entries(d.byProduct)) {
        map.set(k, (map.get(k) || 0) + v)
      }
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [summary])

  const byTool = useMemo(() => {
    if (!summary) return []
    const map = new Map<string, number>()
    for (const d of summary.days) {
      for (const [k, v] of Object.entries(d.byTool)) {
        map.set(k, (map.get(k) || 0) + v)
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
  }, [summary])

  const hasUnbilledWarning = summary && summary.totals.billed === 0 && summary.totals.unbilled > 0

  return (
    <Panel
      title="Revenue Meter"
      subtitle={`Layer-2 call summary · ${days}d window`}
      right={
        <div style={{ display: 'flex', gap: 6 }}>
          {([7, 14, 30] as DaysOption[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              style={{
                padding: '4px 10px',
                borderRadius: 4,
                border: '0.5px solid var(--color-border-secondary)',
                background: d === days ? 'var(--color-background-info)' : 'transparent',
                color: d === days ? 'var(--color-text-info)' : 'var(--color-text-secondary)',
                fontFamily: 'var(--font-ui)',
                fontSize: 10,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {d}d
            </button>
          ))}
        </div>
      }
    >
      {loading && !summary ? (
        <Loading />
      ) : err ? (
        <ErrorState msg={err} />
      ) : !summary ? (
        <Loading />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={sectionHeader}>Totals · {summary.windowDays}d window</span>
            <ul
              style={{
                margin: 0,
                padding: 0,
                listStyle: 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                fontSize: 12,
                color: 'var(--color-text-secondary)',
                fontFamily: 'var(--font-ui)',
              }}
            >
              <li>
                Layer-2 calls: <strong style={{ ...mono }}>{fmtNum(summary.totals.layer2Calls)}</strong>
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>
                  Billed: <strong style={{ ...mono }}>{fmtNum(summary.totals.billed)}</strong>
                </span>
                {hasUnbilledWarning && (
                  <Pill sev="warn" title="Stripe key not mounted — all calls unbilled">
                    stripe key missing
                  </Pill>
                )}
              </li>
              <li>
                Unbilled: <strong style={{ ...mono }}>{fmtNum(summary.totals.unbilled)}</strong>
              </li>
            </ul>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={sectionHeader}>Per-day volume</span>
            <Sparkline days={summary.days} />
          </div>

          {byProduct.length > 0 && <BreakdownList items={byProduct} label="By Product" />}
          {byTool.length > 0 && <BreakdownList items={byTool} label="Top 5 Tools" />}

          {hasUnbilledWarning && (
            <div
              style={{
                marginTop: 8,
                padding: '10px 12px',
                borderRadius: 6,
                border: '0.5px dashed var(--color-border-warning)',
                background: 'var(--color-background-warning)',
                color: 'var(--color-text-warning)',
                fontSize: 11,
                fontFamily: 'var(--font-ui)',
              }}
            >
              <strong>Unbilled:</strong> Stripe key not mounted. All {fmtNum(summary.totals.unbilled)} calls are
              unbilled. Mount the Stripe key to enable billing.
            </div>
          )}
        </div>
      )}
    </Panel>
  )
}

export default RevenueMeter
