// Client-side auth helpers — session probe + sign-in URLs.

export type AuthStatus = {
  configured: { google: boolean; microsoft: boolean; email: boolean }
  anyProvider: boolean
  message: string
}

export type SessionState = {
  authenticated: boolean
  hasSession?: boolean
}

export async function fetchAuthStatus(): Promise<AuthStatus> {
  const res = await fetch('/api/auth/status')
  if (!res.ok) {
    return {
      configured: { google: false, microsoft: false, email: false },
      anyProvider: false,
      message: 'Sign-in not configured',
    }
  }
  return (await res.json()) as AuthStatus
}

export async function fetchSession(): Promise<SessionState> {
  const res = await fetch('/api/auth/session', { credentials: 'include' })
  if (!res.ok) return { authenticated: false }
  return (await res.json()) as SessionState
}

export function googleSignInUrl(): string {
  return '/api/auth/google/start'
}

export function microsoftSignInUrl(): string {
  return '/api/auth/microsoft/start'
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
}

// ---------------------------------------------------------------------------
// P-112 email leg — magic-link sign-in. No password anywhere in this flow.
// ---------------------------------------------------------------------------

/** Loose client-side format guard only — the server is the real validator. */
export function isPlausibleEmail(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 254) return false
  const at = trimmed.indexOf('@')
  return at > 0 && at < trimmed.length - 1 && !trimmed.includes(' ')
}

export type MagicLinkRequestOutcome =
  | { ok: true }
  | { ok: false; error: string; message?: string; retryAfterSeconds?: number }

/** POSTs to the BFF, which proxies to Cortex. Never claims success it did
 * not get back — a send failure or rate limit surfaces honestly. */
export async function requestMagicLinkEmail(
  email: string,
): Promise<MagicLinkRequestOutcome> {
  try {
    const res = await fetch('/api/auth/email/request', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      return {
        ok: false,
        error: typeof body.error === 'string' ? body.error : 'request_failed',
        message: typeof body.message === 'string' ? body.message : undefined,
        retryAfterSeconds:
          typeof body.retryAfterSeconds === 'number' ? body.retryAfterSeconds : undefined,
      }
    }
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: 'network_error',
      message: err instanceof Error ? err.message : String(err),
    }
  }
}

/** Deep-route proxy base — user session Bearer, not service key. */
export const CORTEX_DEEP_PROXY_BASE = '/api/spine-deep'

export async function postDeepResearch(
  path: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetch(`${CORTEX_DEEP_PROXY_BASE}/${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
