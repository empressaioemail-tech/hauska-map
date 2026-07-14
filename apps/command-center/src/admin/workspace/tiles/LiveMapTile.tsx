// apps/command-center/src/admin/workspace/tiles/LiveMapTile.tsx
//
// The command center's LIVE Map tile — local override of the published
// @empressaio/cortex-tiles MapTile (which has no live-fetch wiring and rode
// the fixture corpus). Registered for tile id 'map' in tileRegistry.
//
// What it adds over the published tile:
//   - Viewport loader: on map load + debounced moveend/zoomend, POSTs the
//     current bbox to the cortex proxy (/brokerage/v1/map-data/gis-layer)
//     for `parcels` + `fema` and renders them as live overlays.
//   - Honest states: zoom-in hint below MIN_PARCEL_ZOOM, truncated chip,
//     no-coverage empty state on 404, named error chips on failure — never a
//     silent fixture fallback.
//   - Fixture layers default OFF and are watermarked FIXTURE when toggled on.
//   - Parcel click → info card (situsAddress / APN / owner / land use /
//     county + provider / not-survey-grade attribution) with "Run property
//     brief" and "Site analysis" actions that thread the parcel through the
//     shared EngagementProvider context (#addr/&lat/&lng hash params) and
//     deep-link to the lens-investor / site-analysis panels.

import React, { useCallback, useMemo, useRef, useState } from 'react'
import { FloatingMap } from '@hauska/map-renderer'
import type { OverlaySpec, ParcelSelection, ViewportState } from '@hauska/map-renderer'
import '@hauska/map-renderer/styles.css'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEngagement, useSpatial, TileStatusBanner } from '@empressaio/tile-shell'
import { PropertyBriefTile, TileErrorBoundary } from '@empressaio/cortex-tiles'
import { cortexClient } from '../cortexClient'
import { useActivePanel } from '../../control/center/useActivePanel'
import {
  MIN_PARCEL_ZOOM,
  LIVE_PARCELS_KEY,
  layersForZoom,
  fetchGisLayer,
  toLiveOverlays,
  selectionToCard,
  type GisLayerResponse,
  type LiveLayerKey,
  type LiveLayerState,
  type ParcelCardData,
} from './liveGis'

/** Panel deep-link targets for the card actions. */
const BRIEF_PANEL_ID = 'lens-investor'
const SITE_ANALYSIS_PANEL_ID = 'site-analysis'

interface LayerSlot {
  fetch: LiveLayerState
  /** Last good response — what the overlays render. */
  data: GisLayerResponse | null
}

const IDLE: LayerSlot = { fetch: { status: 'idle' }, data: null }

const chipStyle = (sev: 'info' | 'warn' | 'error'): React.CSSProperties => ({
  fontSize: 10,
  fontFamily: 'var(--font-ui)',
  fontWeight: 600,
  padding: '3px 8px',
  borderRadius: 4,
  pointerEvents: 'none',
  whiteSpace: 'nowrap',
  color: sev === 'error' ? '#fca5a5' : sev === 'warn' ? '#fcd34d' : 'var(--h-text-muted, #768390)',
  background: 'rgba(13,17,23,0.78)',
  border: `0.5px solid ${sev === 'error' ? 'rgba(248,113,113,0.6)' : sev === 'warn' ? 'rgba(252,211,77,0.5)' : 'rgba(118,131,144,0.4)'}`,
})

