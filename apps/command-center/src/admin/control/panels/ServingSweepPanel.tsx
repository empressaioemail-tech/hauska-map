// ServingSweepPanel.tsx — the statewide serving sweep, and the RAIL vs SERVED
// reconciliation, on the County Manifest panel.
//
// The two instruments answer different questions. The County Manifest asks "did a
// writer run for this county". The sweep asks "what does Smart Site actually SERVE a
// human, for every parcel in this county". They sit on one subtab precisely because
// they will disagree, and THE DISAGREEMENT IS THE FINDING.
//
// Three rules are structural here, not stylistic:
//
//   1. NOTHING IS AVERAGED. There is no combined score anywhere in this file. The rail
//      reading and the served reading sit in adjacent columns with a signed gap in
//      points. A rail reading satisfied at 100% beside a served reading of 12% must
//      stay legible as exactly that.
//   2. UNRESOLVED IS ITS OWN CLASS. A failed lookup is an outage, not a coverage gap
//      (CONTRACT_RULES I4). It is counted, coloured and ranked separately everywhere it
//      appears, and it is never added to an absence.
//   3. EVERY RATE CARRIES ITS DENOMINATOR at the point of use (DEV_PROCESS 1.1, 1.2),
//      and the denominator is MEASURED as the sum of the four classes rather than
//      borrowed from parcelsTotal — with the shortfall shown when they disagree.

import React, { useCallback, useMemo, useRef, useState } from 'react'
import {
  Button,
  Card,
  Pill,
  mono,
  sectionHeader,
  sevColors,
  typeCaption,
  type Severity,
} from '../primitives'
import { buildPanelHash } from '../center/panelHash'
import { isStrictParcelNodeId } from '../../api/atomTrace'
import {
  CONTRADICTION_LABELS,
  FIELD_KEYS,
  FIELD_LABELS,
  absenceRate,
  rollUpContradictions,
  rollUpFields,
  rollUpSingleFamily,
  servedRate,
  tallyReconciliation,
  unresolvedRate,
  type CountyServingSweep,
  type FieldKey,
  type FieldTally,
  type RateWithDenominator,
  type StatewideServingSweep,
} from './servingSweepTypes'
import { ORIGIN_COPY, type SweepSourceState } from './servingSweepSource'
import {
  RAIL_FIELD_PAIRS,
  classifyRails,
  fieldsWithoutRail,
} from './railFieldMap'
import { cellVisualState, indexCells, type ManifestCell } from './countyManifestTypes'
import { resolveCountyName } from './texasCountyNames'

const OUTAGE_COLOR = 'var(--color-text-danger)'

function pctText(r: RateWithDenominator, digits = 1): string {
  return r.pct == null ? '—' : `${r.pct.toFixed(digits)}%`
}

function denomText(r: RateWithDenominator): string {
  return `${r.numerator.toLocaleString()}/${r.denominator.toLocaleString()}`
}

/** Open a parcel in Parcel Trace on the shared node lock. */
export function openParcelInTrace(parcelNodeId: string): boolean {
  if (!isStrictParcelNodeId(parcelNodeId)) return false
  window.location.hash = buildPanelHash('parcel-trace', { node: parcelNodeId.trim() })
  return true
}

const ParcelIdList: React.FC<{ ids: string[]; testId?: string }> = ({ ids, testId }) => {
  if (ids.length === 0) {
    return <span style={{ ...typeCaption, color: 'var(--color-text-tertiary)' }}>no example parcels on this tally</span>
  }
  return (
    <div data-testid={testId} style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {ids.map((id) => {
        const openable = isStrictParcelNodeId(id)
        return (
          <button
            key={id}
            type="button"
            data-testid={`sweep-open-parcel-${id}`}
            disabled={!openable}
            title={openable ? `open ${id} in Parcel Trace` : `${id} is not a canonical parcel node id`}
            onClick={() => openParcelInTrace(id)}
            style={{
              ...mono,
              fontSize: 10,
              padding: '2px 6px',
              borderRadius: 3,
              cursor: openable ? 'pointer' : 'not-allowed',
              border: '0.5px solid var(--color-border-tertiary)',
              background: 'var(--color-background-tertiary)',
              color: openable ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
            }}
          >
            {id}
          </button>
        )
      })}
    </div>
  )
}

