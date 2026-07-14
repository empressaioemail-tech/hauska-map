// apps/command-center/src/admin/workspace/tiles/ReportTile.tsx
//
// Generic parameterized report tile — renders any cortex report/capability
// registry entry that has NO dedicated @empressaio/cortex-tiles component
// (capabilities with a real component are resolved to that component in
// dynamicTiles.tsx instead). Given a capability descriptor + the workspace's
// active engagement/parcel context (useEngagement), it:
//
//   - shows honest states when required context is missing ("select a case",
//     "needs a geocoded parcel", "needs a jurisdiction"),
//   - reads the report via the existing report-read pattern
//     (client.getReport(engagementId, type) — the same
//     /api/plan-review/engagements/:id/reports/:type read every report tile
//     in cortex-tiles uses),
//   - offers a Run button (runReport → getReport) for engagement-scoped
//     engines ('engagement' / 'spatial') via the published ReportTileShell,
//   - and is honest about capabilities with no report endpoint: cortex-api's
//     SPA GET catch-all returns HTML for unknown /api paths, which surfaces
//     here as a JSON parse failure and is rendered as "no report endpoint",
//     not as a fake empty state.

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ReportTileShell, useCortexClient } from '@empressaio/cortex-tiles'
import { useEngagement } from '@empressaio/tile-shell'
import type { ReportCapability } from '../reportRegistry'

export type ReportTileCapability = Pick<
  ReportCapability,
  'id' | 'label' | 'status' | 'degradedReason' | 'engine' | 'requires'
>

interface ReportState {
  busy: boolean
  status: string | null
  result: unknown
  error: string | null
  /** True when the reports endpoint does not exist for this capability. */
  unsupported: boolean
}

const INITIAL: ReportState = {
  busy: false,
  status: null,
  result: null,
  error: null,
  unsupported: false,
}

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

/** Detect the cortex SPA fallthrough (HTML where JSON was expected) or a 404. */
function isNoEndpointError(err: unknown): boolean {
  if (err instanceof SyntaxError) return true
  const msg = err instanceof Error ? err.message : String(err)
  return (
    /unexpected token/i.test(msg) ||
    /not valid JSON/i.test(msg) ||
    msg.includes('<!doctype') ||
    msg.includes('<!DOCTYPE') ||
    /^404\b/.test(msg)
  )
}

