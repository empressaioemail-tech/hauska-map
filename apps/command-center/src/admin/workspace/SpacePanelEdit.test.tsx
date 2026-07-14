// apps/command-center/src/admin/workspace/SpacePanelEdit.test.tsx
//
// Edit-mode interaction tests for SpacePanel: enter edit mode, per-tile controls
// (remove, minimize, maximize/restore, span), Add-tile picker, drag-to-reorder,
// and named layout persistence (save → remount ("reload") → persisted; reset;
// layout=<name> hash param selection; default fallback).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { SpacePanel } from './SpacePanel'
import type { PresetSpace } from '@empressaio/tile-shell'

vi.mock('./cortexClient', () => ({
  cortexClient: { baseUrl: '/test', getToken: () => '' },
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
    'document-viewer': mk('document-viewer', 'Document Viewer', 'Compliance'),
    map: mk('map', 'Map', 'Site Analysis', 'partial'),
    topography: mk('topography', 'Topography', 'Site Analysis'),
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
  }
})

vi.mock('@empressaio/design-tokens/tokens.css', () => ({}))

vi.mock('@empressaio/cortex-tiles', () => ({
  CortexProvider: ({ children }: any) => <div data-testid="cortex-provider">{children}</div>,
}))

vi.mock('@empressaio/tile-shell', () => ({
  SpatialProvider: ({ children }: any) => <>{children}</>,
  CodeProvider: ({ children }: any) => <>{children}</>,
  AnnotationSelectionProvider: ({ children }: any) => <>{children}</>,
  DocumentViewerNavigationProvider: ({ children }: any) => <>{children}</>,
}))

const space: PresetSpace = {
  id: 'edit-space',
  label: 'Edit Space',
  tiles: ['intake', 'document-viewer', 'map'],
  layoutId: '2x2',
}

function enterEditMode() {
  fireEvent.click(screen.getByRole('button', { name: /edit layout/i }))
}

beforeEach(() => {
  localStorage.clear()
  window.location.hash = ''
})

