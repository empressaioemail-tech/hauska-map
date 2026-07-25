/**
 * WDLL 8 dogfood smoke — Node & Graph ledger renders Gate A tally shape and
 * uses the shared trace client. Network is mocked; fails loudly on contract drift.
 *
 * Avoids PanelProvider (pulls PanelRegistry → workspace → map-renderer CSS).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import React from 'react'

const lockParcelNode = vi.fn()
let lockedId: string | null = null

vi.mock('../center/parcelNodeBinding', () => ({
  isCanonicalParcelNodeId: (v: unknown) =>
    typeof v === 'string' && /^\d{5}:[^/\s]+$/.test(v.trim()),
  useParcelNodeBinding: () => ({
    parcelNodeId: lockedId,
    lockParcelNode: (id: string | null) => {
      lockedId = id
      lockParcelNode(id)
    },
  }),
}))

vi.mock('../../api/atomTrace', async () => {
  const actual = await vi.importActual<typeof import('../../api/atomTrace')>('../../api/atomTrace')
  return {
    ...actual,
    fetchAtomTrace: vi.fn(async (did: string) => {
      if (did.includes('zoning-fact')) {
        return {
          ok: true,
          status: 200,
          json: { nodes: [{ id: did }], edges: [] },
        }
      }
      return { ok: false, status: 404, json: null, error: 'not found' }
    }),
  }
})

import { NodeGraph } from './NodeGraph'

const TALLY = {
  generatedAt: '2026-07-25T10:49:52.830Z',
  source: 'live SELECT against substrate Neon',
  centralTx: {
    counties: [
      {
        fips: '48453',
        county: 'Travis',
        nodes: 100,
        zoning_present: 61,
        zoning_honest_absent_or_empty: 39,
        zoning_slot_missing: 0,
        setback_present: 50,
        envelope_present: 50,
        full_chain_nodes: 50,
        references: 0,
        zoning_present_pct: 61,
      },
    ],
  },
}

describe('NodeGraph smoke (WDLL 8)', () => {
  beforeEach(() => {
    lockedId = null
    lockParcelNode.mockClear()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('central_tx_node_graph_tally.json')) {
          return {
            ok: true,
            json: async () => TALLY,
          }
        }
        return { ok: false, status: 404, json: async () => null }
      }),
    )
  })

  it('renders Gate A tally columns and inspects a named node', async () => {
    render(<NodeGraph />)

    await waitFor(() => {
      expect(screen.getByText(/Travis/)).toBeTruthy()
      expect(screen.getByText('61%')).toBeTruthy()
    })

    const input = screen.getByTestId('node-graph-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: '48209:156346' } })
    fireEvent.click(screen.getByTestId('node-graph-inspect'))

    await waitFor(() => {
      expect(lockParcelNode).toHaveBeenCalledWith('48209:156346')
      expect(screen.getByText(/zoning-fact: present/i)).toBeTruthy()
      expect(screen.getByText(/setback-rule: honest-empty/i)).toBeTruthy()
    })
  })
})
