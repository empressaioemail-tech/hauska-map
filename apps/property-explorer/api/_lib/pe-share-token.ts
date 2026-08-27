// PE share-link token — mint + validate (Workbench W4 SHARE).
//
// TRUST MODEL (read before touching):
//   - A share link carries a SIGNED, SELF-CONTAINED token: HMAC-SHA256 over
//     {v:1, p:<parcelNodeId>, exp:<epoch-seconds>} using the server-only env
//     `PE_SHARE_SECRET`. No database row, no session, no user id in the token.
//   - MINTING is sign-in only: POST /api/pe-share requires a PE session.
//     Share is free (locked 2026-08-10). Export entitlement is not a mint gate.
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

/**
 * Token versions. v1 = {v,p,exp} (parcel-only). v2 (2026-07-29, dossier
 * share) additionally embeds the SHARER's owner scope {t: tenantId,
 * u: ownerUserId} so the share-view BFF can fetch the sharer's saved
 * dossier through the cortex service-key route. v1 tokens KEEP WORKING
 * read-only — they simply carry no owner scope, so the share view renders
 * without the dossier section (never an error).
 */
export const SHARE_TOKEN_VERSION_V1 = 1
export const SHARE_TOKEN_VERSION_V2 = 2
/** The version newly minted owner-scoped tokens carry. */
export const SHARE_TOKEN_VERSION = SHARE_TOKEN_VERSION_V2
/** Share links are time-boxed to 30 days. */
export const SHARE_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000

/** The sharer's saved-properties owner scope (cortex peSavedProperties key). */
export interface ShareOwnerScope {
  tenantId: string
  ownerUserId: string
}

export interface ShareTokenPayload {
  v: typeof SHARE_TOKEN_VERSION_V1 | typeof SHARE_TOKEN_VERSION_V2
  /** The ONE parcel this token can read ("{fips}:{propId}"). */
  p: string
  /** Expiry, epoch SECONDS. */
  exp: number
  /** v2 only — sharer tenant id. */
  t?: string
  /** v2 only — sharer owner user id. */
  u?: string
}

export type ShareTokenValidation =
  | {
      ok: true
      parcelNodeId: string
      expiresAt: string
      /** Present on v2 tokens; null on v1 (read-only compat, no dossier). */
      ownerScope: ShareOwnerScope | null
    }
  | { ok: false; reason: 'invalid' | 'expired' }

/** Owner-scope ids are cortex-side strings; mirror its 1..128 shape check. */
function isValidScopeId(value: unknown): value is string {
  return (
    typeof value === 'string' && value.trim().length > 0 && value.length <= 128
  )
}

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
  /**
   * The sharer's owner scope. Present → v2 token (share view can carry the
   * dossier). Absent → v1 token (read-only compat shape; no dossier section).
   */
  ownerScope?: ShareOwnerScope | null
  nowMs?: number
  ttlMs?: number
}): { token: string; expiresAt: string; version: 1 | 2 } {
  const nowMs = opts.nowMs ?? Date.now()
  const ttlMs = opts.ttlMs ?? SHARE_TOKEN_TTL_MS
  const exp = Math.floor((nowMs + ttlMs) / 1000)
  const scope =
    opts.ownerScope &&
    isValidScopeId(opts.ownerScope.tenantId) &&
    isValidScopeId(opts.ownerScope.ownerUserId)
      ? opts.ownerScope
      : null
  const payload: ShareTokenPayload = scope
    ? {
        v: SHARE_TOKEN_VERSION_V2,
        p: opts.parcelNodeId,
        exp,
        t: scope.tenantId,
        u: scope.ownerUserId,
      }
    : { v: SHARE_TOKEN_VERSION_V1, p: opts.parcelNodeId, exp }
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), 'utf8'))
  const sig = b64url(sign(payloadB64, opts.secret))
  return {
    token: `${payloadB64}.${sig}`,
    expiresAt: new Date(exp * 1000).toISOString(),
    version: scope ? 2 : 1,
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
  if (rec.v !== SHARE_TOKEN_VERSION_V1 && rec.v !== SHARE_TOKEN_VERSION_V2) {
    return { ok: false, reason: 'invalid' }
  }
  const parcelNodeId = rec.p
  const exp = rec.exp
  if (
    !isValidParcelNodeId(parcelNodeId) ||
    typeof exp !== 'number' ||
    !Number.isFinite(exp)
  ) {
    return { ok: false, reason: 'invalid' }
  }
  // A v2 token MUST carry a well-formed owner scope — a signed v2 payload
  // with a malformed scope is invalid, never silently downgraded to v1.
  let ownerScope: ShareOwnerScope | null = null
  if (rec.v === SHARE_TOKEN_VERSION_V2) {
    if (!isValidScopeId(rec.t) || !isValidScopeId(rec.u)) {
      return { ok: false, reason: 'invalid' }
    }
    ownerScope = { tenantId: rec.t, ownerUserId: rec.u }
  }
  if (nowMs >= exp * 1000) {
    return { ok: false, reason: 'expired' }
  }
  return {
    ok: true,
    parcelNodeId,
    expiresAt: new Date(exp * 1000).toISOString(),
    ownerScope,
  }
}

// ---------------------------------------------------------------------------
// Share-view access gate — the single decision the view BFF applies before
// touching any upstream. Pure so tests can pin the 503/403 mapping.
// ---------------------------------------------------------------------------

export type ShareViewAccess =
  | {
      ok: true
      parcelNodeId: string
      expiresAt: string
      /** v2 tokens only — the sharer's owner scope for the dossier read. */
      ownerScope: ShareOwnerScope | null
    }
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
    return (validated as { ok: false; reason?: string }).reason === 'expired'
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
  return {
    ok: true,
    parcelNodeId: validated.parcelNodeId,
    expiresAt: validated.expiresAt,
    ownerScope: validated.ownerScope,
  }
}
