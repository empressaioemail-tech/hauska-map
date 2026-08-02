// County Ledger — the Command Center factory-floor headline (R-FND-6, OPS-6).
//
// The operator's view of the rewarmable factory: per jurisdiction, what has
// been through the line, at what recipe version, certified or not, which stamps
// have rotted (staleness), and which are rewarm-unsafe. Reads the county-ledger
// endpoint (GET /api/county-ledger) served from county_facet_coverage.
//
// This is where the operator WATCHES Bastrop come online (the first subject) and
// where staleness (the retirement rung) surfaces before it poisons the surface.
import React, { useEffect, useState } from 'react'
import { loadConfig, apiBase, getJson } from '../../api/spineClient'
import { Panel, Pill, Loading, ErrorState, sectionHeader, mono, type Severity } from '../primitives'

interface FacetRow {
  facet: string
  honestCoveragePct: number | null
  integrityVerdict: string
  certState: string | null
  recipeVersion: string | null
  stalenessFlag: boolean
  rewarmUnsafe: boolean
  sourceVintage: string | null
  onboarded: boolean
}

interface CountyRow {
  countyFips: string
  onboarded: boolean
  hasStale: boolean
  rewarmUnsafe: boolean
  recipeVersions: string[]
  certStates: string[]
  facets: FacetRow[]
}

interface LedgerResponse {
  counties: CountyRow[]
  summary: {
    onboardedCount: number
    totalCounties: number
    staleCount: number
    rewarmUnsafeCount: number
  }
}

const certSev = (s: string | null): Severity => {
  if (s === 'certified' || s === 'r6-pass') return 'ok'
  if (s === 'mechanical-pass') return 'warn'
  if (s === 'uncerted' || s === null) return 'info'
  return 'info'
}

export const CountyLedger: React.FC = () => {
  const [data, setData] = useState<LedgerResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const config = await loadConfig()
        const api = apiBase(config)
        if (!api) {
          if (!cancelled) {
            setError('No cortex-api base configured for the county ledger.')
            setLoading(false)
          }
          return
        }
        const res = await getJson<LedgerResponse>(
          `${api}/api/county-ledger`,
          config,
          12_000,
        )
        if (!cancelled) {
          if (res.ok && res.json) {
            setData(res.json)
          } else {
            setError(res.error ?? `county-ledger read failed (HTTP ${res.status})`)
          }
          setLoading(false)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return <Loading />
  if (error) return <ErrorState msg={error} />
  if (!data) return <ErrorState msg="No ledger data." />

  const { summary, counties } = data

  return (
    <Panel
      title="County Ledger"
      subtitle="the rewarmable-factory performance layer — what's onboarded, certified, stale"
      right={
        <span style={{ display: 'flex', gap: 6 }}>
          <Pill sev="ok">{summary.onboardedCount}/{summary.totalCounties} onboarded</Pill>
          {summary.staleCount > 0 ? (
            <Pill sev="warn" title="stamps rotted — refresh needed">
              {summary.staleCount} stale
            </Pill>
          ) : null}
          {summary.rewarmUnsafeCount > 0 ? (
            <Pill sev="danger" title="unfrozen decision — blocks a safe rewarm">
              {summary.rewarmUnsafeCount} rewarm-unsafe
            </Pill>
          ) : null}
        </span>
      }
    >
      {counties.length === 0 ? (
        <div style={{ opacity: 0.6, padding: 12 }}>
          No county has been through the factory line yet. Onboard a county
          (OPS-2) and its row appears here.
        </div>
      ) : (
        <div style={{ overflow: 'auto', minHeight: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={sectionHeader as React.CSSProperties}>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>County (FIPS)</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Facet</th>
                <th style={{ textAlign: 'right', padding: '4px 8px' }}>Coverage</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Cert</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Recipe</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Vintage</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>State</th>
              </tr>
            </thead>
            <tbody>
              {counties.flatMap((c) =>
                c.facets.map((f, i) => (
                  <tr
                    key={`${c.countyFips}:${f.facet}`}
                    style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <td style={{ padding: '4px 8px', ...mono }}>
                      {i === 0 ? c.countyFips : ''}
                    </td>
                    <td style={{ padding: '4px 8px' }}>{f.facet}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                      {f.honestCoveragePct === null
                        ? '—'
                        : `${(f.honestCoveragePct * 100).toFixed(1)}%`}
                    </td>
                    <td style={{ padding: '4px 8px' }}>
                      <Pill sev={certSev(f.certState)}>{f.certState ?? 'uncerted'}</Pill>
                    </td>
                    <td style={{ padding: '4px 8px', ...mono }}>
                      {f.recipeVersion ?? '—'}
                    </td>
                    <td style={{ padding: '4px 8px', ...mono }}>
                      {f.sourceVintage ?? '—'}
                    </td>
                    <td style={{ padding: '4px 8px' }}>
                      {f.stalenessFlag ? (
                        <Pill sev="warn" title="stamp rotted — unverified">
                          stale
                        </Pill>
                      ) : null}
                      {f.rewarmUnsafe ? (
                        <Pill sev="danger" title="unfrozen decision">
                          unsafe
                        </Pill>
                      ) : null}
                      {!f.stalenessFlag && !f.rewarmUnsafe && f.onboarded ? (
                        <Pill sev="ok">fresh</Pill>
                      ) : null}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

export default CountyLedger
