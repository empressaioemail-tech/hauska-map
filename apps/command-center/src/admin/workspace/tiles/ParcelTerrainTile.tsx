// apps/command-center/src/admin/workspace/tiles/ParcelTerrainTile.tsx
//
// Command Center Parcel Terrain Model tile (WDLL terrain-ifc item 8).
// Parcel-scoped via county_fips:prop_id — NOT engagement-scoped. Calls the
// Hauska map-gate catalog tool refresh_parcel_terrain_export through the
// same-origin spine MCP proxy and surfaces multi-format terrain exports with
// source citation, asserted confidence provenance, and download links.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TileErrorBoundary } from '@empressaio/cortex-tiles'
import { useEngagement } from '@empressaio/tile-shell'
import { loadConfig, HauskaMcpClient } from '../../api/spineClient'

export type TerrainExportFormat =
  | 'glb'
  | 'ifc'
  | 'dxf-3dface'
  | 'dxf-contour'
  | 'landxml-tin'

interface TerrainArtifactEntry {
  format?: string
  ref?: string
  byteCount?: number
  vertexCount?: number
  triangleCount?: number
  contourIntervalMeters?: number
  contourPolylineCount?: number
  deferred?: boolean
  deferredReason?: string
}

interface TerrainDownloadPayload {
  format?: string
  contentType?: string
  base64?: string
  ref?: string
  byteCount?: number
  downloadPath?: string
}

interface TerrainExportData {
  parcelNodeId?: string
  atom?: {
    sourceCitation?: unknown
    confidence?: unknown
    coverage?: unknown
    fetchedAt?: unknown
  }
  artifacts?: Record<string, TerrainArtifactEntry>
  download?: TerrainDownloadPayload
}

interface TerrainExportEnvelope {
  data?: TerrainExportData
  meta?: { note?: string; attribution?: string }
}

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; env: TerrainExportEnvelope; format: TerrainExportFormat }
  | { kind: 'unknown-parcel'; parcelNodeId: string; message: string }
  | { kind: 'error'; message: string }

const PARCEL_ID_PATTERN = /^\d{5}:\d+$/

const FORMAT_OPTIONS: Array<{
  id: TerrainExportFormat
  label: string
  disabled?: boolean
  disabledReason?: string
}> = [
  { id: 'glb', label: 'GLB mesh' },
  { id: 'ifc', label: 'IFC4' },
  { id: 'dxf-3dface', label: 'DXF 3DFACE' },
  { id: 'dxf-contour', label: 'DXF contour' },
  {
    id: 'landxml-tin',
    label: 'LandXML TIN',
    disabled: true,
    disabledReason:
      'LandXML TIN writer is deferred; this phase ships the shared mesh and required GLB/IFC/DXF emitters without inventing a second TIN triangulation.',
  },
]

const LANDXML_DEFER_REASON = FORMAT_OPTIONS.find((f) => f.id === 'landxml-tin')!.disabledReason!

const honestStyle: React.CSSProperties = {
  padding: 20,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  textAlign: 'center',
  fontFamily: 'var(--font-ui)',
  fontSize: 12,
  color: 'var(--color-text-tertiary, var(--h-text-muted, #768390))',
  height: '100%',
}

const labelStyle: React.CSSProperties = {
  color: 'var(--h-text-muted, #768390)',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const valueStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-mono, monospace)',
  fontSize: 11,
}

function HonestState({ title, hint }: { title: string; hint: string }) {
  return (
    <div role="status" style={honestStyle}>
      <div style={{ fontWeight: 600, color: 'var(--color-text-secondary, inherit)' }}>
        {title}
      </div>
      <div style={{ fontSize: 11 }}>{hint}</div>
    </div>
  )
}

