// servingSweepTypes.ts — the STATEWIDE SERVING SWEEP record as Command Center reads it.
//
// The type half of this file is a verbatim mirror of the record frozen by the planner
// on 2026-08-18 at `_catalog/parcel_fact_sheet_contract/serving-sweep.ts`. It is FROZEN:
// a change to any shape comes back to the planner, it is not negotiated inside a lane.
// Lane P-43 (hauska-engine) emits it; this lane renders it and does not wait on it.
//
// The County Manifest answers "did a writer run for this county". This answers a
// different question: "what does Smart Site actually SERVE a human, for every parcel
// in this county". The two live side by side on the County Manifest panel precisely
// because they will disagree, and the disagreement is the finding.
//
// The math half below exists so that no renderer computes a rate by hand. Two rules
// are enforced here rather than remembered:
//
//   1. A rate is never returned without the denominator it was taken over
//      (DEV_PROCESS 1.1 / 1.2). `servedRate` returns { pct, numerator, denominator }.
//   2. `unresolved` is NEVER folded into an absence (CONTRACT_RULES I4: failure is not
//      an absence). It is a fourth measured class and it is counted, displayed and
//      ranked on its own. Folding it in is what made a correct Travis County card read
//      as broken to the operator.

export type FieldKey =
  | 'geometry'
  | 'situsAddress'
  | 'apn'
  | 'landUse'
  | 'zoning'
  | 'setbacks'
  | 'envelope'
  | 'flood'
  | 'frontage'

/** Ordered field list — the frozen union, enumerated so a renderer can iterate it. */
export const FIELD_KEYS: readonly FieldKey[] = [
  'geometry',
  'situsAddress',
  'apn',
  'landUse',
  'zoning',
  'setbacks',
  'envelope',
  'flood',
  'frontage',
] as const

/** Presentation-only labels. Not the field set — the field set is the frozen union. */
export const FIELD_LABELS: Readonly<Record<FieldKey, string>> = Object.freeze({
  geometry: 'Geometry',
  situsAddress: 'Situs address',
  apn: 'APN',
  landUse: 'Land use',
  zoning: 'Zoning',
  setbacks: 'Setbacks',
  envelope: 'Buildable envelope',
  flood: 'Flood',
  frontage: 'Frontage',
})

/** Tally of Fact states across every parcel in the county for one field. */
export interface FieldTally {
  present: number
  absentCovered: number
  absentUncovered: number
  /** Lookup FAILED. Non-zero here is an outage, not a coverage gap. */
  unresolved: number
}

export type ContradictionKind =
  | 'envelope-not-derived-but-area-shown'
  | 'flood-zone-disagreement'
  | 'field-unavailable-but-present-upstream'
  | 'address-absent-but-on-cad-roll'
  | 'setbacks-present-card-absent-brief'

export const CONTRADICTION_LABELS: Readonly<Record<ContradictionKind, string>> = Object.freeze({
  'envelope-not-derived-but-area-shown': 'Envelope not-derived while an area was shown',
  'flood-zone-disagreement': 'Two code paths report different flood zones',
  'field-unavailable-but-present-upstream': 'Reported unavailable, present upstream',
  'address-absent-but-on-cad-roll': 'Situs absent on sheet, present on CAD roll',
  'setbacks-present-card-absent-brief': 'Setbacks on card, absent on brief',
})

export interface ContradictionTally {
  kind: ContradictionKind
  count: number
  /** Up to 20 parcel node ids, for the operator to open directly. */
  exampleParcelNodeIds: string[]
}

export interface AbsenceCluster {
  field: FieldKey
  label: string
  parcelCount: number
  bbox: [number, number, number, number]
}

export interface CountyServingSweep {
  countyFips: string
  countyName: string
  sweptAt: string
  /** The ParcelFactSheet resolverVersion this sweep ran against. */
  resolverVersion: string

  parcelsTotal: number
  /** Parcels the sweep could not resolve at all. Distinct from any tally. */
  parcelsUnresolvable: number

  fields: Record<FieldKey, FieldTally>

  singleFamily: {
    parcelsTotal: number
    fields: Record<FieldKey, FieldTally>
  }

  contradictions: ContradictionTally[]

  /** Parcels whose flood determination carries more than one zone. */
  multiZoneFloodParcels: number

  absenceClusters: AbsenceCluster[]

  sourcesByField: Partial<Record<FieldKey, { source: string; vintage: string | null }>>
}

