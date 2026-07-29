/**
 * WB6 dossier model — serialization caps, defensive parse, the exports
 * dedupe upsert, and the display-label fallback chain (the ", ," polish bug).
 */

import { describe, expect, it } from 'vitest'
import {
  cleanDisplayString,
  dossierFromSnapshot,
  sanitizeDossier,
  sanitizeDrawings,
  savedRowDisplayLabel,
  upsertExportEntry,
  DOSSIER_CHAT_MAX_TURNS,
  DOSSIER_DRAWINGS_MAX_FEATURES,
  DOSSIER_NOTES_MAX_CHARS,
  type DossierExportEntry,
} from './propertyDossier'

function feature(coords: [number, number]): unknown {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: coords },
    properties: { tool: 'marker' },
  }
}

describe('display-label fallback chain (", ," polish bug)', () => {
  it('cleanDisplayString rejects empty-comma artifacts and blanks', () => {
    expect(cleanDisplayString(', ,')).toBeNull()
    expect(cleanDisplayString('  ')).toBeNull()
    expect(cleanDisplayString(', , ,')).toBeNull()
    expect(cleanDisplayString(null)).toBeNull()
    expect(cleanDisplayString('104 Main St')).toBe('104 Main St')
  })

  it('label → dossier address → parcel id, never an empty-comma render', () => {
    expect(
      savedRowDisplayLabel({ parcelNodeId: '48021:1', label: '104 Main St', snapshot: null }),
    ).toBe('104 Main St')
    expect(
      savedRowDisplayLabel({
        parcelNodeId: '48021:1',
        label: ', ,',
        snapshot: { address: '200 Pine St' },
      }),
    ).toBe('200 Pine St')
    expect(
      savedRowDisplayLabel({ parcelNodeId: '48021:1', label: ', ,', snapshot: null }),
    ).toBe('48021:1')
    expect(
      savedRowDisplayLabel({ parcelNodeId: '48021:1', label: null, snapshot: {} }),
    ).toBe('48021:1')
  })
})

describe('sanitizeDossier caps', () => {
  it('caps notes at 4k chars', () => {
    const out = sanitizeDossier({ notes: 'x'.repeat(DOSSIER_NOTES_MAX_CHARS + 500) })
    expect(out.notes).toHaveLength(DOSSIER_NOTES_MAX_CHARS)
  })

  it('caps the chat thread to the LAST 20 turns and per-turn content', () => {
    const turns = Array.from({ length: 30 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `turn ${i} ` + 'y'.repeat(5_000),
    }))
    const out = sanitizeDossier({ chatThread: turns })
    expect(out.chatThread).toHaveLength(DOSSIER_CHAT_MAX_TURNS)
    // The TAIL survives (turn 29 is last).
    expect(out.chatThread![DOSSIER_CHAT_MAX_TURNS - 1].content.startsWith('turn 29')).toBe(true)
    expect(out.chatThread![0].content.length).toBeLessThanOrEqual(4_000)
  })

  it('caps drawings by feature count and rounds coordinates to 6 decimals', () => {
    const many = {
      type: 'FeatureCollection',
      features: Array.from({ length: DOSSIER_DRAWINGS_MAX_FEATURES + 50 }, () =>
        feature([-97.123456789, 30.987654321]),
      ),
    }
    const out = sanitizeDrawings(many)
    expect(out!.features).toHaveLength(DOSSIER_DRAWINGS_MAX_FEATURES)
    expect(out!.features[0].geometry.coordinates).toEqual([-97.123457, 30.987654])
  })

  it('drops blob-ish feature properties and malformed features', () => {
    const fc = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [1, 2] },
          properties: { tool: 'marker', blob: { base64: 'AAAA' }, note: 'z'.repeat(999) },
        },
        { type: 'Feature', geometry: { type: 'Nonsense', coordinates: [1, 2] }, properties: {} },
        'not a feature',
      ],
    }
    const out = sanitizeDrawings(fc)
    expect(out!.features).toHaveLength(1)
    expect(out!.features[0].properties.blob).toBeUndefined()
    expect((out!.features[0].properties.note as string).length).toBe(200)
  })

  it('drops data: download paths in exports (bytes never live in the snapshot)', () => {
    const out = sanitizeDossier({
      exports: [
        { kind: 'terrain', format: 'glb', savedAt: '2026-07-29T00:00:00Z', downloadPath: 'data:application/octet-stream;base64,AAAA' },
        { kind: 'site-plan', format: 'pdf-site-plan', savedAt: '2026-07-29T00:00:00Z', downloadPath: '/api/pe-terrain-export?x=1' },
      ],
    })
    expect(out.exports![0].downloadPath).toBeNull()
    expect(out.exports![1].downloadPath).toBe('/api/pe-terrain-export?x=1')
  })

  it('dossierFromSnapshot parses defensively: junk → null, partial → kept', () => {
    expect(dossierFromSnapshot(null)).toBeNull()
    expect(dossierFromSnapshot('nope')).toBeNull()
    expect(dossierFromSnapshot({})).toBeNull()
    expect(dossierFromSnapshot({ notes: 'hi', chatSummary: { bogus: true } })).toEqual({
      notes: 'hi',
    })
  })
})

describe('upsertExportEntry — dedupe by kind+format, latest wins', () => {
  const older: DossierExportEntry = {
    kind: 'terrain',
    format: 'glb',
    savedAt: '2026-07-28T00:00:00Z',
    downloadPath: '/old',
  }
  const newer: DossierExportEntry = {
    kind: 'terrain',
    format: 'glb',
    savedAt: '2026-07-29T00:00:00Z',
    downloadPath: '/new',
  }
  const other: DossierExportEntry = {
    kind: 'site-plan',
    format: 'pdf-site-plan',
    savedAt: '2026-07-28T00:00:00Z',
    downloadPath: '/pdf',
  }

  it('replaces the same kind+format and keeps the rest', () => {
    const out = upsertExportEntry([older, other], newer)
    expect(out).toHaveLength(2)
    expect(out.find((e) => e.kind === 'terrain' && e.format === 'glb')!.downloadPath).toBe('/new')
    expect(out).toContainEqual(other)
  })

  it('appends a new kind+format', () => {
    expect(upsertExportEntry(undefined, other)).toEqual([other])
    expect(upsertExportEntry([older], other)).toEqual([older, other])
  })
})
