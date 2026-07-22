import type { VercelResponse } from '@vercel/node'
import { PE_SESSION_COOKIE } from './oidc-config.js'

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export function setPeSessionCookie(res: VercelResponse, token: string, secure: boolean): void {
  const parts = [
    `${PE_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_MAX_AGE_MS / 1000)}`,
  ]
  if (secure) parts.push('Secure')
  res.setHeader('Set-Cookie', parts.join('; '))
}

export function clearPeSessionCookie(res: VercelResponse): void {
  res.setHeader('Set-Cookie', `${PE_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
}

export function readPeSessionCookie(
  cookieHeader: string | undefined,
): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim()
    if (trimmed.startsWith(`${PE_SESSION_COOKIE}=`)) {
      return decodeURIComponent(trimmed.slice(PE_SESSION_COOKIE.length + 1))
    }
  }
  return null
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'
}
