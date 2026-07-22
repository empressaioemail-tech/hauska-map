// Client-side auth helpers — session probe + sign-in URLs.

export type AuthStatus = {
  configured: { google: boolean; microsoft: boolean }
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
      configured: { google: false, microsoft: false },
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
