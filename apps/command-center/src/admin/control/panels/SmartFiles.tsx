// Smart Files — Command Center data room panel (G-56).
// Hash route: #panel=smart-files
// File list = file-shaped atoms via placed-on edges only.
// Record pane = non-file atoms (reuse Atom Inspector row primitives).
import React, { useEffect, useMemo, useState } from 'react'
import { loadConfig, type SpineConfig } from '../../api/spineClient'
import {
  attachmentUrl,
  fetchSmartFileFolderFiles,
  fetchSmartFileFolderRecords,
  fetchSmartFileFolders,
  fetchSmartFileRead,
  type SmartFileFolder,
  type SmartFileListItem,
  type SmartFileReadHeld,
  type SmartFileRecordAtom,
} from '../../api/smartFilesClient'
import {
  Panel,
  Pill,
  Loading,
  ErrorState,
  Empty,
  sectionHeader,
  mono,
  fmtTime,
  Button,
  AtomListRow,
} from '../primitives'

const DEFAULT_SCOPE = { scopeType: 'jurisdiction', scopeId: '48021' }

function isHeld(read: unknown): read is SmartFileReadHeld {
  return Boolean(read && typeof read === 'object' && (read as SmartFileReadHeld).status === 'held')
}

const RecordPane: React.FC<{ records: SmartFileRecordAtom[] }> = ({ records }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <div style={sectionHeader}>Record pane</div>
    {records.length === 0 ? (
      <Empty msg="No non-file atoms on this folder." />
    ) : (
      records.map((r) => (
        <AtomListRow
          key={r.recordEntityId}
          claimType={r.entityType}
          atomId={r.recordEntityId}
          title={String(r.payload.title ?? r.entityType)}
          accessPolicy={r.accessPolicy}
          preview={String(r.payload.claim ?? r.payload.source ?? '—')}
        />
      ))
    )}
  </div>
)

