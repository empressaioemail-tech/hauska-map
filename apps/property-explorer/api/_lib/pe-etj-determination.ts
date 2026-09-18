// api/_lib/pe-etj-determination.ts
//
// P-332 (OPS-24 wave 1): the ONE writer for the panel's ETJ state.
//
// WHY THIS FILE EXISTS. The panel's facets BFF held a real ETJ determination
// and served a literal in its place. Two independent suppressions produced
// that, and a fix aimed at only one of them would have looked correct and
// changed nothing:
//
//   1. `isCityLimitsFactWire` (atom-chain-to-facets.ts) required
//      `etjStatus === "unresolved"`, so a cortex-sourced cityLimitsFact that
//      carried a real determination was rejected WHOLE — status, cityName,
//      queryPoint and the nested etjFact block included — one layer before
//      any composer ever saw it.
//   2. `composeCityLimits` (pe-record-to-facets.ts) then wrote the literal
//      `etjStatus: "unresolved"` in all four of its branches, and
//      `applyRecordPatch` replaced the whole fact carrying only `queryPoint`
//      across (F21, 2026-09-13 — the same wholesale-replacement defect,
//      caught then for queryPoint and not noticed for the determination).
//
// So the rule lives here, once, and both adoption points call it:
// `withCityLimitsFact` when cortex's root fact is adopted, and the record
// composers when the retrieval reader's `cityLimits` cell replaces it. There
// is no second implementation of the rule, so there is nothing for a
// divergence test to police (DEV_PROCESS 2.4).
//
// FOUR STATES, NOT A BOOLEAN (dispatch item 2). `etjStatus` is
// "present" | "absent" | "unresolved" | "conflicting". `conflicting` is
// emitted ONLY when city limits say `incorporated` AND the ETJ read says
// `present`; a Texas extraterritorial jurisdiction is by definition
// unincorporated land outside a city's limits, so those two reads disagree and
// the panel declares the disagreement rather than serving `present` as a clean
// fact beside `incorporated`, and rather than silently dropping either side.
//
// NEVER DERIVE (dispatch item 3). If no determination is in hand the state is
// `unresolved` and the basis says why. ETJ is never derived from city limits
// and city limits is never derived from ETJ.
//
// WHAT IS NOT SETTLED HERE. Which of the two reads is wrong for the live
// conflict (48453:134392) is a store question, deliberately not decided in
// code (dispatch: "Measure; do not pick"). This module's job is to stop the
// panel from hiding the disagreement, not to adjudicate it.

/** The four served states. `conflicting` is derived; the other three are read. */
export const ETJ_STATUSES = ["present", "absent", "unresolved", "conflicting"] as const;
export type EtjStatus = (typeof ETJ_STATUSES)[number];

/** The states a determination itself can carry (no `conflicting` at source). */
export type RawEtjStatus = "present" | "absent" | "unresolved";

export type EtjQueryPoint = { longitude: number; latitude: number };

/**
 * The ETJ determination as served INSIDE `cityLimitsFact.etjFact` by cortex
 * (P-296). Verified live 2026-09-18 against
 * `GET /api/brokerage/v1/place/node/<id>/facets` for 48453:134392 (present,
 * ring `austin-tx:39`) and 48209:97658 (absent, 1 ring consulted). This is
 * the RAW read and it is carried through untouched: nothing in the panel
 * rewrites `status` here, which is what keeps normalisation idempotent across
 * the two adoption points.
 */
export type EtjFactWire = {
  status: RawEtjStatus;
  source: string;
  basis: string;
  cityKey?: string;
  cityName?: string;
  ringLabel?: string;
  etjId?: string;
  sourceCitation?: string;
  coveredBy?: string[];
  ringsConsulted?: number;
  queryPoint?: EtjQueryPoint | null;
};

/**
 * The declared conflict. Both sides are named, with their own sources and
 * their own bases — the dispatch's "names both sources and both bases", and
 * the alternative to serving two contradictory facts as two clean facts.
 */
export type EtjConflictWire = {
  state: "conflicting";
  cityLimits: {
    state: "incorporated";
    source: string;
    basis: string;
    cityName: string | null;
  };
  etj: {
    state: "present";
    source: string;
    basis: string;
    ringLabel: string | null;
    etjId: string | null;
  };
  note: string;
};

export type EtjDetermination = {
  etjStatus: EtjStatus;
  /** The raw determination carried through, or null when there was none to carry. */
  etjFact: EtjFactWire | null;
  /** Set only when `etjStatus === "conflicting"`. */
  etjConflict: EtjConflictWire | null;
  /**
   * Set only when `etjStatus === "unresolved"`: why the panel is not serving a
   * determination for this point. Deliberately a field of its own rather than
   * text appended to the fact's `basis` — `basis` is the city-limits
   * provenance a customer reads, and code that says "unresolved" without
   * saying why is the defaulting this lane exists to remove.
   */
  etjReason: string | null;
};

