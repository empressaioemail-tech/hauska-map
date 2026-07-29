/**
 * Share-link mint client (Workbench W4) — outcome mapping with injected fetch.
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
      url: 'https://pe.example/share#abc.def',
      expiresAt: '2026-08-28T00:00:00.000Z',
    })
    const outcome = await mintShareLink('48021:2', f)
    expect(outcome).toEqual({
      kind: 'ready',
      link: { url: 'https://pe.example/share#abc.def', expiresAt: '2026-08-28T00:00:00.000Z' },
    })
    expect(f).toHaveBeenCalledWith(
      '/api/pe-share',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ parcelNodeId: '48021:2' }),
      }),
    )
  })

  it('maps 401 → sign-in, 402 → paywall, 503 unconfigured → honest notice', async () => {
    expect(await mintShareLink('48021:2', fakeFetch(401, {}))).toEqual({
      kind: 'sign-in',
    })
    const paywall = await mintShareLink(
      '48021:2',
      fakeFetch(402, { error: 'payment_required', message: 'Pro required.' }),
    )
    expect(paywall).toEqual({ kind: 'paywall', message: 'Pro required.' })
    const unconfigured = await mintShareLink(
      '48021:2',
      fakeFetch(503, { error: 'sharing_not_configured', message: 'PE_SHARE_SECRET missing.' }),
    )
    expect(unconfigured).toEqual({
      kind: 'not-configured',
      message: 'PE_SHARE_SECRET missing.',
    })
  })

  it('unknown failure → message; network throw → unreachable', async () => {
    expect(await mintShareLink('48021:2', fakeFetch(500, {}))).toEqual({
      kind: 'message',
      text: 'Share request returned 500.',
    })
    const throwing = vi.fn(async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    expect(await mintShareLink('48021:2', throwing)).toEqual({ kind: 'unreachable' })
  })
})