const FileSidebar: React.FC<{ read: SmartFileReadHeld; config: SpineConfig }> = ({ read, config }) => {
  const doc = read.document
  const ver = read.version
  const entityId = String(doc.entityId ?? '')
  const versionNum = Number(ver.version ?? 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 'var(--type-caption)' }}>
      <div style={sectionHeader}>Data behind the file</div>
      <div style={mono}>entityId: {entityId}</div>
      <div>accessPolicy: {String(doc.accessPolicy ?? '—')}</div>
      <div>source: {String(read.provenance?.sourceLabel ?? '—')}</div>
      <div>computedAt: {fmtTime(String(read.freshness?.computedAt ?? ''))}</div>
      <div>servedAt: {fmtTime(String(read.freshness?.servedAt ?? ''))}</div>
      {read.freshness?.isStale ? (
        <Pill sev="warn" title="computedAt exceeded staleness threshold">
          STALE
        </Pill>
      ) : (
        <Pill sev="ok">fresh</Pill>
      )}
      <div>
        <div style={{ marginBottom: 4 }}>versions</div>
        <ul style={{ margin: 0, paddingLeft: 16 }}>
          {(read.versions ?? [{ version: versionNum }]).map((v) => (
            <li key={String(v.version)} style={mono}>
              v{String(v.version)}
              {Number(v.version) === versionNum ? ' (open)' : ''}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div style={{ marginBottom: 4 }}>placements ({read.placements?.length ?? 0})</div>
        <ul style={{ margin: 0, paddingLeft: 16 }}>
          {(read.placements ?? []).map((p, i) => {
            const edge = p as { targetType?: string; targetId?: string }
            return (
              <li key={i} style={mono}>
                {edge.targetType}:{edge.targetId}
              </li>
            )
          })}
        </ul>
      </div>
      <a href={attachmentUrl(config, entityId, versionNum)} target="_blank" rel="noreferrer">
        Open attachment (via atom read)
      </a>
    </div>
  )
}

export const SmartFiles: React.FC = () => {
  const [config] = useState<SpineConfig>(() => loadConfig())
  const [folders, setFolders] = useState<SmartFileFolder[]>([])
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [files, setFiles] = useState<SmartFileListItem[]>([])
  const [records, setRecords] = useState<SmartFileRecordAtom[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileRead, setFileRead] = useState<SmartFileReadHeld | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      const res = await fetchSmartFileFolders(config, DEFAULT_SCOPE.scopeType, DEFAULT_SCOPE.scopeId)
      if (cancelled) return
      if (!res.ok) {
        setError(res.error ?? `folders HTTP ${res.status}`)
        setLoading(false)
        return
      }
      const list = res.json?.folders ?? []
      setFolders(list)
      if (list.length > 0 && !selectedFolder) {
        setSelectedFolder(list[0]!.folderId)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [config])

  useEffect(() => {
    if (!selectedFolder) return
    let cancelled = false
    ;(async () => {
      const [filesRes, recordsRes] = await Promise.all([
        fetchSmartFileFolderFiles(config, selectedFolder),
        fetchSmartFileFolderRecords(config, selectedFolder),
      ])
      if (cancelled) return
      if (!filesRes.ok) {
        setError(filesRes.error ?? `files HTTP ${filesRes.status}`)
        return
      }
      setFiles(filesRes.json?.files ?? [])
      setRecords(recordsRes.ok ? recordsRes.json?.records ?? [] : [])
      setSelectedFile(null)
      setFileRead(null)
    })()
    return () => {
      cancelled = true
    }
  }, [config, selectedFolder])

  useEffect(() => {
    if (!selectedFile) return
    let cancelled = false
    ;(async () => {
      const res = await fetchSmartFileRead(config, selectedFile)
      if (cancelled) return
      if (!res.ok) {
        setError(res.error ?? `read HTTP ${res.status}`)
        return
      }
      setFileRead(isHeld(res.json) ? res.json : null)
    })()
    return () => {
      cancelled = true
    }
  }, [config, selectedFile])

  const previewUrl = useMemo(() => {
    if (!fileRead) return null
    const entityId = String(fileRead.document.entityId ?? '')
    const version = Number(fileRead.version.version ?? 1)
    return attachmentUrl(config, entityId, version)
  }, [config, fileRead])

  if (loading) return <Panel title="Smart Files"><Loading msg="Loading data room…" /></Panel>
  if (error) return <Panel title="Smart Files"><ErrorState msg={error} /></Panel>

  return (
    <Panel title="Smart Files" subtitle="Data room · folders are nodes · files are placed-on edges">
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 280px', gap: 12, minHeight: 420 }}>
        <div>
          <div style={sectionHeader}>Folders</div>
          {folders.length === 0 ? (
            <Empty msg="No folders for this scope." />
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {folders.map((f) => (
                <li key={f.folderId}>
                  <Button
                    variant={selectedFolder === f.folderId ? 'primary' : 'ghost'}
                    onClick={() => setSelectedFolder(f.folderId)}
                    style={{ width: '100%', justifyContent: 'flex-start', marginBottom: 4 }}
                  >
                    {f.label}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={sectionHeader}>Files</div>
            {files.length === 0 ? (
              <Empty msg="No file-shaped atoms in this folder." />
            ) : (
              files.map((f) => (
                <div key={f.entityId} style={{ marginBottom: 6 }}>
                  <Button
                    variant={selectedFile === f.entityId ? 'primary' : 'ghost'}
                    onClick={() => setSelectedFile(f.entityId)}
                    style={{ width: '100%', justifyContent: 'flex-start' }}
                  >
                    <span>{f.title}</span>
                    {f.placementCount > 1 ? (
                      <Pill sev="info" title="same entityId in multiple folders">
                        ×{f.placementCount}
                      </Pill>
                    ) : null}
                  </Button>
                  <div style={{ ...mono, fontSize: 'var(--type-caption)', paddingLeft: 8 }}>
                    {f.entityId}
                  </div>
                </div>
              ))
            )}
          </div>

          {fileRead && previewUrl ? (
            <div>
              <div style={sectionHeader}>Preview</div>
              <iframe
                title="PDF preview"
                src={previewUrl}
                style={{ width: '100%', height: 360, border: '1px solid var(--color-border-secondary)' }}
              />
            </div>
          ) : null}

          <RecordPane records={records} />
        </div>

        <div>{fileRead ? <FileSidebar read={fileRead} config={config} /> : <Empty msg="Select a file." />}</div>
      </div>
    </Panel>
  )
}

export default SmartFiles
