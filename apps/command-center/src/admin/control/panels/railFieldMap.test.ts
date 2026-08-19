// railFieldMap.test.ts — every rail and every field is CLASSIFIED, never dropped.
//
// The identity that matters: paired + unpairedDeclared + unclassified equals the rail
// count, exactly. A rail that falls out of all three buckets is a rail the console
// would silently omit from the reconciliation, which is DEV_PROCESS 3.3's failure state
// ("unmentioned") wearing the costume of a clean screen.

import { describe, it, expect } from 'vitest'
import { FIELD_KEYS } from './servingSweepTypes'
import {
  RAILS_WITHOUT_FIELD,
  RAIL_FIELD_PAIRS,
  classifyRails,
  fieldsForRail,
  fieldsWithoutRail,
  railsForField,
} from './railFieldMap'

/** The 14 rails GET /api/county-ledger served on 2026-08-18, in order. */
const LIVE_RAILS = [
  'geometry',
  'cad',
  'zoning',
  'roads',
  'flood',
  'envelope',
  'landuse',
  'footprint',
  'easement',
  'owner',
  'rrc-wells',
  'rrc-pipelines',
  'rail-corridor',
  'mud',
]

describe('railFieldMap', () => {
  it('classifies every live rail with nothing left over', () => {
    const c = classifyRails(LIVE_RAILS)
    expect(c.paired.length + c.unpairedDeclared.length + c.unclassified.length).toBe(LIVE_RAILS.length)
    expect(c.unclassified).toEqual([])
    expect(c.paired).toEqual(['geometry', 'cad', 'zoning', 'roads', 'flood', 'envelope', 'landuse'])
    expect(c.unpairedDeclared.map((u) => u.railKey)).toEqual([
      'footprint',
      'easement',
      'owner',
      'rrc-wells',
      'rrc-pipelines',
      'rail-corridor',
      'mud',
    ])
    for (const u of c.unpairedDeclared) expect(u.reason.length).toBeGreaterThan(0)
  })

  it('surfaces an unknown rail as UNCLASSIFIED rather than swallowing it', () => {
    const c = classifyRails([...LIVE_RAILS, 'a-brand-new-rail'])
    expect(c.unclassified).toEqual(['a-brand-new-rail'])
    expect(c.paired.length + c.unpairedDeclared.length + c.unclassified.length).toBe(15)
  })

  it('every field in the frozen record has at least one rail in the live set', () => {
    expect(fieldsWithoutRail(LIVE_RAILS, FIELD_KEYS)).toEqual([])
  })

  it('names the orphaned fields when the payload is missing their rail', () => {
    // A deployment serving only geometry leaves eight of nine fields with no counterpart.
    const orphans = fieldsWithoutRail(['geometry'], FIELD_KEYS)
    expect(orphans).not.toContain('geometry')
    expect(orphans.length).toBe(FIELD_KEYS.length - 1)
    expect(orphans).toContain('setbacks')
  })

  it('one rail may serve two fields, and that is stated rather than implied', () => {
    expect(fieldsForRail('cad').sort()).toEqual(['apn', 'situsAddress'])
    expect(fieldsForRail('zoning').sort()).toEqual(['setbacks', 'zoning'])
    expect(railsForField('setbacks')).toEqual(['zoning'])
    expect(railsForField('frontage')).toEqual(['roads'])
  })

  it('every pair carries a basis, and no rail is both paired and declared unpaired', () => {
    for (const p of RAIL_FIELD_PAIRS) {
      expect(p.basis.length).toBeGreaterThan(0)
      expect(RAILS_WITHOUT_FIELD[p.railKey]).toBeUndefined()
    }
  })

  it('every declared unpaired rail really has no field', () => {
    for (const railKey of Object.keys(RAILS_WITHOUT_FIELD)) {
      expect(fieldsForRail(railKey)).toEqual([])
    }
  })
})
