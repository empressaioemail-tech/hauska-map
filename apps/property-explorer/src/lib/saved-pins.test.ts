/**
 * WB7c saved-property pins — pure logic: pin derivation from list states
 * (signed-out none, saved with/without coords), status accents, the marker
 * element click seam (opens via the host reopen flow), and save-time pin
 * resolution (direct center → #104 chain → honest null).
 */

import { describe, expect, it, vi } from 'vitest'
import {
  pinAccent,
  pinsFromListOutcome,
  pinsFromRows,
  pinSvgMarkup,
  resolvePinForSave,
  savedPinElement,
  PIN_STATUS_ACCENTS,
  SAVED_PINS_LEGEND,
  type PinDocumentLike,
  type PinElementLike,
  type SavedPin,
} from './saved-pins'
import type { ParcelFactSheet } from '@empressaio/parcel-fact-sheet'
import type { SavedPropertyRow } from './savedPropertiesClient'

function row(overrides: Partial<SavedPropertyRow>): SavedPropertyRow {
  return {
    parcelNodeId: '48021:1',
    label: null,
    updatedAt: null,
    snapshot: null,
    ...overrides,
  }
}

describe('pinsFromRows / pinsFromListOutcome — the pin data path', () => {
  it('rows WITH a save-time pin become pins; rows without stay unpinned (honest)', () => {
    const pins = pinsFromRows([
      row({
        parcelNodeId: '48021:2',
        label: '104 Main St',
        snapshot: { pin: { lat: 30.1, lng: -97.2 }, status: 'offer' },
      }),
      row({ parcelNodeId: '48021:3', snapshot: { notes: 'no pin saved' } }),
      row({ parcelNodeId: '48021:4', snapshot: null }),
    ])
    expect(pins).toEqual([
      {
        parcelNodeId: '48021:2',
        lat: 30.1,
        lng: -97.2,
        status: 'offer',
        title: '104 Main St',
      },
    ])
  })

  it('pin title follows the display-label fallback chain (label → address → id)', () => {
    const pins = pinsFromRows([
      row({
        parcelNodeId: '48021:5',
        label: ', ,',
        snapshot: { address: '200 Pine St', pin: { lat: 30, lng: -97 } },
      }),
      row({ parcelNodeId: '48021:6', snapshot: { pin: { lat: 31, lng: -98 } } }),
    ])
    expect(pins[0].title).toBe('200 Pine St')
    expect(pins[1].title).toBe('48021:6')
  })

  it('signed-out / error / unreachable list states render ZERO pins, no errors', () => {
    expect(pinsFromListOutcome({ kind: 'sign-in' })).toEqual([])
    expect(pinsFromListOutcome({ kind: 'error', message: 'boom' })).toEqual([])
    expect(pinsFromListOutcome({ kind: 'unreachable' })).toEqual([])
    expect(
      pinsFromListOutcome({
        kind: 'ready',
        items: [row({ snapshot: { pin: { lat: 30, lng: -97 } } })],
      }),
    ).toHaveLength(1)
  })
})

describe('status accents — pins mirror the status language', () => {
  it('each status has an accent; unset falls back to the default accent', () => {
    expect(pinAccent('researching')).toBe(PIN_STATUS_ACCENTS.researching)
    expect(pinAccent('offer')).toBe(PIN_STATUS_ACCENTS.offer)
    expect(pinAccent('passed')).toBe(PIN_STATUS_ACCENTS.passed)
    expect(pinAccent(null)).toBe(PIN_STATUS_ACCENTS.unset)
  })

  it('the star markup carries the status accent fill', () => {
    expect(pinSvgMarkup(pinAccent('offer'))).toContain(`fill="${PIN_STATUS_ACCENTS.offer}"`)
    expect(pinSvgMarkup(pinAccent(null))).toContain(`fill="${PIN_STATUS_ACCENTS.unset}"`)
  })

  it('the layer-row legend names all four accents', () => {
    for (const word of ['researching', 'offer', 'passed', 'no status']) {
      expect(SAVED_PINS_LEGEND).toContain(word)
    }
  })
})

/** Minimal fake DOM (node env) capturing listeners + attributes. */
function fakeDoc(): {
  doc: PinDocumentLike
  created: Array<
    PinElementLike & {
      attrs: Record<string, string>
      listeners: Record<string, (ev: { stopPropagation(): void }) => void>
    }
  >
} {
  const created: ReturnType<typeof fakeDoc>['created'] = []
  const doc: PinDocumentLike = {
    createElement() {
      const el = {
        innerHTML: '',
        title: '',
        style: {} as Record<string, string>,
        attrs: {} as Record<string, string>,
        listeners: {} as Record<string, (ev: { stopPropagation(): void }) => void>,
        setAttribute(name: string, value: string) {
          el.attrs[name] = value
        },
        addEventListener(
          type: string,
          listener: (ev: { stopPropagation(): void }) => void,
        ) {
          el.listeners[type] = listener
        },
      }
      created.push(el)
      return el
    },
  }
  return { doc, created }
}

