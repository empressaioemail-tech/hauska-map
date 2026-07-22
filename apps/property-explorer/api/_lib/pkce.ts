import { createHash, randomBytes } from 'node:crypto'

export function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(32))
  const challenge = b64url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

export function generateState(): string {
  return b64url(randomBytes(24))
}

function b64url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

export interface PendingOidcState {
  provider: 'google' | 'microsoft'
  verifier: string
  createdAt: number
}

const STATE_TTL_MS = 10 * 60 * 1000

function stateKey(): string | null {
  const secret = process.env.OIDC_STATE_SECRET?.trim()
  return secret && secret.length > 0 ? secret : null
}

function sealPayload(payload: PendingOidcState): string | null {
  const secret = stateKey()
  if (!secret) return null
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'))
  const sig = b64url(createHash('sha256').update(`${body}.${secret}`).digest())
  return `${body}.${sig}`
}

export function unsealPayload(token: string): PendingOidcState | null {
  const secret = stateKey()
  if (!secret) return null
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = b64url(createHash('sha256').update(`${body}.${secret}`).digest())
  if (sig !== expected) return null
  try {
    const parsed = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as PendingOidcState
    if (Date.now() - parsed.createdAt > STATE_TTL_MS) return null
    return parsed
  } catch {
    return null
  }
}

export function sealOidcState(payload: PendingOidcState): string | null {
  return sealPayload(payload)
}

export function oidcStateCookieName(): string {
  return 'pe_oidc_state'
}

export function oidcStateCookieOpts(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    maxAge: STATE_TTL_MS,
    path: '/api/auth',
  }
}
