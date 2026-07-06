// apps/command-center/src/admin/control/panels/McpInspector.tsx
//
// Command Center · MCP Inspector (panel id: mcp-inspector). LIVE.
//
// Product-gated tool catalog + live call probe. Queries the Empressa MCP server's
// /admin/introspection/tools endpoint (requires auth in direct mode; blocked at
// /api/spine/* proxy by design, so this panel degrades to an honest "requires
// direct operator access" state in deployed mode while working in local-dev
// direct mode where the operator pastes a key).

import React, { useEffect, useMemo, useState } from 'react'
import { loadConfig, type SpineConfig, mcpAdminBase } from '../../api/spineClient'
import { Panel, Pill, Loading, ErrorState, Empty, sectionHeader, mono } from '../primitives'

const PRODUCTS = ['public', 'codex', 'reporting', 'map']

interface McpTool {
  name: string
  description?: string
  product: string
  gate?: string
  gate_summary?: string
  anonymous_ok?: boolean
  input_schema?: Record<string, unknown>
  required?: string[]
}

interface McpIntrospectionResult {
  status: 'ok' | 'error' | 'empty'
  message?: string
  tools?: McpTool[]
  by_product?: Record<string, number>
  count?: number
  source?: string
}

async function fetchMcpIntrospection(config: SpineConfig): Promise<McpIntrospectionResult> {
  const adminUrl = `${mcpAdminBase(config)}/admin/introspection/tools`
  try {
    const res = await fetch(adminUrl, {
      headers: {
        'Content-Type': 'application/json',
        ...(config.hauskaKey && !adminUrl.startsWith('/api/') ? { 'X-Hauska-Key': config.hauskaKey } : {}),
      },
    })
    if (!res.ok) {
      return {
        status: 'error',
        message: `HTTP ${res.status} — ${adminUrl}`,
        tools: [],
        by_product: {},
      }
    }
    const data = (await res.json()) as { tools?: McpTool[] }
    const tools = data.tools || []
    const by_product: Record<string, number> = {}
    for (const p of PRODUCTS) {
      by_product[p] = tools.filter((t) => t.product === p).length
    }
    return {
      status: tools.length > 0 ? 'ok' : 'empty',
      tools,
      by_product,
      count: tools.length,
      source: adminUrl,
    }
  } catch (err) {
    return {
      status: 'error',
      message: (err as Error).message,
      tools: [],
      by_product: {},
    }
  }
}

async function callMcpTool(
  config: SpineConfig,
  toolName: string,
  args: Record<string, unknown>,
  product: string,
): Promise<Record<string, unknown>> {
  const adminUrl = `${mcpAdminBase(config)}/admin/introspection/tools/${encodeURIComponent(toolName)}/call`
  try {
    const res = await fetch(adminUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hauska-Dev-Product': product,
        ...(config.hauskaKey && !adminUrl.startsWith('/api/') ? { 'X-Hauska-Key': config.hauskaKey } : {}),
      },
      body: JSON.stringify(args),
    })
    const data = (await res.json()) as Record<string, unknown>
    return { status: res.ok ? 'ok' : 'error', ...data }
  } catch (err) {
    return { status: 'error', error: (err as Error).message }
  }
}

const inputStyle: React.CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 11,
  padding: '5px 8px',
  borderRadius: 6,
  color: 'var(--color-text-primary)',
  background: 'var(--color-background-secondary)',
  border: '0.5px solid var(--color-border-tertiary)',
  minWidth: 0,
}

const btnStyle: React.CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 11,
  fontWeight: 600,
  padding: '5px 12px',
  borderRadius: 6,
  cursor: 'pointer',
  color: 'var(--color-text-primary)',
  background: 'var(--color-background-accent)',
  border: '0.5px solid var(--color-border-secondary)',
}

const preStyle: React.CSSProperties = {
  ...mono,
  fontSize: 10.5,
  color: 'var(--color-text-primary)',
  background: 'var(--color-background-secondary)',
  border: '0.5px solid var(--color-border-tertiary)',
  borderRadius: 6,
  padding: 10,
  margin: 0,
  overflowX: 'auto',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  maxHeight: 400,
  overflowY: 'auto',
}

