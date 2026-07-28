/**
 * WDLL 8 / CC-A U1+U2 smoke — Node & Graph ledger renders Gate A tally +
 * Control-Tower NodeInspect with clickable edges + family→atoms (mocked network).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import React from 'react'

const lockInspectNode = vi.fn()
const lockParcelNode = vi.fn()
let lockedId: string | null = null
const selectPanel = vi.fn()
let hashParams: Record<string, string> = {}

vi.mock('../center/useActivePanel', () => ({
  useActivePanel: () => ['node-graph', selectPanel, hashParams],
  PanelProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('../center/parcelNodeBinding', async () => {
  const atomTrace = await import('../../api/atomTrace')
  return {
    isCanonicalParcelNodeId: atomTrace.isStrictParcelNodeId,
    isCanonicalRoadNodeId: atomTrace.isCanonicalRoadNodeId,
    isCanonicalBoundaryEdgeNodeId: atomTrace.isCanonicalBoundaryEdgeNodeId,
    isCanonicalSpineNodeId: (v: unknown) =>
      atomTrace.isStrictParcelNodeId(v) ||
      atomTrace.isCanonicalRoadNodeId(v) ||
      atomTrace.isCanonicalBoundaryEdgeNodeId(v),
    useParcelNodeBinding: () => ({
      parcelNodeId: lockedId && atomTrace.isStrictParcelNodeId(lockedId) ? lockedId : null,
      inspectNodeId: lockedId,
      lockParcelNode: (id: string | null) => {
        lockedId = id
        lockParcelNode(id)
      },
      lockInspectNode: (id: string | null) => {
        lockedId = id
        lockInspectNode(id)
      },
    }),
  }
})

vi.mock('../../api/atomTrace', async () => {
  const actual = await vi.importActual<typeof import('../../api/atomTrace')>('../../api/atomTrace')
  return {
    ...actual,
    fetchCentralTxNodeGraphTally: vi.fn(async () => ({
      ok: false,
      status: 401,
      json: null,
      error: 'unauthorized',
    })),
    // CC-NAV: county node list (pinned contract GET /nodes?county=&nodeType=&q=…).
    fetchNodeList: vi.fn(
      async (args: { county: string; nodeType: string; q?: string; offset?: number }) => {
        const parcels = [
          {
            node_id: '48453:100001',
            node_type: 'parcel',
            display_name: '1100 CONGRESS AVE',
            identifiers: { propId: '100001', address: '1100 CONGRESS AVE, AUSTIN, TX', apn: '01-0001' },
            atom_families: { 'zoning-fact': 1 },
          },
          {
            node_id: '48453:100002',
            node_type: 'parcel',
            display_name: '200 E RIVERSIDE DR',
            identifiers: { propId: '100002', address: '200 E RIVERSIDE DR, AUSTIN, TX' },
          },
        ]
        const roads = [
          {
            node_id: '48453:road:555',
            node_type: 'road',
            display_name: 'S Congress Ave',
            identifiers: { roadName: 'S Congress Ave' },
          },
        ]
        const pool = args.nodeType === 'road' ? roads : parcels
        const q = (args.q || '').toLowerCase()
        const nodes = q
          ? pool.filter((n) => JSON.stringify(n.identifiers).toLowerCase().includes(q))
          : pool
        return {
          ok: true,
          status: 200,
          json: {
            available: true,
            county: args.county,
            nodeType: args.nodeType,
            nodes,
            total: nodes.length,
            limit: 50,
            offset: args.offset ?? 0,
          },
        }
      },
    ),
    fetchPropertyAtomChain: vi.fn(async (parcelNodeId: string) => {
      if (parcelNodeId === '48209:156346' || parcelNodeId === '48021:28286') {
        return {
          ok: true,
          status: 200,
          json: {
            parcelNodeId,
            zoningFact: {
              status: 'active',
              atomDid: `did:hauska:zoning-fact:${parcelNodeId}`,
              district: 'HC',
            },
            setbackRule: null,
            buildableEnvelope: {
              status: 'active',
              atomDid: `did:hauska:buildable-envelope:${parcelNodeId}`,
            },
            atoms: [
              {
                did: `did:hauska:zoning-fact:${parcelNodeId}`,
                type: 'zoning-fact',
                accessPolicy: 'public-free',
                payload: {
                  entityType: 'zoning-fact',
                  atomDid: `did:hauska:zoning-fact:${parcelNodeId}`,
                  parcelNodeId,
                  district: 'HC',
                  accessPolicy: 'public-free',
                },
              },
              {
                did: `did:hauska:buildable-envelope:${parcelNodeId}`,
                type: 'buildable-envelope',
                accessPolicy: 'public-free',
                payload: {
                  entityType: 'buildable-envelope',
                  atomDid: `did:hauska:buildable-envelope:${parcelNodeId}`,
                  parcelNodeId,
                  accessPolicy: 'public-free',
                },
              },
            ],
          },
        }
      }
      return { ok: false, status: 502, json: null, error: 'unreachable' }
    }),
    fetchBoundaryEdges: vi.fn(async (parcelNodeId: string) => {
      if (parcelNodeId !== '48021:28286') {
        return { ok: true, status: 200, json: { available: true, parcelNodeId, edges: [], count: 0 } }
      }
      return {
        ok: true,
        status: 200,
        json: {
          available: true,
          parcelNodeId,
          count: 1,
          edges: [
            {
              entityType: 'property-boundary-edge',
              atomDid: 'did:hauska:property-boundary-edge:48021:28286:boundary:2',
              boundaryEdgeId: '48021:28286:boundary:2',
              parcelNodeId,
              role: 'front',
              adjacencyKind: 'ROW',
              accessPolicy: 'platform-internal',
            },
          ],
        },
      }
    }),
    fetchNodeAtoms: vi.fn(async (nodeId: string, family: string) => {
      const atoms = []
      if (!family || family === 'all' || family === 'zoning-fact') {
        atoms.push({
          atom_id: `did:hauska:zoning-fact:${nodeId.includes('boundary') ? '48021:28286' : nodeId}`,
          entity_type: 'zoning-fact',
          entity_id: nodeId,
          claim_key: nodeId,
          claim_type: 'zoning-fact',
          family: 'zoning-fact',
          worker: 'test',
          access_policy: 'public-free',
          knowledge_time: null,
          preview: null,
        })
      }
      if ((!family || family === 'all' || family === 'property-boundary-edge') && nodeId === '48021:28286') {
        atoms.push({
          atom_id: 'did:hauska:property-boundary-edge:48021:28286:boundary:2',
          entity_type: 'property-boundary-edge',
          entity_id: '48021:28286:boundary:2',
          claim_key: '48021:28286:boundary:2',
          claim_type: 'property-boundary-edge',
          family: 'property-boundary-edge',
          worker: 'test',
          access_policy: 'platform-internal',
          knowledge_time: null,
          preview: 'role=front · adj=ROW',
        })
      }
      return {
        ok: true,
        status: 200,
        json: {
          available: true,
          node_id: nodeId,
          family: family || 'all',
          total: atoms.length,
          atoms,
        },
      }
    }),
    fetchPropertyNodeDetail: vi.fn(async (nodeId: string) => {
      if (nodeId === '48021:28286' || nodeId === '48209:156346') {
        return {
          ok: true,
          status: 200,
          json: {
            available: true,
            requested_node_id: nodeId,
            canonical_node_id: nodeId,
            node: {
              node_id: nodeId,
              node_type: 'parcel',
              resolution_status: 'resolved',
              status: 'active',
              name: `parcel ${nodeId.split(':')[1]}`,
              summary: { boundaryEdgeCount: nodeId === '48021:28286' ? 1 : 0 },
            },
            identifiers: [
              { identifier_type: 'parcelNodeId', identifier_value: nodeId, node_id: nodeId },
            ],
            edges_out:
              nodeId === '48021:28286'
                ? [
                    {
                      id: '48021:28286->48021:28286:boundary:2',
                      from_node: '48021:28286',
                      type: 'has-boundary-edge',
                      to_node: '48021:28286:boundary:2',
                      label: 'e2 · front · ROW · 15ft',
                    },
                  ]
                : [],
            edges_in: [],
            atom_counts_by_family: {
              'zoning-fact': 1,
              'buildable-envelope': 1,
              ...(nodeId === '48021:28286' ? { 'property-boundary-edge': 1 } : {}),
            },
          },
        }
      }
      if (nodeId === '48021:28286:boundary:2') {
        return {
          ok: true,
          status: 200,
          json: {
            available: true,
            requested_node_id: nodeId,
            canonical_node_id: nodeId,
            node: {
              node_id: nodeId,
              node_type: 'property-boundary-edge',
              resolution_status: 'resolved',
              status: 'active',
              name: 'edge 2 · front',
              summary: {
                role: 'front',
                adjacencyKind: 'ROW',
                setback: { feet: 15, provenance: 'test' },
                parcelNeighborPropId: '35671',
                facingRoad: { roadNodeId: '48021:road:999' },
              },
            },
            identifiers: [],
            edges_out: [
              {
                id: 'b->road',
                from_node: nodeId,
                type: 'faces-road',
                to_node: '48021:road:999',
                label: 'residential',
              },
              {
                id: 'b->nbr',
                from_node: nodeId,
                type: 'adjacent-parcel',
                to_node: '48021:35671',
                label: 'neighbor 35671',
              },
            ],
            edges_in: [
              {
                id: 'p->b',
                from_node: '48021:28286',
                type: 'has-boundary-edge',
                to_node: nodeId,
              },
            ],
            atom_counts_by_family: { 'property-boundary-edge': 1 },
            boundary_edge: { role: 'front', adjacencyKind: 'ROW' },
          },
        }
      }
      return { ok: false, status: 404, json: null, error: 'not found' }
    }),
  }
})

import { NodeGraph } from './NodeGraph'
import { fetchNodeList } from '../../api/atomTrace'

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
        depth_warm_promoted: 2345,
        zoning_place_type: 3657,
        depth_ratio_place_type: 64.12,
        zoning_present_pct: 61,
      },
    ],
  },
}

describe('NodeGraph smoke (WDLL 8 / CC-A U1+U2)', () => {
  beforeEach(() => {
    lockedId = null
    hashParams = {}
    lockInspectNode.mockClear()
    lockParcelNode.mockClear()
    selectPanel.mockClear()
    selectPanel.mockImplementation((_id: string, params?: Record<string, string>) => {
      hashParams = { ...params }
      if (params?.node) lockedId = params.node
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('central_tx_node_graph_tally.json')) {
          return {
            ok: true,
            text: async () => JSON.stringify(TALLY),
            json: async () => TALLY,
          }
        }
        return { ok: false, status: 404, text: async () => '', json: async () => null }
      }),
    )
  })

  it('renders tally + structured NodeInspect with walkable edge (not JSON-primary)', async () => {
    render(<NodeGraph />)

    // Tally is collapsed below the walk — expand to assert county rows.
    await waitFor(() => {
      expect(screen.getByTestId('central-tx-tally')).toBeTruthy()
    })
    const tallyEl = screen.getByTestId('central-tx-tally')
    const tallyToggle = tallyEl.querySelector('button[aria-expanded]')
    expect(tallyToggle).toBeTruthy()
    fireEvent.click(tallyToggle!)

    // Scope tally assertions to the tally container — the browse-view county
    // roster now also renders county names/percentages, so a global getByText
    // would match two nodes. The tally-only cells (64.12%) stay global-unique.
    await waitFor(() => {
      const { getByText } = within(tallyEl)
      expect(getByText(/Travis/)).toBeTruthy()
      expect(getByText('61%')).toBeTruthy()
      expect(getByText('64.12%')).toBeTruthy()
    })

    const input = screen.getByTestId('node-graph-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: '48021:28286' } })
    fireEvent.click(screen.getByTestId('node-graph-inspect'))

    await waitFor(() => {
      expect(lockInspectNode).toHaveBeenCalledWith('48021:28286')
      expect(screen.getByTestId('node-inspect')).toBeTruthy()
      expect(screen.getByText(/zoning-fact: present/i)).toBeTruthy()
      expect(screen.getByText(/Edges · out 1/i)).toBeTruthy()
    })

    // Raw JSON is demoted — not visible until debug toggle.
    expect(screen.queryByTestId('node-graph-trace')).toBeNull()

    fireEvent.click(screen.getByTestId('edge-out-48021:28286->48021:28286:boundary:2'))

    await waitFor(() => {
      expect(lockInspectNode).toHaveBeenCalledWith('48021:28286:boundary:2')
      expect(screen.getByText(/Boundary primitive/i)).toBeTruthy()
      expect(screen.getByText(/^front$/)).toBeTruthy()
      expect(screen.getByText(/faces-road/i)).toBeTruthy()
      expect(screen.getByText(/adjacent-parcel/i)).toBeTruthy()
    })
  })

  it('opens atoms by family and routes to AtomInspector with return breadcrumb (WDLL 3/5)', async () => {
    lockedId = '48021:28286'
    hashParams = { node: '48021:28286' }
    render(<NodeGraph />)

    await waitFor(() => {
      expect(screen.getByTestId('node-inspect')).toBeTruthy()
    })

    fireEvent.click(screen.getByTestId('family-count-zoning-fact'))

    await waitFor(() => {
      expect(selectPanel).toHaveBeenCalledWith(
        'node-graph',
        expect.objectContaining({ node: '48021:28286', atoms: 'zoning-fact' }),
      )
      expect(screen.getByTestId('node-atoms')).toBeTruthy()
    })

    fireEvent.click(screen.getByTestId('node-atom-zoning-fact'))

    await waitFor(() => {
      expect(selectPanel).toHaveBeenCalledWith(
        'atom-inspector',
        expect.objectContaining({
          id: 'did:hauska:zoning-fact:48021:28286',
          return: 'node-graph',
          node: '48021:28286',
          atoms: 'zoning-fact',
        }),
      )
    })
  })

  it('county click opens the live node list: search, road toggle, node click, back-nav restore (CC-NAV)', async () => {
    render(<NodeGraph />)

    fireEvent.click(await screen.findByTestId('county-row-48453'))

    await waitFor(() => {
      expect(screen.getByTestId('county-node-list')).toBeTruthy()
      expect(screen.getByTestId('node-row-48453:100001')).toBeTruthy()
      expect(screen.getByTestId('node-row-48453:100002')).toBeTruthy()
    })
    expect(fetchNodeList).toHaveBeenCalledWith(
      expect.objectContaining({ county: '48453', nodeType: 'parcel', offset: 0, limit: 50 }),
      expect.anything(),
    )
    // Filters persisted into the hash on open (county=).
    expect(selectPanel).toHaveBeenCalledWith('node-graph', expect.objectContaining({ county: '48453' }))

    // Server-side multi-identifier search.
    fireEvent.change(screen.getByTestId('node-list-search'), { target: { value: 'riverside' } })
    fireEvent.click(screen.getByTestId('node-list-apply'))
    await waitFor(() => {
      expect(screen.getByTestId('node-row-48453:100002')).toBeTruthy()
      expect(screen.queryByTestId('node-row-48453:100001')).toBeNull()
    })
    expect(fetchNodeList).toHaveBeenCalledWith(
      expect.objectContaining({ county: '48453', nodeType: 'parcel', q: 'riverside' }),
      expect.anything(),
    )
    expect(selectPanel).toHaveBeenCalledWith(
      'node-graph',
      expect.objectContaining({ county: '48453', q: 'riverside' }),
    )

    // Node click → existing NodeInspect flow locks the node.
    fireEvent.click(screen.getByTestId('node-row-48453:100002'))
    await waitFor(() => {
      expect(lockInspectNode).toHaveBeenCalledWith('48453:100002')
      expect(screen.getByTestId('node-graph-back-to-browse')).toBeTruthy()
    })

    // Back-nav → the county list is restored with the exact filters.
    fireEvent.click(screen.getByTestId('node-graph-back-to-browse'))
    await waitFor(() => {
      expect(screen.getByTestId('county-node-list')).toBeTruthy()
    })
    expect((screen.getByTestId('node-list-search') as HTMLInputElement).value).toBe('riverside')
  })

  it('toggles the county list to road nodes', async () => {
    hashParams = { county: '48453' }
    render(<NodeGraph />)

    await waitFor(() => {
      expect(screen.getByTestId('node-row-48453:100001')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('node-list-type-road'))
    await waitFor(() => {
      expect(screen.getByTestId('node-row-48453:road:555')).toBeTruthy()
      expect(screen.queryByTestId('node-row-48453:100001')).toBeNull()
    })
    expect(fetchNodeList).toHaveBeenCalledWith(
      expect.objectContaining({ county: '48453', nodeType: 'road' }),
      expect.anything(),
    )
  })

  it('falls back to the roster proxy + honest-empty note when GET /nodes list 404s (endpoint not live)', async () => {
    vi.mocked(fetchNodeList).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: null,
      error: 'HTTP 404',
    })
    render(<NodeGraph />)

    fireEvent.click(await screen.findByTestId('county-row-48453'))

    // 404 → back on the roster, id box seeded, honest-empty note names the 404.
    await waitFor(() => {
      expect(screen.getByTestId('node-browser')).toBeTruthy()
      expect((screen.getByTestId('node-graph-input') as HTMLInputElement).value).toBe('48453:')
      expect(screen.getByTestId('node-browse-honest-empty').textContent).toContain('404')
    })

    // Subsequent county clicks keep the legacy roster-proxy behavior (no list).
    fireEvent.click(screen.getByTestId('county-row-48453'))
    expect(screen.queryByTestId('county-node-list')).toBeNull()
    expect((screen.getByTestId('node-graph-input') as HTMLInputElement).value).toBe('48453:')
  })

  it('labels county zoning honestly: city-zoned pill + unincorporated tooltip, number unchanged (CC-NAV fix 4)', async () => {
    render(<NodeGraph />)

    const pill = await screen.findByText('61% city-zoned')
    expect(pill.getAttribute('title')).toContain('Only cities zone in TX')
    expect(pill.getAttribute('title')).toContain('legitimately unzoned')

    // Tally table: same framing on the Zoning breadth % column header.
    const tallyEl = screen.getByTestId('central-tx-tally')
    fireEvent.click(tallyEl.querySelector('button[aria-expanded]')!)
    await waitFor(() => {
      const th = within(tallyEl).getByText('Zoning breadth %')
      expect(th.getAttribute('title')).toContain('Only cities zone in TX')
      // The computed number itself is untouched.
      expect(within(tallyEl).getByText('61%')).toBeTruthy()
    })
  })
})
