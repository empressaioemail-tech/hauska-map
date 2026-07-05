// apps/command-center/src/admin/control/panels/Settings.tsx
//
// Command Center · Settings (panel id: settings). LIVE.
//
// Config/key management for local-dev direct mode. In deployed mode (proxy via
// /api/spine/*), auth is attached server-side from Vercel env vars and the
// browser never holds service keys. This panel shows current config status and
// allows operators to set a hauskaKey in local-dev direct mode.

import React, { useMemo, useState } from 'react'
import { loadConfig, saveConfig, type SpineConfig } from '../../api/spineClient'
import { Panel, Pill, sectionHeader, mono } from '../primitives'

const inputStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  padding: '6px 10px',
  borderRadius: 6,
  color: 'var(--color-text-primary)',
  background: 'var(--color-background-secondary)',
  border: '0.5px solid var(--color-border-tertiary)',
  width: '100%',
}

const btnStyle: React.CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 11,
  fontWeight: 600,
  padding: '6px 14px',
  borderRadius: 6,
  cursor: 'pointer',
  color: 'var(--color-text-primary)',
  background: 'var(--color-background-accent)',
  border: '0.5px solid var(--color-border-secondary)',
}

export const Settings: React.FC = () => {
  const config = useMemo<SpineConfig>(() => loadConfig(), [])
  const [hauskaKey, setHauskaKey] = useState(config.hauskaKey || '')
  const [saved, setSaved] = useState(false)

  const isProxyMode =
    config.cortexApiUrl?.startsWith('/api/') ||
    config.mcpUrl?.startsWith('/api/') ||
    config.retrievalApiUrl?.startsWith('/api/')

  const handleSave = () => {
    saveConfig({ hauskaKey })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleClear = () => {
    saveConfig({ hauskaKey: '' })
    setHauskaKey('')
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <Panel
      title="Settings"
      subtitle="Config + key management (local-dev direct mode)"
      right={<Pill sev={config.hauskaKey ? 'ok' : 'info'}>{config.hauskaKey ? 'keyed' : 'anonymous'}</Pill>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <span style={sectionHeader}>Mode</span>
          <div
            style={{
              marginTop: 8,
              padding: '10px 12px',
              borderRadius: 6,
              background: isProxyMode ? 'var(--color-background-success)' : 'var(--color-background-warning)',
              border: `0.5px solid ${isProxyMode ? 'var(--color-border-success)' : 'var(--color-border-warning)'}`,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: isProxyMode ? 'var(--color-text-success)' : 'var(--color-text-warning)', fontFamily: 'var(--font-ui)', marginBottom: 4 }}>
              {isProxyMode ? 'Deployed Mode (Proxy)' : 'Local-Dev Direct Mode'}
            </div>
            <div style={{ fontSize: 11, color: isProxyMode ? 'var(--color-text-success)' : 'var(--color-text-warning)', fontFamily: 'var(--font-ui)', lineHeight: 1.5 }}>
              {isProxyMode
                ? 'Same-origin /api/spine/* proxy. Auth attached server-side from Vercel env vars. Browser never holds service keys.'
                : 'Direct mode (VITE_ env overrides). Keys sent from browser. Use for local dev only.'}
            </div>
          </div>
        </div>

        <div>
          <span style={sectionHeader}>Empressa API Key</span>
          <p
            style={{
              fontSize: 11,
              color: 'var(--color-text-tertiary)',
              fontFamily: 'var(--font-ui)',
              marginTop: 4,
              marginBottom: 8,
            }}
          >
            {isProxyMode
              ? 'In deployed mode, keys are managed server-side. This field is not used.'
              : 'For local-dev direct mode only. Paste your Empressa API key (X-Hauska-Key / Bearer).'}
          </p>
          <input
            type="password"
            style={inputStyle}
            placeholder={isProxyMode ? '(not used in proxy mode)' : 'Paste Empressa key here'}
            value={hauskaKey}
            onChange={(e) => setHauskaKey(e.target.value)}
            disabled={isProxyMode}
          />
          {!isProxyMode && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button style={btnStyle} onClick={handleSave}>
                Save Key
              </button>
              <button style={{ ...btnStyle, background: 'var(--color-background-secondary)' }} onClick={handleClear}>
                Clear
              </button>
              {saved && (
                <span style={{ fontSize: 11, color: 'var(--color-text-success)', fontFamily: 'var(--font-ui)', alignSelf: 'center' }}>
                  Saved
                </span>
              )}
            </div>
          )}
        </div>

        <div>
          <span style={sectionHeader}>Current Configuration</span>
          <div
            style={{
              marginTop: 8,
              padding: '10px 12px',
              borderRadius: 6,
              background: 'var(--color-background-secondary)',
              border: '0.5px solid var(--color-border-tertiary)',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px', alignItems: 'baseline' }}>
              <span style={{ ...sectionHeader, fontSize: 10 }}>cortexApiUrl</span>
              <span style={{ ...mono, fontSize: 10, color: 'var(--color-text-secondary)', wordBreak: 'break-all' }}>
                {config.cortexApiUrl || '—'}
              </span>
              <span style={{ ...sectionHeader, fontSize: 10 }}>mcpUrl</span>
              <span style={{ ...mono, fontSize: 10, color: 'var(--color-text-secondary)', wordBreak: 'break-all' }}>
                {config.mcpUrl || '—'}
              </span>
              <span style={{ ...sectionHeader, fontSize: 10 }}>retrievalApiUrl</span>
              <span style={{ ...mono, fontSize: 10, color: 'var(--color-text-secondary)', wordBreak: 'break-all' }}>
                {config.retrievalApiUrl || '—'}
              </span>
              <span style={{ ...sectionHeader, fontSize: 10 }}>hauskaKey</span>
              <span style={{ ...mono, fontSize: 10, color: 'var(--color-text-secondary)' }}>
                {config.hauskaKey ? '••••••••' : '(not set)'}
              </span>
              <span style={{ ...sectionHeader, fontSize: 10 }}>installId</span>
              <span style={{ ...mono, fontSize: 10, color: 'var(--color-text-secondary)' }}>
                {config.installId || '—'}
              </span>
            </div>
          </div>
        </div>

        <div>
          <span style={sectionHeader}>Query String Overrides</span>
          <p
            style={{
              fontSize: 11,
              color: 'var(--color-text-tertiary)',
              fontFamily: 'var(--font-ui)',
              marginTop: 4,
              lineHeight: 1.5,
            }}
          >
            You can override config via query params: ?api=..., ?mcp=..., ?retrieval=.... These take precedence over
            localStorage. Reload to apply.
          </p>
        </div>
      </div>
    </Panel>
  )
}

export default Settings
