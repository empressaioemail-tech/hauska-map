// manifestDerivation.ts — the County Manifest's own provenance, computed rather than
// narrated, plus the two checks that catch the manifest lying to itself.
//
// WHY THIS FILE EXISTS. The manifest drifts against the engine in both directions and
// the boundary that keeps biting is which parts of it are DERIVED from live state and
// which are HAND-DECLARED. That boundary has lived in prose, in dispatch briefs and in
// close artifacts, all of which rot. Here it is a value the console renders, so an
// operator reading the grid can see, without asking anyone, which numbers are measured
// and which are asserted.
//
// Three provenance classes, and the distinction is load-bearing:
//
//   derived-api            computed by the server from live store state on each
//                          materialization. Trustworthy to the extent the
//                          materialization is fresh — which is why computedAt is
//                          always on screen.
//   declared-upstream      a value a human wrote into a manifest or a config and the
//                          server serves back. It can be true, false, or simply old,
//                          and NOTHING recomputes it. This is the class that bites.
//   declared-client        a presentation-only lookup in this repo (rail short labels,
//                          county display names). It never enters a measurement.
//
// And two checks that are cheap and have both already paid for themselves:
//
//   deadIndicators        an indicator whose value is constant across the entire
//                         payload cannot fire, so any UI that renders it is decoration
//                         (DEV_PROCESS 2.2 — a gating indicator is tested for its
//                         ability to FIRE before it is trusted).
//   selfContradictions    a cell whose coverage clears its own threshold while its
//                         state says unacquired, or the reverse (DEV_PROCESS 1.4 —
//                         two numbers that should agree and do not is a free finding).

import { isSatisfiedCell, type ManifestCell, type ManifestLedgerResponse, type RailCapability } from './countyManifestTypes'

export type Provenance = 'derived-api' | 'declared-upstream' | 'declared-client'

export interface ProvenanceRow {
  /** The thing the operator sees on screen. */
  subject: string
  provenance: Provenance
  /** Where the value comes from, concretely enough to go look. */
  basis: string
  /** What refreshes it, and "nothing" where nothing does. */
  refreshedBy: string
}

/**
 * The provenance table. It is a DECLARATION about the payload contract, which is why
 * it is a constant and not a probe — but every row names a concrete field, and
 * `auditProvenance` below attaches live evidence to the rows it can measure, so a row
 * that stops matching the payload becomes visible rather than staying quietly wrong.
 */
export const PROVENANCE_ROWS: readonly ProvenanceRow[] = Object.freeze([
  {
    subject: 'Rail set and column order',
    provenance: 'derived-api',
    basis: 'railCapabilities[] ordered, falling back to first-appearance order in manifestCells[]',
    refreshedBy: 'every read — the console asserts no rail set of its own',
  },
  {
    subject: 'Cell coverage percentage',
    provenance: 'derived-api',
    basis: 'manifestCells[].honestCoveragePct, scored against the atom store by named instruments',
    refreshedBy: 'a block or scorer run for that county, which rewrites the materialization',
  },
  {
    subject: 'Cell display state',
    provenance: 'derived-api',
    basis: 'manifestCells[].displayState',
    refreshedBy: 'a block or scorer run for that county',
  },
  {
    subject: 'Rail reachable ceiling',
    provenance: 'derived-api',
    basis: 'railCapabilities[].maxCountiesReachable, from a per-rail source probe',
    refreshedBy: 'the capability probe, where one is defined — several rails have none',
  },
  {
    subject: 'hasWriter (NO WRITER tag)',
    provenance: 'declared-upstream',
    basis: 'manifestCells[].hasWriter — hand-declared in the engine manifest, not derived from the writer registry',
    refreshedBy: 'nothing. A human edits the declaration; a merged writer does not move it',
  },
  {
    subject: 'atomFamilyState (NO ATOM tag)',
    provenance: 'declared-upstream',
    basis: 'manifestCells[].atomFamilyState — hand-declared alongside hasWriter',
    refreshedBy: 'nothing. A published atom family does not move it',
  },
  {
    subject: 'Threshold percentage',
    provenance: 'declared-upstream',
    basis: 'manifestCells[].thresholdPct — a policy number set per rail',
    refreshedBy: 'nothing automatic; it is a policy decision',
  },
  {
    subject: 'Rail short labels and long names',
    provenance: 'declared-client',
    basis: 'RAIL_LABELS in countyManifestTypes.ts — presentation only; an unlabelled rail still renders',
    refreshedBy: 'a commit in this repo. Never enters a measurement',
  },
  {
    subject: 'County display names (where the API serves none)',
    provenance: 'declared-client',
    basis: 'texasCountyNames.ts, generated from the canonical Texas roster; presentation only',
    refreshedBy: 'node apps/command-center/scripts/gen-texas-county-names.mjs',
  },
])

