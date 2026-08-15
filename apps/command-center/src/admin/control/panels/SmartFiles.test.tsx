import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { SmartFiles } from './SmartFiles'
import * as spineClient from '../../api/spineClient'
import * as smartFilesClient from '../../api/smartFilesClient'

vi.mock('../../api/spineClient')
vi.mock('../../api/smartFilesClient')

describe('SmartFiles panel', () => {
  beforeEach(() => {
    vi.mocked(spineClient.loadConfig).mockReturnValue({
      cortexApiUrl: '/api/spine/cortex',
      mcpUrl: '/api/spine/mcp',
      retrievalApiUrl: '/api/spine/retrieval',
      hauskaKey: '',
      installId: 'test',
    })
    vi.mocked(spineClient.apiBase).mockReturnValue('/api/spine/cortex')
  })

  it('renders file list without non-file record atoms', async () => {
    vi.mocked(smartFilesClient.fetchSmartFileFolders).mockResolvedValue({
      ok: true,
      status: 200,
      json: {
        folders: [{ folderId: 'f1', label: 'Planning', scopeType: 'jurisdiction', scopeId: '48021', accessPolicy: 'platform-internal', parentFolderId: null }],
      },
    })
    vi.mocked(smartFilesClient.fetchSmartFileFolderFiles).mockResolvedValue({
      ok: true,
      status: 200,
      json: {
        folder: { folderId: 'f1', label: 'Planning', scopeType: 'jurisdiction', scopeId: '48021', accessPolicy: 'platform-internal', parentFolderId: null },
        files: [{ entityId: 'smartfile:jurisdiction:48021:udc-seed', title: 'UDC', accessPolicy: 'platform-internal', currentVersion: 1, scopeType: 'jurisdiction', scopeId: '48021', docSlug: 'udc-seed', placementCount: 2 }],
        countingRule: 'placements join',
      },
    })
    vi.mocked(smartFilesClient.fetchSmartFileFolderRecords).mockResolvedValue({
      ok: true,
      status: 200,
      json: {
        records: [{ recordEntityId: 'property:flood-zone:48021:R12345', entityType: 'flood-hazard-zone', accessPolicy: 'platform-internal', payload: { title: 'FEMA SFHA', claim: 'Zone X' } }],
      },
    })

    render(<SmartFiles />)
    await waitFor(() => expect(screen.getByText('UDC')).toBeInTheDocument())
    expect(screen.getByText('FEMA SFHA')).toBeInTheDocument()
    expect(screen.getByText('Record pane')).toBeInTheDocument()
    expect(screen.queryByText('FEMA SFHA', { selector: 'button' })).toBeNull()
  })
})