export type CityLimitsStatus = "incorporated" | "unincorporated" | "unmeasured";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function isEtjStatus(value: unknown): value is EtjStatus {
  return typeof value === "string" && (ETJ_STATUSES as readonly string[]).includes(value);
}

function isRawEtjStatus(value: unknown): value is RawEtjStatus {
  return value === "present" || value === "absent" || value === "unresolved";
}

function strArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((v): v is string => typeof v === "string");
  return out.length ? out : undefined;
}

function queryPoint(value: unknown): EtjQueryPoint | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const lon = value.longitude;
  const lat = value.latitude;
  if (typeof lon !== "number" || typeof lat !== "number") return undefined;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return undefined;
  return { longitude: lon, latitude: lat };
}

/**
 * Validate a wire `etjFact` value. A determination with no basis is not a
 * determination — it is an assertion the panel cannot carry a reason for — so
 * it is refused here rather than served bare (an empty result is not an
 * absence; neither is an unfounded one).
 */
export function readEtjFact(value: unknown): EtjFactWire | null {
  if (!isRecord(value)) return null;
  if (!isRawEtjStatus(value.status)) return null;
  const source = str(value.source);
  const basis = str(value.basis);
  if (!source || !basis) return null;
  const out: EtjFactWire = { status: value.status, source, basis };
  const cityKey = str(value.cityKey);
  if (cityKey) out.cityKey = cityKey;
  const cityName = str(value.cityName);
  if (cityName) out.cityName = cityName;
  const ringLabel = str(value.ringLabel);
  if (ringLabel) out.ringLabel = ringLabel;
  const etjId = str(value.etjId);
  if (etjId) out.etjId = etjId;
  const sourceCitation = str(value.sourceCitation);
  if (sourceCitation) out.sourceCitation = sourceCitation;
  const coveredBy = strArray(value.coveredBy);
  if (coveredBy) out.coveredBy = coveredBy;
  if (typeof value.ringsConsulted === "number" && Number.isFinite(value.ringsConsulted)) {
    out.ringsConsulted = value.ringsConsulted;
  }
  const qp = queryPoint(value.queryPoint);
  if (qp !== undefined) out.queryPoint = qp;
  return out;
}

/**
 * The raw determination actually in hand, from either carrier.
 *
 * `etjFact.status` wins when a valid block exists: it is the dedicated
 * determination with its own basis, and it is the field normalisation never
 * rewrites. Falling back to the top-level `etjStatus` is what lets a payload
 * that carries only the summary state (no block) still serve its read rather
 * than defaulting. A SERVED `conflicting` maps back to raw `present` — the
 * only raw that can produce it — which is what makes re-normalising an
 * already-normalised fact a no-op instead of a state drift.
 */
export function rawEtjStatusInHand(
  etjFact: EtjFactWire | null,
  etjStatusInHand: unknown,
): RawEtjStatus | null {
  if (etjFact) return etjFact.status;
  if (etjStatusInHand === "conflicting") return "present";
  if (isRawEtjStatus(etjStatusInHand)) return etjStatusInHand;
  return null;
}

/** Why the panel serves `unresolved`: it has no determination, and it will not invent one. */
export const NO_DETERMINATION_REASON =
  "no ETJ determination was served for this point; P-332: ETJ is never derived from city limits, nor city limits from ETJ.";

/**
 * Cortex stamps its ETJ read onto the city-limits `basis` as a trailing
 * `ETJ: <basis>` segment (verified live 2026-09-18 on both probe parcels). When
 * a determination arrives as the top-level `etjStatus` WITHOUT a well-formed
 * `etjFact` block, that segment is the only real basis in hand for the ETJ
 * side of a conflict — recover it rather than substituting a generic sentence.
 */
function etjBasisFromCityLimitsBasis(basis: string): string | null {
  const marker = basis.indexOf("ETJ:");
  if (marker < 0) return null;
  const segment = basis.slice(marker + 4).trim();
  return segment || null;
}