/** Best-effort parcel_node_id from shared engagement context. */
export function defaultParcelNodeId(activeParcel: Record<string, unknown> | null | undefined): string {
  if (!activeParcel) return ''
  const direct = activeParcel.parcel_node_id ?? activeParcel.parcelNodeId
  if (typeof direct === 'string' && PARCEL_ID_PATTERN.test(direct.trim())) {
    return direct.trim()
  }
  const fips = activeParcel.county_fips ?? activeParcel.countyFips
  const prop = activeParcel.prop_id ?? activeParcel.propId ?? activeParcel.apn
  if (fips != null && prop != null) {
    const candidate = `${String(fips).trim()}:${String(prop).trim()}`
    if (PARCEL_ID_PATTERN.test(candidate)) return candidate
  }
  return ''
}

function confidenceEstimate(confidence: unknown): number | null {
  if (typeof confidence === 'number') return confidence
  if (confidence && typeof confidence === 'object') {
    const c = confidence as { estimate?: unknown; value?: unknown }
    if (typeof c.estimate === 'number') return c.estimate
    if (typeof c.value === 'number') return c.value
  }
  return null
}

function confidenceProvenance(confidence: unknown): string | null {
  if (confidence && typeof confidence === 'object') {
    const c = confidence as { provenance?: unknown; kind?: unknown }
    if (typeof c.provenance === 'string' && c.provenance.trim()) return c.provenance
    if (typeof c.kind === 'string' && c.kind.trim()) return c.kind
  }
  return null
}

function coverageFraction(coverage: unknown): number | null {
  if (typeof coverage === 'number') return coverage
  if (coverage && typeof coverage === 'object') {
    const c = coverage as {
      fraction?: unknown
      coveredFraction?: unknown
      coverageFraction?: unknown
      resolutionMetersActual?: unknown
      resolutionMetersRequested?: unknown
    }
    if (typeof c.fraction === 'number') return c.fraction
    if (typeof c.coveredFraction === 'number') return c.coveredFraction
    if (typeof c.coverageFraction === 'number') return c.coverageFraction
  }
  return null
}

function demResolutionMeters(coverage: unknown): number | null {
  if (coverage && typeof coverage === 'object') {
    const c = coverage as {
      resolutionMetersActual?: unknown
      resolutionMetersRequested?: unknown
    }
    if (typeof c.resolutionMetersActual === 'number') return c.resolutionMetersActual
    if (typeof c.resolutionMetersRequested === 'number') return c.resolutionMetersRequested
  }
  return null
}

function isUnknownParcelError(message: string): boolean {
  return /not found|unknown parcel|no parcel|404|invalid parcel/i.test(message)
}

function downloadHref(
  download: TerrainDownloadPayload | undefined,
  artifact: TerrainArtifactEntry | undefined,
): { href: string; label: string } | null {
  if (download?.base64 && download.format) {
    try {
      const bytes = Uint8Array.from(atob(download.base64), (c) => c.charCodeAt(0))
      const blob = new Blob([bytes], {
        type: download.contentType || 'application/octet-stream',
      })
      const ext = download.format.includes('dxf') ? 'dxf' : download.format
      return {
        href: URL.createObjectURL(blob),
        label: `Download ${download.format.toUpperCase()} (${download.byteCount ?? bytes.length} bytes)`,
      }
    } catch {
      /* fall through to ref */
    }
  }
  const ref = download?.ref ?? artifact?.ref
  if (typeof ref === 'string' && (ref.startsWith('http://') || ref.startsWith('https://'))) {
    return { href: ref, label: `Download (${ref})` }
  }
  if (typeof ref === 'string' && ref.trim() && !ref.startsWith('deferred:')) {
    return { href: ref, label: `Artifact ref: ${ref}` }
  }
  return null
}

