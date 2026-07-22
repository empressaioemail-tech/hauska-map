// apps/property-explorer/src/coldopen/SignUpCard.tsx
//
// Cold-open sign-up card over the live dimmed map. Google + Microsoft OIDC
// when env is configured; honest "sign-in not configured" when secrets missing.
// "Just browse" stays anonymous — no auth required.

import { useEffect, useState } from 'react'
import {
  fetchAuthStatus,
  googleSignInUrl,
  microsoftSignInUrl,
  type AuthStatus,
} from '../lib/auth'

const CARD_BG = 'rgba(17, 21, 28, 0.92)'
const ACCENT = '#7dd3fc'

export function SignUpCard({ onDismiss }: { onDismiss: () => void }) {
  const [busy, setBusy] = useState<'google' | 'microsoft' | null>(null)
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    fetchAuthStatus()
      .then(setAuthStatus)
      .catch(() => setLoadError('Could not reach auth status'))
  }, [])

  const startGoogle = () => {
    if (!authStatus?.configured.google) return
    setBusy('google')
    window.location.href = googleSignInUrl()
  }

  const startMicrosoft = () => {
    if (!authStatus?.configured.microsoft) return
    setBusy('microsoft')
    window.location.href = microsoftSignInUrl()
  }

  const signInConfigured = authStatus?.anyProvider ?? false

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Get started"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        data-testid="signup-card"
        style={{
          pointerEvents: 'auto',
          width: 'min(420px, calc(100vw - 32px))',
          padding: '28px 28px 24px',
          borderRadius: 16,
          background: CARD_BG,
          border: '0.5px solid rgba(125,211,252,0.35)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.55)',
          color: '#e9eef5',
          fontFamily:
            'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
          backdropFilter: 'blur(2px)',
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.16em',
            color: ACCENT,
            marginBottom: 14,
          }}
        >
          EMPRESSA
        </div>

        <h1
          style={{
            margin: '0 0 14px',
            fontSize: 24,
            lineHeight: 1.22,
            fontWeight: 700,
            letterSpacing: '-0.01em',
          }}
        >
          See what you can build on any lot in Central Texas.
        </h1>

        <ul
          style={{
            listStyle: 'none',
            margin: '0 0 22px',
            padding: 0,
            display: 'grid',
            gap: 10,
          }}
        >
          {[
            'Tap any parcel for zoning, setbacks, and your buildable envelope.',
            'Real records, cited and dated — never a guess dressed up as fact.',
            'Free to explore. No account needed to look around.',
          ].map((t) => (
            <li
              key={t}
              style={{
                display: 'flex',
                gap: 10,
                fontSize: 14,
                lineHeight: 1.4,
                color: '#c6d0dc',
              }}
            >
              <span aria-hidden style={{ color: ACCENT, marginTop: 1 }}>
                ●
              </span>
              <span>{t}</span>
            </li>
          ))}
        </ul>

        {loadError && (
          <p data-testid="auth-load-error" style={{ color: '#c98b3a', fontSize: 13, marginBottom: 12 }}>
            {loadError}
          </p>
        )}

        {!signInConfigured && authStatus && (
          <p
            data-testid="sign-in-not-configured"
            style={{
              fontSize: 13,
              color: '#aeb8c4',
              marginBottom: 14,
              padding: '10px 12px',
              borderRadius: 8,
              border: '0.5px solid rgba(174,184,196,0.28)',
              background: 'rgba(0,0,0,0.2)',
            }}
          >
            Sign-in is not configured on this deploy yet. You can browse the map anonymously.
          </p>
        )}

        {authStatus?.configured.google && (
          <button
            type="button"
            data-testid="continue-google"
            onClick={startGoogle}
            disabled={busy !== null}
            style={primaryBtnStyle(busy === 'google')}
          >
            <GoogleGlyph />
            {busy === 'google' ? 'Redirecting…' : 'Continue with Google'}
          </button>
        )}

        {authStatus?.configured.microsoft && (
          <button
            type="button"
            data-testid="continue-microsoft"
            onClick={startMicrosoft}
            disabled={busy !== null}
            style={{ ...primaryBtnStyle(busy === 'microsoft'), marginTop: authStatus?.configured.google ? 10 : 0 }}
          >
            <MicrosoftGlyph />
            {busy === 'microsoft' ? 'Redirecting…' : 'Continue with Microsoft'}
          </button>
        )}

        <button
          type="button"
          data-testid="browse-instead"
          onClick={onDismiss}
          style={{
            width: '100%',
            marginTop: 10,
            padding: '10px 16px',
            fontSize: 13,
            fontWeight: 500,
            color: '#aeb8c4',
            background: 'transparent',
            border: '0.5px solid rgba(174,184,196,0.28)',
            borderRadius: 10,
            cursor: 'pointer',
          }}
        >
          Just browse the map
        </button>
      </div>
    </div>
  )
}

function primaryBtnStyle(busy: boolean) {
  return {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: '12px 16px',
    fontSize: 15,
    fontWeight: 600,
    color: '#11151c',
    background: '#ffffff',
    border: 'none',
    borderRadius: 10,
    cursor: busy ? 'default' : 'pointer',
    opacity: busy ? 0.7 : 1,
  } as const
}

function GoogleGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

function MicrosoftGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 21 21" aria-hidden focusable="false">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  )
}
