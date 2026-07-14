// apps/command-center/src/admin/api/searchAtomsContract.test.ts
//
// Contract tests for the search_atoms client helpers: the jurisdiction
// normalizer (free-form input → underscored tenant id) and the entity_type
// option list (must match the live tool enum EXACTLY — hyphenated; the
// underscored form is rejected upstream with -32602 invalid_enum_value).

import { describe, it, expect } from 'vitest'
import { SEARCH_ATOMS_ENTITY_TYPES, normalizeJurisdiction } from './searchAtomsContract'

describe('normalizeJurisdiction', () => {
  it('maps "Bastrop, TX" to bastrop_tx (lowercase, punctuation/spaces → underscores)', () => {
    expect(normalizeJurisdiction('Bastrop, TX')).toBe('bastrop_tx')
  })

  it('maps hyphenated tenant ids to underscores (bastrop-tx → bastrop_tx)', () => {
    expect(normalizeJurisdiction('bastrop-tx')).toBe('bastrop_tx')
  })

  it('passes already-normalized ids through unchanged', () => {
    expect(normalizeJurisdiction('bastrop_tx')).toBe('bastrop_tx')
    expect(normalizeJurisdiction('grand_county_co')).toBe('grand_county_co')
  })

  it('collapses runs of separators and strips leading/trailing underscores', () => {
    expect(normalizeJurisdiction('  Grand County, CO  ')).toBe('grand_county_co')
    expect(normalizeJurisdiction('--bastrop -- tx--')).toBe('bastrop_tx')
    expect(normalizeJurisdiction('San Marcos,   TX.')).toBe('san_marcos_tx')
  })

  it('returns empty string for empty / punctuation-only input (caller sends undefined)', () => {
    expect(normalizeJurisdiction('')).toBe('')
    expect(normalizeJurisdiction('   ')).toBe('')
    expect(normalizeJurisdiction(', -- .')).toBe('')
  })

  it('preserves digits', () => {
    expect(normalizeJurisdiction('District 9, TX')).toBe('district_9_tx')
  })
})

describe('SEARCH_ATOMS_ENTITY_TYPES', () => {
  it('matches the live search_atoms enum exactly (introspection, 2026-07-14)', () => {
    // GET /api/spine/mcp-introspection/tools/search_atoms →
    // input_schema.entity_type.enum
    expect([...SEARCH_ATOMS_ENTITY_TYPES]).toEqual([
      'code-section',
      'code-definition',
      'code-amendment',
      'code-cross-reference',
      'code-edition',
      'jurisdiction-corpus',
    ])
  })

  it('is hyphenated — never underscored (underscores are rejected with -32602)', () => {
    for (const t of SEARCH_ATOMS_ENTITY_TYPES) {
      expect(t).not.toContain('_')
      expect(t).toBe(t.toLowerCase())
    }
  })
})