function FormatArtifactRow({
  format,
  entry,
}: {
  format: TerrainExportFormat
  entry: TerrainArtifactEntry | undefined
}) {
  const deferred = Boolean(entry?.deferred || entry?.ref?.startsWith('deferred:'))
  const available = Boolean(entry && !deferred && entry.ref)
  return (
    <div
      data-testid={`terrain-format-${format}`}
      style={{
        border: '0.5px solid var(--h-border-subtle, #30363d)',
        borderRadius: 6,
        padding: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 600, fontSize: 11 }}>{format}</span>
        <span
          data-testid={`terrain-format-${format}-availability`}
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: available ? '#7dd3fc' : 'var(--h-text-muted, #768390)',
          }}
        >
          {deferred ? 'deferred' : available ? 'available' : 'not available'}
        </span>
      </div>
      {deferred && entry?.deferredReason ? (
        <div style={{ fontSize: 10, color: 'var(--h-text-muted, #768390)' }}>{entry.deferredReason}</div>
      ) : null}
      {available ? (
        <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 8px' }}>
          {entry?.byteCount != null ? (
            <>
              <dt style={labelStyle}>Bytes</dt>
              <dd style={valueStyle}>{entry.byteCount}</dd>
            </>
          ) : null}
          {entry?.vertexCount != null ? (
            <>
              <dt style={labelStyle}>Vertices</dt>
              <dd style={valueStyle}>{entry.vertexCount}</dd>
            </>
          ) : null}
          {entry?.triangleCount != null ? (
            <>
              <dt style={labelStyle}>Triangles</dt>
              <dd style={valueStyle}>{entry.triangleCount}</dd>
            </>
          ) : null}
          {entry?.contourPolylineCount != null ? (
            <>
              <dt style={labelStyle}>Contours</dt>
              <dd style={valueStyle}>{entry.contourPolylineCount}</dd>
            </>
          ) : null}
        </dl>
      ) : null}
    </div>
  )
}