export interface StatewideServingSweep {
  sweptAt: string
  resolverVersion: string
  countiesTotal: number
  countiesSwept: number
  parcelsTotal: number
  counties: CountyServingSweep[]
}

// ── Tally math (no renderer computes a rate by hand) ───────────────────────────

export interface RateWithDenominator {
  /** Percentage, 0-100. Null when the denominator is zero — never 0, never NaN. */
  pct: number | null
  numerator: number
  denominator: number
  /** The counting rule, carried inline so it renders next to the number. */
  rule: string
}

/**
 * Denominator for a field tally, MEASURED as the sum of the four classes rather
 * than taken from parcelsTotal. If the four classes do not sum to parcelsTotal that
 * is a finding, and `tallyReconciliation` reports it instead of hiding it behind a
 * borrowed denominator (DEV_PROCESS 1.3 — measure the class, never subtract it).
 */
export function tallyDenominator(t: FieldTally): number {
  return t.present + t.absentCovered + t.absentUncovered + t.unresolved
}

export function servedRate(t: FieldTally): RateWithDenominator {
  const denominator = tallyDenominator(t)
  return {
    pct: denominator > 0 ? (100 * t.present) / denominator : null,
    numerator: t.present,
    denominator,
    rule: 'present / (present + absentCovered + absentUncovered + unresolved)',
  }
}

/** Absence rate EXCLUDING unresolved. Failure is not an absence. */
export function absenceRate(t: FieldTally): RateWithDenominator {
  const denominator = tallyDenominator(t)
  const numerator = t.absentCovered + t.absentUncovered
  return {
    pct: denominator > 0 ? (100 * numerator) / denominator : null,
    numerator,
    denominator,
    rule: 'absentCovered + absentUncovered, unresolved excluded — failure is not an absence',
  }
}

/** Outage rate. Its own class, never merged into absence. */
export function unresolvedRate(t: FieldTally): RateWithDenominator {
  const denominator = tallyDenominator(t)
  return {
    pct: denominator > 0 ? (100 * t.unresolved) / denominator : null,
    numerator: t.unresolved,
    denominator,
    rule: 'unresolved / measured tally — an outage, not a coverage gap',
  }
}

/**
 * Does the measured tally account for every parcel the sweep claims to have swept?
 * Returns the shortfall rather than a boolean so the console can print the gap.
 */
export function tallyReconciliation(
  t: FieldTally,
  parcelsTotal: number,
): { measured: number; claimed: number; unaccounted: number; agrees: boolean } {
  const measured = tallyDenominator(t)
  return {
    measured,
    claimed: parcelsTotal,
    unaccounted: parcelsTotal - measured,
    agrees: measured === parcelsTotal,
  }
}

export function emptyTally(): FieldTally {
  return { present: 0, absentCovered: 0, absentUncovered: 0, unresolved: 0 }
}

export function addTally(a: FieldTally, b: FieldTally): FieldTally {
  return {
    present: a.present + b.present,
    absentCovered: a.absentCovered + b.absentCovered,
    absentUncovered: a.absentUncovered + b.absentUncovered,
    unresolved: a.unresolved + b.unresolved,
  }
}

/** Roll the per-county field tallies up to one statewide tally per field. */
export function rollUpFields(counties: CountyServingSweep[]): Record<FieldKey, FieldTally> {
  const out = {} as Record<FieldKey, FieldTally>
  for (const key of FIELD_KEYS) out[key] = emptyTally()
  for (const county of counties) {
    for (const key of FIELD_KEYS) {
      const t = county.fields?.[key]
      if (t) out[key] = addTally(out[key], t)
    }
  }
  return out
}

export function rollUpSingleFamily(counties: CountyServingSweep[]): Record<FieldKey, FieldTally> {
  const out = {} as Record<FieldKey, FieldTally>
  for (const key of FIELD_KEYS) out[key] = emptyTally()
  for (const county of counties) {
    for (const key of FIELD_KEYS) {
      const t = county.singleFamily?.fields?.[key]
      if (t) out[key] = addTally(out[key], t)
    }
  }
  return out
}

