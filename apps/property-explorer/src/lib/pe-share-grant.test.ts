/**
 * P-86 items 1 and 6 — grant row first; resolvable URL carries the grant id.
 * HMAC stays on /share#token only. A check observed only passing is not a check:
 * each case has a named violation.
 */

import { describe, expect, it } from 'vitest'
import {
  buildHumanShareUrl,
  buildResolvableShareUrl,
  isShareGrantId,
  mintShareWithGrant,
  resolvableUrlLeaksToken,
  resolveGrantViewAccess,
} from '../../api/_lib/pe-share-grant.js'
import { createMemoryShareGrantStore } from '../../api/_lib/pe-share-grant-store.js'

const SECRET = 'test-share-secret'
const NOW = Date.UTC(2026, 7, 27)
const ORIGIN = 'https://smartsite.cloud'
const GRANTOR = { grantorUserId: 'user-1', grantorTenantId: 'tenant-a' }

describe('resolvable URL shape (item 1)', () => {
  it('carries a UUID grant id and never a hash or HMAC', () => {
    const id = '2c1a9d4e-7b11-4f0a-9c3d-0a1b2c3d4e5f'
    const url = buildResolvableShareUrl(ORIGIN, id)
    expect(url).toBe('https://smartsite.cloud/s/2c1a9d4e-7b11-4f0a-9c3d-0a1b2c3d4e5f')
    expect(url.includes('#')).toBe(false)
    expect(resolvableUrlLeaksToken(url)).toBe(false)
  })

  it('refuses to mint a resolvable URL from an HMAC-shaped id (violation)', () => {
    const hmacish = 'eyJ2IjoxfQ.signature'
    expect(isShareGrantId(hmacish)).toBe(false)
    expect(() => buildResolvableShareUrl(ORIGIN, hmacish)).toThrow('grant_id_required')
    expect(resolvableUrlLeaksToken(`${ORIGIN}/s/${hmacish}`)).toBe(true)
    expect(resolvableUrlLeaksToken(`${ORIGIN}/share#${hmacish}`)).toBe(true)
  })

  it('keeps the HMAC on the human hash URL only', () => {
    const human = buildHumanShareUrl(ORIGIN, 'payload.sig')
    expect(human).toBe('https://smartsite.cloud/share#payload.sig')
  })
})

describe('mint writes a grant row or refuses (item 6)', () => {
  it('persists the grantor, parcel, window, and un-revoked state, then returns /s/{id}', async () => {
    const store = createMemoryShareGrantStore()
    const minted = await mintShareWithGrant({
      parcelNodeId: '48021:34137',
      origin: ORIGIN,
      secret: SECRET,
      store,
      nowMs: NOW,
      ...GRANTOR,
    })
    expect(minted.ok).toBe(true)
    if (!minted.ok) return
    expect(minted.url).toBe(`${ORIGIN}/s/${minted.grantId}`)
    expect(minted.url.includes('#')).toBe(false)
    expect(resolvableUrlLeaksToken(minted.url)).toBe(false)
    expect(minted.humanUrl.startsWith(`${ORIGIN}/share#`)).toBe(true)
    expect(minted.humanUrl.includes(minted.grantId)).toBe(false)

    const row = await store.getById(minted.grantId)
    expect(row).toEqual({
      id: minted.grantId,
      grantorUserId: 'user-1',
      grantorTenantId: 'tenant-a',
      parcelNodeId: '48021:34137',
      createdAt: new Date(NOW).toISOString(),
      expiresAt: minted.expiresAt,
      revokedAt: null,
    })
  })

  it('no-row mint refuses: a store that throws never returns a URL (violation)', async () => {
    const store = createMemoryShareGrantStore()
    store.insert = async () => {
      throw new Error('neon_down')
    }
    const minted = await mintShareWithGrant({
      parcelNodeId: '48021:34137',
      origin: ORIGIN,
      secret: SECRET,
      store,
      nowMs: NOW,
      ...GRANTOR,
    })
    expect(minted).toEqual({ ok: false, error: 'grant_persist_failed' })
  })

  it('no-row mint refuses: a store that echoes a different id never returns a URL (violation)', async () => {
    const store = createMemoryShareGrantStore()
    store.insert = async (row) => ({ ...row, id: '00000000-0000-4000-8000-000000000000' })
    const minted = await mintShareWithGrant({
      parcelNodeId: '48021:34137',
      origin: ORIGIN,
      secret: SECRET,
      store,
      nowMs: NOW,
      ...GRANTOR,
    })
    expect(minted).toEqual({ ok: false, error: 'grant_persist_failed' })
  })

  it('missing grantor refuses (no anonymous grant row)', async () => {
    const minted = await mintShareWithGrant({
      parcelNodeId: '48021:34137',
      grantorUserId: '',
      grantorTenantId: 'tenant-a',
      origin: ORIGIN,
      secret: SECRET,
      store: createMemoryShareGrantStore(),
      nowMs: NOW,
    })
    expect(minted).toEqual({ ok: false, error: 'missing_grantor' })
  })
})

describe('revoke / expire / sibling (item 6)', () => {
  it('revoking one grant leaves a sibling grant live; expired and revoked are distinct', async () => {
    const store = createMemoryShareGrantStore()
    const a = await mintShareWithGrant({
      parcelNodeId: '48021:34137',
      origin: ORIGIN,
      secret: SECRET,
      store,
      nowMs: NOW,
      randomUuid: () => '11111111-1111-4111-8111-111111111111',
      ...GRANTOR,
    })
    const b = await mintShareWithGrant({
      parcelNodeId: '48021:34137',
      origin: ORIGIN,
      secret: SECRET,
      store,
      nowMs: NOW,
      randomUuid: () => '22222222-2222-4222-8222-222222222222',
      ...GRANTOR,
    })
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return

    await store.revoke(a.grantId, new Date(NOW + 1000).toISOString())
    const revoked = resolveGrantViewAccess(await store.getById(a.grantId), NOW + 2000)
    const sibling = resolveGrantViewAccess(await store.getById(b.grantId), NOW + 2000)
    expect(revoked).toMatchObject({
      ok: false,
      status: 403,
      error: 'share_grant_revoked',
    })
    expect(sibling.ok).toBe(true)

    const expiredRow = await store.getById(b.grantId)
    const expired = resolveGrantViewAccess(expiredRow, Date.parse(b.expiresAt) + 1)
    expect(expired).toMatchObject({
      ok: false,
      status: 403,
      error: 'share_grant_expired',
    })
    expect(revoked.ok === false && expired.ok === false && revoked.error !== expired.error).toBe(
      true,
    )
  })

  it('absent grant is invalid, not expired (violation of collapsing the three states)', () => {
    const access = resolveGrantViewAccess(null, NOW)
    expect(access).toMatchObject({
      ok: false,
      status: 403,
      error: 'share_grant_invalid',
    })
  })
})