function ParcelTerrainTileInner() {
  const { activeParcel } = useEngagement()
  const contextDefault = useMemo(() => defaultParcelNodeId(activeParcel), [activeParcel])
  const [parcelNodeId, setParcelNodeId] = useState(contextDefault)
  const [format, setFormat] = useState<TerrainExportFormat>('glb')
  const [state, setState] = useState<LoadState>({ kind: 'idle' })

  const client = useMemo(() => {
    const config = loadConfig()
    return new HauskaMcpClient(config.mcpUrl, config.hauskaKey, 'map')
  }, [])

  useEffect(() => {
    if (contextDefault && !parcelNodeId) {
      setParcelNodeId(contextDefault)
    }
  }, [contextDefault, parcelNodeId])

  const load = useCallback(async () => {
    const id = parcelNodeId.trim()
    if (!id) {
      setState({ kind: 'error', message: 'Enter a parcel id as county_fips:prop_id (e.g. 48021:27303).' })
      return
    }
    if (!PARCEL_ID_PATTERN.test(id)) {
      setState({
        kind: 'error',
        message: 'Parcel id must match county_fips:prop_id (e.g. 48021:27303).',
      })
      return
    }
    if (format === 'landxml-tin') {
      setState({ kind: 'error', message: LANDXML_DEFER_REASON })
      return
    }

    setState({ kind: 'loading' })
    try {
      const raw = (await client.callTool('refresh_parcel_terrain_export', {
        parcel_node_id: id,
        format,
      })) as TerrainExportEnvelope
      setState({ kind: 'ready', env: raw, format })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (isUnknownParcelError(message)) {
        setState({ kind: 'unknown-parcel', parcelNodeId: id, message })
        return
      }
      setState({ kind: 'error', message })
    }
  }, [client, format, parcelNodeId])

  const loadRef = useRef(load)
  loadRef.current = load

  const idValid = PARCEL_ID_PATTERN.test(parcelNodeId.trim())

  return (
    <div
      data-testid="parcel-terrain-tile"
      style={{
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        fontFamily: 'var(--font-ui)',
        fontSize: 12,
        color: 'var(--color-text-secondary, var(--h-text-primary, #e6edf3))',
        overflow: 'auto',
        height: '100%',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label htmlFor="terrain-parcel-id" style={labelStyle}>
          Parcel id (county_fips:prop_id)
        </label>
        <input
          id="terrain-parcel-id"
          data-testid="terrain-parcel-id-input"
          type="text"
          value={parcelNodeId}
          placeholder="48021:27303"
          onChange={(e) => setParcelNodeId(e.target.value)}
          style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 11,
            padding: '6px 8px',
            borderRadius: 4,
            border: '0.5px solid var(--h-border-subtle, #30363d)',
            background: 'var(--color-background-secondary, #0d1117)',
            color: 'inherit',
          }}
        />
      </div>

      <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
        <legend style={{ ...labelStyle, marginBottom: 6 }}>Export format</legend>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {FORMAT_OPTIONS.map((opt) => (
            <label
              key={opt.id}
              data-testid={`terrain-format-option-${opt.id}`}
              title={opt.disabled ? opt.disabledReason : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
                opacity: opt.disabled ? 0.55 : 1,
                cursor: opt.disabled ? 'not-allowed' : 'pointer',
              }}
            >
              <input
                type="radio"
                name="terrain-format"
                value={opt.id}
                checked={format === opt.id}
                disabled={opt.disabled}
                onChange={() => {
                  if (!opt.disabled) setFormat(opt.id)
                }}
              />
              {opt.label}
            </label>
          ))}
        </div>
        {format === 'landxml-tin' ? (
          <div
            data-testid="terrain-landxml-deferred"
            style={{ fontSize: 10, color: 'var(--h-text-muted, #768390)', marginTop: 4 }}
          >
            {LANDXML_DEFER_REASON}
          </div>
        ) : null}
      </fieldset>

      <button
        type="button"
        data-testid="terrain-refresh"
        disabled={!idValid || format === 'landxml-tin' || state.kind === 'loading'}
        onClick={() => void loadRef.current()}
        style={{
          alignSelf: 'flex-start',
          padding: '5px 10px',
          fontSize: 11,
          fontWeight: 600,
          fontFamily: 'var(--font-ui)',
          color: 'var(--h-text-primary, #e6edf3)',
          background: 'transparent',
          border: '0.5px solid var(--h-border-subtle, #30363d)',
          borderRadius: 4,
          cursor: idValid ? 'pointer' : 'not-allowed',
          opacity: idValid ? 1 : 0.6,
        }}
      >
        {state.kind === 'loading' ? 'Refreshing…' : 'Refresh terrain export'}
      </button>

      {state.kind === 'idle' ? (
        <HonestState
          title="Parcel terrain export"
          hint="Enter a county_fips:prop_id and pick a format. Paid MCP key required (public-paid tier)."
        />
      ) : null}

      {state.kind === 'loading' ? (
        <HonestState title="Refreshing terrain export…" hint="Calling refresh_parcel_terrain_export." />
      ) : null}

      {state.kind === 'unknown-parcel' ? (
        <div style={honestStyle} role="status" data-testid="terrain-unknown-parcel">
          <div style={{ fontWeight: 600, color: 'var(--color-text-secondary, inherit)' }}>
            Parcel not found
          </div>
          <div style={{ fontSize: 11 }}>
            No terrain export for <code>{state.parcelNodeId}</code>.
          </div>
          <div style={{ fontSize: 11 }}>{state.message}</div>
        </div>
      ) : null}

      {state.kind === 'error' ? (
        <div style={honestStyle} role="alert" data-testid="terrain-error">
          <div style={{ fontWeight: 600, color: 'var(--color-text-error, #e5534b)' }}>
            Terrain export failed
          </div>
          <div style={{ fontSize: 11 }}>{state.message}</div>
          <button
            type="button"
            data-testid="terrain-retry"
            onClick={() => void loadRef.current()}
            style={{
              marginTop: 8,
              padding: '5px 10px',
              fontSize: 11,
              fontWeight: 600,
              fontFamily: 'var(--font-ui)',
              color: 'var(--h-text-primary, #e6edf3)',
              background: 'transparent',
              border: '0.5px solid var(--h-border-subtle, #30363d)',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      ) : null}

      {state.kind === 'ready' ? (
        <TerrainExportResults env={state.env} selectedFormat={state.format} />
      ) : null}
    </div>
  )
}

function TerrainExportResults({
  env,
  selectedFormat,
}: {
  env: TerrainExportEnvelope
  selectedFormat: TerrainExportFormat
}) {
  const data = env.data ?? {}
  const atom = data.atom ?? {}
  const artifacts = data.artifacts ?? {}
  const selectedArtifact = artifacts[selectedFormat]
  const download = downloadHref(data.download, selectedArtifact)

  const estimate = confidenceEstimate(atom.confidence)
  const provenance = confidenceProvenance(atom.confidence)
  const covFraction = coverageFraction(atom.coverage)
  const demRes = demResolutionMeters(atom.coverage)
  const citation =
    typeof atom.sourceCitation === 'string' && atom.sourceCitation.trim()
      ? atom.sourceCitation
      : 'USGS 3DEP'

  return (
    <>
      <div
        data-testid="terrain-selected-format"
        style={{
          border: '0.5px solid var(--h-border-subtle, #30363d)',
          borderRadius: 6,
          padding: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 12 }}>
          Selected: {selectedFormat}
          {data.parcelNodeId ? (
            <span style={{ fontWeight: 400, color: 'var(--h-text-muted, #768390)' }}>
              {' '}
              · {data.parcelNodeId}
            </span>
          ) : null}
        </div>
        {download ? (
          <a
            data-testid="terrain-download"
            href={download.href}
            download={
              data.download?.base64
                ? `terrain-${data.parcelNodeId ?? 'export'}.${selectedFormat.includes('dxf') ? 'dxf' : selectedFormat}`
                : undefined
            }
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: '#7dd3fc',
              textDecoration: 'none',
              wordBreak: 'break-all',
            }}
          >
            {download.label}
          </a>
        ) : (
          <span data-testid="terrain-download-missing" style={{ fontSize: 11, color: 'var(--h-text-muted, #768390)' }}>
            No download payload for {selectedFormat}. Artifact refs are listed below.
          </span>
        )}
      </div>

      <div
        data-testid="terrain-artifact-map"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6 }}
      >
        {(['glb', 'ifc', 'dxf-3dface', 'dxf-contour', 'landxml-tin'] as TerrainExportFormat[]).map(
          (fmt) => (
            <FormatArtifactRow key={fmt} format={fmt} entry={artifacts[fmt]} />
          ),
        )}
      </div>

      <div
        data-testid="terrain-quality-signals"
        style={{
          border: '0.5px solid var(--h-border-subtle, #30363d)',
          borderRadius: 6,
          padding: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 2 }}>Provenance and confidence</div>
        <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 8px' }}>
          <dt style={labelStyle}>Source</dt>
          <dd style={valueStyle} data-testid="terrain-source-citation">
            {citation}
          </dd>
          <dt style={labelStyle}>Confidence</dt>
          <dd style={valueStyle} data-testid="terrain-confidence">
            {estimate != null ? estimate.toFixed(2) : '—'}
            {provenance ? ` (${provenance})` : ''}
          </dd>
          <dt style={labelStyle}>Coverage</dt>
          <dd style={valueStyle} data-testid="terrain-coverage">
            {covFraction != null
              ? `${(covFraction * 100).toFixed(1)}%`
              : atom.coverage != null
                ? JSON.stringify(atom.coverage)
                : '—'}
          </dd>
          <dt style={labelStyle}>DEM resolution</dt>
          <dd style={valueStyle} data-testid="terrain-dem-resolution">
            {demRes != null ? `${String(demRes)} m` : '—'}
          </dd>
        </dl>
        {env.meta?.note ? (
          <div style={{ fontSize: 10, color: 'var(--h-text-muted, #768390)', marginTop: 4 }}>{env.meta.note}</div>
        ) : null}
        <div style={{ fontSize: 10, color: 'var(--h-text-muted, #768390)', marginTop: 4 }}>
          Layer 2 paid export (`public-paid`). Confidence reflects source resolution and coverage;
          asserted provenance is shown until calibration earns tighter bounds.
        </div>
      </div>
    </>
  )
}

export function ParcelTerrainTile() {
  return (
    <TileErrorBoundary label="Parcel Terrain Model">
      <ParcelTerrainTileInner />
    </TileErrorBoundary>
  )
}