export function rollUpContradictions(counties: CountyServingSweep[]): ContradictionTally[] {
  const map = new Map<ContradictionKind, ContradictionTally>()
  for (const county of counties) {
    for (const c of county.contradictions ?? []) {
      const existing = map.get(c.kind)
      if (existing) {
        existing.count += c.count
        for (const id of c.exampleParcelNodeIds ?? []) {
          if (existing.exampleParcelNodeIds.length < 20) existing.exampleParcelNodeIds.push(id)
        }
      } else {
        map.set(c.kind, {
          kind: c.kind,
          count: c.count,
          exampleParcelNodeIds: [...(c.exampleParcelNodeIds ?? [])].slice(0, 20),
        })
      }
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count)
}

// ── Runtime validation ────────────────────────────────────────────────────────

export interface SweepParseResult {
  ok: boolean
  sweep: StatewideServingSweep | null
  /** Every problem found, by path. An empty list with ok=false is impossible. */
  problems: string[]
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function checkTally(v: unknown, path: string, problems: string[]): FieldTally | null {
  if (!isRecord(v)) {
    problems.push(`${path}: expected a tally object`)
    return null
  }
  const out = emptyTally()
  for (const k of ['present', 'absentCovered', 'absentUncovered', 'unresolved'] as const) {
    const n = v[k]
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) {
      problems.push(`${path}.${k}: expected a non-negative number, got ${JSON.stringify(n)}`)
    } else {
      out[k] = n
    }
  }
  return out
}

function checkFields(v: unknown, path: string, problems: string[]): Record<FieldKey, FieldTally> {
  const out = {} as Record<FieldKey, FieldTally>
  if (!isRecord(v)) {
    problems.push(`${path}: expected a fields object`)
    for (const key of FIELD_KEYS) out[key] = emptyTally()
    return out
  }
  for (const key of FIELD_KEYS) {
    if (!(key in v)) {
      problems.push(`${path}.${key}: missing — the frozen record requires every FieldKey`)
      out[key] = emptyTally()
      continue
    }
    out[key] = checkTally(v[key], `${path}.${key}`, problems) ?? emptyTally()
  }
  for (const key of Object.keys(v)) {
    if (!(FIELD_KEYS as readonly string[]).includes(key)) {
      problems.push(`${path}.${key}: not a FieldKey in the frozen record`)
    }
  }
  return out
}

function str(v: unknown, path: string, problems: string[], fallback = ''): string {
  if (typeof v === 'string') return v
  problems.push(`${path}: expected a string, got ${JSON.stringify(v)}`)
  return fallback
}

function num(v: unknown, path: string, problems: string[]): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  problems.push(`${path}: expected a number, got ${JSON.stringify(v)}`)
  return 0
}

