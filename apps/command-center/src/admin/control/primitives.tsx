// apps/command-center/src/admin/control/primitives.tsx
//
// Shared visual primitives for the Spine Command Center. Ported from the trading
// app's operator Control Tower: flex columns, var(--color-*) tokens, mono for
// numerics, uppercase section headers, honest loading / empty / error states
// (never a white screen).

import React from 'react'

export type Severity = 'info' | 'warn' | 'action' | 'ok' | 'danger' | string | null | undefined

// Map a backend severity/status string onto our token palette.
export function sevColors(sev: Severity): { fg: string; bg: string; border: string } {
  const s = (sev || '').toString().toLowerCase()
  if (s === 'action' || s === 'danger' || s === 'error' || s === 'red' || s === 'down' || s === 'fail' || s === 'unhealthy')
    return { fg: 'var(--color-text-danger)', bg: 'var(--color-background-danger)', border: 'var(--color-border-danger)' }
  if (s === 'warn' || s === 'warning' || s === 'degraded' || s === 'yellow' || s === 'drift')
    return { fg: 'var(--color-text-warning)', bg: 'var(--color-background-warning)', border: 'var(--color-border-warning)' }
  if (s === 'ok' || s === 'green' || s === 'healthy' || s === 'up' || s === 'pass' || s === 'success' || s === 'active')
    return { fg: 'var(--color-text-success)', bg: 'var(--color-background-success)', border: 'var(--color-border-success)' }
  return { fg: 'var(--color-text-info)', bg: 'var(--color-background-info)', border: 'var(--color-border-info)' }
}

export const sectionHeader: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  fontFamily: 'var(--font-ui)',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--color-text-tertiary)',
}

export const mono: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontVariantNumeric: 'tabular-nums',
}

// A panel shell: header + a scrollable body. Every Command Center panel uses it
// so loading / empty / error all read the same.
export const Panel: React.FC<{
  title: string
  subtitle?: React.ReactNode
  right?: React.ReactNode
  children: React.ReactNode
}> = ({ title, subtitle, right, children }) => (
  <section
    style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
      flex: 1,
      background: 'var(--color-background-primary)',
      border: '0.5px solid var(--color-border-tertiary)',
      borderRadius: 10,
      overflow: 'hidden',
    }}
  >
    <div
      style={{
        flex: 'none',
        padding: '10px 14px',
        borderBottom: '0.5px solid var(--color-border-tertiary)',
        background: 'var(--color-background-secondary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ ...sectionHeader, fontSize: 11, color: 'var(--color-text-secondary)' }}>{title}</span>
        {subtitle != null && (
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-ui)' }}>
            {subtitle}
          </span>
        )}
      </div>
      {right}
    </div>
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: 14 }}>{children}</div>
  </section>
)

export const Centered: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color }) => (
  <div
    style={{
      minHeight: 80,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 18,
      textAlign: 'center',
      color: color ?? 'var(--color-text-tertiary)',
      fontFamily: 'var(--font-ui)',
      fontSize: 12,
    }}
  >
    {children}
  </div>
)

export const Loading: React.FC = () => <Centered>Loading…</Centered>

export const ErrorState: React.FC<{ msg: string }> = ({ msg }) => (
  <Centered color="var(--color-text-danger)">Couldn't load — {msg}</Centered>
)

export const Empty: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <Centered>{children ?? 'Nothing here.'}</Centered>
)

// Small status pill (used for service / feed / account health).
export const Pill: React.FC<{ sev: Severity; children: React.ReactNode; title?: string }> = ({ sev, children, title }) => {
  const c = sevColors(sev)
  return (
    <span
      title={title}
      style={{
        ...mono,
        fontSize: 10,
        fontWeight: 700,
        padding: '2px 8px',
        borderRadius: 999,
        color: c.fg,
        background: c.bg,
        border: `0.5px solid ${c.border}`,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function fmtNum(n: number | null | undefined, digits = 0): string {
  if (n == null || Number.isNaN(n)) return '—'
  return n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 })
}
