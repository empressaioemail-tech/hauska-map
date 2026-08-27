// PE share grant — P-86 items 1 and 6 (A-037).
//
// The resolvable URL carries the grant row id. The HMAC never appears in a
// path or query (those land in Vercel / Cloud Run logs and referrers). HMAC
// remains the bearer for /share#token only.
//
// A mint that cannot persist a grant row refuses. A view that cannot resolve
// a grant row refuses. Expired and revoked are distinct 403s.

import { randomUUID } from 'node:crypto'
import { isValidParcelNodeId } from './parcel-node-id.js'
import { mintShareToken, SHARE_TOKEN_TTL_MS } from './pe-share-token.js'
import type { ShareGrantStore } from './pe-share-grant-store.js'

/** UUID (any RFC-4122 version). Not an HMAC (those contain a '.'). */
export const SHARE_GRANT_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface ShareGrantRow {
  id: string
  grantorUserId: string
  grantorTenantId: string
  parcelNodeId: string
  createdAt: string
  expiresAt: string
  revokedAt: string | null
}

export function isShareGrantId(value: unknown): value is string {
  return typeof value === 'string' && SHARE_GRANT_ID_RE.test(value)
}

export function newShareGrantId(randomUuid: () => string = randomUUID): string {
  const id = randomUuid()
  if (!isShareGrantId(id)) {
    throw new Error('grant_id_not_uuid')
  }
  return id
}

export function buildResolvableShareUrl(origin: string, grantId: string): string {
  if (!isShareGrantId(grantId)) {
    throw new Error('grant_id_required')
  }
  return `${origin.replace(/\/$/, '')}/s/${grantId}`
}

export function buildHumanShareUrl(origin: string, hmacToken: string): string {
  if (!hmacToken || hmacToken.includes('#') || hmacToken.includes('/')) {
    throw new Error('hmac_token_invalid')
  }
  return `${origin.replace(/\/$/, '')}/share#${hmacToken}`
}

/** SPA path a human browser should land on for a grant-id share (W2.1). */
export function shareAppLandingPath(grantId: string): string {
  if (!isShareGrantId(grantId)) {
    throw new Error('grant_id_required')
  }
  return `/share?g=${grantId}`
}

/**
 * True when GET /s/{id} is a browser document navigation and must 302 to
 * the SPA. Explicit format= (json / agent / html / markdown) stays the
 * instrument — that is how models fetch. A check observed only passing
 * is not a check: format=html + dest=document must NOT redirect.
 */
export function isBrowserShareNavigation(input: {
  queryFormat?: string | null
  secFetchDest?: string | null
  secFetchMode?: string | null
}): boolean {
  const format = input.queryFormat?.trim().toLowerCase() ?? ''
  if (
    format === 'json' ||
    format === 'agent' ||
    format === 'html' ||
    format === 'markdown'
  ) {
    return false
  }
  return input.secFetchDest === 'document' || input.secFetchMode === 'navigate'
}

/** True when a minted URL put a token (hash or HMAC-shaped path) where a grant id belongs. */
export function resolvableUrlLeaksToken(url: string): boolean {
  if (url.includes('#')) return true
  try {
    const parsed = new URL(url)
    const path = parsed.pathname.replace(/\/+$/, '')
    const match = path.match(/^\/s\/(.+)$/)
    if (!match) return true
    return !isShareGrantId(match[1])
  } catch {
    return true
  }
}

export type GrantViewAccess =
  | { ok: true; row: ShareGrantRow }
  | {
      ok: false
      status: 403
      error: 'share_grant_expired' | 'share_grant_revoked' | 'share_grant_invalid'
      message: string
    }

export function resolveGrantViewAccess(
  row: ShareGrantRow | null,
  nowMs: number = Date.now(),
): GrantViewAccess {
  if (!row || !isShareGrantId(row.id) || !isValidParcelNodeId(row.parcelNodeId)) {
    return {
      ok: false,
      status: 403,
      error: 'share_grant_invalid',
      message: 'This share link is invalid or has expired.',
    }
  }
  if (row.revokedAt) {
    return {
      ok: false,
      status: 403,
      error: 'share_grant_revoked',
      message: 'This share link has been revoked.',
    }
  }
  const expMs = Date.parse(row.expiresAt)
  if (!Number.isFinite(expMs) || nowMs >= expMs) {
    return {
      ok: false,
      status: 403,
      error: 'share_grant_expired',
      message: 'This share link has expired.',
    }
  }
  return { ok: true, row }
}

export type MintShareWithGrantResult =
  | {
      ok: true
      url: string
      humanUrl: string
      grantId: string
      token: string
      expiresAt: string
      parcelNodeId: string
    }
  | { ok: false; error: 'missing_grantor' | 'grant_persist_failed' | 'invalid_parcel_node_id' }

export async function mintShareWithGrant(opts: {
  parcelNodeId: string
  grantorUserId: string
  grantorTenantId: string
  origin: string
  secret: string
  store: ShareGrantStore
  nowMs?: number
  ttlMs?: number
  randomUuid?: () => string
}): Promise<MintShareWithGrantResult> {
  if (!isValidParcelNodeId(opts.parcelNodeId)) {
    return { ok: false, error: 'invalid_parcel_node_id' }
  }
  if (!opts.grantorUserId.trim() || !opts.grantorTenantId.trim()) {
    return { ok: false, error: 'missing_grantor' }
  }

  const nowMs = opts.nowMs ?? Date.now()
  const ttlMs = opts.ttlMs ?? SHARE_TOKEN_TTL_MS
  const grantId = newShareGrantId(opts.randomUuid)
  const minted = mintShareToken({
    parcelNodeId: opts.parcelNodeId,
    secret: opts.secret,
    ownerScope: {
      tenantId: opts.grantorTenantId,
      ownerUserId: opts.grantorUserId,
    },
    nowMs,
    ttlMs,
  })

  const row: ShareGrantRow = {
    id: grantId,
    grantorUserId: opts.grantorUserId,
    grantorTenantId: opts.grantorTenantId,
    parcelNodeId: opts.parcelNodeId,
    createdAt: new Date(nowMs).toISOString(),
    expiresAt: minted.expiresAt,
    revokedAt: null,
  }

  let written: ShareGrantRow
  try {
    written = await opts.store.insert(row)
  } catch {
    return { ok: false, error: 'grant_persist_failed' }
  }
  if (!written || written.id !== grantId || written.revokedAt) {
    return { ok: false, error: 'grant_persist_failed' }
  }

  const url = buildResolvableShareUrl(opts.origin, grantId)
  if (resolvableUrlLeaksToken(url)) {
    return { ok: false, error: 'grant_persist_failed' }
  }

  return {
    ok: true,
    url,
    humanUrl: buildHumanShareUrl(opts.origin, minted.token),
    grantId,
    token: minted.token,
    expiresAt: minted.expiresAt,
    parcelNodeId: opts.parcelNodeId,
  }
}
