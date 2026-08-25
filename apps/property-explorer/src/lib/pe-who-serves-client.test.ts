import { describe, expect, it, vi } from 'vitest'
import {
  fetchWhoServesAtPoint,
  loadWhoServesPresentation,
  whoServesQueryPointFromCentroid,
} from './pe-who-serves-client'
import { WHO_SERVES_RESIDUAL } from '../../api/_lib/pe-who-serves-core'

describe('whoServesQueryPointFromCentroid', () => {
  it('accepts a finite centroid and refuses (0,0)', () => {
    expect(whoServesQueryPointFromCentroid({ lat: 30.11, lng: -97.32 })).toEqual({
      lat: 30.11,
      lng: -97.32,
    })
    expect(whoServesQueryPointFromCentroid({ lat: 0, lng: 0 })).toBeNull()
    expect(whoServesQueryPointFromCentroid(null)).toBeNull()
  })
})

describe('fetchWhoServesAtPoint', () => {
  it('calls the PE BFF and validates the section', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        status: 'measured',
        holders: [],
        residual: WHO_SERVES_RESIDUAL,
        asOf: null,
      }),
    })) as unknown as typeof fetch

    const section = await fetchWhoServesAtPoint(30.1, -97.3, {
      fetchImpl,
      basePath: '/api/pe-who-serves',
    })
    expect(section.status).toBe('measured')
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/pe-who-serves?lat=30.1&lng=-97.3',
      expect.objectContaining({ method: 'GET' }),
    )
  })
})

describe('loadWhoServesPresentation', () => {
  it('maps unmeasured to absent presentation', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        status: 'unmeasured',
        basis: 'staging empty',
        holders: [],
        asOf: null,
      }),
    })) as unknown as typeof fetch

    const presentation = await loadWhoServesPresentation(30.1, -97.3, {
      fetchImpl,
    })
    expect(presentation.state).toBe('absent')
    expect(presentation.summary).toBe('staging empty')
    expect(presentation.residual).toBeNull()
  })
})