describe('savedPinElement — the pin-click seam', () => {
  const pin: SavedPin = {
    parcelNodeId: '48021:2',
    lat: 30.1,
    lng: -97.2,
    status: 'researching',
    title: '104 Main St',
  }

  it('click opens THAT saved property via the host reopen flow, swallowing the map click', () => {
    const { doc } = fakeDoc()
    const onOpen = vi.fn()
    const el = savedPinElement(pin, onOpen, doc) as ReturnType<typeof fakeDoc>['created'][0]
    const stopPropagation = vi.fn()
    el.listeners.click({ stopPropagation })
    expect(onOpen).toHaveBeenCalledWith('48021:2')
    expect(stopPropagation).toHaveBeenCalled()
  })

  it('element is a restrained, labeled button with the status-accent star', () => {
    const { doc } = fakeDoc()
    const el = savedPinElement(pin, () => {}, doc) as ReturnType<typeof fakeDoc>['created'][0]
    expect(el.attrs['data-testid']).toBe('saved-property-pin')
    expect(el.attrs['data-parcel-node-id']).toBe('48021:2')
    expect(el.attrs['aria-label']).toContain('104 Main St')
    expect(el.title).toContain('104 Main St')
    expect(el.innerHTML).toContain(`fill="${PIN_STATUS_ACCENTS.researching}"`)
    expect(el.style.width).toBe('18px')
    expect(el.style.cursor).toBe('pointer')
  })
})

/** Full ParcelCardData for lookup-result fakes (only lat/lng matter here). */
const SHEET_PROV = {
  source: 'cad-roll',
  sourceLabel: 'Bastrop County appraisal roll',
  vintage: null,
  method: null,
  retrievedAt: null,
  confidence: null,
  confidenceBasis: 'asserted' as const,
  sourceUrl: null,
}

/**
 * UPDATED BEHAVIOUR (P-39): the save-time pin is the parcel's own GEOMETRY
 * CENTROID off the one sealed fact sheet. It used to come from a bespoke
 * address-geocode chain inside parcel-lookup, which is the path invariant I5
 * demotes; a sheet always carries a centroid, so there is no coordless variant
 * of a resolved sheet any more.
 */
function sheetAt(lat: number, lng: number): ParcelFactSheet {
  const absent = { state: 'absent-covered' as const, reason: 'n/a', provenance: SHEET_PROV }
  return {
    factSheetId: 'fs_test',
    resolverVersion: 'test',
    sealedAt: '2026-08-18T00:00:00.000Z',
    identity: {
      parcelNodeId: '48021:2',
      county: { fips: '48021', name: 'Bastrop' },
      apn: absent,
      situsAddress: absent,
      owner: absent,
    },
    geometry: {
      rings: [],
      centroid: { lat, lng },
      bbox: [lng, lat, lng, lat],
      lotArea: { value: 1, unit: 'sqft' },
      crs: 'EPSG:4326',
    },
    landUse: absent,
    zoning: absent,
    setbacks: absent,
    envelope: { kind: 'not-derived', reason: 'n/a', missing: [] },
    flood: absent,
    site: { elevationRange: null, contourInterval: null, frontage: absent },
    verdict: 'v.',
  }
}

describe('resolvePinForSave — save-time coordinate capture', () => {
  it('uses the direct center when the save flow already has one (no lookup)', async () => {
    const resolve = vi.fn()
    const pin = await resolvePinForSave('48021:2', 30.123456789, -97.987654321, resolve)
    expect(pin).toEqual({ lat: 30.123457, lng: -97.987654 })
    expect(resolve).not.toHaveBeenCalled()
  })

  it('falls back ONCE to the sheet GEOMETRY CENTROID when unknown', async () => {
    const resolve = vi.fn(async () => sheetAt(30.5, -97.5))
    const pin = await resolvePinForSave('48021:2', null, null, resolve)
    expect(pin).toEqual({ lat: 30.5, lng: -97.5 })
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(resolve).toHaveBeenCalledWith('48021:2')
  })

  it('unresolvable stays honestly null (a failed resolve never fails the save)', async () => {
    expect(
      await resolvePinForSave('48021:2', null, null, async () => {
        throw new Error('offline')
      }),
    ).toBeNull()
    expect(
      await resolvePinForSave('48021:2', null, null, async () =>
        sheetAt(Number.NaN, Number.NaN),
      ),
    ).toBeNull()
  })
})