export interface ProvenanceAudit {
  rows: ProvenanceRow[]
  derivedCount: number
  declaredUpstreamCount: number
  declaredClientCount: number
}

export function auditProvenance(): ProvenanceAudit {
  const rows = [...PROVENANCE_ROWS]
  return {
    rows,
    derivedCount: rows.filter((r) => r.provenance === 'derived-api').length,
    declaredUpstreamCount: rows.filter((r) => r.provenance === 'declared-upstream').length,
    declaredClientCount: rows.filter((r) => r.provenance === 'declared-client').length,
  }
}

// ── Dead indicators ───────────────────────────────────────────────────────────

export interface DeadIndicator {
  indicator: string
  /** The single value the whole payload carries. */
  constantValue: string
  /** How many cells were examined. A rate never travels without its denominator. */
  cellsExamined: number
  /** What the console renders off this indicator, and therefore cannot ever show. */
  consequence: string
}

/**
 * Indicators whose value never varies across the payload. Such an indicator cannot
 * fire, so any pill, tag or legend entry driven by it is decoration and the operator
 * should be told so on the same screen rather than trusting a control that is off.
 */
export function deadIndicators(cells: ManifestCell[]): DeadIndicator[] {
  const out: DeadIndicator[] = []
  if (cells.length === 0) return out

  const writers = new Set(cells.map((c) => String(c.hasWriter)))
  if (writers.size === 1) {
    out.push({
      indicator: 'hasWriter',
      constantValue: [...writers][0],
      cellsExamined: cells.length,
      consequence: 'the NO WRITER column tag and its legend entry cannot appear',
    })
  }

  const families = new Set(cells.map((c) => c.atomFamilyState))
  if (families.size === 1) {
    out.push({
      indicator: 'atomFamilyState',
      constantValue: [...families][0],
      cellsExamined: cells.length,
      consequence: 'the NO ATOM column tag and the no-atom legend entry cannot appear',
    })
  }

  const partials = new Set(cells.map((c) => String(c.isPartial)))
  if (partials.size === 1 && [...partials][0] === 'false') {
    out.push({
      indicator: 'isPartial',
      constantValue: 'false',
      cellsExamined: cells.length,
      consequence: 'the partial (below threshold, zero credit) legend entry cannot appear',
    })
  }

  return out
}

/** Display states the legend advertises that the payload does not contain. */
export function absentDisplayStates(cells: ManifestCell[], advertised: string[]): string[] {
  const present = new Set<string>(cells.map((c) => c.displayState))
  return advertised.filter((s) => !present.has(s))
}

// ── Self-contradictions ───────────────────────────────────────────────────────

export type ManifestContradictionKind =
  | 'coverage-clears-threshold-but-unacquired'
  | 'satisfied-present-below-threshold'
  | 'satisfied-absent-with-no-basis'
  | 'satisfied-present-never-verified'

export interface ManifestContradiction {
  kind: ManifestContradictionKind
  countyFips: string
  railKey: string
  detail: string
}

export const MANIFEST_CONTRADICTION_LABELS: Readonly<Record<ManifestContradictionKind, string>> =
  Object.freeze({
    'coverage-clears-threshold-but-unacquired':
      'coverage clears its own threshold while the state says unacquired',
    'satisfied-present-below-threshold': 'counted satisfied while coverage sits below threshold',
    'satisfied-absent-with-no-basis': 'established absence carrying no basis',
    'satisfied-present-never-verified': 'counted satisfied with no verifying instrument on record',
  })

/**
 * Cells that disagree with themselves. Each kind is MEASURED over the whole cell set,
 * so a zero is a real zero rather than an unexamined class.
 */
export function manifestContradictions(cells: ManifestCell[]): ManifestContradiction[] {
  const out: ManifestContradiction[] = []
  for (const c of cells) {
    const cov = c.honestCoveragePct
    const thr = c.thresholdPct
    if (cov != null && thr != null && cov >= thr && c.displayState === 'not-yet') {
      out.push({
        kind: 'coverage-clears-threshold-but-unacquired',
        countyFips: c.countyFips,
        railKey: c.railKey,
        detail: `coverage ${cov}% clears threshold ${thr}% but displayState is not-yet`,
      })
    }
    if (cov != null && thr != null && cov < thr && c.displayState === 'satisfied-present' && !c.isPartial) {
      out.push({
        kind: 'satisfied-present-below-threshold',
        countyFips: c.countyFips,
        railKey: c.railKey,
        detail: `counted satisfied at ${cov}% against threshold ${thr}% with isPartial false`,
      })
    }
    if (c.displayState === 'satisfied-absent' && !c.absenceBasis) {
      out.push({
        kind: 'satisfied-absent-with-no-basis',
        countyFips: c.countyFips,
        railKey: c.railKey,
        detail: 'established absence with absenceBasis null — an absence must carry its basis',
      })
    }
    if (c.displayState === 'satisfied-present' && !c.isPartial && !c.verifiedByInstrument) {
      out.push({
        kind: 'satisfied-present-never-verified',
        countyFips: c.countyFips,
        railKey: c.railKey,
        detail: 'counted satisfied with verifiedByInstrument null',
      })
    }
  }
  return out
}

