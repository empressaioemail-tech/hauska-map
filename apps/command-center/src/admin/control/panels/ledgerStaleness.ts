// ledgerStaleness.ts — staleness as an ALARM that names what it invalidates, not a
// banner people read past.
//
// WHY THIS FILE EXISTS. On 2026-08-14T17:41:22.500Z the ledger materialized. On
// 2026-08-17 an effort landed footprints across counties. The ledger still reports the
// footprint rail as not-yet on 254 of 254 cells, because it was computed 67 hours
// earlier and nothing has recomputed it since. The planner read that as world-truth and
// told the operator footprints were not ingested. The number was not wrong; the reading
// of it was, because a ledger figure is a claim about its computedAt and nothing else.
//
// So the console raises three checks, in descending order of how much they prove:
//
//   1. AGE, derived. computedAt against the clock, with the consequence stated: every
//      cell state on screen is a claim about that instant.
//   2. EVIDENCE HORIZON, derived. Any observation the console can actually see whose
//      timestamp POSTDATES computedAt — a sweep, a written tally, a cell's own
//      lastVerifiedAt. The ledger cannot contain what was observed after it was
//      computed, so any such observation is proof the snapshot is behind the world.
//   3. DECLARED WORK HORIZON, hand-declared. A dated record of landed work with its
//      doc_repo artifact path. This one is a DECLARATION, it rots, and it is rendered
//      as declared-upstream provenance so it can never pass for a measurement. It
//      earns its place because it is the only check that can name the specific work a
//      snapshot predates, which is the operator's worked example.
//
// A check that cannot fire is worse than no check, so every one of the three is proven
// able to fire AND to stay quiet in ledgerStaleness.test.ts.

import type { ManifestCell } from './countyManifestTypes'

export type AlarmSeverity = 'ok' | 'warn' | 'danger'

export interface StalenessAlarm {
  id: string
  severity: AlarmSeverity
  headline: string
  /** What this alarm proves, stated so it is not over-read. */
  proves: string
  /** Where the claim comes from — a URL, a payload field, or a repo path. */
  basis: string
  provenance: 'derived' | 'declared'
}

export const LEDGER_AGE_WARN_MS = 15 * 60 * 1000
export const LEDGER_AGE_DANGER_MS = 24 * 60 * 60 * 1000

export function ageMsBetween(computedAt: string | null, nowIso: string): number | null {
  if (!computedAt) return null
  const c = Date.parse(computedAt)
  const n = Date.parse(nowIso)
  if (!Number.isFinite(c) || !Number.isFinite(n)) return null
  return n - c
}

