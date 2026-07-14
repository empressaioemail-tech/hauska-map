// apps/command-center/src/admin/control/panels/AtomInspector.test.tsx
//
// Filter-wiring tests for the Atoms panel: entity_type must reach search_atoms
// VERBATIM (hyphenated enum — the old .replace(/-/g,'_') produced -32602
// invalid_enum_value upstream), jurisdiction must be normalized to the
// underscored tenant-id shape, and the normalized value must surface as a
// hint chip so 0-row results stay interpretable.

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

const { callToolMock } = vi.hoisted(() => ({
  callToolMock: vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ results: [] as unknown[] })),
}))

// PanelProvider → PanelRegistry pulls the whole panel/tile graph. The
// externalized @empressaio/cortex-tiles dist itself imports
// "@hauska/map-renderer/styles.css", which node's ESM loader can't load and
// vi.mock can't intercept inside an externalized dep — so stub the package
// (and the css specifiers the local sources import), as LiveMapTile.test does.
vi.mock('@empressaio/cortex-tiles', () => {
  const Stub = () => null
  const Passthrough = ({ children }: { children?: React.ReactNode }) => <>{children}</>
  return {
    IntakeQueueTile: Stub,
    IntakeTile: Stub,
    FindingsLibraryTile: Stub,
    ComplianceRunTile: Stub,
    DocumentViewerTile: Stub,
    DataroomTile: Stub,
    TopographyTile: Stub,
    DrainageTile: Stub,
    HydrologyTile: Stub,
    SubsurfaceTile: Stub,
    PropertyBriefTile: Stub,
    HazardProfileTile: Stub,
    EncumbranceTile: Stub,
    LocalSetbacksTile: Stub,
    SheetExtractionTile: Stub,
    ResponseTasksTile: Stub,
    DocumentParsingTile: Stub,
    ProductSpecReferenceTile: Stub,
    LetterTile: Stub,
    CortexProvider: Passthrough,
    TileErrorBoundary: Passthrough,
  }
})
vi.mock('@hauska/map-renderer', () => ({ FloatingMap: () => null }))
vi.mock('@hauska/map-renderer/styles.css', () => ({}))
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}))
vi.mock('@empressaio/design-tokens/tokens.css', () => ({}))

vi.mock('../../api/spineClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/spineClient')>()
  return {
    ...actual,
    HauskaMcpClient: class {
      callTool = callToolMock
    },
  }
})

import { PanelProvider } from '../center/useActivePanel'
import { AtomInspector } from './AtomInspector'

beforeEach(() => {
  localStorage.clear()
  callToolMock.mockClear()
  window.location.hash = ''
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const renderPanel = () =>
  render(
    <PanelProvider>
      <AtomInspector />
    </PanelProvider>,
  )

describe('AtomInspector filters', () => {
  it('sends the hyphenated entity_type verbatim (no underscore conversion)', async () => {
    renderPanel()
    await waitFor(() => expect(callToolMock).toHaveBeenCalled())

    fireEvent.change(screen.getByLabelText('entity_type'), { target: { value: 'code-section' } })
    fireEvent.click(screen.getByText('Query'))

    await waitFor(() => expect(callToolMock).toHaveBeenCalledTimes(2))
    const [tool, args] = callToolMock.mock.calls[1]
    expect(tool).toBe('search_atoms')
    expect(args.entity_type).toBe('code-section')
  })

  it('offers exactly the live introspection enum as entity_type options', () => {
    renderPanel()
    const options = Array.from(screen.getByLabelText('entity_type').querySelectorAll('option')).map(
      (o) => (o as HTMLOptionElement).value,
    )
    expect(options).toEqual([
      '',
      'code-section',
      'code-definition',
      'code-amendment',
      'code-cross-reference',
      'code-edition',
      'jurisdiction-corpus',
    ])
  })

  it('normalizes free-form jurisdiction input and shows the sent value as a hint chip', async () => {
    renderPanel()
    await waitFor(() => expect(callToolMock).toHaveBeenCalled())

    fireEvent.change(screen.getByPlaceholderText(/jurisdiction/), { target: { value: 'Bastrop, TX' } })
    expect(screen.getByText('jurisdiction sent: bastrop_tx')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Query'))
    await waitFor(() => expect(callToolMock).toHaveBeenCalledTimes(2))
    expect(callToolMock.mock.calls[1][1].jurisdiction).toBe('bastrop_tx')
  })

  it('omits empty filters (undefined, not empty strings)', async () => {
    renderPanel()
    await waitFor(() => expect(callToolMock).toHaveBeenCalled())
    const [, args] = callToolMock.mock.calls[0]
    expect(args.jurisdiction).toBeUndefined()
    expect(args.entity_type).toBeUndefined()
  })
})
