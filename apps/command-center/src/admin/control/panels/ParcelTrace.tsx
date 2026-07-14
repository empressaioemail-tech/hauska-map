// apps/command-center/src/admin/control/panels/ParcelTrace.tsx
//
// Command Center · Parcel Trace (panel id: parcel-trace). LIVE.
//
// Parcel drill-through and atom trace. The vanilla console's E7 panel was driven
// by map click (select parcel → show atoms → trace graph). The deployed
// command-center has no interactive map, so this panel provides a search-based
// interface: enter an address → resolve place → show atoms → trace graph.

import React, { useMemo, useState } from 'react'
import { loadConfig, type SpineConfig, getJson, postJson } from '../../api/spineClient'
import { Panel, Pill, Loading, sectionHeader, mono, fmtTime } from '../primitives'

// Response of POST cortex /api/plan-review/geocode (live-verified 2026-07-14):
// { placeKey: "coord:29.88408:-97.93273", apn, jurisdiction, address, lat, lng,
//   city, state, confidence: "high" } — 422 {error:"geocode_miss"} on a miss.
interface GeocodeResult {
  placeKey?: string
  address?: string
  city?: string
  state?: string
  confidence?: string
  error?: string
  message?: string
}

interface Atom {
  atomDid?: string
  atomId?: string
  id?: string
  family?: string
  entityType?: string
  title?: string
  summary?: string
}

const inputStyle: React.CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 11,
  padding: '6px 10px',
  borderRadius: 6,
  color: 'var(--color-text-primary)',
  background: 'var(--color-background-secondary)',
  border: '0.5px solid var(--color-border-tertiary)',
  minWidth: 0,
}

const btnStyle: React.CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 11,
  fontWeight: 600,
  padding: '6px 14px',
  borderRadius: 6,
  cursor: 'pointer',
  color: 'var(--color-text-primary)',
  background: 'var(--color-background-accent)',
  border: '0.5px solid var(--color-border-secondary)',
}

const preStyle: React.CSSProperties = {
  ...mono,
  fontSize: 10.5,
  color: 'var(--color-text-primary)',
  background: 'var(--color-background-secondary)',
  border: '0.5px solid var(--color-border-tertiary)',
  borderRadius: 6,
  padding: 10,
  margin: 0,
  overflowX: 'auto',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  maxHeight: 400,
  overflowY: 'auto',
}

