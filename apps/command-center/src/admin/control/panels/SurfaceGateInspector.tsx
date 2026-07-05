// apps/command-center/src/admin/control/panels/SurfaceGateInspector.tsx
//
// Command Center · Surface & Gate (panel id: surface-gate).  LIVE.
//
// The operator view of which tools are exposed on which product surface at the
// MCP gate. Fetches the Empressa MCP server's admin introspection:
//   GET {mcpAdminBase}/admin/introspection/tools
// Renders the total tool count, the by_product and by_gate breakdowns, and the
// full tool inventory (name + product + gate). Honest error/empty when the MCP
// admin surface is unreachable, showing the URL attempted. Never mock data.

import React, { useEffect, useMemo, useState } from 'react'
import { loadConfig, mcpAdminBase, getJson, type SpineConfig } from '../../api/spineClient'
import { Panel, Pill, Loading, ErrorState, Empty, sectionHeader, mono, fmtNum } from '../primitives'

interface ToolRow {
  name?: string
  product?: string
  gate?: string
  tier?: string
  description?: string
}

interface IntrospectionResponse {
  tools?: ToolRow[]
  items?: ToolRow[]
  total?: number
  by_product?: Record<string, number>
  by_gate?: Record<string, number>
  server_version?: string
  version?: string
}

const Breakdown: React.FC<{ label: string; map: Record<string, number> | undefined }> = ({ label, map }) => {
  const entries = Object.entries(map || {})
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={sectionHeader}>{label}</span>
      {entries.length === 0 ? (
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-ui)' }}>not reported</span>
      ) : (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {entries.map(([k, v]) => (
            <span
              key={k}
              style={{
                display: 'inline-flex',
                gap: 6,
                alignItems: 'center',
                padding: '4px 8px',
                borderRadius: 6,
                background: 'var(--color-background-secondary)',
                border: '0.5px solid var(--color-border-tertiary)',
                ...mono,
                fontSize: 11,
                color: 'var(--color-text-secondary)',
              }}
            >
              {k}
              <strong style={{ color: 'var(--color-text-primary)' }}>{fmtNum(v)}</strong>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export const SurfaceGateInspector: React.FC = () => {
  const config = useMemo<SpineConfig>(() => loadConfig(), [])
  const [data, setData] = useState<IntrospectionResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const url = `${mcpAdminBase(config)}/admin/introspection/tools`

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getJson<IntrospectionResponse>(url, config, 15_000)
      .then((res) => {
        if (cancelled) return
        if (!res.ok) {
          setErr(`${res.error} · ${url}`)
          setData(null)
        } else {
          setData(res.json)
          setErr(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [url, config])

  const tools = data?.tools || data?.items || []
  const total = data?.total ?? tools.length

  return (
    <Panel
      title="Surface & Gate"
      subtitle="Live · MCP admin introspection · which tools on which surface at the gate"
      right={data ? <Pill sev="ok">{fmtNum(total)} tools</Pill> : <Pill sev="warn">unreachable</Pill>}
    >
      {loading ? (
        <Loading />
      ) : err ? (
        <ErrorState msg={`${err} — is the Empressa MCP admin surface reachable?`} />
      ) : !data ? (
        <Empty>No introspection data.</Empty>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Pill sev="ok">{fmtNum(total)} tools exposed</Pill>
            {(data.server_version || data.version) && <Pill sev="info">v{data.server_version || data.version}</Pill>}
          </div>
          <Breakdown label="By product surface" map={data.by_product} />
          <Breakdown label="By gate" map={data.by_gate} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={sectionHeader}>Tool inventory</span>
            {tools.length === 0 ? (
              <Empty>No tools listed.</Empty>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {tools.map((t, i) => (
                  <div
                    key={t.name || i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      padding: '6px 10px',
                      borderRadius: 6,
                      background: 'var(--color-background-secondary)',
                      border: '0.5px solid var(--color-border-tertiary)',
                    }}
                  >
                    <span style={{ ...mono, fontSize: 11, color: 'var(--color-text-primary)', wordBreak: 'break-all' }}>{t.name || '—'}</span>
                    <span style={{ display: 'flex', gap: 6 }}>
                      {t.product && <Pill sev="info">{t.product}</Pill>}
                      {(t.gate || t.tier) && <Pill sev="warn">{t.gate || t.tier}</Pill>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Panel>
  )
}

export default SurfaceGateInspector