export function groupContradictions(
  list: ManifestContradiction[],
): Array<{ kind: ManifestContradictionKind; count: number; examples: ManifestContradiction[] }> {
  const map = new Map<ManifestContradictionKind, ManifestContradiction[]>()
  for (const c of list) {
    const arr = map.get(c.kind) ?? []
    arr.push(c)
    map.set(c.kind, arr)
  }
  return [...map.entries()]
    .map(([kind, items]) => ({ kind, count: items.length, examples: items.slice(0, 12) }))
    .sort((a, b) => b.count - a.count)
}

// ── Rail denominators ─────────────────────────────────────────────────────────

export interface RailDenominator {
  railKey: string
  satisfied: number
  /** Counties in the payload — the grid denominator. */
  countiesInPayload: number
  /** The rail's own reachable ceiling, where a capability probe defines one. */
  maxCountiesReachable: number | null
  /** Null when no capability probe is defined; the console says so rather than guessing. */
  sourceBasis: string | null
  limitation: string | null
}

/**
 * A rail reading 0 of 254 is not the same finding as a rail reading 0 of 1. rrc-wells
 * has a reachable ceiling of one county because its source is a single-county mirror;
 * scoring it against 254 manufactures a statewide hole. Where a probe defines a
 * ceiling the console shows both denominators; where none is defined it says that,
 * rather than silently using 254 (DEV_PROCESS 1.1, 2.1).
 */
export function railDenominators(
  cells: ManifestCell[],
  capabilities: RailCapability[] | undefined,
  railKeys: string[],
  countiesInPayload: number,
): RailDenominator[] {
  const capByKey = new Map((capabilities ?? []).map((c) => [c.railKey, c]))
  return railKeys.map((railKey) => {
    const cap = capByKey.get(railKey)
    return {
      railKey,
      satisfied: cells.filter((c) => c.railKey === railKey && isSatisfiedCell(c)).length,
      countiesInPayload,
      maxCountiesReachable: cap?.maxCountiesReachable ?? null,
      sourceBasis: cap?.sourceBasis ?? null,
      limitation: cap?.limitation ?? null,
    }
  })
}

// ── Materialization ───────────────────────────────────────────────────────────

export interface MaterializationState {
  computedAt: string | null
  servedAt: string | null
  ageMs: number | null
  ageHuman: string
}

export function humanAge(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return 'unknown'
  const s = Math.max(0, Math.round(ms / 1000))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function materializationState(res: ManifestLedgerResponse | null): MaterializationState {
  const summary = res?.summary
  const computedAt = summary?.computedAt ?? null
  const servedAt = summary?.servedAt ?? null
  let ageMs: number | null = null
  if (typeof summary?.materializationAgeMs === 'number' && Number.isFinite(summary.materializationAgeMs)) {
    ageMs = summary.materializationAgeMs
  } else if (computedAt && servedAt) {
    const c = Date.parse(computedAt)
    const s = Date.parse(servedAt)
    if (Number.isFinite(c) && Number.isFinite(s)) ageMs = s - c
  }
  return { computedAt, servedAt, ageMs, ageHuman: humanAge(ageMs) }
}

export type ReReadVerdict = 'first-read' | 'materialization-moved' | 'materialization-unchanged'

/**
 * The verdict on a re-read. The console can only RE-READ; it cannot recompute — no
 * recompute route exists on cortex-api (probed 2026-08-18: /api/county-ledger/recompute
 * and /api/county-ledger/refresh both return the SPA fallthrough). A re-read that does
 * not move computedAt is EVIDENCE OF UPSTREAM STALENESS and must be reported that way,
 * never as a successful refresh.
 */
export function reReadVerdict(
  previousComputedAt: string | null,
  nextComputedAt: string | null,
): ReReadVerdict {
  if (previousComputedAt == null) return 'first-read'
  return previousComputedAt === nextComputedAt ? 'materialization-unchanged' : 'materialization-moved'
}

export const RE_READ_VERDICT_COPY: Readonly<Record<ReReadVerdict, string>> = Object.freeze({
  'first-read': 'first read of this session',
  'materialization-moved': 'computedAt moved — the server materialized a new snapshot',
  'materialization-unchanged':
    'computedAt did NOT move — the console re-read the same snapshot. Command Center cannot recompute the manifest; a block or scorer run in the engine is what moves it',
})
