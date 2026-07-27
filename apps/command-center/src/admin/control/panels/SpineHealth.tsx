// apps/command-center/src/admin/control/panels/SpineHealth.tsx
//
// COMPLETE-BASTROP B1 / WDLL 6–7 — Spine source+engine health board.
// Ports Control Tower / RevenueMeter panel shell — do NOT invent a third organism.
// Reads GET /api/spine/retrieval/health/spine (Bearer attached by BFF).

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { loadConfig, type SpineConfig } from '../../api/spineClient'
import {
  fetchSpineHealthSummary,
  runSpineHealthPack,
  type SpineHealthProbeRow,
  type SpineHealthSummary,
} from '../../api/atomTrace'
import { Panel, Pill, Loading, ErrorState, sectionHeader, mono, sevColors } from '../primitives'

function statusSev(status: SpineHealthProbeRow['status'] | undefined): string {
  if (status === 'firing') return 'ok'
  if (status === 'degraded') return 'warn'
  if (status === 'dead-expected') return 'info'
  if (status === 'dead') return 'danger'
  return 'info'
}

function ProbeRow({ row }: { row: SpineHealthProbeRow }) {
  const sev = statusSev(row.status)
  const colors = sevColors(sev)
  return (
    <div
      data-testid={`spine-health-row-${row.probeId}`}
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(140px, 1.4fr) 110px 70px 1fr',
        gap: 8,
        alignItems: 'center',
        padding: '8px 0',
        borderBottom: '0.5px solid var(--color-border-tertiary)',
        fontSize: 11,
        fontFamily: 'var(--font-ui)',
        color: 'var(--color-text-secondary)',
      }}
    >
      <div style={{ ...mono, color: 'var(--color-text-primary)' }}>
        {row.probeId}
        <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
          {row.kind}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <Pill sev={sev}>{row.status}</Pill>
        {row.alert ? <Pill sev="danger">ALERT</Pill> : null}
      </div>
      <div style={mono}>
        {row.currentValue ?? '—'}
        <span style={{ color: 'var(--color-text-tertiary)' }}>
          {' / '}
          {row.baselineValue ?? '—'}
        </span>
      </div>
      <div style={{ ...mono, color: colors.fg, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {row.error
          ? row.error
          : row.signal
            ? JSON.stringify(row.signal).slice(0, 120)
            : '—'}
      </div>
    </div>
  )
}

export const SpineHealth: React.FC = () => {
  const config = useMemo<SpineConfig>(() => loadConfig(), [])
  const [summary, setSummary] = useState<SpineHealthSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchSpineHealthSummary(config)
      if (res.status === 0 || !res.ok) {
        setErr(res.error || `HTTP ${res.status}`)
        setSummary(null)
      } else {
        setSummary(res.json)
        setErr(null)
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [config])

  useEffect(() => {
    void load()
  }, [load])

  const onRun = async () => {
    setRunning(true)
    setErr(null)
    try {
      const res = await runSpineHealthPack(config)
      if (!res.ok) {
        setErr(res.error || `HTTP ${res.status}`)
      } else {
        setSummary(res.json)
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }

  const rows = summary?.rows ?? []
  const alerts = rows.filter((r) => r.alert)
  const sources = rows.filter((r) => r.kind === 'source')
  const engines = rows.filter((r) => r.kind === 'engine')

  return (
    <Panel
      title="Spine Health"
      subtitle="Bastrop source+engine liveness · Control-Tower panel shell (COMPLETE-BASTROP B1)"
      right={
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || running}
            style={{
              padding: '4px 10px',
              borderRadius: 4,
              border: '0.5px solid var(--color-border-secondary)',
              background: 'transparent',
              color: 'var(--color-text-secondary)',
              fontFamily: 'var(--font-ui)',
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void onRun()}
            disabled={loading || running}
            style={{
              padding: '4px 10px',
              borderRadius: 4,
              border: '0.5px solid var(--color-border-secondary)',
              background: 'var(--color-background-info)',
              color: 'var(--color-text-info)',
              fontFamily: 'var(--font-ui)',
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {running ? 'Running…' : 'Run probes'}
          </button>
        </div>
      }
    >
      {loading && !summary ? (
        <Loading />
      ) : err && !summary ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} data-testid="spine-health-degraded">
          <ErrorState msg={err} />
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 6,
              border: '0.5px dashed var(--color-border-warning)',
              background: 'var(--color-background-warning)',
              color: 'var(--color-text-warning)',
              fontSize: 11,
              fontFamily: 'var(--font-ui)',
              lineHeight: 1.45,
            }}
          >
            Spine health summary unavailable. GET{' '}
            <code style={mono}>/api/spine/retrieval/health/spine</code> must return JSON. Run probes
            after retrieval deploy, or paste the JSON path for planner verify.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} data-testid="spine-health-board">
          {err ? <ErrorState msg={err} /> : null}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <Pill sev={(summary?.alertCount ?? 0) > 0 ? 'danger' : 'ok'}>
              alerts: {summary?.alertCount ?? 0}
            </Pill>
            <span style={{ ...mono, fontSize: 10, color: 'var(--color-text-tertiary)' }}>
              pack={summary?.pack ?? 'bastrop'} · {summary?.source ?? '—'} ·{' '}
              {summary?.generatedAt ?? '—'}
            </span>
          </div>

          {summary?.notes?.length ? (
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: 'var(--color-text-warning)' }}>
              {summary.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : null}

          {rows.length === 0 ? (
            <div
              style={{
                padding: '12px',
                border: '0.5px dashed var(--color-border-secondary)',
                borderRadius: 6,
                fontSize: 11,
                color: 'var(--color-text-secondary)',
              }}
            >
              No probe rows yet. Click <strong>Run probes</strong> (POST/GET{' '}
              <code style={mono}>/health/spine/run</code>) to populate{' '}
              <code style={mono}>spine_health_probe</code>.
            </div>
          ) : (
            <>
              {alerts.length > 0 ? (
                <div
                  data-testid="spine-health-alerts"
                  style={{
                    padding: '10px 12px',
                    borderRadius: 6,
                    border: '0.5px solid var(--color-border-danger)',
                    background: 'var(--color-background-danger)',
                    color: 'var(--color-text-danger)',
                    fontSize: 11,
                    fontFamily: 'var(--font-ui)',
                  }}
                >
                  <strong>{alerts.length} ALERT(s)</strong> — zero/error with baseline&gt;0:{' '}
                  {alerts.map((r) => r.probeId).join(', ')}
                </div>
              ) : null}
              <div>
                <span style={sectionHeader}>Sources</span>
                {sources.map((r) => (
                  <ProbeRow key={`s-${r.probeId}`} row={r} />
                ))}
              </div>
              <div>
                <span style={sectionHeader}>Engines</span>
                {engines.map((r) => (
                  <ProbeRow key={`e-${r.probeId}`} row={r} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </Panel>
  )
}

export default SpineHealth
