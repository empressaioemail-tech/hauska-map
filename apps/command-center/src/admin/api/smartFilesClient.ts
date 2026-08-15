// Smart Files API client — cortex-api /api/smart-files/*
import { apiBase, getJson, type SpineConfig } from './spineClient'

export interface SmartFileFolder {
  folderId: string
  label: string
  scopeType: string
  scopeId: string
  accessPolicy: string
  parentFolderId: string | null
}

export interface SmartFileListItem {
  entityId: string
  title: string
  accessPolicy: string
  currentVersion: number
  scopeType: string
  scopeId: string
  docSlug: string
  placementCount: number
}

export interface SmartFileRecordAtom {
  recordEntityId: string
  entityType: string
  payload: Record<string, unknown>
  accessPolicy: string
}

export interface SmartFileReadHeld {
  status: 'held'
  document: Record<string, unknown>
  version: Record<string, unknown>
  provenance: Record<string, unknown>
  freshness: { computedAt: string; servedAt: string; isStale: boolean; stalenessThresholdSeconds: number }
  placements: unknown[]
  versions?: Array<Record<string, unknown>>
  attachmentPath?: string
}

export async function fetchSmartFileFolders(
  config: SpineConfig,
  scopeType: string,
  scopeId: string,
) {
  const api = apiBase(config)
  const q = new URLSearchParams({ scopeType, scopeId })
  return getJson<{ folders: SmartFileFolder[] }>(`${api}/api/smart-files/folders?${q}`, config)
}

export async function fetchSmartFileFolderFiles(config: SpineConfig, folderId: string) {
  const api = apiBase(config)
  return getJson<{ folder: SmartFileFolder; files: SmartFileListItem[]; countingRule: string }>(
    `${api}/api/smart-files/folders/${encodeURIComponent(folderId)}/files`,
    config,
  )
}

export async function fetchSmartFileFolderRecords(config: SpineConfig, folderId: string) {
  const api = apiBase(config)
  return getJson<{ records: SmartFileRecordAtom[] }>(
    `${api}/api/smart-files/folders/${encodeURIComponent(folderId)}/records`,
    config,
  )
}

export async function fetchSmartFileRead(config: SpineConfig, entityId: string, version?: number) {
  const api = apiBase(config)
  const q = version != null ? `?version=${version}` : ''
  return getJson<SmartFileReadHeld | Record<string, unknown>>(
    `${api}/api/smart-files/files/${encodeURIComponent(entityId)}${q}`,
    config,
  )
}

export function attachmentUrl(config: SpineConfig, entityId: string, version: number): string {
  const api = apiBase(config)
  return `${api}/api/smart-files/files/${encodeURIComponent(entityId)}/attachment?version=${version}`
}
