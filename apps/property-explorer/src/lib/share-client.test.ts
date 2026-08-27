/**
 * Share-link mint client (Workbench W4) — outcome mapping with injected fetch.
 * P-86 item 4: mint is sign-in only. 402 is not a product paywall path.
 */

import { describe, expect, it, vi } from 'vitest'
import { mintShareLink } from './shareClient'

function fakeFetch(status: number, body: unknown): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  ) as unknown as typeof fetch
}

describe('mintShareLink', () => {
  it('POSTs the parcel and returns the minted link', async () => {
    const f = fakeFetch(200, {
      url: 'https://pe.example/s/2c1a9d4e-7b11-4f0a-9c3d-0a1b2c3d4e5f',
      expiresAt: '2026-08-28T00:00:00.000Z',
    })
    const outcome = await mintShareLink('48021:2', { includeNotes: true }, f)
    expect(outcome).toEqual({
      kind: 'ready',
      link: {
        url: 'https://pe.example/s/2c1a9d4e-7b11-4f0a-9c3d-0a1b2c3d4e5f',
        expiresAt: '2026-08-28T00:00:00.000Z',
        grantId: null,
      },
    })
    expect(f).toHaveBeenCalledWith(
      '/api/pe-share',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ parcelNodeId: '48021:2', includeNotes: true }),
      }),
    )
  })

  it('maps 401 → sign-in; 402 is a message, not a product paywall', async () => {
    expect(await mintShareLink('48021:2', { includeNotes: true }, fakeFetch(401, {}))).toEqual({
      kind: 'sign-in',
    })
    const leftover402 = await mintShareLink(
      '48021:2',
      { includeNotes: true },
      fakeFetch(402, { error: 'payment_required', message: 'Legacy paywall.' }),
    )
    expect(leftover402).toEqual({
      kind: 'message',
      text: 'Legacy paywall.',
    })
    expect(leftover402).not.toMatchObject({ kind: 'paywall' })
    const unconfigured = await mintShareLink(
      '48021:2',
      { includeNotes: true },
      fakeFetch(503, { error: 'sharing_not_configured', message: 'PE_SHARE_SECRET missing.' }),
    )
    expect(unconfigured).toEqual({
      kind: 'not-configured',
      message: 'PE_SHARE_SECRET missing.',
    })
  })

  it('posts includeNotes:false when the picker excludes notes (violate: drop the flag)', async () => {
    const f = fakeFetch(200, {
      url: 'https://pe.example/s/2c1a9d4e-7b11-4f0a-9c3d-0a1b2c3d4e5f',
      grantId: '2c1a9d4e-7b11-4f0a-9c3d-0a1b2c3d4e5f',
      expiresAt: '2026-08-28T00:00:00.000Z',
    })
    const outcome = await mintShareLink('48021:2', { includeNotes: false }, f)
    expect(outcome.kind).toBe('ready')
    if (outcome.kind !== 'ready') return
    expect(outcome.link.grantId).toBe('2c1a9d4e-7b11-4f0a-9c3d-0a1b2c3d4e5f')
    expect(f).toHaveBeenCalledWith(
      '/api/pe-share',
      expect.objectContaining({
        body: JSON.stringify({ parcelNodeId: '48021:2', includeNotes: false }),
      }),
    )
  })

  it('unknown failure → message; network throw → unreachable', async () => {
    expect(await mintShareLink('48021:2', { includeNotes: true }, fakeFetch(500, {}))).toEqual({
      kind: 'message',
      text: 'Share request returned 500.',
    })
    const throwing = vi.fn(async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    expect(await mintShareLink('48021:2', { includeNotes: true }, throwing)).toEqual({
      kind: 'unreachable',
    })
  })
})
