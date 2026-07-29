/**
 * Share-token mint + validate + share-view access gate (Workbench W4).
 * HMAC round-trip, expiry, tamper rejection, honest 503/403 mapping.
 */

import { describe, expect, it } from 'vitest'
import {
  mintShareToken,
  resolveShareViewAccess,
  SHARE_TOKEN_TTL_MS,
  validateShareToken,
} from '../../api/_lib/pe-share-token.js'

const SECRET = 'test-share-secret'
const NOW = Date.UTC(2026, 6, 29)

describe('share token mint + validate round-trip', () => {
  it('round-trips the parcel and expiry', () => {
    const minted = mintShareToken({
      parcelNodeId: '48021:27303',
      secret: SECRET,
      nowMs: NOW,
    })
    const validated = validateShareToken(minted.token, SECRET, NOW)
    expect(validated).toEqual({
      ok: true,
      parcelNodeId: '48021:27303',
      expiresAt: minted.expiresAt,
    })
    // 30-day TTL (to second precision — exp is epoch seconds).
    const expMs = new Date(minted.expiresAt).getTime()
    expect(Math.abs(expMs - (NOW + SHARE_TOKEN_TTL_MS))).toBeLessThan(1000)
  })

  it('rejects an expired token as expired (not invalid)', () => {
    const minted = mintShareToken({
      parcelNodeId: '48021:27303',
      secret: SECRET,
      nowMs: NOW,
      ttlMs: 1000,
    })
    expect(validateShareToken(minted.token, SECRET, NOW + 2000)).toEqual({
      ok: false,
      reason: 'expired',
    })
    // Still valid just before expiry.
    expect(validateShareToken(minted.token, SECRET, NOW + 500).ok).toBe(true)
  })

  it('rejects a tampered payload (parcel swap keeps the old signature)', () => {
    const minted = mintShareToken({
      parcelNodeId: '48021:27303',
      secret: SECRET,
      nowMs: NOW,
    })
    const [, sig] = minted.token.split('.')
    const forgedPayload = Buffer.from(
      JSON.stringify({ v: 1, p: '48055:99999', exp: Math.floor((NOW + SHARE_TOKEN_TTL_MS) / 1000) }),
      'utf8',
    ).toString('base64url')
    expect(validateShareToken(`${forgedPayload}.${sig}`, SECRET, NOW)).toEqual({
      ok: false,
      reason: 'invalid',
    })
  })

  it('rejects a tampered signature and a wrong secret', () => {
    const minted = mintShareToken({
      parcelNodeId: '48021:27303',
      secret: SECRET,
      nowMs: NOW,
    })
    const flipped = minted.token.slice(0, -2) + (minted.token.endsWith('AA') ? 'BB' : 'AA')
    expect(validateShareToken(flipped, SECRET, NOW).ok).toBe(false)
    expect(validateShareToken(minted.token, 'other-secret', NOW).ok).toBe(false)
  })

  it('rejects malformed tokens', () => {
    for (const bad of ['', 'no-dot', '.leading', 'trailing.', 'a.b.c', null, 42]) {
      expect(validateShareToken(bad as never, SECRET, NOW).ok).toBe(false)
    }
  })

  it('rejects a signed token carrying a non-parcel payload', async () => {
    // Sign a structurally wrong payload with the REAL secret — the shape
    // check must still refuse it.
    const { createHmac } = await import('node:crypto')
    const payloadB64 = Buffer.from(
      JSON.stringify({ v: 1, p: 'not-a-parcel-id', exp: Math.floor(NOW / 1000) + 999 }),
      'utf8',
    ).toString('base64url')
    const sig = createHmac('sha256', SECRET).update(payloadB64).digest('base64url')
    expect(validateShareToken(`${payloadB64}.${sig}`, SECRET, NOW).ok).toBe(false)
  })
})

describe('share-view access gate (503/403 mapping)', () => {
  it('503 sharing_not_configured when the secret is absent — honest, never open', () => {
    const access = resolveShareViewAccess({ token: 'anything', secret: null, nowMs: NOW })
    expect(access.ok).toBe(false)
    if (!access.ok) {
      expect(access.status).toBe(503)
      expect(access.error).toBe('sharing_not_configured')
    }
  })

  it('403 share_link_invalid on a wrong token', () => {
    const access = resolveShareViewAccess({
      token: 'wrong.token',
      secret: SECRET,
      nowMs: NOW,
    })
    expect(access.ok).toBe(false)
    if (!access.ok) {
      expect(access.status).toBe(403)
      expect(access.error).toBe('share_link_invalid')
    }
  })

  it('403 share_link_expired with the honest expired message', () => {
    const minted = mintShareToken({
      parcelNodeId: '48021:27303',
      secret: SECRET,
      nowMs: NOW,
      ttlMs: 1000,
    })
    const access = resolveShareViewAccess({
      token: minted.token,
      secret: SECRET,
      nowMs: NOW + 5000,
    })
    expect(access.ok).toBe(false)
    if (!access.ok) {
      expect(access.status).toBe(403)
      expect(access.error).toBe('share_link_expired')
      expect(access.message).toBe('This share link has expired.')
    }
  })

  it('grants exactly the token parcel on a valid token', () => {
    const minted = mintShareToken({
      parcelNodeId: '48021:27303',
      secret: SECRET,
      nowMs: NOW,
    })
    const access = resolveShareViewAccess({
      token: minted.token,
      secret: SECRET,
      nowMs: NOW,
    })
    expect(access.ok).toBe(true)
    if (access.ok) expect(access.parcelNodeId).toBe('48021:27303')
  })
})
