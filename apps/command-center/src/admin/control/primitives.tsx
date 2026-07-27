// apps/command-center/src/admin/control/primitives.tsx
//
// Shared visual primitives for the Spine Command Center. Ported from the trading
// app's operator Control Tower: flex columns, var(--color-*) tokens, mono for
// numerics, uppercase section headers, honest loading / empty / error states
// (never a white screen). Type scale + Card / Button / AtomListRow / WalkBreadcrumb
// are the single shared idioms (QA3).

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
  fontSize: 'var(--type-section)',
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

export const typeCaption: React.CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--type-caption)',
  color: 'var(--color-text-tertiary)',
  lineHeight: 1.4,
}

export const typeBody: React.CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--type-body)',
  color: 'var(--color-text-secondary)',
  lineHeight: 1.45,
}

export const typeTitle: React.CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--type-title)',
  fontWeight: 700,
  color: 'var(--color-text-primary)',
  lineHeight: 1.3,
}

/** Readable one-line summary of arbitrary JSON / objects (no raw truncated stringify). */
export function summarizeValue(value: unknown, maxLen = 96): string {
  if (value == null) return '—'
  if (typeof value === 'string') return value.length > maxLen ? `${value.slice(0, maxLen - 1)}…` : value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    const head = summarizeValue(value[0], 40)
    return value.length === 1 ? `[${head}]` : `[${head}, … +${value.length - 1}]`
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj)
    if (keys.length === 0) return '{}'
    const parts = keys.slice(0, 3).map((k) => {
      const v = obj[k]
      const short =
        v == null
          ? 'null'
          : typeof v === 'object'
            ? Array.isArray(v)
              ? `arr(${v.length})`
              : '{…}'
            : String(v)
      return `${k}=${short.length > 24 ? `${short.slice(0, 23)}…` : short}`
    })
    const extra = keys.length > 3 ? ` · +${keys.length - 3}` : ''
    const out = parts.join(' · ') + extra
    return out.length > maxLen ? `${out.slice(0, maxLen - 1)}…` : out
  }
  return String(value)
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
        <span style={{ ...sectionHeader, fontSize: 'var(--type-body)', color: 'var(--color-text-secondary)' }}>{title}</span>
        {subtitle != null && <span style={{ ...typeCaption }}>{subtitle}</span>}
      </div>
      {right}
    </div>
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: 14 }}>{children}</div>
  </section>
)

/** Single card surface used across NodeGraph / SpineHealth / workspace tiles. */
export const Card: React.FC<{
  children: React.ReactNode
  padding?: number | string
  style?: React.CSSProperties
  onClick?: () => void
  asButton?: boolean
  testId?: string
  title?: string
}> = ({ children, padding = '10px 12px', style, onClick, asButton, testId, title }) => {
  const base: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding,
    borderRadius: 8,
    background: 'var(--color-background-secondary)',
    border: '0.5px solid var(--color-border-tertiary)',
    ...style,
  }
  if (asButton || onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        data-testid={testId}
        style={{
          ...base,
          textAlign: 'left',
          cursor: 'pointer',
          font: 'inherit',
          color: 'inherit',
          width: '100%',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--color-background-accent)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background =
            (style?.background as string) || 'var(--color-background-secondary)'
        }}
      >
        {children}
      </button>
    )
  }
  return (
    <div data-testid={testId} title={title} style={base}>
      {children}
    </div>
  )
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'accent'

const buttonVariantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    color: 'var(--color-text-primary)',
    background: 'var(--color-background-accent)',
    border: '0.5px solid var(--color-border-secondary)',
  },
  secondary: {
    color: 'var(--color-text-primary)',
    background: 'var(--color-background-secondary)',
    border: '0.5px solid var(--color-border-tertiary)',
  },
  ghost: {
    color: 'var(--color-text-secondary)',
    background: 'transparent',
    border: '0.5px solid var(--color-border-secondary)',
  },
  accent: {
    color: 'var(--color-text-info)',
    background: 'var(--color-background-info)',
    border: '0.5px solid var(--color-border-info)',
  },
}

export const Button: React.FC<{
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: ButtonVariant
  type?: 'button' | 'submit'
  title?: string
  testId?: string
  style?: React.CSSProperties
}> = ({ children, onClick, disabled, variant = 'primary', type = 'button', title, testId, style }) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    title={title}
    data-testid={testId}
    style={{
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--type-caption)',
      fontWeight: 600,
      padding: '6px 12px',
      borderRadius: 6,
      cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      ...buttonVariantStyles[variant],
      ...style,
    }}
  >
    {children}
  </button>
)