export function ReportTile({ capability }: { capability: ReportTileCapability }) {
  const client = useCortexClient()
  const { engagementId, activeParcel } = useEngagement()
  const [state, setState] = useState<ReportState>(INITIAL)

  const requires = capability.requires ?? {}
  const runnable = capability.engine === 'engagement' || capability.engine === 'spatial'

  // Context gates — report reads are engagement-scoped, so an engagement is
  // always needed; apn/jurisdiction gates come from the capability descriptor.
  const missingContext = !engagementId
    ? 'engagement'
    : requires.apn && !activeParcel?.apn
      ? 'apn'
      : requires.jurisdiction && !activeParcel?.jurisdiction
        ? 'jurisdiction'
        : null

  const read = useCallback(async () => {
    if (!engagementId) return
    setState((s) => ({ ...s, busy: true, error: null, unsupported: false }))
    try {
      const report = await client.getReport(engagementId, capability.id)
      setState({
        busy: false,
        status: report.status ?? null,
        result: report.result ?? null,
        error: report.status === 'error' ? (report.error ?? 'Report errored') : null,
        unsupported: false,
      })
    } catch (err) {
      if (isNoEndpointError(err)) {
        setState({ ...INITIAL, unsupported: true })
      } else {
        setState({
          ...INITIAL,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }, [client, engagementId, capability.id])

  // Key the read effect on stable identity values only (engagement, capability,
  // context gates) — `read` itself is reffed so an unstable client identity
  // can never re-trigger reads in a loop.
  const readRef = useRef(read)
  readRef.current = read
  useEffect(() => {
    setState(INITIAL)
    if (!missingContext) void readRef.current()
  }, [missingContext, engagementId, capability.id])

  const handleRun = useCallback(async () => {
    if (!engagementId) return
    setState((s) => ({ ...s, busy: true, error: null }))
    try {
      await client.runReport(engagementId, capability.id)
      await read()
    } catch (err) {
      if (isNoEndpointError(err)) {
        setState({ ...INITIAL, unsupported: true })
      } else {
        setState((s) => ({
          ...s,
          busy: false,
          error: err instanceof Error ? err.message : String(err),
        }))
      }
    }
  }, [client, engagementId, capability.id, read])

  const statusBanner =
    capability.status && capability.status !== 'live'
      ? `${capability.status.toUpperCase()}${capability.degradedReason ? ` — ${capability.degradedReason}` : ''}`
      : null

  // Honest states — required context missing.
  if (missingContext === 'engagement') {
    return (
      <HonestState
        title="Select a case"
        hint={
          requires.engagementId
            ? `${capability.label} runs against an engagement. Pick one in the Intake Queue or the context bar.`
            : `Report status is engagement-scoped. Select a case to read ${capability.label}.`
        }
      />
    )
  }
  if (missingContext === 'apn') {
    return (
      <HonestState
        title="Needs a geocoded parcel"
        hint={`${capability.label} needs an APN. Set an active parcel via address search or a map click.`}
      />
    )
  }
  if (missingContext === 'jurisdiction') {
    return (
      <HonestState
        title="Needs a jurisdiction"
        hint={`${capability.label} is jurisdiction-scoped. Set an active parcel with a resolved jurisdiction.`}
      />
    )
  }

  if (state.unsupported) {
    return (
      <HonestState
        title="No report endpoint"
        hint={`cortex-api has no engagement report endpoint for "${capability.id}" yet (capability status: ${capability.status}). Nothing to display — this tile will light up when the backend ships it.`}
      />
    )
  }

  if (runnable) {
    // The published generic report renderer: run button + status + collapsible
    // JSON result + honest empty hint.
    return (
      <ReportTileShell
        label={capability.label}
        engagementId={engagementId}
        busy={state.busy}
        error={state.error}
        onRun={() => void handleRun()}
        result={state.result}
        emptyHint={
          state.status === 'not-run' || state.status === null
            ? `${capability.label} has not run for this engagement yet.`
            : `Status: ${state.status} — no result payload returned.`
        }
        runLabel={`Run ${capability.label}`}
        quotaBanner={statusBanner}
      />
    )
  }

  // Read-only capabilities (code-engine / no engine): status + payload, no run.
  return (
    <div
      style={{
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        fontFamily: 'var(--font-ui)',
        fontSize: 12,
        color: 'var(--color-text-secondary)',
        overflow: 'auto',
        height: '100%',
      }}
    >
      {statusBanner && (
        <div
          role="status"
          style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-warning, #f59e0b)' }}
        >
          {statusBanner}
        </div>
      )}
      {state.busy && <div>Loading report status…</div>}
      {state.error && (
        <div role="alert" style={{ color: 'var(--color-text-error, #e5534b)' }}>
          {state.error}
        </div>
      )}
      {!state.busy && !state.error && (
        <>
          <div>
            Status:{' '}
            <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>
              {state.status ?? 'unknown'}
            </span>
          </div>
          {state.result != null ? (
            <pre
              style={{
                margin: 0,
                padding: 8,
                background: 'var(--color-background-tertiary)',
                borderRadius: 6,
                overflow: 'auto',
                maxHeight: 280,
                fontSize: 11,
              }}
            >
              {JSON.stringify(state.result, null, 2)}
            </pre>
          ) : (
            <div style={{ color: 'var(--color-text-tertiary)' }}>
              No result payload. This capability is read-only here (no
              engagement-scoped run).
            </div>
          )}
        </>
      )}
    </div>
  )
}
