// apps/command-center/src/admin/workspace/SpacePanelLibrary.test.tsx
//
// Component-library picker tests: the report library section fetches the
// cortex tile-registry through the client (mocked here), renders grouped +
// searchable entries, is honest when the registry is unreachable (error +
// Retry), and parameterized report/component tiles added from the picker
// persist through save / remount ("reload"). The generic ReportTile's honest
// missing-context state is asserted end-to-end (no engagement selected).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { SpacePanel } from './SpacePanel'
import { __resetReportRegistryForTests } from './reportRegistry'
import type { PresetSpace } from '@empressaio/tile-shell'

// The registry fetch rides cortexClient.fetch — mock the transport only, so
// the real reportRegistry cache/sanitize/hook logic is under test.
const registryFetch = vi.fn()
vi.mock('./cortexClient', () => ({
  cortexClient: {
    baseUrl: '/test',
    getToken: () => '',
    fetch: (...args: unknown[]) => registryFetch(...args),
  },
}))

vi.mock('./tileRegistry', () => {
  const mk = (id: string, label: string, category: string, status = 'live') => ({
    id,
    label,
    category,
    status,
    el: () => <div data-testid={`tile-${id}`}>{label} Tile</div>,
  })
  const tiles: Record<string, any> = {
    intake: mk('intake', 'Intake', 'Compliance'),
    map: mk('map', 'Map', 'Site Analysis'),
    letter: mk('letter', 'Letter', 'Deliverable'),
  }
  return {
    ALL_TILES: Object.values(tiles),
    TILE_CATEGORIES: [
      'Compliance',
      'Site Analysis',
      'Property Intel',
      'Design Accelerator',
      'Deliverable',
      'Market',
    ] as const,
    getTile: (id: string) => tiles[id],
    // No real components mapped — added report tiles use the generic ReportTile.
    TILE_COMPONENTS: {},
  }
})

vi.mock('@empressaio/design-tokens/tokens.css', () => ({}))

vi.mock('@empressaio/cortex-tiles', () => {
  const stub = () => <div data-testid="published-tile" />
  return {
    CortexProvider: ({ children }: any) => <>{children}</>,
    useCortexClient: () => ({
      getReport: async () => ({ status: 'not-run' }),
      runReport: async () => ({ generationId: 'g' }),
    }),
    ReportTileShell: ({ label, emptyHint }: any) => (
      <div data-testid="report-shell">
        {label} — {emptyHint}
      </div>
    ),
    ComplianceRunTile: stub,
    DataroomTile: stub,
    DocumentParsingTile: stub,
    DocumentViewerTile: stub,
    DrainageTile: stub,
    EncumbranceTile: stub,
    FindingsLibraryTile: stub,
    HazardProfileTile: stub,
    HydrologyTile: stub,
    IntakeQueueTile: stub,
    IntakeTile: stub,
    LetterTile: stub,
    LocalSetbacksTile: stub,
    MapTile: () => <div data-testid="published-map-tile">Published MapTile</div>,
    ProductSpecReferenceTile: stub,
    PropertyBriefTile: stub,
    ResponseTasksTile: stub,
    SheetExtractionTile: stub,
    SubsurfaceTile: stub,
    TopographyTile: stub,
  }
})

vi.mock('@empressaio/tile-shell', () => ({
  SpatialProvider: ({ children }: any) => <>{children}</>,
  CodeProvider: ({ children }: any) => <>{children}</>,
  AnnotationSelectionProvider: ({ children }: any) => <>{children}</>,
  DocumentViewerNavigationProvider: ({ children }: any) => <>{children}</>,
  // No engagement selected — the generic ReportTile must show its honest state.
  useEngagement: () => ({
    engagementId: null,
    activeParcel: {
      engagementId: null,
      apn: null,
      jurisdiction: null,
      address: null,
      lat: null,
      lng: null,
    },
  }),
}))

const REGISTRY_FIXTURE = [
  {
    id: 'avm',
    label: 'AVM / Valuation',
    category: 'Market',
    status: 'partial',
    engine: 'engagement',
    requires: { apn: true },
    produces: {},
    modes: ['full'],
    mcpTools: [],
  },
  {
    id: 'calibration',
    label: 'Finding Calibration',
    category: 'Compliance',
    status: 'partial',
    engine: 'engagement',
    requires: { engagementId: true, completedFindings: true },
    produces: {},
    modes: ['full'],
    mcpTools: [],
  },
  {
    id: 'precedence',
    label: 'Precedence Engine',
    category: 'Compliance',
    status: 'degraded',
    engine: 'code',
    requires: { jurisdiction: true },
    produces: {},
    modes: ['full'],
    mcpTools: [],
  },
]

const space: PresetSpace = {
  id: 'library-space',
  label: 'Library Space',
  tiles: ['intake', 'map'],
  layoutId: '2x2',
}

async function openPicker() {
  fireEvent.click(screen.getByRole('button', { name: /edit layout/i }))
  fireEvent.click(screen.getByRole('button', { name: 'Add tile' }))
  // let the registry fetch settle
  await screen.findByRole('group', { name: 'Report library' })
}