export const CollapsibleSection: React.FC<{
  title: string
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  right?: React.ReactNode
  children: React.ReactNode
  testId?: string
}> = ({ title, defaultOpen = false, open: controlled, onOpenChange, right, children, testId }) => {
  const [internal, setInternal] = React.useState(defaultOpen)
  const open = controlled ?? internal
  const setOpen = (next: boolean) => {
    if (controlled === undefined) setInternal(next)
    onOpenChange?.(next)
  }
  return (
    <div data-testid={testId} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            color: 'inherit',
            font: 'inherit',
          }}
          aria-expanded={open}
        >
          <span style={{ ...mono, fontSize: 'var(--type-caption)', color: 'var(--color-text-tertiary)', width: 12 }}>
            {open ? '▾' : '▸'}
          </span>
          <span style={sectionHeader}>{title}</span>
        </button>
        {right}
      </div>
      {open ? children : null}
    </div>
  )
}

export type WalkCrumb = {
  label: string
  onClick?: () => void
  title?: string
}

/** Full traversal trail: node › family › atom (not a single back hop). */
export const WalkBreadcrumb: React.FC<{ crumbs: WalkCrumb[]; testId?: string }> = ({ crumbs, testId }) => {
  if (crumbs.length === 0) return null
  return (
    <nav
      aria-label="Walk trail"
      data-testid={testId ?? 'walk-breadcrumb'}
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 6,
        padding: '6px 10px',
        borderRadius: 6,
        background: 'var(--color-background-tertiary)',
        border: '0.5px solid var(--color-border-tertiary)',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--type-caption)',
        color: 'var(--color-text-secondary)',
        lineHeight: 1.4,
      }}
    >
      {crumbs.map((c, i) => (
        <React.Fragment key={`${c.label}-${i}`}>
          {i > 0 ? (
            <span style={{ color: 'var(--color-text-tertiary)', userSelect: 'none' }} aria-hidden>
              ›
            </span>
          ) : null}
          {c.onClick ? (
            <button
              type="button"
              onClick={c.onClick}
              title={c.title ?? c.label}
              style={{
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                color: 'var(--color-text-info)',
                font: 'inherit',
                maxWidth: 280,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {c.label}
            </button>
          ) : (
            <span
              title={c.title ?? c.label}
              style={{
                color: i === crumbs.length - 1 ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                fontWeight: i === crumbs.length - 1 ? 700 : 500,
                maxWidth: 320,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {c.label}
            </span>
          )}
        </React.Fragment>
      ))}
    </nav>
  )
}

export type AtomListRowProps = {
  claimType: string
  knowledgeTime?: string | null
  meta?: Array<{ label: string; value: React.ReactNode }>
  atomId?: string
  preview?: string | null
  accessPolicy?: string | null
  trailing?: React.ReactNode
  onClick?: () => void
  testId?: string
  title?: string
}

/** Single atom-row renderer for NodeGraph + AtomInspector lists. */
export const AtomListRow: React.FC<AtomListRowProps> = ({
  claimType,
  knowledgeTime,
  meta,
  atomId,
  preview,
  accessPolicy,
  trailing,
  onClick,
  testId,
  title,
}) => (
  <Card asButton={Boolean(onClick)} onClick={onClick} testId={testId} title={title} padding="8px 10px">
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
      <span style={{ ...mono, fontSize: 'var(--type-body)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
        {claimType}
      </span>
      <span style={{ ...mono, fontSize: 'var(--type-caption)', color: 'var(--color-text-tertiary)' }}>
        {fmtTime(knowledgeTime)}
      </span>
    </div>
    <div
      style={{
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
        alignItems: 'center',
        ...mono,
        fontSize: 'var(--type-caption)',
        color: 'var(--color-text-secondary)',
      }}
    >
      {(meta ?? []).map((m) => (
        <span key={m.label}>
          {m.label}: {m.value}
        </span>
      ))}
      {accessPolicy ? (
        <Pill sev={accessPolicy.includes('public') ? 'ok' : 'warn'}>{accessPolicy}</Pill>
      ) : null}
      {preview ? <span>{preview}</span> : null}
      {trailing}
    </div>
    {atomId ? (
      <span
        style={{
          ...mono,
          fontSize: 'var(--type-caption)',
          color: 'var(--color-text-tertiary)',
          wordBreak: 'break-all',
        }}
      >
        {atomId}
      </span>
    ) : null}
  </Card>
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
      fontSize: 'var(--type-body)',
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
        fontSize: 'var(--type-caption)',
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

export function shortDid(id: string, keep = 28): string {
  if (!id || id.length <= keep) return id
  return `${id.slice(0, 14)}…${id.slice(-10)}`
}