export function resolveEtjDetermination(input: {
  cityLimitsStatus: CityLimitsStatus;
  cityName: string | null;
  cityLimitsSource: string;
  cityLimitsBasis: string;
  etjFact: EtjFactWire | null;
  etjStatusInHand: unknown;
}): EtjDetermination {
  const raw = rawEtjStatusInHand(input.etjFact, input.etjStatusInHand);

  if (raw === null || (raw === "unresolved" && !input.etjFact)) {
    return {
      etjStatus: "unresolved",
      etjFact: null,
      etjConflict: null,
      etjReason: NO_DETERMINATION_REASON,
    };
  }

  if (raw === "unresolved") {
    // A determination that is itself unresolved still carries its own reason.
    return {
      etjStatus: "unresolved",
      etjFact: input.etjFact,
      etjConflict: null,
      etjReason: input.etjFact ? input.etjFact.basis : NO_DETERMINATION_REASON,
    };
  }

  if (raw === "present" && input.cityLimitsStatus === "incorporated") {
    const etjSource = input.etjFact?.source ?? "tx_etj_boundary";
    const conflict: EtjConflictWire = {
      state: "conflicting",
      cityLimits: {
        state: "incorporated",
        source: input.cityLimitsSource,
        basis: input.cityLimitsBasis,
        cityName: input.cityName,
      },
      etj: {
        state: "present",
        source: etjSource,
        basis:
          input.etjFact?.basis ??
          etjBasisFromCityLimitsBasis(input.cityLimitsBasis) ??
          "the ETJ read returned present with no basis served alongside it.",
        ringLabel: input.etjFact?.ringLabel ?? null,
        etjId: input.etjFact?.etjId ?? null,
      },
      note:
        `City limits say this point is incorporated (${input.cityLimitsSource}) while the ETJ read says it is ` +
        `inside a published ETJ ring (${etjSource}${input.etjFact?.ringLabel ? `: "${input.etjFact.ringLabel}"` : ""}). ` +
        "An extraterritorial jurisdiction is unincorporated land outside a city's limits, so the two independently " +
        "derived answers disagree. Both are served and neither is dropped; the disagreement is not resolved here.",
    };
    return {
      etjStatus: "conflicting",
      etjFact: input.etjFact,
      etjConflict: conflict,
      etjReason: null,
    };
  }

  // present (coherent: unincorporated land inside a city's ETJ) or absent
  // (a checked absence, with its publishers and ring count).
  return {
    etjStatus: raw,
    etjFact: input.etjFact,
    etjConflict: null,
    etjReason: null,
  };
}

/** The subset of the wire fact this module needs to normalise one it already holds. */
export type NormalizableCityLimitsFact = {
  status: CityLimitsStatus;
  source: string;
  basis: string;
  cityName?: string | null;
  etjStatus?: unknown;
  etjFact?: unknown;
  [key: string]: unknown;
};

/**
 * Normalise a cityLimitsFact that was ADOPTED, not composed — today that means
 * cortex's own root fact.
 *
 * This is the site that would otherwise serve `{status: "incorporated",
 * etjStatus: "present"}` verbatim on any parcel whose `cityLimits` rail is NOT
 * slated `record` (no record patch is composed there, so the cortex fact
 * stands as adopted).
 */
export function normalizeAdoptedCityLimitsEtj<T extends NormalizableCityLimitsFact>(
  fact: T,
): T & {
  etjStatus: EtjStatus;
  etjFact?: EtjFactWire;
  etjConflict?: EtjConflictWire;
  etjReason?: string;
} {
  const etjFact = readEtjFact(fact.etjFact);
  const determination = resolveEtjDetermination({
    cityLimitsStatus: fact.status,
    cityName: typeof fact.cityName === "string" ? fact.cityName : null,
    cityLimitsSource: fact.source,
    cityLimitsBasis: fact.basis,
    etjFact,
    etjStatusInHand: fact.etjStatus,
  });
  // The resolved fields REPLACE whatever was in hand rather than being merged
  // over it. A refused `etjFact` block, a stale `etjConflict` from a previous
  // city-limits reading, or a stale `etjReason` must not survive as residue of
  // the payload this function was asked to normalise — an unfounded block
  // forwarded verbatim is still an unfounded block.
  const {
    etjStatus: _servedStatus,
    etjFact: _rawFact,
    etjConflict: _staleConflict,
    etjReason: _staleReason,
    ...rest
  } = fact;
  void _servedStatus;
  void _rawFact;
  void _staleConflict;
  void _staleReason;
  const out = {
    ...rest,
    etjStatus: determination.etjStatus,
  } as T & {
    etjStatus: EtjStatus;
    etjFact?: EtjFactWire;
    etjConflict?: EtjConflictWire;
    etjReason?: string;
  };
  if (determination.etjFact) out.etjFact = determination.etjFact;
  if (determination.etjConflict) out.etjConflict = determination.etjConflict;
  if (determination.etjReason) out.etjReason = determination.etjReason;
  return out;
}