export function humanDuration(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return 'unknown'
  const s = Math.max(0, Math.round(ms / 1000))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

// ── Check 1: age ──────────────────────────────────────────────────────────────

export function ageAlarm(
  computedAt: string | null,
  nowIso: string,
  cellCount: number,
): StalenessAlarm {
  const age = ageMsBetween(computedAt, nowIso)
  if (!computedAt || age == null) {
    return {
      id: 'age',
      severity: 'danger',
      headline: 'the ledger served no computedAt',
      proves:
        'nothing on screen can be dated. A snapshot with no timestamp cannot be distinguished from a live read, which is the failure this console exists to prevent',
      basis: 'summary.computedAt absent from GET /api/county-ledger',
      provenance: 'derived',
    }
  }
  const severity: AlarmSeverity =
    age >= LEDGER_AGE_DANGER_MS ? 'danger' : age >= LEDGER_AGE_WARN_MS ? 'warn' : 'ok'
  return {
    id: 'age',
    severity,
    headline:
      severity === 'ok'
        ? `materialized ${humanDuration(age)} ago`
        : `the ledger is ${humanDuration(age)} old — every one of the ${cellCount.toLocaleString()} cell states below is a claim about ${computedAt}, not about now`,
    proves:
      severity === 'ok'
        ? 'the snapshot is recent; it is still a snapshot'
        : 'only that the snapshot is old. Whether the world moved since is what the other two checks test',
    basis: `summary.computedAt ${computedAt} against the console clock ${nowIso}`,
    provenance: 'derived',
  }
}

// ── Check 2: evidence horizon ─────────────────────────────────────────────────

export interface Observation {
  /** Short name of the instrument that made it. */
  instrument: string
  /** ISO timestamp of the observation itself, not of the read. */
  observedAt: string | null
  /** What it saw, in one clause. */
  saw: string
}

export interface EvidenceHorizon {
  /** Observations that POSTDATE computedAt. Non-empty means the ledger is behind. */
  ahead: Observation[]
  /** Observations older than computedAt. Named so the reader knows they prove nothing. */
  behind: Observation[]
  /** Observations with no usable timestamp. Counted, never discarded. */
  undated: Observation[]
}

export function evidenceHorizon(computedAt: string | null, observations: Observation[]): EvidenceHorizon {
  const c = computedAt ? Date.parse(computedAt) : NaN
  const ahead: Observation[] = []
  const behind: Observation[] = []
  const undated: Observation[] = []
  for (const o of observations) {
    const t = o.observedAt ? Date.parse(o.observedAt) : NaN
    if (!Number.isFinite(t)) undated.push(o)
    else if (!Number.isFinite(c) || t > c) ahead.push(o)
    else behind.push(o)
  }
  return { ahead, behind, undated }
}

export function evidenceHorizonAlarm(
  computedAt: string | null,
  observations: Observation[],
): StalenessAlarm | null {
  const horizon = evidenceHorizon(computedAt, observations)
  if (horizon.ahead.length === 0) return null
  const named = horizon.ahead
    .map((o) => `${o.instrument} observed ${o.saw} at ${o.observedAt}`)
    .join('; ')
  return {
    id: 'evidence-horizon',
    severity: 'danger',
    headline: `${horizon.ahead.length} of ${observations.length} observations this console can see POSTDATE the ledger`,
    proves: `the snapshot cannot contain them. ${named}. It does not prove any particular cell is wrong — it proves the ledger is behind the world and must not be read as world-truth`,
    basis: 'timestamps carried by the other instruments on screen, compared against summary.computedAt',
    provenance: 'derived',
  }
}

/** Every timestamp inside the ledger payload itself that postdates its own computedAt. */
export function internalObservations(cells: ManifestCell[]): Observation[] {
  const stamps = cells
    .map((c) => c.lastVerifiedAt)
    .filter((s): s is string => Boolean(s))
    .sort()
  const newest = stamps[stamps.length - 1]
  if (!newest) return []
  return [
    {
      instrument: 'ledger cell verification',
      observedAt: normalizeStamp(newest),
      saw: `its newest lastVerifiedAt of ${stamps.length.toLocaleString()} carrying one`,
    },
  ]
}

/**
 * The ledger serves lastVerifiedAt as a Postgres timestamp string
 * ("2026-08-14 06:36:42.306217+00"), not as ISO. Date.parse handles it in V8 but not
 * everywhere, so it is normalized before any comparison rather than being trusted to
 * parse identically in two places.
 */
export function normalizeStamp(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.includes('T')) return trimmed
  return trimmed.replace(' ', 'T').replace('+00', 'Z')
}

// ── Check 3: declared work horizon ────────────────────────────────────────────

/**
 * Work known to have landed, DECLARED IN THIS REPO, with the artifact that says so.
 *
 * THIS LIST IS HAND-DECLARED AND NOTHING REFRESHES IT. It is rendered as declared
 * provenance for exactly that reason. It exists because it is the only check that can
 * say "this snapshot predates THAT specific work", which is what nobody could see when
 * a stale footprint reading was reported as world-truth.
 *
 * NOT DECLARED HERE, deliberately: the same source line also claims 174 counties for
 * rrc-wells. The ledger's own capability probe serves maxCountiesReachable 1 for that
 * rail with sourceBasis "RRC public GIS Harris County mirror", and standing memory
 * records the Harris-only finding. A contested claim is not put in a console's mouth.
 */