export const McpInspector: React.FC = () => {
  const config = useMemo<SpineConfig>(() => loadConfig(), [])
  const [result, setResult] = useState<McpIntrospectionResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedTool, setSelectedTool] = useState<string>('')
  const [selectedProduct, setSelectedProduct] = useState<string>('public')
  const [toolArgs, setToolArgs] = useState<string>('{}')
  const [callResult, setCallResult] = useState<string>('—')
  const [schema, setSchema] = useState<string>('Select a tool')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const r = await fetchMcpIntrospection(config)
      if (!cancelled) {
        setResult(r)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [config])

  useEffect(() => {
    if (!selectedTool || !result?.tools) {
      setSchema('Select a tool')
      return
    }
    const tool = result.tools.find((t) => t.name === selectedTool)
    if (tool) {
      setSchema(
        JSON.stringify(
          {
            input_schema: tool.input_schema,
            required: tool.required,
            gate: tool.gate,
            product: tool.product,
            anonymous_ok: tool.anonymous_ok,
          },
          null,
          2,
        ),
      )
    } else {
      setSchema('Tool not found')
    }
  }, [selectedTool, result])

  const handleCallTool = async () => {
    if (!selectedTool) {
      setCallResult('Select a tool first')
      return
    }
    let args: Record<string, unknown> = {}
    try {
      args = JSON.parse(toolArgs)
    } catch (err) {
      setCallResult(`Invalid JSON: ${(err as Error).message}`)
      return
    }
    setCallResult(`Calling ${selectedTool}…`)
    const outcome = await callMcpTool(config, selectedTool, args, selectedProduct)
    setCallResult(JSON.stringify(outcome, null, 2))
  }

  const isProxyMode = config.mcpUrl?.startsWith('/api/')
  const adminBlocked = isProxyMode

  if (loading) return <Panel title="MCP Inspector" subtitle="Live · tool catalog + call probe"><Loading /></Panel>

  if (adminBlocked) {
    return (
      <Panel title="MCP Inspector" subtitle="Not available through proxy" right={<Pill sev="warn">excluded</Pill>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={sectionHeader}>Proxy-excluded by design</span>
          <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-ui)', margin: 0 }}>
            The MCP /admin/* paths are blocked at the same-origin /api/spine/* proxy by design (operator-only
            introspection, admin key stays out). This panel works in local-dev direct mode where an operator pastes
            a key. In deployed mode, use the root vanilla console or connect directly to the MCP server.
          </p>
          <div style={{ padding: '8px 10px', borderRadius: 6, background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)' }}>
            <span style={{ ...mono, fontSize: 10, color: 'var(--color-text-tertiary)' }}>
              Blocked paths: /api/spine/mcp/admin/*
            </span>
          </div>
        </div>
      </Panel>
    )
  }

  if (!result || result.status === 'error' || result.status === 'empty') {
    const msg = result?.message || 'No tools available'
    return (
      <Panel title="MCP Inspector" subtitle="Introspection unavailable" right={<Pill sev="warn">{result?.status || 'error'}</Pill>}>
        <ErrorState msg={msg} />
        <p style={{ ...mono, fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 10 }}>
          GET {result?.source || mcpAdminBase(config) + '/admin/introspection/tools'}
        </p>
        <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-ui)' }}>
          Start MCP server; set Empressa key if admin routes require bootstrap auth.
        </p>
      </Panel>
    )
  }

  const tools = result.tools || []
  const byProduct = result.by_product || {}
  const total = result.count || tools.length

  return (
    <Panel
      title="MCP Inspector"
      subtitle={`Live · ${total} tools from introspection`}
      right={<Pill sev={config.hauskaKey ? 'ok' : 'info'}>{config.hauskaKey ? 'keyed' : 'anonymous'}</Pill>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PRODUCTS.map((p) => (
            <div
              key={p}
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                background: 'var(--color-background-secondary)',
                border: '0.5px solid var(--color-border-tertiary)',
              }}
            >
              <span style={{ ...mono, fontSize: 10, color: 'var(--color-text-tertiary)' }}>{p}</span>
              <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', marginLeft: 6 }}>
                {byProduct[p] || 0}
              </span>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={sectionHeader}>Tool Catalog</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 400, overflowY: 'auto' }}>
              {PRODUCTS.map((product) => {
                const productTools = tools.filter((t) => t.product === product)
                if (productTools.length === 0) return null
                return (
                  <div key={product}>
                    <div
                      style={{
                        ...sectionHeader,
                        fontSize: 11,
                        color: 'var(--color-text-secondary)',
                        padding: '6px 0',
                        borderBottom: '0.5px solid var(--color-border-tertiary)',
                        marginBottom: 4,
                      }}
                    >
                      {product} ({productTools.length})
                    </div>
                    {productTools.map((t) => (
                      <button
                        key={t.name}
                        onClick={() => setSelectedTool(t.name)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '5px 8px',
                          borderRadius: 4,
                          cursor: 'pointer',
                          background:
                            selectedTool === t.name ? 'var(--color-background-accent)' : 'var(--color-background-secondary)',
                          border: '0.5px solid var(--color-border-tertiary)',
                          marginBottom: 2,
                        }}
                      >
                        <div style={{ ...mono, fontSize: 10.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                          {t.name}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-ui)' }}>
                          {(t.description || '').slice(0, 80)}
                          {(t.description || '').length > 80 ? '…' : ''}
                        </div>
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={sectionHeader}>Live call test</span>
            <select
              style={inputStyle}
              value={selectedTool}
              onChange={(e) => setSelectedTool(e.target.value)}
            >
              <option value="">— select tool —</option>
              {tools.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
            <select
              style={inputStyle}
              value={selectedProduct}
              onChange={(e) => setSelectedProduct(e.target.value)}
            >
              {PRODUCTS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <details open>
              <summary style={{ ...sectionHeader, cursor: 'pointer', marginBottom: 6 }}>Input schema</summary>
              <pre style={preStyle}>{schema}</pre>
            </details>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={sectionHeader}>Arguments (JSON)</span>
              <textarea
                style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: 10.5, minHeight: 80 }}
                value={toolArgs}
                onChange={(e) => setToolArgs(e.target.value)}
              />
            </label>
            <button style={btnStyle} onClick={handleCallTool}>
              Call tool
            </button>
            <pre style={preStyle}>{callResult}</pre>
          </div>
        </div>

        <p style={{ ...mono, fontSize: 10, color: 'var(--color-text-tertiary)' }}>
          Source: {result.source}
        </p>
      </div>
    </Panel>
  )
}

export default McpInspector
