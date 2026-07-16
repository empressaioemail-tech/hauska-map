// apps/command-center/src/admin/workspace/tiles/ParcelTerrainTile.tsx
//
// The command center's Parcel Terrain Model tile: a LOCAL-WORKSPACE tile
// (not a published @empressaio/cortex-tiles component) that surfaces the
// on-demand parcel 3D terrain mesh (GLB) + IFC4 model produced during
// site-topography ingest and served through the Hauska map-gate tool
// `generate_parcel_terrain_model`.
//
// What it does:
//   - reads the current engagement from useEngagement(),
//   - calls HauskaMcpClient.callTool("generate_parcel_terrain_model",
//     { engagementId }) via the same-origin spine proxy,
//   - renders mesh + IFC availability, their geometry metadata, and download
//     references for the GLB and IFC,
//   - and CRITICALLY surfaces the quality-gate signals (source citation,
//     confidence estimate + provenance, coverage fraction, DEM resolution)
//     rather than hiding them. This is the product surface of structural
//     commitment 1: every output carries source citation and confidence.
//
// Honest states: no engagement -> "select a case"; not-yet-generated ->
// a prompt to run site-topography refresh first (NOT an error); tool failure
// -> a named error. A full three.js GLB viewer is deliberately deferred to a
// follow-on; v1 shows mesh/IFC metadata + download refs.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TileErrorBoundary } from '@empressaio/cortex-tiles'
import { useEngagement } from '@empressaio/tile-shell'
import { loadConfig, HauskaMcpClient } from '../../api/spineClient'

/** Shape of the generate_parcel_terrain_model envelope this tile consumes. */
interface TerrainModelRef {
  available?: boolean
  ref?: string | null
  metadata?: Record<string, unknown> | null
}

interface TerrainModelData {
  status?: string
  engagementId?: string
  materializableElementId?: string
  mesh?: TerrainModelRef
  ifc?: TerrainModelRef
  coverage?: unknown
  confidence?: unknown
  demResolutionMeters?: unknown
  sourceCitation?: unknown
  // not-yet-generated shape:
  reason?: string
  nextStep?: string
}

interface TerrainEnvelope {
  data?: TerrainModelData
  atoms?: Array<Record<string, unknown>>
  readContract?: unknown
  meta?: { note?: string; attribution?: string }
}

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'not-generated'; reason: string; nextStep: string }
  | { kind: 'ready'; env: TerrainEnvelope }
  | { kind: 'error'; message: string }

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

/** Read a plausible confidence estimate out of a WidthedConfidence-ish value. */
function confidenceEstimate(confidence: unknown): number | null {
  if (typeof confidence === 'number') return confidence
  if (confidence && typeof confidence === 'object') {
    const c = confidence as { estimate?: unknown }
    if (typeof c.estimate === 'number') return c.estimate
  }
  return null
}

function confidenceProvenance(confidence: unknown): string | null {
  if (confidence && typeof confidence === 'object') {
    const c = confidence as { provenance?: unknown }
    if (typeof c.provenance === 'string') return c.provenance
  }
  return null
}

/** Read a coverage fraction from a coverage block (measured / total, or a bare fraction). */
function coverageFraction(coverage: unknown): number | null {
  if (typeof coverage === 'number') return coverage
  if (coverage && typeof coverage === 'object') {
    const c = coverage as { fraction?: unknown; coveredFraction?: unknown }
    if (typeof c.fraction === 'number') return c.fraction
    if (typeof c.coveredFraction === 'number') return c.coveredFraction
  }
  return null
}

function metaNumber(metadata: Record<string, unknown> | null | undefined, key: string): string {
  const v = metadata?.[key]
  return typeof v === 'number' || typeof v === 'string' ? String(v) : '—'
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

function ModelRow({ title, model }: { title: string; model: TerrainModelRef | undefined }) {
  const available = Boolean(model?.available && model?.ref)
  const meta = model?.metadata ?? null
  return (
    <div
      data-testid={`terrain-${title.toLowerCase()}-row`}
      style={{
        border: '0.5px solid var(--h-border-subtle, #30363d)',
        borderRadius: 6,
        padding: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 12 }}>{title}</span>
        <span
          data-testid={`terrain-${title.toLowerCase()}-availability`}
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: available ? '#7dd3fc' : 'var(--h-text-muted, #768390)',
          }}
        >
          {available ? 'available' : 'not available'}
        </span>
      </div>
      <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 8px' }}>
        {title === 'Mesh' ? (
          <>
            <dt style={labelStyle}>Vertices</dt>
            <dd style={valueStyle}>{metaNumber(meta, 'vertexCount')}</dd>
            <dt style={labelStyle}>Triangles</dt>
            <dd style={valueStyle}>{metaNumber(meta, 'triangleCount')}</dd>
            <dt style={labelStyle}>Georef origin</dt>
            <dd style={valueStyle}>
              {meta?.georefOrigin ? JSON.stringify(meta.georefOrigin) : '—'}
            </dd>
            <dt style={labelStyle}>Bytes</dt>
            <dd style={valueStyle}>{metaNumber(meta, 'byteCount')}</dd>
          </>
        ) : (
          <>
            <dt style={labelStyle}>IFC schema</dt>
            <dd style={valueStyle}>{metaNumber(meta, 'ifcSchemaVersion')}</dd>
            <dt style={labelStyle}>Bytes</dt>
            <dd style={valueStyle}>{metaNumber(meta, 'byteCount')}</dd>
          </>
        )}
      </dl>
      {available ? (
        <a
          data-testid={`terrain-${title.toLowerCase()}-download`}
          href={String(model?.ref)}
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#7dd3fc',
            textDecoration: 'none',
            wordBreak: 'break-all',
          }}
        >
          Download {title} ({model?.ref})
        </a>
      ) : (
        <span style={{ fontSize: 11, color: 'var(--h-text-muted, #768390)' }}>
          No {title} reference for this engagement.
        </span>
      )}
    </div>
  )
}