beforeEach(() => {
  localStorage.clear()
  window.location.hash = ''
  __resetReportRegistryForTests()
  registryFetch.mockReset()
})

describe('Add-tile picker — library sections', () => {
  it('shows grouped sections with live-fetched report library entries', async () => {
    registryFetch.mockResolvedValue(REGISTRY_FIXTURE)
    render(<SpacePanel space={space} />)
    await openPicker()

    expect(registryFetch).toHaveBeenCalledWith('/plan-review/admin/tile-registry')
    expect(screen.getByRole('group', { name: "This panel's tiles" })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'All console tiles' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Components' })).toBeInTheDocument()

    // Registry entries render as addable report tiles (status-annotated)
    expect(
      await screen.findByRole('button', { name: 'Add report AVM / Valuation' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Add report Finding Calibration' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Add report Precedence Engine' }),
    ).toBeInTheDocument()

    // Published component library entries render under Components
    expect(
      screen.getByRole('button', { name: 'Add component MapTile' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Add component TopographyTile' }),
    ).toBeInTheDocument()
  })

  it('is honest when the registry is unreachable, and Retry refetches', async () => {
    registryFetch.mockRejectedValueOnce(new Error('502 upstream unavailable'))
    registryFetch.mockResolvedValueOnce(REGISTRY_FIXTURE)
    render(<SpacePanel space={space} />)
    await openPicker()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Report library unreachable')
    expect(alert.textContent).toContain('502 upstream unavailable')

    fireEvent.click(screen.getByRole('button', { name: 'Retry report library' }))
    expect(
      await screen.findByRole('button', { name: 'Add report AVM / Valuation' }),
    ).toBeInTheDocument()
    expect(registryFetch).toHaveBeenCalledTimes(2)
  })

  it('search filters entries across sections by name', async () => {
    registryFetch.mockResolvedValue(REGISTRY_FIXTURE)
    render(<SpacePanel space={space} />)
    await openPicker()

    fireEvent.change(screen.getByLabelText('Search tiles'), {
      target: { value: 'valuation' },
    })
    expect(
      screen.getByRole('button', { name: 'Add report AVM / Valuation' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Add report Precedence Engine' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add Letter' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Add component MapTile' }),
    ).not.toBeInTheDocument()
  })

  it('adds a report tile that renders its honest missing-context state', async () => {
    registryFetch.mockResolvedValue(REGISTRY_FIXTURE)
    render(<SpacePanel space={space} />)
    await openPicker()

    fireEvent.click(
      await screen.findByRole('button', { name: 'Add report Finding Calibration' }),
    )
    // The tile mounts with the generic ReportTile — no engagement selected, so
    // the honest state renders (not a blank tile, not a fake empty).
    expect(screen.getByText('Select a case')).toBeInTheDocument()
    expect(screen.getByText(/runs against an engagement/i)).toBeInTheDocument()
    // Tile header carries the capability label + status
    expect(screen.getByText('Finding Calibration')).toBeInTheDocument()
    // Added entry leaves the picker
    expect(
      screen.queryByRole('button', { name: 'Add report Finding Calibration' }),
    ).not.toBeInTheDocument()
  })

  it('adds a published component tile from the Components section', async () => {
    registryFetch.mockResolvedValue(REGISTRY_FIXTURE)
    render(<SpacePanel space={space} />)
    await openPicker()

    fireEvent.click(screen.getByRole('button', { name: 'Add component MapTile' }))
    expect(screen.getByTestId('published-map-tile')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Add component MapTile' }),
    ).not.toBeInTheDocument()
  })

  it('parameterized tiles survive save + remount (reload) round-trip', async () => {
    registryFetch.mockResolvedValue(REGISTRY_FIXTURE)
    render(<SpacePanel space={space} />)
    await openPicker()

    fireEvent.click(
      await screen.findByRole('button', { name: 'Add report Finding Calibration' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add component MapTile' }))
    fireEvent.change(screen.getByLabelText('Layout name'), {
      target: { value: 'with-library' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save as' }))

    // simulate reload — no registry fetch needed to render persisted tiles
    cleanup()
    registryFetch.mockReset()
    window.location.hash = ''
    render(<SpacePanel space={space} />)

    expect(screen.getByText('· with-library')).toBeInTheDocument()
    expect(screen.getByText('Finding Calibration')).toBeInTheDocument()
    expect(screen.getByText('Select a case')).toBeInTheDocument()
    expect(screen.getByTestId('published-map-tile')).toBeInTheDocument()
    expect(registryFetch).not.toHaveBeenCalled()

    // and via the layout=<name> hash deep-link
    cleanup()
    window.location.hash = '#layout=with-library'
    render(<SpacePanel space={space} />)
    expect(screen.getByText('Finding Calibration')).toBeInTheDocument()
    expect(screen.getByTestId('published-map-tile')).toBeInTheDocument()
  })
})
