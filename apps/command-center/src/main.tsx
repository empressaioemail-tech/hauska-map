/**
 * Command Center — the Empressa Command Center (operator/admin console).
 *
 * Phase 2: this app is now the operator console (the :5174 admin surface),
 * distinct from the root JS spine console (:5173, E1-E7) and from the product
 * cortex workspace. It lifts the trading app's Control Tower skeleton (3-column
 * ControlCenterLayout + PanelRegistry + hash routing + primitives) and wires the
 * highest-value panels against OUR live APIs (MCP search_atoms / admin
 * introspection, cortex-api operator run-state). No Clerk — the token-getter
 * seam is replaced by the API key held in localStorage (the same key the
 * root console uses).
 *
 * The prior FloatingMap rendering demo is preserved (exported, not auto-mounted)
 * in ./map-demo.tsx.
 */

import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './admin/tokens.css'
import { ControlCenterLayout } from './admin/control/center/ControlCenterLayout'
import { loadConfig, saveConfig, hasAuthKey } from './admin/api/spineClient'
import { Pill } from './admin/control/primitives'

function ConfigBar() {
  const config = loadConfig()
  const [keyInput, setKeyInput] = useState('')

  const isProxyMode =
    config.cortexApiUrl?.startsWith('/api/') ||
    config.mcpUrl?.startsWith('/api/') ||
    config.retrievalApiUrl?.startsWith('/api/')

  const saveKey = () => {
    saveConfig({ hauskaKey: keyInput.trim() })
    window.location.reload()
  }

  const chip: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: 10.5,
    color: 'var(--color-text-tertiary)',
    padding: '3px 8px',
    borderRadius: 6,
    background: 'var(--color-background-secondary)',
    border: '0.5px solid var(--color-border-tertiary)',
    whiteSpace: 'nowrap',
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={chip}>mcp: {config.mcpUrl}</span>
      <span style={chip}>cortex: {config.cortexApiUrl.replace(/^https?:\/\//, '')}</span>
      {isProxyMode ? (
        <Pill sev="ok" title="keys held server-side; panels query live services through /api/spine">
          PROXY AUTH
        </Pill>
      ) : (
        <>
          <input
            type="password"
            placeholder={hasAuthKey(config) ? 'key set — paste to replace' : 'X-Hauska-Key'}
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && keyInput.trim()) saveKey()
            }}
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: 11,
              padding: '4px 8px',
              borderRadius: 6,
              color: 'var(--color-text-primary)',
              background: 'var(--color-background-secondary)',
              border: '0.5px solid var(--color-border-tertiary)',
              width: 180,
            }}
          />
          <button
            type="button"
            onClick={saveKey}
            disabled={!keyInput.trim()}
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: 11,
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: 6,
              cursor: keyInput.trim() ? 'pointer' : 'default',
              opacity: keyInput.trim() ? 1 : 0.5,
              color: 'var(--color-text-primary)',
              background: 'var(--color-background-accent)',
              border: '0.5px solid var(--color-border-secondary)',
            }}
          >
            Save key
          </button>
          <Pill sev={hasAuthKey(config) ? 'ok' : 'info'}>{hasAuthKey(config) ? 'keyed' : 'anonymous'}</Pill>
        </>
      )}
    </div>
  )
}

function App() {
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}>
      <header
        style={{
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          padding: '10px 16px',
          borderBottom: '0.5px solid var(--color-border-tertiary)',
          background: 'var(--color-background-secondary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--color-text-primary)' }}>
            EMPRESSA · COMMAND CENTER
          </span>
          <Pill sev="warn">Internal · operator</Pill>
        </div>
        <ConfigBar />
      </header>
      <ControlCenterLayout />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
