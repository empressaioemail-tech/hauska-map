// texasCountyNames.test.ts — the generated roster is complete, is Texas-only, and never
// overrides a name the API served.
//
// This file is the condition on which a 254-row declared table was accepted at all: it
// is presentation only, it is generated from a canonical dated artifact rather than
// typed from memory, and its completeness is asserted rather than assumed. The ten names
// the live API does serve are pinned here as a divergence test — the roster agreed with
// the API on 10 of 10 when checked against the live payload on 2026-08-18, and a future
// roster regeneration that breaks that agreement fails here rather than in the console.

import { describe, it, expect } from 'vitest'
import {
  TEXAS_COUNTY_NAMES,
  TEXAS_COUNTY_NAME_SOURCE,
  resolveCountyName,
} from './texasCountyNames'

/** Every county GET /api/county-ledger served a countyName for, 2026-08-18. */
const API_SERVED_NAMES: Record<string, string> = {
  '48021': 'Bastrop',
  '48027': 'Bell',
  '48029': 'Bexar',
  '48055': 'Caldwell',
  '48091': 'Comal',
  '48187': 'Guadalupe',
  '48209': 'Hays',
  '48257': 'Kaufman',
  '48309': 'McLennan',
  '48491': 'Williamson',
}

describe('texasCountyNames', () => {
  it('covers all 254 Texas counties', () => {
    const keys = Object.keys(TEXAS_COUNTY_NAMES)
    expect(keys.length).toBe(254)
    expect(TEXAS_COUNTY_NAME_SOURCE.countyCount).toBe(254)
  })

  it('is Texas-only and carries no empty names', () => {
    for (const [fips, name] of Object.entries(TEXAS_COUNTY_NAMES)) {
      expect(fips).toMatch(/^48\d{3}$/)
      expect(name.trim().length).toBeGreaterThan(0)
    }
  })

  it('records the artifact it was generated from, so a stale roster is traceable', () => {
    expect(TEXAS_COUNTY_NAME_SOURCE.artifact).toContain('texas_roster_v1')
    expect(TEXAS_COUNTY_NAME_SOURCE.schemaVersion).toBe('t6_roster_v1')
    expect(TEXAS_COUNTY_NAME_SOURCE.vintage).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('agrees with every name the live API serves — divergence test, 10 of 10', () => {
    let agree = 0
    for (const [fips, apiName] of Object.entries(API_SERVED_NAMES)) {
      expect(TEXAS_COUNTY_NAMES[fips]).toBe(apiName)
      agree += 1
    }
    expect(agree).toBe(10)
  })

  it('the API name always wins, and the origin is reported rather than swallowed', () => {
    expect(resolveCountyName('48021', 'Bastrop')).toEqual({ name: 'Bastrop', origin: 'api' })
    // Even a name the roster disagrees with: the served value is authoritative.
    expect(resolveCountyName('48021', 'Renamed County')).toEqual({
      name: 'Renamed County',
      origin: 'api',
    })
  })

  it('falls back to the roster only where the API served nothing', () => {
    expect(resolveCountyName('48001', null)).toEqual({ name: 'Anderson', origin: 'roster' })
    expect(resolveCountyName('48001', '   ')).toEqual({ name: 'Anderson', origin: 'roster' })
    expect(resolveCountyName('48001', undefined)).toEqual({ name: 'Anderson', origin: 'roster' })
  })

  it('degrades to the FIPS with origin none for a county in neither source', () => {
    expect(resolveCountyName('49001', null)).toEqual({ name: '49001', origin: 'none' })
  })
})