/** One field tally as four separately-measured classes. Never three plus a subtraction. */
const TallyRow: React.FC<{
  field: FieldKey
  tally: FieldTally
  parcelsClaimed: number
  onOpenAbsence?: (field: FieldKey) => void
}> = ({ field, tally, parcelsClaimed, onOpenAbsence }) => {
  const served = servedRate(tally)
  const absent = absenceRate(tally)
  const outage = unresolvedRate(tally)
  const recon = tallyReconciliation(tally, parcelsClaimed)
  return (
    <tr data-testid={`sweep-tally-${field}`} style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}>
      <td style={{ padding: '4px 8px', fontWeight: 600 }}>{FIELD_LABELS[field]}</td>
      <td style={{ ...mono, padding: '4px 8px', textAlign: 'right' }}>
        <div data-testid={`sweep-served-pct-${field}`}>{pctText(served)}</div>
        <div style={{ ...typeCaption, color: 'var(--color-text-tertiary)' }}>{denomText(served)}</div>
      </td>
      <td style={{ ...mono, padding: '4px 8px', textAlign: 'right' }}>
        {tally.absentCovered.toLocaleString()}
      </td>
      <td style={{ ...mono, padding: '4px 8px', textAlign: 'right' }}>
        {tally.absentUncovered.toLocaleString()}
      </td>
      <td
        data-testid={`sweep-unresolved-${field}`}
        style={{
          ...mono,
          padding: '4px 8px',
          textAlign: 'right',
          color: tally.unresolved > 0 ? OUTAGE_COLOR : 'var(--color-text-tertiary)',
          fontWeight: tally.unresolved > 0 ? 700 : 400,
        }}
      >
        {tally.unresolved.toLocaleString()}
        {tally.unresolved > 0 ? (
          <div style={{ ...typeCaption, color: OUTAGE_COLOR }}>{pctText(outage)} OUTAGE</div>
        ) : null}
      </td>
      <td style={{ ...mono, padding: '4px 8px', textAlign: 'right' }}>
        <button
          type="button"
          data-testid={`sweep-open-absence-${field}`}
          onClick={() => onOpenAbsence?.(field)}
          disabled={!onOpenAbsence}
          style={{
            ...mono,
            fontSize: 11,
            padding: '2px 6px',
            border: '0.5px solid var(--color-border-tertiary)',
            background: 'var(--color-background-tertiary)',
            color: 'var(--color-text-primary)',
            borderRadius: 3,
            cursor: onOpenAbsence ? 'pointer' : 'default',
          }}
          title="open the parcels behind this absence"
        >
          {pctText(absent)} absent
        </button>
        <div style={{ ...typeCaption, color: 'var(--color-text-tertiary)' }}>{denomText(absent)}</div>
      </td>
      <td style={{ ...typeCaption, padding: '4px 8px', color: recon.agrees ? 'var(--color-text-tertiary)' : 'var(--color-text-warning)' }}>
        {recon.agrees
          ? `${recon.measured.toLocaleString()} measured`
          : `${recon.measured.toLocaleString()} measured vs ${recon.claimed.toLocaleString()} claimed — ${recon.unaccounted.toLocaleString()} unaccounted`}
      </td>
    </tr>
  )
}

