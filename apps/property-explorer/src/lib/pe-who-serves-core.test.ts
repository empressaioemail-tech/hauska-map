import { describe, expect, it } from 'vitest'
import {
  WHO_SERVES_RESIDUAL,
  assertWhoServesSection,
  formatWhoServesDisplay,
  parseWhoServesParams,
} from '../../api/_lib/pe-who-serves-core'

describe('parseWhoServesParams', () => {
  it('accepts finite lat/lng', () => {
    const parsed = parseWhoServesParams({ lat: '30.11', lng: '-97.32' })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.lat).toBeCloseTo(30.11)
    expect(parsed.lng).toBeCloseTo(-97.32)
  })

  it('refuses non-finite and degenerate (0,0) points', () => {
    expect(parseWhoServesParams({ lat: 'x', lng: '1' }).ok).toBe(false)
    expect(parseWhoServesParams({ lat: '0', lng: '0' }).ok).toBe(false)
  })
})

describe('assertWhoServesSection', () => {
  it('accepts measured with holders and residual', () => {
    const section = assertWhoServesSection({
      status: 'measured',
      holders: [
        {
          source_key: 'puc-ccn',
          service_kind: 'water',
          territory_id: 'w1',
          territory_name: 'City of Bastrop',
        },
      ],
      residual: WHO_SERVES_RESIDUAL,
      asOf: '2026-08-01T00:00:00.000Z',
    })
    expect(section.status).toBe('measured')
  })

  it('accepts measured miss as holders [] plus residual', () => {
    const section = assertWhoServesSection({
      status: 'measured',
      holders: [],
      residual: WHO_SERVES_RESIDUAL,
      asOf: null,
    })
    expect(section.status).toBe('measured')
    if (section.status === 'measured') {
      expect(section.holders).toEqual([])
    }
  })

  it('refuses empty object success', () => {
    expect(() => assertWhoServesSection({})).toThrow(/holders and residual/)
  })

  it('refuses TCEQ additive row restated as water CCN', () => {
    expect(() =>
      assertWhoServesSection({
        status: 'measured',
        holders: [
          {
            source_key: 'tceq-water-districts',
            service_kind: 'water',
            territory_id: 'x',
            territory_name: null,
          },
        ],
        residual: WHO_SERVES_RESIDUAL,
        asOf: null,
      }),
    ).toThrow(/TCEQ/)
  })
})

describe('formatWhoServesDisplay', () => {
  it('summarizes holders and keeps residual separate for the card join', () => {
    const formatted = formatWhoServesDisplay({
      status: 'measured',
      holders: [
        {
          source_key: 'puc-ccn',
          service_kind: 'water',
          territory_id: 'w1',
          territory_name: 'City of Bastrop',
        },
      ],
      residual: WHO_SERVES_RESIDUAL,
      asOf: null,
    })
    expect(formatted.state).toBe('present')
    expect(formatted.summary).toContain('water')
    expect(formatted.summary).toContain('City of Bastrop')
    expect(formatted.residual).toBe(WHO_SERVES_RESIDUAL)
  })

  it('honest absence when staging is unmeasured', () => {
    const formatted = formatWhoServesDisplay({
      status: 'unmeasured',
      basis: 'tx_utility_territory_staging row count is 0',
      holders: [],
      asOf: null,
    })
    expect(formatted.state).toBe('absent')
    expect(formatted.residual).toBeNull()
  })
})
