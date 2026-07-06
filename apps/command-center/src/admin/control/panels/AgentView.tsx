// apps/command-center/src/admin/control/panels/AgentView.tsx
//
// Command Center · Agent View (panel id: agent-view). LIVE.
//
// Third-party agent surface: tool catalog (product × tier), discoverability docs
// (llms.txt / agents.txt), and a human test harness. Shows what an external
// operator sees before wiring an agent at Empressa.

import React, { useEffect, useMemo, useState } from 'react'
import { loadConfig, type SpineConfig, mcpAdminBase, HauskaMcpClient } from '../../api/spineClient'
import { Panel, Pill, Loading, ErrorState, sectionHeader, mono } from '../primitives'

const PRODUCTS = ['public', 'codex', 'reporting', 'map']
const TIERS = ['free_anonymous', 'free', 'pro', 'max']

interface McpTool {
  name: string
  description?: string
  product: string
  gate?: string
  gate_summary?: string
  anonymous_ok?: boolean
}

interface DiscoverabilityDocs {
  llms?: string
  llmsError?: string
  agents?: string
  agentsError?: string
  source?: string
}

async function fetchDiscoverabilityDocs(config: SpineConfig): Promise<DiscoverabilityDocs> {
  const base = mcpAdminBase(config)
  const isProxyMode = base.startsWith('/api/')
  const docs: DiscoverabilityDocs = { source: 'fallback static' }
  
  // llms.txt and agents.txt are at the MCP server root (not under /mcp/*), so they're not proxied
  if (isProxyMode) {
    docs.llmsError = 'Not available through proxy — MCP server root paths are not routed'
    docs.agentsError = 'Not available through proxy — MCP server root paths are not routed'
    docs.source = 'proxy mode (root paths excluded)'
    return docs
  }

  try {
    const llmsRes = await fetch(`${base}/llms.txt`)
    if (llmsRes.ok) {
      docs.llms = await llmsRes.text()
      docs.source = `${base}/llms.txt`
    } else {
      docs.llmsError = `HTTP ${llmsRes.status}`
    }
  } catch (err) {
    docs.llmsError = (err as Error).message
  }

  try {
    const agentsRes = await fetch(`${base}/.well-known/agents.txt`)
    if (agentsRes.ok) {
      docs.agents = await agentsRes.text()
    } else {
      docs.agentsError = `HTTP ${agentsRes.status}`
    }
  } catch (err) {
    docs.agentsError = (err as Error).message
  }

  return docs
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
  maxHeight: 300,
  overflowY: 'auto',
}