export const ParcelTrace: React.FC = () => {
  const config = useMemo<SpineConfig>(() => loadConfig(), [])
  const [address, setAddress] = useState('1101 Colorado St, Austin, TX 78701')
  const [loading, setLoading] = useState(false)
  const [placeKey, setPlaceKey] = useState<string | null>(null)
  const [atoms, setAtoms] = useState<Atom[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selectedAtomId, setSelectedAtomId] = useState<string | null>(null)
  const [traceResult, setTraceResult] = useState<string>('—')
  const [autoRan, setAutoRan] = useState(false)

  const handleResolve = async () => {
    if (!address.trim()) {
      setError('Enter an address')
      return
    }
    setLoading(true)
    setError(null)
    setPlaceKey(null)
    setAtoms([])
    setSelectedAtomId(null)
    setTraceResult('—')

    try {
      const base = config.cortexApiUrl?.replace(/\/$/, '') || ''
      // Resolve = POST /api/plan-review/geocode with the address in the body.
      // (The old GET /api/brokerage/v1/place/resolve does not exist on deployed
      // cortex — it fell through to the SPA's index.html — and never sent the
      // address at all. Live-verified 2026-07-14 through the console proxy.)
      const geocodeResult = await postJson<GeocodeResult>(
        `${base}/api/plan-review/geocode`,
        config,
        { address: address.trim() },
        10000,
      )
      if (!geocodeResult.ok) {
        setError(
          geocodeResult.json?.error === 'geocode_miss'
            ? `Geocode miss — could not geocode “${address.trim()}”. Check the address and try again.`
            : geocodeResult.error || 'Geocode failed',
        )
        setLoading(false)
        return
      }
      const pk = geocodeResult.json?.placeKey
      if (!pk) {
        setError('Geocode succeeded but returned no placeKey')
        setLoading(false)
        return
      }
      setPlaceKey(pk)

      // Atoms composed at the place: GET /api/brokerage/v1/place/:placeKey/atoms
      // (real route; 404 {error:"geocode_miss"} for an unknown place key).
      const atomsResult = await getJson<{ atoms?: Atom[]; atomCount?: number; error?: string }>(
        `${base}/api/brokerage/v1/place/${encodeURIComponent(pk)}/atoms`,
        config,
        15000,
      )
      if (!atomsResult.ok) {
        setError(
          atomsResult.json?.error === 'geocode_miss'
            ? `Place ${pk} is unknown to cortex (geocode_miss on atoms lookup)`
            : atomsResult.error || 'Atoms fetch failed',
        )
        setLoading(false)
        return
      }
      setAtoms(atomsResult.json?.atoms || [])
      setLoading(false)
    } catch (err) {
      setError((err as Error).message)
      setLoading(false)
    }
  }

  const handleTraceAtom = async (atomId: string) => {
    setSelectedAtomId(atomId)
    setTraceResult(`Tracing ${atomId}…`)

    try {
      const retrievalUrl = config.retrievalApiUrl?.replace(/\/$/, '') || ''
      if (!retrievalUrl) {
        setTraceResult('No retrieval API URL configured')
        return
      }
      // retrieval-api routes are unprefixed: GET /atoms/trace/:did (there is
      // no /v1 — verified against services/retrieval-api/src/server.ts).
      const traceRes = await getJson<{ trace?: unknown }>(
        `${retrievalUrl}/atoms/trace/${encodeURIComponent(atomId)}`,
        config,
        15000,
      )
      if (!traceRes.ok) {
        setTraceResult(`Trace error: ${traceRes.error || 'unknown error'}`)
        return
      }
      setTraceResult(JSON.stringify(traceRes.json, null, 2))
    } catch (err) {
      setTraceResult(`Trace error: ${(err as Error).message}`)
    }
  }

  React.useEffect(() => {
    if (!autoRan && address.trim()) {
      setAutoRan(true)
      void handleResolve()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const atomById = selectedAtomId ? atoms.find((a) => (a.atomDid || a.atomId || a.id) === selectedAtomId) : null

  return (
    <Panel
      title="Parcel Trace"
      subtitle="Place lookup + atom drill-through + trace graph"
      right={<Pill sev={config.hauskaKey ? 'ok' : 'info'}>{config.hauskaKey ? 'keyed' : 'anonymous'}</Pill>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <span style={sectionHeader}>Place Resolve</span>
          <p
            style={{
              fontSize: 11,
              color: 'var(--color-text-tertiary)',
              fontFamily: 'var(--font-ui)',
              marginTop: 4,
              marginBottom: 8,
            }}
          >
            The vanilla console's E7 panel was map-driven (click parcel → atoms). The deployed command-center has no
            interactive map, so this panel provides a search interface: enter address → resolve place → show atoms →
            trace graph.
          </p>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              style={{ ...inputStyle, flex: 1 }}
              placeholder="123 Main St, Austin, TX"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleResolve()
              }}
            />
            <button style={btnStyle} onClick={handleResolve} disabled={loading}>
              {loading ? 'Resolving…' : 'Resolve'}
            </button>
          </div>
          {error && (
            <div
              style={{
                marginTop: 8,
                padding: '8px 10px',
                borderRadius: 6,
                background: 'var(--color-background-danger)',
                border: '0.5px solid var(--color-border-danger)',
              }}
            >
              <span style={{ fontSize: 11, color: 'var(--color-text-danger)', fontFamily: 'var(--font-ui)' }}>
                {error}
              </span>
            </div>
          )}
          {placeKey && (
            <div
              style={{
                marginTop: 8,
                padding: '8px 10px',
                borderRadius: 6,
                background: 'var(--color-background-success)',
                border: '0.5px solid var(--color-border-success)',
              }}
            >
              <span style={{ ...mono, fontSize: 11, color: 'var(--color-text-success)' }}>placeKey: {placeKey}</span>
            </div>
          )}
        </div>

        {atoms.length > 0 && (
          <div>
            <span style={sectionHeader}>Composed Atoms ({atoms.length})</span>
            <p
              style={{
                fontSize: 11,
                color: 'var(--color-text-tertiary)',
                fontFamily: 'var(--font-ui)',
                marginTop: 4,
                marginBottom: 8,
              }}
            >
              Click an atom to trace its graph (retrieval-api /atoms/trace/:did). Uncapped, cycle-safe BFS.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 300, overflowY: 'auto' }}>
              {atoms.map((atom) => {
                const id = atom.atomDid || atom.atomId || atom.id || 'unknown'
                const isSelected = id === selectedAtomId
                return (
                  <button
                    key={id}
                    onClick={() => void handleTraceAtom(id)}
                    style={{
                      textAlign: 'left',
                      padding: '6px 10px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      background: isSelected ? 'var(--color-background-accent)' : 'var(--color-background-secondary)',
                      border: '0.5px solid var(--color-border-tertiary)',
                    }}
                  >
                    <div style={{ ...mono, fontSize: 11, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      {id}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-ui)' }}>
                      {atom.family || atom.entityType || '—'} · {atom.title || atom.summary || '—'}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {selectedAtomId && (
          <div>
            <span style={sectionHeader}>Atom Trace Graph</span>
            {atomById && (
              <div
                style={{
                  marginTop: 6,
                  marginBottom: 6,
                  padding: '6px 10px',
                  borderRadius: 4,
                  background: 'var(--color-background-secondary)',
                  border: '0.5px solid var(--color-border-tertiary)',
                }}
              >
                <div style={{ ...mono, fontSize: 10, color: 'var(--color-text-secondary)' }}>
                  {atomById.family || atomById.entityType || '—'} · {atomById.title || atomById.summary || '—'}
                </div>
              </div>
            )}
            <pre style={preStyle}>{traceResult}</pre>
          </div>
        )}

        {atoms.length === 0 && !loading && !error && (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 11 }}>
            {placeKey
              ? `Place resolved (${placeKey}) but no atoms are composed at this place yet — an honest 0, not an error.`
              : 'Enter an address above to resolve a place and view its composed atoms.'}
          </div>
        )}
      </div>
    </Panel>
  )
}

export default ParcelTrace
