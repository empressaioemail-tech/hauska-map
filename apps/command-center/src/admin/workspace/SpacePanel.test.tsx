// apps/command-center/src/admin/workspace/SpacePanel.test.tsx
//
// Smoke tests for native space panel composition — verifies that the nested
// CortexShell is GONE (no inner spaces bar, no View/Edit chrome, no "Cortex
// Workspace" title row). Tiles mount directly in command center's own style.

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SpacePanel } from './SpacePanel'
import type { PresetSpace } from '@empressaio/tile-shell'

// Mock the cortex client and tile components
vi.mock('./cortexClient', () => ({
  cortexClient: { baseUrl: '/test', getToken: () => '' },
}))

vi.mock('./tileRegistry', () => ({
  getTile: (id: string) => {
    const tiles: Record<string, any> = {
      'intake-queue': {
        id: 'intake-queue',
        label: 'Intake Queue',
        category: 'Compliance',
        status: 'live',
        el: () => <div data-testid="tile-intake-queue">Intake Queue Tile</div>,
      },
      intake: {
        id: 'intake',
        label: 'Intake',
        category: 'Compliance',
        status: 'live',
        el: () => <div data-testid="tile-intake">Intake Tile</div>,
      },
      'document-viewer': {
        id: 'document-viewer',
        label: 'Document Viewer',
        category: 'Compliance',
        status: 'live',
        el: () => <div data-testid="tile-document-viewer">Document Viewer Tile</div>,
      },
      map: {
        id: 'map',
        label: 'Map',
        category: 'Site Analysis',
        status: 'partial',
        el: () => <div data-testid="tile-map">Map Tile</div>,
      },
    }
    return tiles[id]
  },
}))

// Mock the design tokens CSS
vi.mock('@empressaio/design-tokens/tokens.css', () => ({}))

// Mock the CortexProvider and EngagementProvider
vi.mock('@empressaio/cortex-tiles', () => ({
  CortexProvider: ({ children }: any) => <div data-testid="cortex-provider">{children}</div>,
}))

vi.mock('@empressaio/tile-shell', () => ({
  EngagementProvider: ({ children }: any) => <div data-testid="engagement-provider">{children}</div>,
  SpatialProvider: ({ children }: any) => <>{children}</>,
  CodeProvider: ({ children }: any) => <>{children}</>,
  AnnotationSelectionProvider: ({ children }: any) => <>{children}</>,
  DocumentViewerNavigationProvider: ({ children }: any) => <>{children}</>,
}))

describe('SpacePanel', () => {
  const mockSpace: PresetSpace = {
    id: 'plan-review',
    label: 'Plan Review',
    tiles: ['intake-queue', 'intake', 'document-viewer', 'map'],
    layoutId: '2x2',
  }

  it('should render a space with its tiles', () => {
    render(<SpacePanel space={mockSpace} />)

    // Space label should be visible in the header
    expect(screen.getByText('Plan Review')).toBeInTheDocument()

    // All tiles should mount
    expect(screen.getByTestId('tile-intake-queue')).toBeInTheDocument()
    expect(screen.getByTestId('tile-intake')).toBeInTheDocument()
    expect(screen.getByTestId('tile-document-viewer')).toBeInTheDocument()
    expect(screen.getByTestId('tile-map')).toBeInTheDocument()
  })

  it('should NOT render nested CortexShell elements', () => {
    const { container } = render(<SpacePanel space={mockSpace} />)

    // Assert NO nested shell indicators:
    // - No "Cortex Workspace" title
    expect(screen.queryByText(/Cortex Workspace/i)).not.toBeInTheDocument()

    // - No inner spaces bar (the CortexShell's own space selector)
    // The spaces bar typically has aria-label="workspace spaces" or similar
    expect(container.querySelector('[aria-label*="workspace spaces"]')).toBeNull()
    expect(container.querySelector('[aria-label*="space selector"]')).toBeNull()

    // - No View/Edit mode toggle (CortexShell's mode chrome)
    // These would typically be buttons labeled "View" and "Edit"
    const buttons = container.querySelectorAll('button')
    const buttonTexts = Array.from(buttons).map((b) => b.textContent?.toLowerCase() || '')
    
    // We DO have "Edit layout" button (that's ours), but NOT "View" or "Edit" mode toggles
    expect(buttonTexts).toContain('edit layout')
    expect(buttonTexts.filter((t) => t === 'view')).toHaveLength(0)
    expect(buttonTexts.filter((t) => t === 'edit')).toHaveLength(0)
  })

  it('should use command center design language', () => {
    const { container } = render(<SpacePanel space={mockSpace} />)

    // Tiles should be wrapped in command-center styled containers
    // Check for CSS custom properties (design tokens)
    const tileContainers = container.querySelectorAll('[data-testid^="tile-"]')
    expect(tileContainers.length).toBeGreaterThan(0)

    // The parent grid should use command center background
    const grid = container.querySelector('[style*="grid"]')
    expect(grid).not.toBeNull()
  })

  it('should show Edit layout affordance', () => {
    render(<SpacePanel space={mockSpace} />)

    // Single compact "Edit layout" button should be present
    const editButton = screen.getByRole('button', { name: /edit layout/i })
    expect(editButton).toBeInTheDocument()
  })

  it('should handle tiles with non-live status', () => {
    render(<SpacePanel space={mockSpace} />)

    // Map tile has status: 'partial'
    // The tile header should show the status label
    const mapTileHeader = screen.getByText('Map').closest('div')
    expect(mapTileHeader).toBeInTheDocument()
    
    // Status label should be visible
    const partialLabel = screen.getByText('partial')
    expect(partialLabel).toBeInTheDocument()
  })

  it('should apply correct grid layout based on layoutId', () => {
    const { container } = render(<SpacePanel space={mockSpace} />)

    // layoutId '2x2' should create a 2-column, 2-row grid
    const grid = container.querySelector('[style*="grid-template-columns"]')
    expect(grid).not.toBeNull()
    
    const style = grid?.getAttribute('style') || ''
    expect(style).toContain('repeat(2')
  })

  it('should wrap tiles in CortexProvider (EngagementProvider is at app root)', () => {
    render(<SpacePanel space={mockSpace} />)

    // CortexProvider should be present in the tree
    expect(screen.getByTestId('cortex-provider')).toBeInTheDocument()
    // EngagementProvider is now mounted at the app root (main.tsx), not here
  })
})