export const AgentView: React.FC = () => {
  const config = useMemo<SpineConfig>(() => loadConfig(), [])
  const [tools, setTools] = useState<McpTool[]>([])
  const [docs, setDocs] = useState<DiscoverabilityDocs | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<string>('')
  const [selectedTier, setSelectedTier] = useState<string>('pro')
  const [selectedTool, setSelectedTool] = useState<string>('')
  const [toolArgs, setToolArgs] = useState<string>('{}')
  const [callResult, setCallResult] = useState<string>('—')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setErr(null)
    ;(async () => {
      try {
        const mcp = new HauskaMcpClient(config.mcpUrl, config.hauskaKey, 'public')
        const toolsList = (await mcp.listTools()) as McpTool[]
        const docsResult = await fetchDiscoverabilityDocs(config)
        if (!cancelled) {
          setTools(toolsList || [])
          setDocs(docsResult)
          setLoading(false)
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : String(e))
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [config])

  const productCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of PRODUCTS) {
      counts[p] = tools.filter((t) => t.product === p).length
    }
    return counts
  }, [tools])

  const filteredTools = useMemo(() => {
    return tools.filter((t) => {
      if (selectedProduct && t.product !== selectedProduct) return false
      if (selectedTier === 'free_anonymous' && !t.anonymous_ok) return false
      return true
    })
  }, [tools, selectedProduct, selectedTier])

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
    try {
      const mcp = new HauskaMcpClient(config.mcpUrl, config.hauskaKey, selectedProduct || 'public')
      const result = await mcp.callTool(selectedTool, args)
      setCallResult(JSON.stringify(result, null, 2))
    } catch (e) {
      setCallResult(`Error: ${(e as Error).message}`)
    }
  }

  if (loading) return <Panel title="Agent View" subtitle="Third-party agent surface"><Loading /></Panel>

  if (err) {
    return (
      <Panel title="Agent View" subtitle="Third-party agent surface" right={<Pill sev="warn">error</Pill>}>
        <ErrorState msg={`${err} — is the Empressa MCP server reachable at ${config.mcpUrl}?`} />
      </Panel>
    )
  }

  return (
    <Panel
      title="Agent View"
      subtitle={`Third-party agent surface · ${tools.length} tools`}
      right={<Pill sev={config.hauskaKey ? 'ok' : 'info'}>{config.hauskaKey ? 'keyed' : 'anonymous'}</Pill>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <span style={sectionHeader}>Tool catalog (product × tier)</span>
          <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-ui)', marginTop: 4, marginBottom: 8 }}>
            What an external operator sees before wiring an agent at Empressa.
          </p>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <select style={inputStyle} value={selectedProduct} onChange={(e) => setSelectedProduct(e.target.value)}>
              <option value="">All ({tools.length})</option>
              {PRODUCTS.map((p) => (
                <option key={p} value={p}>
                  {p} ({productCounts[p] || 0})
                </option>
              ))}
            </select>
            <select style={inputStyle} value={selectedTier} onChange={(e) => setSelectedTier(e.target.value)}>
              {TIERS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div
            style={{
              maxHeight: 300,
              overflowY: 'auto',
              border: '0.5px solid var(--color-border-tertiary)',
              borderRadius: 6,
              background: 'var(--color-background-secondary)',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-primary)' }}>
                  <th style={{ ...sectionHeader, textAlign: 'left', padding: '8px 10px' }}>Tool</th>
                  <th style={{ ...sectionHeader, textAlign: 'left', padding: '8px 10px' }}>Product</th>
                  <th style={{ ...sectionHeader, textAlign: 'left', padding: '8px 10px' }}>Gate</th>
                  <th style={{ ...sectionHeader, textAlign: 'left', padding: '8px 10px' }}>Anonymous OK</th>
                </tr>
              </thead>
              <tbody>
                {filteredTools.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: 10, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 11 }}>
                      No tools match filter
                    </td>
                  </tr>
                ) : (
                  filteredTools.map((t) => (
                    <tr
                      key={t.name}
                      onClick={() => setSelectedTool(t.name)}
                      style={{
                        cursor: 'pointer',
                        borderBottom: '0.5px solid var(--color-border-tertiary)',
                        background: selectedTool === t.name ? 'var(--color-background-accent)' : 'transparent',
                      }}
                    >
                      <td style={{ ...mono, fontSize: 10.5, padding: '6px 10px', color: 'var(--color-text-primary)' }}>{t.name}</td>
                      <td style={{ fontSize: 10.5, padding: '6px 10px', color: 'var(--color-text-secondary)' }}>{t.product}</td>
                      <td style={{ ...mono, fontSize: 10, padding: '6px 10px', color: 'var(--color-text-tertiary)' }}>
                        {(t.gate_summary || t.gate || '').slice(0, 40)}
                        {(t.gate_summary || t.gate || '').length > 40 ? '…' : ''}
                      </td>
                      <td style={{ fontSize: 10.5, padding: '6px 10px', color: 'var(--color-text-secondary)' }}>
                        {t.anonymous_ok ? 'yes' : 'no'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <span style={sectionHeader}>Agent discoverability</span>
          <details open style={{ marginTop: 8 }}>
            <summary
              style={{ ...sectionHeader, fontSize: 11, cursor: 'pointer', marginBottom: 6, color: 'var(--color-text-secondary)' }}
            >
              llms.txt
            </summary>
            <pre style={preStyle}>{docs?.llms || docs?.llmsError || '—'}</pre>
          </details>
          <details style={{ marginTop: 8 }}>
            <summary
              style={{ ...sectionHeader, fontSize: 11, cursor: 'pointer', marginBottom: 6, color: 'var(--color-text-secondary)' }}
            >
              agents.txt (.well-known)
            </summary>
            <pre style={preStyle}>{docs?.agents || docs?.agentsError || '—'}</pre>
          </details>
          <p style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-ui)', marginTop: 6 }}>
            Source: {docs?.source || 'fallback static'}
          </p>
        </div>

        <div>
          <span style={sectionHeader}>Human test harness</span>
          <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-ui)', marginTop: 4, marginBottom: 8 }}>
            Pick product + tier, invoke any tool, inspect raw read-contract-shaped response.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <select style={inputStyle} value={selectedTool} onChange={(e) => setSelectedTool(e.target.value)}>
              <option value="">— select tool —</option>
              {tools.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={sectionHeader}>Arguments (JSON)</span>
              <textarea
                style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: 10.5, minHeight: 80 }}
                value={toolArgs}
                onChange={(e) => setToolArgs(e.target.value)}
              />
            </label>
            <button style={btnStyle} onClick={handleCallTool}>
              Invoke (call-probe)
            </button>
            <pre style={preStyle}>{callResult}</pre>
          </div>
        </div>
      </div>
    </Panel>
  )
}

export default AgentView