function checkCounty(v: unknown, path: string, problems: string[]): CountyServingSweep {
  if (!isRecord(v)) {
    problems.push(`${path}: expected a county sweep object`)
    v = {}
  }
  const c = v as Record<string, unknown>
  const contradictions: ContradictionTally[] = []
  if (c.contradictions !== undefined) {
    if (!Array.isArray(c.contradictions)) {
      problems.push(`${path}.contradictions: expected an array`)
    } else {
      c.contradictions.forEach((raw, i) => {
        if (!isRecord(raw)) {
          problems.push(`${path}.contradictions[${i}]: expected an object`)
          return
        }
        const kind = raw.kind
        if (typeof kind !== 'string' || !(kind in CONTRADICTION_LABELS)) {
          problems.push(`${path}.contradictions[${i}].kind: not a ContradictionKind (${JSON.stringify(kind)})`)
          return
        }
        const ids = Array.isArray(raw.exampleParcelNodeIds)
          ? raw.exampleParcelNodeIds.filter((x): x is string => typeof x === 'string')
          : []
        if (ids.length > 20) {
          problems.push(`${path}.contradictions[${i}].exampleParcelNodeIds: ${ids.length} ids, the record caps at 20`)
        }
        contradictions.push({
          kind: kind as ContradictionKind,
          count: num(raw.count, `${path}.contradictions[${i}].count`, problems),
          exampleParcelNodeIds: ids,
        })
      })
    }
  }

  const clusters: AbsenceCluster[] = []
  if (c.absenceClusters !== undefined) {
    if (!Array.isArray(c.absenceClusters)) {
      problems.push(`${path}.absenceClusters: expected an array`)
    } else {
      c.absenceClusters.forEach((raw, i) => {
        if (!isRecord(raw)) {
          problems.push(`${path}.absenceClusters[${i}]: expected an object`)
          return
        }
        const field = raw.field
        if (typeof field !== 'string' || !(FIELD_KEYS as readonly string[]).includes(field)) {
          problems.push(`${path}.absenceClusters[${i}].field: not a FieldKey (${JSON.stringify(field)})`)
          return
        }
        const bboxRaw = raw.bbox
        const bboxOk =
          Array.isArray(bboxRaw) && bboxRaw.length === 4 && bboxRaw.every((n) => typeof n === 'number')
        if (!bboxOk) {
          problems.push(`${path}.absenceClusters[${i}].bbox: expected 4 numbers, got ${JSON.stringify(bboxRaw)}`)
        }
        const bbox: [number, number, number, number] = bboxOk
          ? (bboxRaw as [number, number, number, number])
          : [0, 0, 0, 0]
        clusters.push({
          field: field as FieldKey,
          label: str(raw.label, `${path}.absenceClusters[${i}].label`, problems),
          parcelCount: num(raw.parcelCount, `${path}.absenceClusters[${i}].parcelCount`, problems),
          bbox,
        })
      })
    }
  }

  const sourcesByField: CountyServingSweep['sourcesByField'] = {}
  if (isRecord(c.sourcesByField)) {
    for (const [k, raw] of Object.entries(c.sourcesByField)) {
      if (!(FIELD_KEYS as readonly string[]).includes(k)) {
        problems.push(`${path}.sourcesByField.${k}: not a FieldKey`)
        continue
      }
      if (!isRecord(raw)) {
        problems.push(`${path}.sourcesByField.${k}: expected { source, vintage }`)
        continue
      }
      sourcesByField[k as FieldKey] = {
        source: str(raw.source, `${path}.sourcesByField.${k}.source`, problems),
        vintage: typeof raw.vintage === 'string' ? raw.vintage : null,
      }
    }
  } else if (c.sourcesByField !== undefined) {
    problems.push(`${path}.sourcesByField: expected an object`)
  }

  const sf = isRecord(c.singleFamily) ? c.singleFamily : undefined
  if (!sf) problems.push(`${path}.singleFamily: missing — the frozen record requires the single-family break-out`)

  return {
    countyFips: str(c.countyFips, `${path}.countyFips`, problems),
    countyName: str(c.countyName, `${path}.countyName`, problems),
    sweptAt: str(c.sweptAt, `${path}.sweptAt`, problems),
    resolverVersion: str(c.resolverVersion, `${path}.resolverVersion`, problems),
    parcelsTotal: num(c.parcelsTotal, `${path}.parcelsTotal`, problems),
    parcelsUnresolvable: num(c.parcelsUnresolvable, `${path}.parcelsUnresolvable`, problems),
    fields: checkFields(c.fields, `${path}.fields`, problems),
    singleFamily: {
      parcelsTotal: sf ? num(sf.parcelsTotal, `${path}.singleFamily.parcelsTotal`, problems) : 0,
      fields: checkFields(sf?.fields, `${path}.singleFamily.fields`, problems),
    },
    contradictions,
    multiZoneFloodParcels: num(c.multiZoneFloodParcels, `${path}.multiZoneFloodParcels`, problems),
    absenceClusters: clusters,
    sourcesByField,
  }
}

/**
 * Parse an unknown payload into the frozen StatewideServingSweep.
 *
 * Every problem is collected by path rather than thrown on the first one, so the
 * console can show P-43 exactly what its emitter got wrong in a single pass. This
 * validator is proven able to FAIL in servingSweepTypes.test.ts (DEV_PROCESS 2.2);
 * a parser that cannot reject is not a parser.
 */
export function parseStatewideSweep(raw: unknown): SweepParseResult {
  const problems: string[] = []
  if (!isRecord(raw)) {
    return { ok: false, sweep: null, problems: ['root: expected a StatewideServingSweep object'] }
  }
  if (!Array.isArray(raw.counties)) {
    problems.push('root.counties: expected an array of CountyServingSweep')
    return { ok: false, sweep: null, problems }
  }
  const counties = raw.counties.map((c, i) => checkCounty(c, `counties[${i}]`, problems))
  const sweep: StatewideServingSweep = {
    sweptAt: str(raw.sweptAt, 'root.sweptAt', problems),
    resolverVersion: str(raw.resolverVersion, 'root.resolverVersion', problems),
    countiesTotal: num(raw.countiesTotal, 'root.countiesTotal', problems),
    countiesSwept: num(raw.countiesSwept, 'root.countiesSwept', problems),
    parcelsTotal: num(raw.parcelsTotal, 'root.parcelsTotal', problems),
    counties,
  }
  if (sweep.countiesSwept !== counties.length) {
    problems.push(
      `root.countiesSwept: says ${sweep.countiesSwept} but counties[] carries ${counties.length} — two numbers that should agree and do not`,
    )
  }
  return { ok: problems.length === 0, sweep, problems }
}
