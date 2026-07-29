/**
 * Saved-properties client (Workbench W4) — outcome mapping with an injected
 * fetch: list ready/401/error, save + remove verbs/paths, change notification.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  listSavedProperties,
  removeSavedProperty,
  saveProperty,
  savePropertyWithDossier,
  subscribeSavedPropertiesChanged,
  updatePropertyDossier,
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
        { parcelNodeId: '48021:2', label: '104 Main St', updatedAt: '2026-07-28T00:00:00Z', snapshot: null },
        { parcelNodeId: '48021:1', label: null, updatedAt: '2026-07-27T00:00:00Z', snapshot: null },
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

  it('PUTs the sanitized snapshot when provided (dossier rides the jsonb)', async () => {
    const f = fakeFetch(200, { ok: true })
    await saveProperty('48021:2', {
      label: '104 Main St',
      snapshot: { notes: 'hello', savedAt: '2026-07-29T00:00:00Z' },
    }, f)
    const [, init] = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    expect(JSON.parse(init.body as string)).toEqual({
      label: '104 Main St',
      snapshot: { savedAt: '2026-07-29T00:00:00Z', notes: 'hello' },
    })
  })
})

/** Sequenced fake fetch: first call = LIST response, later calls = PUT. */
function listThenPut(
  listBody: unknown,
  putStatus = 200,
): { fetch: typeof fetch; calls: () => Array<[string, RequestInit]> } {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const isList = (init?.method ?? 'GET') === 'GET'
    return new Response(JSON.stringify(isList ? listBody : { ok: true }), {
      status: isList ? 200 : putStatus,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as unknown as typeof fetch
  return {
    fetch: fn,
    calls: () => (fn as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock.calls,
  }
}

describe('updatePropertyDossier — read-modify-write against the server snapshot', () => {
  const savedRow = {
    parcelNodeId: '48021:2',
    label: '104 Main St',
    updatedAt: '2026-07-28T00:00:00Z',
    snapshot: { notes: 'old notes', savedAt: '2026-07-01T00:00:00Z' },
  }

  it('merges the patch into the EXISTING snapshot and keeps the label', async () => {
    const { fetch: f, calls } = listThenPut([savedRow])
    const outcome = await updatePropertyDossier(
      '48021:2',
      { chatSummary: { summary: 'AI summary text', savedAt: '2026-07-29T00:00:00Z', turnCount: 4 } },
      f,
    )
    expect(outcome).toEqual({ kind: 'ok' })
    const put = calls().find(([, init]) => init?.method === 'PUT')!
    const body = JSON.parse(put[1].body as string)
    expect(body.label).toBe('104 Main St')
    expect(body.snapshot.notes).toBe('old notes') // untouched field survives
    expect(body.snapshot.savedAt).toBe('2026-07-01T00:00:00Z')
    expect(body.snapshot.chatSummary.summary).toBe('AI summary text')
  })

  it('supports the FUNCTION patch form (exports dedupe needs current state)', async () => {
    const rowWithExports = {
      ...savedRow,
      snapshot: {
        ...savedRow.snapshot,
        exports: [
          { kind: 'terrain', format: 'glb', savedAt: '2026-07-20T00:00:00Z', downloadPath: '/old' },
        ],
      },
    }
    const { fetch: f, calls } = listThenPut([rowWithExports])
    await updatePropertyDossier(
      '48021:2',
      (current) => ({
        exports: [
          ...(current.exports ?? []).filter((e) => e.format !== 'glb'),
          { kind: 'terrain', format: 'glb', savedAt: '2026-07-29T00:00:00Z', downloadPath: '/new' },
        ],
      }),
      f,
    )
    const put = calls().find(([, init]) => init?.method === 'PUT')!
    const body = JSON.parse(put[1].body as string)
    expect(body.snapshot.exports).toEqual([
      { kind: 'terrain', format: 'glb', savedAt: '2026-07-29T00:00:00Z', downloadPath: '/new' },
    ])
  })

  it('property not in the list → honest not-saved, no PUT fired', async () => {
    const { fetch: f, calls } = listThenPut([])
    const outcome = await updatePropertyDossier('48021:2', { notes: 'x' }, f)
    expect(outcome).toEqual({ kind: 'not-saved' })
    expect(calls().every(([, init]) => (init?.method ?? 'GET') === 'GET')).toBe(true)
  })

  it('list 401 → sign-in (never a blind PUT)', async () => {
    const outcome = await updatePropertyDossier('48021:2', { notes: 'x' }, fakeFetch(401, {}))
    expect(outcome).toEqual({ kind: 'sign-in' })
  })
})

describe('savePropertyWithDossier — seeded save merges, never clobbers', () => {
  it('already saved → existing dossier fields survive the seed', async () => {
    const existing = {
      parcelNodeId: '48021:2',
      label: 'Old label',
      updatedAt: '2026-07-28T00:00:00Z',
      snapshot: { notes: 'keep me', savedAt: '2026-07-01T00:00:00Z' },
    }
    const { fetch: f, calls } = listThenPut([existing])
    await savePropertyWithDossier('48021:2', {
      label: '104 Main St',
      address: '104 Main St',
      drawings: {
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] }, properties: { tool: 'marker' } },
        ],
      },
    }, f)
    const put = calls().find(([, init]) => init?.method === 'PUT')!
    const body = JSON.parse(put[1].body as string)
    expect(body.snapshot.notes).toBe('keep me')
    expect(body.snapshot.savedAt).toBe('2026-07-01T00:00:00Z')
    expect(body.snapshot.address).toBe('104 Main St')
    expect(body.snapshot.drawings.features).toHaveLength(1)
  })

  it('not yet saved → snapshot seeded with savedAt + address', async () => {
    const { fetch: f, calls } = listThenPut([])
    await savePropertyWithDossier('48021:9', { label: '9 Oak Ln', address: '9 Oak Ln' }, f)
    const put = calls().find(([, init]) => init?.method === 'PUT')!
    const body = JSON.parse(put[1].body as string)
    expect(body.label).toBe('9 Oak Ln')
    expect(body.snapshot.address).toBe('9 Oak Ln')
    expect(typeof body.snapshot.savedAt).toBe('string')
  })

  it('WB7c: first save seeds the pin; a re-save NEVER drags an existing pin', async () => {
    // First save: no existing row — the seed pin lands.
    const first = listThenPut([])
    await savePropertyWithDossier(
      '48021:9',
      { label: '9 Oak Ln', pin: { lat: 30.1, lng: -97.2 } },
      first.fetch,
    )
    const firstPut = first.calls().find(([, init]) => init?.method === 'PUT')!
    expect(JSON.parse(firstPut[1].body as string).snapshot.pin).toEqual({
      lat: 30.1,
      lng: -97.2,
    })

    // Re-save with a DIFFERENT seed pin: the existing pin wins.
    const existing = {
      parcelNodeId: '48021:9',
      label: '9 Oak Ln',
      updatedAt: '2026-07-28T00:00:00Z',
      snapshot: { savedAt: '2026-07-01T00:00:00Z', pin: { lat: 30.1, lng: -97.2 } },
    }
    const second = listThenPut([existing])
    await savePropertyWithDossier(
      '48021:9',
      { label: '9 Oak Ln', pin: { lat: 44.4, lng: -88.8 } },
      second.fetch,
    )
    const secondPut = second.calls().find(([, init]) => init?.method === 'PUT')!
    expect(JSON.parse(secondPut[1].body as string).snapshot.pin).toEqual({
      lat: 30.1,
      lng: -97.2,
    })
  })
})