function ParcelTerrainTileInner() {
  const { engagementId } = useEngagement()
  const [state, setState] = useState<LoadState>({ kind: 'idle' })

  // One client per config load; the browser holds no keys in proxy mode.
  const client = useMemo(() => {
    const config = loadConfig()
    return new HauskaMcpClient(config.mcpUrl, config.hauskaKey, 'map')
  }, [])

  const load = useCallback(async () => {
    if (!engagementId) return
    setState({ kind: 'loading' })
    try {
      const raw = (await client.callTool('generate_parcel_terrain_model', {
        engagementId,
      })) as TerrainEnvelope
      const data = raw?.data ?? {}
      if (data.status === 'not-yet-generated') {
        setState({
          kind: 'not-generated',
          reason: data.reason ?? 'No parcel terrain model has been generated yet.',
          nextStep:
            data.nextStep ??
            'Run site-topography refresh for this engagement, then reload this tile.',
        })
        return
      }
      setState({ kind: 'ready', env: raw })
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }, [client, engagementId])

  // Reff the loader so an unstable client identity cannot loop the effect.
  const loadRef = useRef(load)
  loadRef.current = load
  useEffect(() => {
    setState({ kind: 'idle' })
    if (engagementId) void loadRef.current()
  }, [engagementId])

  if (!engagementId) {
    return (
      <HonestState
        title="Select a case"
        hint="The parcel terrain model is engagement-scoped. Pick a case in the Intake Queue or the context bar."
      />
    )
  }

  if (state.kind === 'loading' || state.kind === 'idle') {
    return <HonestState title="Loading terrain model…" hint="Calling generate_parcel_terrain_model." />
  }

  if (state.kind === 'not-generated') {
    return (
      <div style={honestStyle} role="status" data-testid="terrain-not-generated">
        <div style={{ fontWeight: 600, color: 'var(--color-text-secondary, inherit)' }}>
          Terrain model not generated yet
        </div>
        <div style={{ fontSize: 11 }}>{state.reason}</div>
        <div style={{ fontSize: 11, marginTop: 4 }}>{state.nextStep}</div>
        <button
          type="button"
          data-testid="terrain-reload"
          onClick={() => void load()}
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
          Reload
        </button>
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div style={honestStyle} role="alert" data-testid="terrain-error">
        <div style={{ fontWeight: 600, color: 'var(--color-text-error, #e5534b)' }}>
          Terrain model failed
        </div>
        <div style={{ fontSize: 11 }}>{state.message}</div>
        <button
          type="button"
          data-testid="terrain-retry"
          onClick={() => void load()}
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
    )
  }

  const data = state.env.data ?? {}
  const estimate = confidenceEstimate(data.confidence)
  const provenance = confidenceProvenance(data.confidence)
  const covFraction = coverageFraction(data.coverage)
  const citation =
    typeof data.sourceCitation === 'string' && data.sourceCitation.trim()
      ? data.sourceCitation
      : 'USGS 3DEP'
  const demRes = data.demResolutionMeters

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
      <ModelRow title="Mesh" model={data.mesh} />
      <ModelRow title="IFC" model={data.ifc} />

      {/* Quality-gate signals for structural commitment 1. NEVER hidden: the tile
          shows source citation, confidence + provenance, coverage, and DEM
          resolution alongside the deliverables. */}
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
              : data.coverage != null
                ? JSON.stringify(data.coverage)
                : '—'}
          </dd>
          <dt style={labelStyle}>DEM resolution</dt>
          <dd style={valueStyle} data-testid="terrain-dem-resolution">
            {demRes != null ? `${String(demRes)} m` : '—'}
          </dd>
        </dl>
        <div style={{ fontSize: 10, color: 'var(--h-text-muted, #768390)', marginTop: 4 }}>
          Layer 2 processed output. Confidence reflects source resolution and
          measured-vs-interpolated coverage, not a flat asserted number. A full
          3D GLB viewer is a follow-on; this tile shows mesh/IFC metadata and
          download references.
        </div>
      </div>
    </div>
  )
}

export function ParcelTerrainTile() {
  return (
    <TileErrorBoundary label="Parcel Terrain Model">
      <ParcelTerrainTileInner />
    </TileErrorBoundary>
  )
}