function LiveMapTileInner() {
  const { activeParcel, setActiveParcel } = useEngagement()
  const { overlays: spatialOverlays } = useSpatial()
  const [, selectPanel] = useActivePanel()

  const [parcels, setParcels] = useState<LayerSlot>(IDLE)
  const [fema, setFema] = useState<LayerSlot>(IDLE)
  const [zoom, setZoom] = useState<number | null>(null)
  const [fixtureOn, setFixtureOn] = useState(false)
  const [card, setCard] = useState<ParcelCardData | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const { apn, jurisdiction, lat, lng } = activeParcel
  const center = useMemo(
    () => (lat != null && lng != null ? { latitude: lat, longitude: lng } : undefined),
    [lat, lng],
  )
  const flyToParcel = useMemo(
    () => (lat != null && lng != null ? { apn: apn ?? undefined, lat, lng } : null),
    [apn, lat, lng],
  )

  const handleViewportChange = useCallback((vp: ViewportState) => {
    setZoom(vp.zoom)
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const wanted = layersForZoom(vp.zoom)
    const baseUrl = cortexClient.config.baseUrl

    const run = (layer: LiveLayerKey, set: React.Dispatch<React.SetStateAction<LayerSlot>>) => {
      if (!wanted.includes(layer)) {
        set({ fetch: { status: 'zoom-gated' }, data: null })
        return
      }
      set((s) => ({ ...s, fetch: { status: 'loading' } }))
      fetchGisLayer(baseUrl, layer, vp.bbox, ctrl.signal)
        .then((state) => {
          if (ctrl.signal.aborted) return
          set({ fetch: state, data: state.status === 'ok' ? state.response : null })
        })
        .catch((err) => {
          if (ctrl.signal.aborted || (err as Error)?.name === 'AbortError') return
          set({ fetch: { status: 'error', message: `${layer}: ${(err as Error)?.message}` }, data: null })
        })
    }

    run('parcels', setParcels)
    run('fema', setFema)
  }, [])

  const handleParcelSelect = useCallback(
    (sel: ParcelSelection) => {
      if (sel.layerKey === LIVE_PARCELS_KEY) {
        const next = selectionToCard(sel)
        setCard(next)
        setActiveParcel({
          apn: next.apn,
          address: next.situsAddress,
          lat: next.lat,
          lng: next.lng,
        })
        return
      }
      // Fixture / zoning click — legacy behavior: recenter shared context.
      if (sel.lat == null || sel.lng == null) return
      setActiveParcel({
        apn: sel.apn ?? null,
        address: sel.address ?? null,
        lat: sel.lat,
        lng: sel.lng,
      })
    },
    [setActiveParcel],
  )

  const openPanelWithParcel = useCallback(
    (panelId: string) => {
      if (card) {
        setActiveParcel({
          apn: card.apn,
          address: card.situsAddress,
          lat: card.lat,
          lng: card.lng,
        })
      }
      selectPanel(panelId)
    },
    [card, setActiveParcel, selectPanel],
  )

  const mapOverlays = useMemo<OverlaySpec[]>(() => {
    const live = toLiveOverlays(
      parcels.data ? { status: 'ok', response: parcels.data } : parcels.fetch,
      fema.data ? { status: 'ok', response: fema.data } : fema.fetch,
    )
    const spatial: OverlaySpec[] = (spatialOverlays ?? [])
      .filter((o) => o.geojson)
      .map((o) => ({
        layerKey: o.kind || o.id,
        geojson: o.geojson as unknown,
        visible: true,
        ...(o.opacity != null ? { paint: { 'fill-opacity': o.opacity } } : {}),
      }))
    return [...live, ...spatial]
  }, [parcels, fema, spatialOverlays])

  // ── honest state chips ──────────────────────────────────────────────
  const chips: Array<{ key: string; sev: 'info' | 'warn' | 'error'; text: string }> = []
  if (zoom != null && zoom < MIN_PARCEL_ZOOM) {
    chips.push({ key: 'zoom-hint', sev: 'info', text: 'Zoom in for parcels' })
  }
  if (parcels.fetch.status === 'loading' || fema.fetch.status === 'loading') {
    chips.push({ key: 'loading', sev: 'info', text: 'Loading live layers…' })
  }
  if (parcels.fetch.status === 'ok' && parcels.fetch.response.truncated) {
    chips.push({ key: 'truncated', sev: 'warn', text: 'Parcel set truncated — zoom in for full coverage' })
  }
  if (parcels.fetch.status === 'no-coverage') {
    chips.push({ key: 'parcels-nc', sev: 'warn', text: 'No parcel coverage for this area' })
  }
  if (fema.fetch.status === 'no-coverage') {
    chips.push({ key: 'fema-nc', sev: 'warn', text: 'No FEMA flood coverage for this area' })
  }
  if (parcels.fetch.status === 'error') {
    chips.push({ key: 'parcels-err', sev: 'error', text: `Parcels failed — ${parcels.fetch.message}` })
  }
  if (fema.fetch.status === 'error') {
    chips.push({ key: 'fema-err', sev: 'error', text: `FEMA failed — ${fema.fetch.message}` })
  }
  const attribution =
    parcels.fetch.status === 'ok' && parcels.fetch.response.provider
      ? `${parcels.fetch.response.provider}${parcels.fetch.response.notSurveyGrade ? ' · not survey grade' : ''}`
      : null

  const hasParcelContext = lat != null && lng != null

  return (
    <div
      data-testid="live-map-tile"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <TileStatusBanner status="live" label="Map" />

      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex' }}>
        <FloatingMap
          floating={false}
          center={center}
          parcel={flyToParcel}
          address={jurisdiction || undefined}
          useFixture={fixtureOn}
          overlays={mapOverlays}
          onParcelSelect={handleParcelSelect}
          onViewportChange={handleViewportChange}
          style={{ flex: 1, minHeight: 0 }}
        />

        {/* Fixture layers must never render unlabeled (tile-level watermark;
            the renderer stamps its own FIXTURE DATA badge on the canvas too). */}
        {fixtureOn && (
          <div
            data-testid="fixture-watermark"
            style={{
              position: 'absolute',
              top: 8,
              right: 48,
              zIndex: 5,
              pointerEvents: 'none',
              padding: '3px 8px',
              fontSize: 10,
              fontWeight: 700,
              fontFamily: 'var(--font-ui)',
              letterSpacing: '0.12em',
              color: '#b45309',
              background: 'rgba(251,191,36,0.18)',
              border: '1px solid rgba(180,83,9,0.65)',
              borderRadius: 4,
            }}
          >
            FIXTURE
          </div>
        )}

        {/* Honest live-layer state chips. */}
        <div
          data-testid="live-layer-chips"
          style={{
            position: 'absolute',
            left: 8,
            bottom: 8,
            zIndex: 5,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 4,
          }}
        >
          {chips.map((c) => (
            <span key={c.key} style={chipStyle(c.sev)}>
              {c.text}
            </span>
          ))}
          {attribution && (
            <span data-testid="live-attribution" style={chipStyle('info')}>
              {attribution}
            </span>
          )}
        </div>

        {/* Parcel info card (click-through). */}
        {card && (
          <div
            data-testid="parcel-info-card"
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              zIndex: 6,
              width: 248,
              maxWidth: 'calc(100% - 60px)',
              padding: '10px 12px',
              borderRadius: 6,
              background: 'rgba(13,17,23,0.92)',
              border: '0.5px solid var(--h-border-subtle, #30363d)',
              color: 'var(--h-text-primary, #e6edf3)',
              fontFamily: 'var(--font-ui)',
              fontSize: 11,
              lineHeight: 1.45,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 12 }}>
                {card.situsAddress || (card.apn ? `APN ${card.apn}` : 'Parcel')}
              </div>
              <button
                type="button"
                aria-label="Close parcel card"
                onClick={() => setCard(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--h-text-muted, #768390)',
                  cursor: 'pointer',
                  fontSize: 13,
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                ×
              </button>
            </div>
            <dl style={{ margin: '6px 0 0', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 8px' }}>
              {card.apn && (
                <>
                  <dt style={{ color: 'var(--h-text-muted, #768390)' }}>APN</dt>
                  <dd style={{ margin: 0 }} data-testid="parcel-card-apn">{card.apn}</dd>
                </>
              )}
              {card.owner && (
                <>
                  <dt style={{ color: 'var(--h-text-muted, #768390)' }}>Owner</dt>
                  <dd style={{ margin: 0 }}>{card.owner}</dd>
                </>
              )}
              {card.landUseDescription && (
                <>
                  <dt style={{ color: 'var(--h-text-muted, #768390)' }}>Land use</dt>
                  <dd style={{ margin: 0 }}>{card.landUseDescription}</dd>
                </>
              )}
              {card.county && (
                <>
                  <dt style={{ color: 'var(--h-text-muted, #768390)' }}>County</dt>
                  <dd style={{ margin: 0 }}>{card.county}</dd>
                </>
              )}
            </dl>
            {(card.provider || card.notSurveyGrade) && (
              <div style={{ marginTop: 6, fontSize: 10, color: 'var(--h-text-muted, #768390)' }}>
                {card.provider ? `Source: ${card.provider}` : null}
                {card.notSurveyGrade ? `${card.provider ? ' · ' : ''}not survey grade` : null}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => openPanelWithParcel(BRIEF_PANEL_ID)}
                style={{
                  flex: 1,
                  padding: '5px 8px',
                  fontSize: 11,
                  fontWeight: 600,
                  fontFamily: 'var(--font-ui)',
                  color: '#0d1117',
                  background: '#7dd3fc',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              >
                Run property brief
              </button>
              <button
                type="button"
                onClick={() => openPanelWithParcel(SITE_ANALYSIS_PANEL_ID)}
                style={{
                  flex: 1,
                  padding: '5px 8px',
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
                Site analysis
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer: fixture toggle + context readout + in-tile brief card. */}
      <div style={{ flexShrink: 0, borderTop: '1px solid var(--h-border-subtle, #30363d)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: 'var(--h-space-xs, 4px) var(--h-space-sm, 8px)',
          }}
        >
          <p style={{ fontSize: 10, color: 'var(--h-text-muted, #768390)', margin: 0 }}>
            {hasParcelContext
              ? `Center: ${lat!.toFixed(5)}, ${lng!.toFixed(5)}${apn ? ` · APN ${apn}` : ''}`
              : 'Click a parcel for info, or search an address in the top bar.'}
          </p>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10,
              fontFamily: 'var(--font-ui)',
              color: 'var(--h-text-muted, #768390)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <input
              type="checkbox"
              data-testid="fixture-toggle"
              checked={fixtureOn}
              onChange={(e) => setFixtureOn(e.target.checked)}
              style={{ margin: 0 }}
            />
            Fixture layers
          </label>
        </div>
        {hasParcelContext && <PropertyBriefTile mode="card" />}
      </div>
    </div>
  )
}

export function LiveMapTile() {
  return (
    <TileErrorBoundary label="Map">
      <LiveMapTileInner />
    </TileErrorBoundary>
  )
}
