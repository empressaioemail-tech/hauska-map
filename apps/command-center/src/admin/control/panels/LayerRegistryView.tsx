// apps/command-center/src/admin/control/panels/LayerRegistryView.tsx
//
// Command Center · Layer Registry View (panel id: layer-registry). LIVE.
//
// Layer registry + per-app allocation display. Shows the full LAYER_REGISTRY
// from @hauska/map-renderer, backend catalog status, and allocation rules.
// This is an informational panel — the deployed command-center doesn't control
// the live map renderer (that's in the root vanilla console for local dev).

import React, { useEffect, useMemo, useState } from 'react'
import { loadConfig, type SpineConfig, fetchLayerCatalog } from '../../api/spineClient'
import { Panel, Pill, Loading, ErrorState, sectionHeader, mono, fmtNum } from '../primitives'

// Minimal layer registry type (imported conceptually from @hauska/map-renderer)
interface LayerEntry {
  key: string
  label: string
  group: string
  fixture: boolean
  live: boolean
  fuelGated: boolean
  pending?: boolean
}

// Mock registry - in a real scenario, this would be imported from @hauska/map-renderer
// For now, we'll fetch this from the backend catalog or show a message
const LAYER_GROUPS = ['parcel', 'regulatory', 'hazard', 'terrain', 'hydrology', 'reasoning', 'investor', 'subsurface']

export const LayerRegistryView: React.FC = () => {
  const config = useMemo<SpineConfig>(() => loadConfig(), [])
  const [catalog, setCatalog] = useState<{ status: string; message?: string; packageTier?: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const result = await fetchLayerCatalog(config)
      if (!cancelled) {
        setCatalog(result)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [config])

  if (loading) {
    return (
      <Panel title="Layer Registry" subtitle="GIS layer catalog + allocation">
        <Loading />
      </Panel>
    )
  }

  const isLocalOnly = catalog?.status === 'local-only'
  const isError = catalog?.status === 'error'

  return (
    <Panel
      title="Layer Registry"
      subtitle="GIS layer catalog + allocation metadata"
      right={
        <Pill sev={isLocalOnly ? 'warn' : isError ? 'danger' : 'ok'}>
          {catalog?.status || 'unknown'}
        </Pill>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <span style={sectionHeader}>Backend Catalog Status</span>
          <div
            style={{
              marginTop: 8,
              padding: '10px 12px',
              borderRadius: 6,
              background: 'var(--color-background-secondary)',
              border: '0.5px solid var(--color-border-tertiary)',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', alignItems: 'baseline' }}>
              <span style={{ ...sectionHeader, fontSize: 10 }}>Status</span>
              <span style={{ ...mono, fontSize: 11, color: 'var(--color-text-primary)' }}>
                {catalog?.status || '—'}
              </span>
              {catalog?.packageTier && (
                <>
                  <span style={{ ...sectionHeader, fontSize: 10 }}>Package Tier</span>
                  <span style={{ ...mono, fontSize: 11, color: 'var(--color-text-primary)' }}>
                    {catalog.packageTier}
                  </span>
                </>
              )}
              {catalog?.message && (
                <>
                  <span style={{ ...sectionHeader, fontSize: 10 }}>Message</span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-ui)' }}>
                    {catalog.message}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div>
          <span style={sectionHeader}>Layer Registry Information</span>
          <p
            style={{
              fontSize: 11,
              color: 'var(--color-text-tertiary)',
              fontFamily: 'var(--font-ui)',
              marginTop: 4,
              marginBottom: 10,
            }}
          >
            The full LAYER_REGISTRY lives in @hauska/map-renderer. This panel shows backend catalog status and
            allocation metadata. For layer visibility control and the live map renderer, use the root vanilla console
            in local-dev mode.
          </p>
          <div
            style={{
              padding: '12px',
              borderRadius: 6,
              background: 'var(--color-background-secondary)',
              border: '0.5px solid var(--color-border-tertiary)',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
              {LAYER_GROUPS.map((group) => (
                <div
                  key={group}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 4,
                    background: 'var(--color-background-primary)',
                    border: '0.5px solid var(--color-border-tertiary)',
                  }}
                >
                  <div style={{ ...sectionHeader, fontSize: 9, marginBottom: 3 }}>
                    {group}
                  </div>
                  <div style={{ ...mono, fontSize: 11, color: 'var(--color-text-secondary)' }}>
                    registry group
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <span style={sectionHeader}>Allocation Rules</span>
          <p
            style={{
              fontSize: 11,
              color: 'var(--color-text-tertiary)',
              fontFamily: 'var(--font-ui)',
              marginTop: 4,
              marginBottom: 10,
            }}
          >
            Layer allocation is driven by appId + reportType + packageTier. The resolver in @hauska/map-renderer
            determines which layers appear by default for each app configuration.
          </p>
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 6,
              background: 'var(--color-background-secondary)',
              border: '0.5px dashed var(--color-border-secondary)',
            }}
          >
            <span style={{ ...mono, fontSize: 10.5, color: 'var(--color-text-tertiary)' }}>
              resolveLayerAllocation(appId, reportType, tier) → visibleLayers + defaultOn
            </span>
          </div>
        </div>

        {isLocalOnly && (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 6,
              background: 'var(--color-background-warning)',
              border: '0.5px solid var(--color-border-warning)',
            }}
          >
            <span style={{ fontSize: 11, color: 'var(--color-text-warning)', fontFamily: 'var(--font-ui)' }}>
              Backend catalog unavailable — using local LAYER_REGISTRY only. Set cortexApiUrl to enable backend layer
              catalog.
            </span>
          </div>
        )}

        {isError && (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 6,
              background: 'var(--color-background-danger)',
              border: '0.5px solid var(--color-border-danger)',
            }}
          >
            <span style={{ fontSize: 11, color: 'var(--color-text-danger)', fontFamily: 'var(--font-ui)' }}>
              {catalog?.message || 'Backend catalog error'}
            </span>
          </div>
        )}

        <div>
          <span style={sectionHeader}>Implementation Note</span>
          <p
            style={{
              fontSize: 11,
              color: 'var(--color-text-tertiary)',
              fontFamily: 'var(--font-ui)',
              marginTop: 4,
              lineHeight: 1.5,
            }}
          >
            The vanilla console's E3 panel provided interactive layer visibility toggles and real-time legend sync with
            the floating map window. The deployed command-center is operator-read-only and doesn't embed the live map
            renderer, so this panel focuses on catalog status and allocation metadata rather than interactive controls.
          </p>
        </div>
      </div>
    </Panel>
  )
}

export default LayerRegistryView
