/**
 * Saved-properties client (Workbench W4) — outcome mapping with an injected
 * fetch: list ready/401/error, save + remove verbs/paths, change notification.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  listSavedProperties,
  removeSavedProperty,
  saveProperty,
  subscribeSavedPropertiesChanged,
} from './savedPropertiesClient'

function fakeFetch(status: number, body: unknown): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  ) as unknown as typeof fetch
}

describe('listSavedProperties', () => {
  it('maps rows (server order preserved) and drops malformed entries', async () => {
    const rows = [
      { id: 1, parcelNodeId: '48021:2', label: '104 Main St', updatedAt: '2026-07-28T00:00:00Z', snapshot: {} },
      { id: 2, parcelNodeId: '48021:1', label: null, updatedAt: '2026-07-27T00:00:00Z' },
      { id: 3, label: 'no parcel id' },
    ]
    const outcome = await listSavedProperties(fakeFetch(200, rows))
    expect(outcome).toEqual({
      kind: 'ready',
      items: [
        { parcelNodeId: '48021:2', label: '104 Main St', updatedAt: '2026-07-28T00:00:00Z' },
        { parcelNodeId: '48021:1', label: null, updatedAt: '2026-07-27T00:00:00Z' },
      ],
    })
  })

  it('hits the deep-proxy list path with credentials', async () => {
    const f = fakeFetch(200, [])
    await listSavedProperties(f)
    expect(f).toHaveBeenCalledWith(
      '/api/spine-deep/api/property-explorer/v1/saved-properties',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    )
  })

  it('401 → sign-in; 5xx → error with the server message; throw → unreachable', async () => {
    expect(await listSavedProperties(fakeFetch(401, { error: 'authentication_required' }))).toEqual({
      kind: 'sign-in',
    })
    expect(await listSavedProperties(fakeFetch(502, { message: 'upstream broke' }))).toEqual({
      kind: 'error',
      message: 'upstream broke',
    })
    const throwing = vi.fn(async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    expect(await listSavedProperties(throwing)).toEqual({ kind: 'unreachable' })
  })
})

describe('saveProperty / removeSavedProperty', () => {
  it('PUTs the item path with the label body and notifies subscribers', async () => {
    const f = fakeFetch(200, { ok: true, parcelNodeId: '48021:2' })
    const seen = vi.fn()
    const unsub = subscribeSavedPropertiesChanged(seen)
    const outcome = await saveProperty('48021:2', { label: '104 Main St' }, f)
    unsub()
    expect(outcome).toEqual({ kind: 'ok' })
    expect(seen).toHaveBeenCalledTimes(1)
    expect(f).toHaveBeenCalledWith(
      '/api/spine-deep/api/property-explorer/v1/saved-properties/48021%3A2',
      expect.objectContaining({
        method: 'PUT',
        credentials: 'include',
        body: JSON.stringify({ label: '104 Main St' }),
      }),
    )
  })

  it('save 401 → sign-in (no notification)', async () => {
    const seen = vi.fn()
    const unsub = subscribeSavedPropertiesChanged(seen)
    const outcome = await saveProperty('48021:2', {}, fakeFetch(401, {}))
    unsub()
    expect(outcome).toEqual({ kind: 'sign-in' })
    expect(seen).not.toHaveBeenCalled()
  })

  it('DELETEs the item path; 404 (already gone) still counts as ok', async () => {
    const f = fakeFetch(404, { error: 'saved_property_not_found' })
    const outcome = await removeSavedProperty('48021:2', f)
    expect(outcome).toEqual({ kind: 'ok' })
    expect(f).toHaveBeenCalledWith(
      '/api/spine-deep/api/property-explorer/v1/saved-properties/48021%3A2',
      expect.objectContaining({ method: 'DELETE', credentials: 'include' }),
    )
  })

  it('remove 401 → sign-in; remove 500 → error', async () => {
    expect(await removeSavedProperty('48021:2', fakeFetch(401, {}))).toEqual({
      kind: 'sign-in',
    })
    expect(
      await removeSavedProperty('48021:2', fakeFetch(500, { message: 'boom' })),
    ).toEqual({ kind: 'error', message: 'boom' })
  })
})