export interface DeclaredWork {
  id: string
  railKey: string
  completedAt: string
  claim: string
  /** doc_repo path of the artifact that declares it. */
  artifact: string
  declaredAt: string
}

export const DECLARED_WORK: readonly DeclaredWork[] = Object.freeze([
  {
    id: 'l26-footprints',
    railKey: 'footprint',
    completedAt: '2026-08-17T12:43:00Z',
    claim: 'footprints landed in 174 counties',
    artifact: '_inbox/2026-08-17_l26_backfill_and_gtm_stand.md (table row: "Wells / footprints | 174 landed each.")',
    declaredAt: '2026-08-19',
  },
])

export interface WorkHorizonFinding {
  work: DeclaredWork
  /** Cells of that rail the ledger reports as unacquired, and the denominator. */
  notYetCells: number
  railCells: number
}

export function workHorizonFindings(
  cells: ManifestCell[],
  computedAt: string | null,
  work: readonly DeclaredWork[] = DECLARED_WORK,
): WorkHorizonFinding[] {
  const c = computedAt ? Date.parse(computedAt) : NaN
  const out: WorkHorizonFinding[] = []
  for (const w of work) {
    const completed = Date.parse(w.completedAt)
    if (!Number.isFinite(completed) || !Number.isFinite(c) || completed <= c) continue
    const railCells = cells.filter((cell) => cell.railKey === w.railKey)
    if (railCells.length === 0) continue
    const notYet = railCells.filter(
      (cell) => cell.displayState === 'not-yet' || cell.displayState === 'no-writer' || cell.displayState === 'no-atom',
    ).length
    if (notYet === 0) continue
    out.push({ work: w, notYetCells: notYet, railCells: railCells.length })
  }
  return out
}

export function workHorizonAlarm(
  cells: ManifestCell[],
  computedAt: string | null,
  work: readonly DeclaredWork[] = DECLARED_WORK,
): StalenessAlarm | null {
  const findings = workHorizonFindings(cells, computedAt, work)
  if (findings.length === 0) return null
  const f = findings[0]
  return {
    id: 'work-horizon',
    severity: 'danger',
    headline: `the ledger predates declared work on ${findings.map((x) => x.work.railKey).join(', ')}`,
    proves: `${f.work.claim} completed ${f.work.completedAt}; this snapshot was computed ${computedAt} and reports ${f.work.railKey} as unacquired on ${f.notYetCells.toLocaleString()} of ${f.railCells.toLocaleString()} cells. The snapshot cannot have seen that work, so its reading of that rail is not evidence of absence`,
    basis: findings.map((x) => x.work.artifact).join('; '),
    provenance: 'declared',
  }
}

// ── The alarm set ─────────────────────────────────────────────────────────────

export interface StalenessAlarmInput {
  computedAt: string | null
  nowIso: string
  cells: ManifestCell[]
  /** Observations from the other layers on screen. */
  observations: Observation[]
  work?: readonly DeclaredWork[]
}

export interface StalenessAlarmSet {
  alarms: StalenessAlarm[]
  worst: AlarmSeverity
}

export function stalenessAlarms(input: StalenessAlarmInput): StalenessAlarmSet {
  const alarms: StalenessAlarm[] = [ageAlarm(input.computedAt, input.nowIso, input.cells.length)]
  const horizon = evidenceHorizonAlarm(input.computedAt, [
    ...input.observations,
    ...internalObservations(input.cells),
  ])
  if (horizon) alarms.push(horizon)
  const work = workHorizonAlarm(input.cells, input.computedAt, input.work ?? DECLARED_WORK)
  if (work) alarms.push(work)
  const worst: AlarmSeverity = alarms.some((a) => a.severity === 'danger')
    ? 'danger'
    : alarms.some((a) => a.severity === 'warn')
      ? 'warn'
      : 'ok'
  return { alarms, worst }
}
