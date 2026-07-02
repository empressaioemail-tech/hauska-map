// apps/command-center/src/admin/components/ErrorBoundary.tsx
//
// Per-panel boundary (re-keyed on panel id so a thrown panel resets on nav).
// Ported verbatim from the trading Control Tower so a panel that throws shows an
// honest error card (with retry) instead of a white screen.
import React from 'react'

interface Props {
  tabName: string
  children: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  componentStack: string | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null, componentStack: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, componentStack: null }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.tabName}]`, error, info.componentStack)
    this.setState({ componentStack: info.componentStack ?? null })
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, componentStack: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: 16,
          padding: 32,
          fontFamily: 'var(--font-mono, monospace)',
          color: 'var(--color-text-secondary)',
          background: 'var(--color-background-primary)',
        }}>
          <div style={{
            fontSize: 11,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-text-danger)',
          }}>
            {this.props.tabName} — render error
          </div>
          <div style={{
            fontSize: 11,
            color: 'var(--color-text-tertiary)',
            maxWidth: 480,
            textAlign: 'center',
            lineHeight: 1.5,
            wordBreak: 'break-word',
          }}>
            {this.state.error?.message ?? 'Unknown error'}
          </div>
          {import.meta.env.DEV && (this.state.error?.stack || this.state.componentStack) && (
            <pre style={{
              fontSize: 9,
              lineHeight: 1.5,
              color: 'var(--color-text-tertiary)',
              background: 'var(--color-background-secondary)',
              border: '0.5px solid var(--color-border-tertiary)',
              borderRadius: 6,
              padding: 12,
              maxWidth: 760,
              maxHeight: 280,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              textAlign: 'left',
            }}>
              {[this.state.error?.stack, this.state.componentStack].filter(Boolean).join('\n\n— component stack —\n')}
            </pre>
          )}
          <button
            type="button"
            onClick={this.handleRetry}
            style={{
              fontSize: 10,
              fontFamily: 'var(--font-mono, monospace)',
              padding: '5px 16px',
              border: '0.5px solid var(--color-border-secondary)',
              background: 'var(--color-background-secondary)',
              color: 'var(--color-text-primary)',
              cursor: 'pointer',
              borderRadius: 2,
              letterSpacing: '0.05em',
            }}
          >
            Retry
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
