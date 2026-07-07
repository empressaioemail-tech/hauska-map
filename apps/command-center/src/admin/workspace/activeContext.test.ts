import { describe, it, expect, beforeEach } from 'vitest'
import {
  CONTEXT_PARAM_KEYS,
  parseContextFromHash,
  serializeContextToHash,
  loadContextFromStorage,
  saveContextToStorage,
} from './activeContext'

describe('activeContext hash round-trip', () => {
  beforeEach(() => {
    window.location.hash = ''
    localStorage.clear()
  })

  it('serialize → hash → parse round-trips address + apn + engagement + coords', () => {
    const ctx = {
      address: '1209 Main St, Bastrop, TX',
      apn: 'R12345',
      engagementId: '33ba88d7-ee02-43e3-81cd-182922eba02f',
      jurisdiction: 'bastrop-tx',
      lat: 30.1105,
      lng: -97.3183,
    }
    const params = serializeContextToHash(ctx)
    // only reserved keys, no collision with panel params like `id`
    for (const k of Object.keys(params)) {
      expect(CONTEXT_PARAM_KEYS).toContain(k)
    }
    expect(params).not.toHaveProperty('id')

    const qs = new URLSearchParams(params).toString()
    window.location.hash = `#panel=lens-investor&${qs}`
    const parsed = parseContextFromHash()
    expect(parsed?.address).toBe(ctx.address)
    expect(parsed?.apn).toBe(ctx.apn)
    expect(parsed?.engagementId).toBe(ctx.engagementId)
    expect(parsed?.jurisdiction).toBe(ctx.jurisdiction)
    expect(parsed?.lat).toBeCloseTo(ctx.lat)
    expect(parsed?.lng).toBeCloseTo(ctx.lng)
  })

  it('parse returns null when the hash carries no context params', () => {
    window.location.hash = '#panel=atom-inspector&id=some-atom'
    expect(parseContextFromHash()).toBeNull()
  })

  it('localStorage round-trips and clears on null', () => {
    const ctx = { address: '123 Main', apn: 'A1' }
    saveContextToStorage(ctx)
    expect(loadContextFromStorage()?.address).toBe('123 Main')
    saveContextToStorage(null)
    expect(loadContextFromStorage()).toBeNull()
  })
})