describe('WB7d status — set / persist round-trip via the ONE dossier write path', () => {
  const savedRow = {
    parcelNodeId: '48021:2',
    label: '104 Main St',
    updatedAt: '2026-07-28T00:00:00Z',
    snapshot: { notes: 'old notes', savedAt: '2026-07-01T00:00:00Z' },
  }

  it('status patch PUTs the merged snapshot with status (other fields survive)', async () => {
    const { fetch: f, calls } = listThenPut([savedRow])
    const outcome = await updatePropertyDossier('48021:2', { status: 'researching' }, f)
    expect(outcome).toEqual({ kind: 'ok' })
    const put = calls().find(([, init]) => init?.method === 'PUT')!
    const body = JSON.parse(put[1].body as string)
    expect(body.snapshot.status).toBe('researching')
    expect(body.snapshot.notes).toBe('old notes')
  })

  it('status: null clears back to unset (dropped from the written snapshot)', async () => {
    const withStatus = {
      ...savedRow,
      snapshot: { ...savedRow.snapshot, status: 'offer' },
    }
    const { fetch: f, calls } = listThenPut([withStatus])
    await updatePropertyDossier('48021:2', { status: null }, f)
    const put = calls().find(([, init]) => init?.method === 'PUT')!
    const body = JSON.parse(put[1].body as string)
    expect(body.snapshot.status).toBeUndefined()
    expect(body.snapshot.notes).toBe('old notes')
  })

  it('the parsed list row carries status + pin back out (round trip)', async () => {
    const rows = [
      {
        parcelNodeId: '48021:2',
        label: '104 Main St',
        updatedAt: '2026-07-29T00:00:00Z',
        snapshot: { status: 'passed', pin: { lat: 30.1, lng: -97.2 } },
      },
    ]
    const outcome = await listSavedProperties(fakeFetch(200, rows))
    expect(outcome.kind).toBe('ready')
    if (outcome.kind === 'ready') {
      expect(outcome.items[0].snapshot).toEqual({
        status: 'passed',
        pin: { lat: 30.1, lng: -97.2 },
      })
    }
  })
})
