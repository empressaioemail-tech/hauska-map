// PE share-link token — mint + validate (Workbench W4 SHARE).
//
// TRUST MODEL (read before touching):
//   - A share link carries a SIGNED, SELF-CONTAINED token: HMAC-SHA256 over
//     {v:1, p:<parcelNodeId>, exp:<epoch-seconds>} using the server-only env
//     `PE_SHARE_SECRET`. No database row, no session, no user id in the token.
//   - MINTING is gated: POST /api/pe-share requires a PE session plus the same
//     entitlement class as exporting (paid tier, or the operator dev bypass) —
//     the sharer must be able to see what they share.
//   - VIEWING is anonymous by design (the realtor-hands-a-client wedge), but
//     the token scopes the viewer to EXACTLY one parcel's artifacts, read-only,
//     time-boxed (30 days). The share-view BFF validates the token server-side
//     and proxies upstream fetches with server credentials; the viewer never
//     receives a session, a service key, or any path beyond that parcel.
//   - Everything served through a share link is public-record-derived baked
//     data (the anonymous facet snapshot the map already serves, and export
//     artifacts derived from it). No owner data, no tenant-private paths.
//   - Missing PE_SHARE_SECRET → honest 503 "sharing not configured", never a
//     silently-unsigned token.
//
// Token wire format: base64url(payloadJson) + "." + base64url(hmacSha256).

import { createHmac, timingSafeEqual } from 'node:crypto'
import { isValidParcelNodeId } from './parcel-node-id.js'

export const SHARE_TOKEN_VERSION = 1
/** Share links are time-boxed to 30 days. */
export const SHARE_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000

export interface ShareTokenPayload {
  v: typeof SHARE_TOKEN_VERSION
  /** The ONE parcel this token can read ("{fips}:{propId}"). */
  p: string
  /** Expiry, epoch SECONDS. */
  exp: number
}

export type ShareTokenValidation =
  | { ok: true; parcelNodeId: string; expiresAt: string }
  | { ok: false; reason: 'invalid' | 'expired' }

export function peShareSecret(): string | null {
  const v = process.env.PE_SHARE_SECRET?.trim()
  return v && v.length > 0 ? v : null
}

function b64url(buf: Buffer): string {
  return buf.toString('base64url')
}

function sign(payloadB64: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(payloadB64).digest()
}

export function mintShareToken(opts: {
  parcelNodeId: string
  secret: string
  nowMs?: number
  ttlMs?: number
}): { token: string; expiresAt: string } {
  const nowMs = opts.nowMs ?? Date.now()
  const ttlMs = opts.ttlMs ?? SHARE_TOKEN_TTL_MS
  const exp = Math.floor((nowMs + ttlMs) / 1000)
  const payload: ShareTokenPayload = {
    v: SHARE_TOKEN_VERSION,
    p: opts.parcelNodeId,
    exp,
  }
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), 'utf8'))
  const sig = b64url(sign(payloadB64, opts.secret))
  return {
    token: `${payloadB64}.${sig}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  }
}

/**
 * Validate a share token. Signature is checked BEFORE the payload is trusted;
 * a bad signature or malformed structure is 'invalid', a good signature past
 * its exp is 'expired' (the honest "this share link has expired" state).
 */
export function validateShareToken(
  token: unknown,
  secret: string,
  nowMs: number = Date.now(),
): ShareTokenValidation {
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) {
    return { ok: false, reason: 'invalid' }
  }
  const dot = token.indexOf('.')
  if (dot <= 0 || dot === token.length - 1 || token.indexOf('.', dot + 1) !== -1) {
    return { ok: false, reason: 'invalid' }
  }
  const payloadB64 = token.slice(0, dot)
  const sigB64 = token.slice(dot + 1)

  let claimed: Buffer
  try {
    claimed = Buffer.from(sigB64, 'base64url')
  } catch {
    return { ok: false, reason: 'invalid' }
  }
  const expected = sign(payloadB64, secret)
  if (claimed.length !== expected.length || !timingSafeEqual(claimed, expected)) {
    return { ok: false, reason: 'invalid' }
  }

  let payload: unknown
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
  } catch {
    return { ok: false, reason: 'invalid' }
  }
  if (payload === null || typeof payload !== 'object') {
    return { ok: false, reason: 'invalid' }
  }
  const rec = payload as Record<string, unknown>
  if (rec.v !== SHARE_TOKEN_VERSION) return { ok: false, reason: 'invalid' }
  const parcelNodeId = rec.p
  const exp = rec.exp
  if (
    !isValidParcelNodeId(parcelNodeId) ||
    typeof exp !== 'number' ||
    !Number.isFinite(exp)
  ) {
    return { ok: false, reason: 'invalid' }
  }
  if (nowMs >= exp * 1000) {
    return { ok: false, reason: 'expired' }
  }
  return {
    ok: true,
    parcelNodeId,
    expiresAt: new Date(exp * 1000).toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Share-view access gate — the single decision the view BFF applies before
// touching any upstream. Pure so tests can pin the 503/403 mapping.
// ---------------------------------------------------------------------------

export type ShareViewAccess =
  | { ok: true; parcelNodeId: string; expiresAt: string }
  | {
      ok: false
      status: 403 | 503
      error: 'sharing_not_configured' | 'share_link_invalid' | 'share_link_expired'
      message: string
    }

export function resolveShareViewAccess(opts: {
  token: unknown
  secret: string | null
  nowMs?: number
}): ShareViewAccess {
  if (!opts.secret) {
    return {
      ok: false,
      status: 503,
      error: 'sharing_not_configured',
      message: 'Sharing is not configured on this deployment (PE_SHARE_SECRET missing).',
    }
  }
  const validated = validateShareToken(opts.token, opts.secret, opts.nowMs)
  if (!validated.ok) {
    return validated.reason === 'expired'
      ? {
          ok: false,
          status: 403,
          error: 'share_link_expired',
          message: 'This share link has expired.',
        }
      : {
          ok: false,
          status: 403,
          error: 'share_link_invalid',
          message: 'This share link is invalid or has expired.',
        }
  }
  return { ok: true, parcelNodeId: validated.parcelNodeId, expiresAt: validated.expiresAt }
}