const TallyTable: React.FC<{
  title: string
  note: string
  fields: Record<FieldKey, FieldTally>
  parcelsClaimed: number
  testId: string
  onOpenAbsence?: (field: FieldKey) => void
}> = ({ title, note, fields, parcelsClaimed, testId, onOpenAbsence }) => (
  <div style={{ marginTop: 16 }} data-testid={testId}>
    <div style={{ ...sectionHeader, marginBottom: 2 }}>{title}</div>
    <div style={{ ...typeCaption, marginBottom: 6, color: 'var(--color-text-tertiary)' }}>{note}</div>
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--type-caption)' }}>
      <thead>
        <tr style={sectionHeader as React.CSSProperties}>
          <th style={{ textAlign: 'left', padding: '4px 8px' }}>Field</th>
          <th style={{ textAlign: 'right', padding: '4px 8px' }}>Served</th>
          <th style={{ textAlign: 'right', padding: '4px 8px' }}>Absent covered</th>
          <th style={{ textAlign: 'right', padding: '4px 8px' }}>Absent uncovered</th>
          <th style={{ textAlign: 'right', padding: '4px 8px' }}>Unresolved</th>
          <th style={{ textAlign: 'right', padding: '4px 8px' }}>Absence</th>
          <th style={{ textAlign: 'left', padding: '4px 8px' }}>Tally vs claimed</th>
        </tr>
      </thead>
      <tbody>
        {FIELD_KEYS.map((f) => (
          <TallyRow
            key={f}
            field={f}
            tally={fields[f]}
            parcelsClaimed={parcelsClaimed}
            onOpenAbsence={onOpenAbsence}
          />
        ))}
      </tbody>
    </table>
  </div>
)

// ── Reconciliation: the two instruments side by side ──────────────────────────

export interface ReconciliationRow {
  countyFips: string
  countyName: string
  railKey: string
  field: FieldKey
  basis: string
  /** Manifest side. Null when the manifest has no cell for this county+rail. */
  railState: string | null
  railPct: number | null
  /** Sweep side. */
  served: RateWithDenominator
  unresolved: RateWithDenominator
  /** railPct − servedPct in points. Null when either side has no number. */
  gapPoints: number | null
}

/**
 * Build the side-by-side rows. No row is dropped for lack of a counterpart: a missing
 * manifest cell renders as "no rail cell", never as zero, because a manufactured zero
 * would read as a gap that the instrument never measured.
 */
export function buildReconciliation(
  sweep: StatewideServingSweep,
  cells: ManifestCell[],
): ReconciliationRow[] {
  const index = indexCells(cells)
  const rows: ReconciliationRow[] = []
  for (const county of sweep.counties) {
    for (const pair of RAIL_FIELD_PAIRS) {
      const tally = county.fields?.[pair.field]
      if (!tally) continue
      const cell = index.get(`${county.countyFips}:${pair.railKey}`)
      const served = servedRate(tally)
      const railPct = cell?.honestCoveragePct ?? null
      rows.push({
        countyFips: county.countyFips,
        countyName: county.countyName,
        railKey: pair.railKey,
        field: pair.field,
        basis: pair.basis,
        railState: cell ? cellVisualState(cell) : null,
        railPct,
        served,
        unresolved: unresolvedRate(tally),
        gapPoints: railPct != null && served.pct != null ? railPct - served.pct : null,
      })
    }
  }
  return rows.sort((a, b) => (b.gapPoints ?? -Infinity) - (a.gapPoints ?? -Infinity))
}

function gapSev(gap: number | null): Severity {
  if (gap == null) return 'info'
  if (gap >= 50) return 'danger'
  if (gap >= 20) return 'warn'
  if (gap >= 5) return 'action'
  return 'ok'
}