describe('SpacePanel edit mode', () => {
  it('replaces the stub bar with a working toolbar', () => {
    render(<SpacePanel space={space} />)
    enterEditMode()
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add tile' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset to default' })).toBeInTheDocument()
    expect(screen.getByLabelText('Saved layouts')).toBeInTheDocument()
  })

  it('removes a tile', () => {
    render(<SpacePanel space={space} />)
    enterEditMode()
    expect(screen.getByTestId('tile-intake')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Intake' }))
    expect(screen.queryByTestId('tile-intake')).not.toBeInTheDocument()
    expect(screen.getByTestId('tile-map')).toBeInTheDocument()
  })

  it('adds a tile from the registry picker (cross-space tile)', () => {
    render(<SpacePanel space={space} />)
    enterEditMode()
    fireEvent.click(screen.getByRole('button', { name: 'Add tile' }))
    // Picker lists tiles not already in the layout, grouped by category
    expect(screen.queryByRole('button', { name: 'Add Intake' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add Letter' }))
    expect(screen.getByTestId('tile-letter')).toBeInTheDocument()
    // Added tile leaves the picker
    expect(screen.queryByRole('button', { name: 'Add Letter' })).not.toBeInTheDocument()
  })

  it('minimizes a tile to header-only and restores it', () => {
    render(<SpacePanel space={space} />)
    enterEditMode()
    fireEvent.click(screen.getByRole('button', { name: 'Minimize Intake' }))
    expect(screen.queryByTestId('tile-intake')).not.toBeInTheDocument() // content hidden
    expect(screen.getByText('Intake')).toBeInTheDocument() // header remains
    fireEvent.click(screen.getByRole('button', { name: 'Restore Intake' }))
    expect(screen.getByTestId('tile-intake')).toBeInTheDocument()
  })

  it('maximizes a tile to the full workspace and restores the grid', () => {
    render(<SpacePanel space={space} />)
    enterEditMode()
    fireEvent.click(screen.getByRole('button', { name: 'Maximize Map' }))
    expect(screen.getByTestId('tile-map')).toBeInTheDocument()
    expect(screen.queryByTestId('tile-intake')).not.toBeInTheDocument()
    expect(screen.queryByTestId('tile-document-viewer')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Restore layout' }))
    expect(screen.getByTestId('tile-intake')).toBeInTheDocument()
    expect(screen.getByTestId('tile-document-viewer')).toBeInTheDocument()
  })

  it('widens a tile (column span) up to the column count', () => {
    const { container } = render(<SpacePanel space={space} />)
    enterEditMode()
    const widen = screen.getByRole('button', { name: 'Widen Intake' })
    fireEvent.click(widen)
    const tileBox = screen.getByTestId('tile-intake').parentElement?.parentElement
    expect(tileBox?.getAttribute('style')).toContain('span 2')
    expect(widen).toBeDisabled() // clamped at columns=2
    // container smoke: grid still 2 columns
    const grid = container.querySelector('[style*="grid-template-columns"]')
    expect(grid?.getAttribute('style')).toContain('repeat(2')
  })

  it('reorders tiles with drag and drop', () => {
    render(<SpacePanel space={space} />)
    enterEditMode()
    const mapBox = screen.getByTestId('tile-map').parentElement!.parentElement!
    const intakeBox = screen.getByTestId('tile-intake').parentElement!.parentElement!
    fireEvent.dragStart(mapBox)
    fireEvent.dragOver(intakeBox)
    fireEvent.drop(intakeBox)
    const ids = Array.from(
      document.querySelectorAll('[data-testid^="tile-"]'),
    ).map((el) => el.getAttribute('data-testid'))
    expect(ids).toEqual(['tile-map', 'tile-intake', 'tile-document-viewer'])
  })
})

describe('SpacePanel layout persistence', () => {
  it('saves a named layout and restores it after remount (reload)', () => {
    render(<SpacePanel space={space} />)
    enterEditMode()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Intake' }))
    fireEvent.change(screen.getByLabelText('Layout name'), {
      target: { value: 'no-intake' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save as' }))

    // simulate reload
    cleanup()
    window.location.hash = ''
    render(<SpacePanel space={space} />)

    expect(screen.queryByTestId('tile-intake')).not.toBeInTheDocument()
    expect(screen.getByTestId('tile-map')).toBeInTheDocument()
    expect(screen.getByText('· no-intake')).toBeInTheDocument()
  })

  it('unsaved working edits also survive remount', () => {
    render(<SpacePanel space={space} />)
    enterEditMode()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Document Viewer' }))

    cleanup()
    render(<SpacePanel space={space} />)

    expect(screen.queryByTestId('tile-document-viewer')).not.toBeInTheDocument()
    expect(screen.getByTestId('tile-intake')).toBeInTheDocument()
  })

  it('reset to default restores the preset layout', () => {
    render(<SpacePanel space={space} />)
    enterEditMode()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Intake' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }))
    expect(screen.getByTestId('tile-intake')).toBeInTheDocument()

    cleanup()
    render(<SpacePanel space={space} />)
    expect(screen.getByTestId('tile-intake')).toBeInTheDocument()
  })

  it('deleting the active layout falls back to the default', () => {
    render(<SpacePanel space={space} />)
    enterEditMode()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Map' }))
    fireEvent.change(screen.getByLabelText('Layout name'), {
      target: { value: 'temp' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save as' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByTestId('tile-map')).toBeInTheDocument()
    expect(screen.queryByText('· temp')).not.toBeInTheDocument()
  })

  it('selects a saved layout via the layout=<name> hash param', () => {
    render(<SpacePanel space={space} />)
    enterEditMode()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Intake' }))
    fireEvent.change(screen.getByLabelText('Layout name'), {
      target: { value: 'hashed' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save as' }))
    // Go back to default, then "arrive" via deep link
    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }))

    cleanup()
    window.location.hash = '#panel=edit-space&layout=hashed'
    render(<SpacePanel space={space} />)

    expect(screen.queryByTestId('tile-intake')).not.toBeInTheDocument()
    expect(screen.getByText('· hashed')).toBeInTheDocument()
  })

  it('unknown hash layout name falls back to the default layout', () => {
    window.location.hash = '#panel=edit-space&layout=missing'
    render(<SpacePanel space={space} />)
    expect(screen.getByTestId('tile-intake')).toBeInTheDocument()
    expect(screen.getByTestId('tile-document-viewer')).toBeInTheDocument()
    expect(screen.getByTestId('tile-map')).toBeInTheDocument()
  })
})