const ReconciliationTable: React.FC<{
  rows: ReconciliationRow[]
  limit: number
  cells: ManifestCell[]
}> = ({ rows, limit, cells }) => {
  const shown = rows.slice(0, limit)
  const withGap = rows.filter((r) => r.gapPoints != null)
  const noCounterpart = rows.filter((r) => r.railState == null)
  return (
    <div data-testid="sweep-reconciliation">
      <div style={{ ...sectionHeader, marginBottom: 2 }}>Rail reading vs served reading</div>
      <div style={{ ...typeCaption, marginBottom: 8, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
        One row per county and paired field, ranked by the gap in points, worst first. The gap is
        railPct minus servedPct; nothing is averaged and no combined score is computed.
        {' '}
        {withGap.length.toLocaleString()} of {rows.length.toLocaleString()} rows carry a gap
        (both sides produced a number); {noCounterpart.length.toLocaleString()} rows have no rail cell
        for that county and rail and show as no counterpart rather than zero.
        {' '}Manifest cells in this payload: {cells.length.toLocaleString()}.
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--type-caption)' }}>
        <thead>
          <tr style={sectionHeader as React.CSSProperties}>
            <th style={{ textAlign: 'left', padding: '4px 8px' }}>County</th>
            <th style={{ textAlign: 'left', padding: '4px 8px' }}>Rail → field</th>
            <th style={{ textAlign: 'right', padding: '4px 8px' }}>Manifest says</th>
            <th style={{ textAlign: 'right', padding: '4px 8px' }}>Sweep serves</th>
            <th style={{ textAlign: 'right', padding: '4px 8px' }}>Gap</th>
            <th style={{ textAlign: 'right', padding: '4px 8px' }}>Unresolved</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const c = sevColors(gapSev(r.gapPoints))
            return (
              <tr
                key={`${r.countyFips}-${r.railKey}-${r.field}`}
                data-testid={`recon-row-${r.countyFips}-${r.field}`}
                style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}
              >
                <td style={{ padding: '4px 8px' }}>
                  {r.countyName || r.countyFips}
                  <span style={{ ...mono, color: 'var(--color-text-tertiary)', marginLeft: 6 }}>{r.countyFips}</span>
                </td>
                <td style={{ padding: '4px 8px' }} title={r.basis}>
                  <span style={mono}>{r.railKey}</span>
                  <span style={{ color: 'var(--color-text-tertiary)' }}> → </span>
                  <span>{FIELD_LABELS[r.field]}</span>
                </td>
                <td style={{ ...mono, padding: '4px 8px', textAlign: 'right' }}>
                  {r.railState == null ? (
                    <span style={{ color: 'var(--color-text-warning)' }}>no rail cell</span>
                  ) : (
                    <>
                      <div>{r.railPct == null ? '—' : `${r.railPct.toFixed(1)}%`}</div>
                      <div style={{ ...typeCaption, color: 'var(--color-text-tertiary)' }}>{r.railState}</div>
                    </>
                  )}
                </td>
                <td style={{ ...mono, padding: '4px 8px', textAlign: 'right' }}>
                  <div>{pctText(r.served)}</div>
                  <div style={{ ...typeCaption, color: 'var(--color-text-tertiary)' }}>{denomText(r.served)}</div>
                </td>
                <td
                  data-testid={`recon-gap-${r.countyFips}-${r.field}`}
                  style={{
                    ...mono,
                    padding: '4px 8px',
                    textAlign: 'right',
                    color: c.fg,
                    background: r.gapPoints != null && r.gapPoints >= 20 ? c.bg : undefined,
                    fontWeight: 700,
                  }}
                >
                  {r.gapPoints == null ? '—' : `${r.gapPoints > 0 ? '+' : ''}${r.gapPoints.toFixed(1)} pt`}
                </td>
                <td
                  style={{
                    ...mono,
                    padding: '4px 8px',
                    textAlign: 'right',
                    color: r.unresolved.numerator > 0 ? OUTAGE_COLOR : 'var(--color-text-tertiary)',
                    fontWeight: r.unresolved.numerator > 0 ? 700 : 400,
                  }}
                >
                  {r.unresolved.numerator.toLocaleString()}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {rows.length > limit ? (
        <div style={{ ...typeCaption, marginTop: 6, color: 'var(--color-text-tertiary)' }}>
          showing {limit} of {rows.length.toLocaleString()} rows
        </div>
      ) : null}
    </div>
  )
}

// ── Pairing coverage: what each instrument measures that the other does not ────

const PairingNote: React.FC<{ railKeys: string[] }> = ({ railKeys }) => {
  const classification = useMemo(() => classifyRails(railKeys), [railKeys])
  const orphanFields = useMemo(() => fieldsWithoutRail(railKeys, FIELD_KEYS), [railKeys])
  const total =
    classification.paired.length +
    classification.unpairedDeclared.length +
    classification.unclassified.length
  return (
    <div
      data-testid="sweep-pairing-note"
      style={{
        ...typeCaption,
        marginTop: 12,
        padding: '8px 10px',
        border: '0.5px solid var(--color-border-tertiary)',
        lineHeight: 1.55,
      }}
    >
      <div style={{ ...sectionHeader, marginBottom: 4 }}>What pairs, and what does not</div>
      <div>
        {classification.paired.length} of {total} rails pair with at least one served field;{' '}
        {classification.unpairedDeclared.length} have a declared reason for no counterpart;{' '}
        <span style={{ color: classification.unclassified.length ? 'var(--color-text-warning)' : undefined }}>
          {classification.unclassified.length} are unclassified
        </span>
        . Rails with no served field are listed, never dropped: they are not a gap in the sweep.
      </div>
      <div style={{ marginTop: 4 }}>
        {classification.unpairedDeclared.map((u) => (
          <div key={u.railKey}>
            <span style={mono}>{u.railKey}</span> — {u.reason}
          </div>
        ))}
        {classification.unclassified.map((r) => (
          <div key={r} style={{ color: 'var(--color-text-warning)' }}>
            <span style={mono}>{r}</span> — UNCLASSIFIED: a rail was added server-side and railFieldMap.ts
            has not been told about it
          </div>
        ))}
        {orphanFields.length > 0 ? (
          <div style={{ marginTop: 4, color: 'var(--color-text-warning)' }}>
            served fields with no rail in this payload: {orphanFields.map((f) => FIELD_LABELS[f]).join(', ')}
          </div>
        ) : null}
      </div>
      <div style={{ marginTop: 4, color: 'var(--color-text-tertiary)' }}>
        Not a double count: cad pairs to two fields (situs address, APN) and zoning pairs to two
        (zoning, setbacks). One rail can serve more than one field; the rail reading repeats on each
        paired row and is never summed across rows.
      </div>
    </div>
  )
}

// ── County detail ─────────────────────────────────────────────────────────────

const CountyDetail: React.FC<{ county: CountyServingSweep }> = ({ county }) => {
  const [openAbsenceField, setOpenAbsenceField] = useState<FieldKey | null>(null)

  const contradictionsForField = useCallback(
    (field: FieldKey) =>
      county.contradictions.filter((c) => {
        if (field === 'envelope') return c.kind === 'envelope-not-derived-but-area-shown'
        if (field === 'flood') return c.kind === 'flood-zone-disagreement'
        if (field === 'situsAddress') return c.kind === 'address-absent-but-on-cad-roll'
        if (field === 'setbacks') return c.kind === 'setbacks-present-card-absent-brief'
        return c.kind === 'field-unavailable-but-present-upstream'
      }),
    [county.contradictions],
  )

  const clustersForField = useCallback(
    (field: FieldKey) => county.absenceClusters.filter((c) => c.field === field),
    [county.absenceClusters],
  )

  return (
    <div data-testid={`sweep-county-${county.countyFips}`}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>
          {county.countyName || county.countyFips}
          <span style={{ ...mono, color: 'var(--color-text-tertiary)', marginLeft: 6 }}>{county.countyFips}</span>
        </div>
        <span style={{ ...typeCaption, ...mono }}>
          {county.parcelsTotal.toLocaleString()} parcels swept · {county.parcelsUnresolvable.toLocaleString()} unresolvable
        </span>
        <span style={{ ...typeCaption, ...mono, color: 'var(--color-text-tertiary)' }}>
          resolver {county.resolverVersion} · swept {county.sweptAt}
        </span>
        {county.multiZoneFloodParcels > 0 ? (
          <Pill sev="warn">{county.multiZoneFloodParcels.toLocaleString()} multi-zone flood parcels</Pill>
        ) : null}
      </div>

      <TallyTable
        title="All parcels"
        note={`denominator is the MEASURED sum of the four classes per field; ${county.parcelsTotal.toLocaleString()} parcels claimed swept. Unresolved is an outage and is never added to an absence.`}
        fields={county.fields}
        parcelsClaimed={county.parcelsTotal}
        testId={`sweep-tallies-all-${county.countyFips}`}
        onOpenAbsence={(f) => setOpenAbsenceField((prev) => (prev === f ? null : f))}
      />

      <TallyTable
        title="Single-family residential"
        note={`the class a consumer surface is judged on, and where the address gap was observed; ${county.singleFamily.parcelsTotal.toLocaleString()} single-family parcels claimed.`}
        fields={county.singleFamily.fields}
        parcelsClaimed={county.singleFamily.parcelsTotal}
        testId={`sweep-tallies-sf-${county.countyFips}`}
      />

      {openAbsenceField ? (
        <Card style={{ marginTop: 12 }}>
          <div style={{ ...sectionHeader, marginBottom: 6 }}>
            Behind the {FIELD_LABELS[openAbsenceField]} absence in {county.countyName || county.countyFips}
          </div>
          <div style={{ ...typeCaption, marginBottom: 6, lineHeight: 1.5 }}>
            The frozen record carries example parcel ids on CONTRADICTION tallies, not on field tallies,
            so what opens here is every contradiction touching this field plus every named absence
            cluster. Clicking an id locks it on the shared node bus and opens Parcel Trace.
          </div>
          {contradictionsForField(openAbsenceField).length === 0 ? (
            <div style={{ ...typeCaption, color: 'var(--color-text-tertiary)' }}>
              no contradiction tally on this county touches this field
            </div>
          ) : (
            contradictionsForField(openAbsenceField).map((c) => (
              <div key={c.kind} style={{ marginBottom: 8 }}>
                <div style={{ ...typeCaption, fontWeight: 600 }}>
                  {CONTRADICTION_LABELS[c.kind]} — {c.count.toLocaleString()} parcels,{' '}
                  {c.exampleParcelNodeIds.length} examples carried
                </div>
                <ParcelIdList ids={c.exampleParcelNodeIds} testId={`sweep-absence-ids-${c.kind}`} />
              </div>
            ))
          )}
          {clustersForField(openAbsenceField).map((cluster) => (
            <div key={cluster.label} style={{ ...typeCaption, marginTop: 6 }}>
              cluster <strong>{cluster.label}</strong> — {cluster.parcelCount.toLocaleString()} parcels, bbox{' '}
              <span style={mono}>{cluster.bbox.join(', ')}</span>
            </div>
          ))}
          <Button variant="ghost" onClick={() => setOpenAbsenceField(null)}>
            close
          </Button>
        </Card>
      ) : null}

      <div style={{ marginTop: 16 }}>
        <div style={{ ...sectionHeader, marginBottom: 6 }}>Contradictions</div>
        <div style={{ ...typeCaption, marginBottom: 6, color: 'var(--color-text-tertiary)' }}>
          Two surfaces disagreeing about the SAME parcel. These are the defects a coverage percentage
          cannot see.
        </div>
        {county.contradictions.length === 0 ? (
          <div style={{ ...typeCaption }}>no contradiction tallies on this county</div>
        ) : (
          county.contradictions.map((c) => (
            <div key={c.kind} style={{ marginBottom: 8 }}>
              <div style={{ ...typeCaption, fontWeight: 600 }}>
                {CONTRADICTION_LABELS[c.kind]} — {c.count.toLocaleString()}
              </div>
              <ParcelIdList ids={c.exampleParcelNodeIds} testId={`sweep-contradiction-ids-${c.kind}`} />
            </div>
          ))
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ ...sectionHeader, marginBottom: 6 }}>Absence clusters</div>
        {county.absenceClusters.length === 0 ? (
          <div style={{ ...typeCaption }}>no clustered absences reported for this county</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--type-caption)' }}>
            <thead>
              <tr style={sectionHeader as React.CSSProperties}>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Field</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Cluster</th>
                <th style={{ textAlign: 'right', padding: '4px 8px' }}>Parcels</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Bbox</th>
              </tr>
            </thead>
            <tbody>
              {county.absenceClusters.map((c) => (
                <tr key={`${c.field}-${c.label}`} style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                  <td style={{ padding: '4px 8px' }}>{FIELD_LABELS[c.field]}</td>
                  <td style={{ padding: '4px 8px' }}>{c.label}</td>
                  <td style={{ ...mono, padding: '4px 8px', textAlign: 'right' }}>{c.parcelCount.toLocaleString()}</td>
                  <td style={{ ...mono, padding: '4px 8px' }}>{c.bbox.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ ...sectionHeader, marginBottom: 6 }}>Source per field</div>
        <div style={{ ...typeCaption, marginBottom: 6, color: 'var(--color-text-tertiary)' }}>
          The follow-on work is per-county source review and re-ingest; this is that list.
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--type-caption)' }}>
          <tbody>
            {FIELD_KEYS.map((f) => {
              const s = county.sourcesByField[f]
              return (
                <tr key={f} style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                  <td style={{ padding: '4px 8px', width: 160 }}>{FIELD_LABELS[f]}</td>
                  <td style={{ ...mono, padding: '4px 8px' }}>
                    {s ? s.source : <span style={{ color: 'var(--color-text-warning)' }}>no source recorded</span>}
                  </td>
                  <td style={{ ...mono, padding: '4px 8px', width: 140, color: 'var(--color-text-tertiary)' }}>
                    {s?.vintage ?? '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export interface ServingSweepPanelProps {
  /** Manifest cells from the SAME read that drives the grid — the other instrument. */
  cells: ManifestCell[]
  railKeys: string[]
  /** Live probe result. Null while the probe has not run. */
  source: SweepSourceState | null
  probing: boolean
  onProbe: () => void
  onLoadArtifact: (text: string, filename: string) => void
}

export const ServingSweepPanel: React.FC<ServingSweepPanelProps> = ({
  cells,
  railKeys,
  source,
  probing,
  onProbe,
  onLoadArtifact,
}) => {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [selectedFips, setSelectedFips] = useState<string | null>(null)

  const sweep = source?.sweep ?? null
  const reconciliation = useMemo(
    () => (sweep ? buildReconciliation(sweep, cells) : []),
    [sweep, cells],
  )
  const statewideFields = useMemo(() => (sweep ? rollUpFields(sweep.counties) : null), [sweep])
  const statewideSf = useMemo(() => (sweep ? rollUpSingleFamily(sweep.counties) : null), [sweep])
  const statewideContradictions = useMemo(
    () => (sweep ? rollUpContradictions(sweep.counties) : []),
    [sweep],
  )

  const selectedCounty = useMemo(() => {
    if (!sweep) return null
    if (selectedFips) return sweep.counties.find((c) => c.countyFips === selectedFips) ?? null
    return sweep.counties[0] ?? null
  }, [sweep, selectedFips])

  const onFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => onLoadArtifact(String(reader.result ?? ''), file.name)
      reader.readAsText(file)
    },
    [onLoadArtifact],
  )

  return (
    <div data-testid="serving-sweep-panel">
      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
          padding: '8px 10px',
          border: '0.5px solid var(--color-border-tertiary)',
          marginBottom: 12,
        }}
      >
        <Pill sev={source?.origin === 'live-endpoint' && sweep ? 'ok' : source?.origin === 'loaded-artifact' ? 'warn' : 'info'}>
          {source ? ORIGIN_COPY[source.origin] : 'not probed yet'}
        </Pill>
        <span data-testid="sweep-locator" style={{ ...mono, ...typeCaption }}>
          {source?.locator ?? '—'}
          {source?.httpStatus != null ? ` · HTTP ${source.httpStatus}` : ''}
        </span>
        <Button variant="secondary" onClick={onProbe} disabled={probing}>
          {probing ? 'probing…' : 'probe live endpoint'}
        </Button>
        <Button variant="ghost" onClick={() => fileRef.current?.click()}>
          load report artifact
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          data-testid="sweep-artifact-input"
          onChange={onFile}
          style={{ display: 'none' }}
        />
        {sweep ? (
          <span style={{ ...mono, ...typeCaption, marginLeft: 'auto' }}>
            swept {sweep.sweptAt} · resolver {sweep.resolverVersion} · {sweep.countiesSwept.toLocaleString()} of{' '}
            {sweep.countiesTotal.toLocaleString()} counties · {sweep.parcelsTotal.toLocaleString()} parcels
          </span>
        ) : null}
      </div>

      {source?.notServedReason ? (
        <div
          data-testid="sweep-not-served"
          style={{
            ...typeCaption,
            padding: '10px 12px',
            border: '0.5px solid var(--color-border-warning)',
            background: 'var(--color-background-warning)',
            color: 'var(--color-text-warning)',
            marginBottom: 12,
            lineHeight: 1.55,
          }}
        >
          <strong>No sweep served.</strong> {source.locator}
          {source.httpStatus != null ? ` returned HTTP ${source.httpStatus}` : ''} — {source.notServedReason}.
          {' '}This is a NAMED absence, not an empty panel: lane P-43 emits the statewide sweep and delivers
          it as a dated report artifact first, so load that artifact here until the endpoint exists.
        </div>
      ) : null}

      {source && source.problems.length > 0 ? (
        <div
          data-testid="sweep-parse-problems"
          style={{
            ...typeCaption,
            padding: '10px 12px',
            border: '0.5px solid var(--color-border-warning)',
            marginBottom: 12,
            lineHeight: 1.5,
          }}
        >
          <strong>{source.problems.length} payload problems against the frozen record.</strong> The panel
          renders what parsed; every problem is listed rather than the payload being rejected whole.
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {source.problems.slice(0, 25).map((p) => (
              <li key={p} style={mono}>
                {p}
              </li>
            ))}
          </ul>
          {source.problems.length > 25 ? <div>…and {source.problems.length - 25} more</div> : null}
        </div>
      ) : null}

      {!sweep ? (
        <div style={{ ...typeCaption, lineHeight: 1.6 }}>
          The serving sweep resolves a ParcelFactSheet for every parcel in a county and tallies the
          resulting Fact states. It never samples — sampling is what certified a broken Bastrop once.
          When a sweep is loaded it renders here beside the rail manifest, and the disagreement between
          the two is the finding.
          <PairingNote railKeys={railKeys} />
        </div>
      ) : (
        <>
          <ReconciliationTable rows={reconciliation} limit={60} cells={cells} />
          <PairingNote railKeys={railKeys} />

          {statewideFields ? (
            <TallyTable
              title="Statewide — all parcels"
              note={`rolled up across ${sweep.countiesSwept.toLocaleString()} swept counties; each class measured, none derived by subtraction.`}
              fields={statewideFields}
              parcelsClaimed={sweep.parcelsTotal}
              testId="sweep-statewide-all"
            />
          ) : null}
          {statewideSf ? (
            <TallyTable
              title="Statewide — single-family residential"
              note="the class a consumer surface is judged on."
              fields={statewideSf}
              parcelsClaimed={sweep.counties.reduce((n, c) => n + (c.singleFamily?.parcelsTotal ?? 0), 0)}
              testId="sweep-statewide-sf"
            />
          ) : null}

          <div style={{ marginTop: 16 }}>
            <div style={{ ...sectionHeader, marginBottom: 6 }}>Statewide contradictions</div>
            {statewideContradictions.length === 0 ? (
              <div style={{ ...typeCaption }}>no contradiction tallies in this sweep</div>
            ) : (
              statewideContradictions.map((c) => (
                <div key={c.kind} style={{ marginBottom: 8 }}>
                  <div style={{ ...typeCaption, fontWeight: 600 }}>
                    {CONTRADICTION_LABELS[c.kind]} — {c.count.toLocaleString()}
                  </div>
                  <ParcelIdList ids={c.exampleParcelNodeIds} testId={`sweep-statewide-ids-${c.kind}`} />
                </div>
              ))
            )}
          </div>

          <div style={{ marginTop: 20, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ ...sectionHeader }}>County detail</span>
            <select
              data-testid="sweep-county-select"
              value={selectedCounty?.countyFips ?? ''}
              onChange={(e) => setSelectedFips(e.target.value)}
              style={{
                ...mono,
                padding: '3px 6px',
                background: 'var(--color-background-tertiary)',
                border: '0.5px solid var(--color-border-tertiary)',
                color: 'var(--color-text-primary)',
                borderRadius: 4,
              }}
            >
              {sweep.counties.map((c) => (
                <option key={c.countyFips} value={c.countyFips}>
                  {resolveCountyName(c.countyFips, c.countyName).name} ({c.countyFips})
                </option>
              ))}
            </select>
          </div>
          {selectedCounty ? (
            <Card style={{ marginTop: 8 }}>
              <CountyDetail county={selectedCounty} />
            </Card>
          ) : null}
        </>
      )}
    </div>
  )
}

export default ServingSweepPanel
