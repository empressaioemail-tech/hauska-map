// apps/property-explorer/src/lib/coverage-miss.ts
//
// P-353. The one place that reads a coverage answer out of a situs-search
// wire body and the one place that says it in words.
//
// WHY ONE MODULE. Four classes are owed to the customer and every one of them
// has a distinct sentence. Two implementations of that (a Find path and a
// typeahead path) is the CTRL-1 shape DEV_PROCESS 2.4 names: two careful
// edits, no divergence test, drifting. So the read and the wording live here,
// together, and every surface calls in.
//
// NOTHING IS FABRICATED. An absent class yields `null`, never a defaulted
// `no-hit` — an empty list that reads as "we looked and found nothing" when
// nobody looked is the P-205 collapse itself.

import type {
  SitusSearchMissClass,
  SitusSearchOutOfCoverageCounty,
} from "../../api/_lib/pe-situs-search-core";

/** The four owed classes. Anything else the upstream sends is unrecognised. */
export const COVERAGE_MISS_CLASSES = [
  "no-hit",
  "county_out_of_coverage",
  "out_of_coverage",
  "coverage_check_unavailable",
] as const;

export type CoverageMissClass = (typeof COVERAGE_MISS_CLASSES)[number];

export interface CoverageMiss {
  /** The class as served. May be one we do not recognise; see `recognised`. */
  missClass: SitusSearchMissClass;
  /** True when `missClass` is one of the four owed classes. */
  recognised: boolean;
  county: SitusSearchOutOfCoverageCounty | null;
  /** The recognised out-of-coverage state code, e.g. "CO". */
  state: string | null;
  /** Why the coverage check could not answer. Never used as a miss reason. */
  unavailableReason: string | null;
  /** Upstream display text, when one was sent. Not built here. */
  displayText: string | null;
}

function nonEmptyString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

/**
 * Read the coverage answer out of a wire body.
 *
 * `hits.length > 0` means the coverage question was never asked, so there is
 * no answer to read and this returns null even if a class is present (a
 * hits-carrying body with a class is a contradiction, and the honest reading
 * of a contradiction is "no answer", not "pick one").
 */
export function coverageMissFromWire(json: unknown): CoverageMiss | null {
  if (!isRecord(json)) return null;
  const hits = Array.isArray(json.hits) ? json.hits.length : 0;
  if (hits > 0) return null;
  const rawClass = nonEmptyString(json.missClass);
  if (!rawClass) return null;

  const rawCounty = json.outOfCoverageCounty;
  let county: SitusSearchOutOfCoverageCounty | null = null;
  if (isRecord(rawCounty)) {
    const countyFips = nonEmptyString(rawCounty.countyFips);
    const countyName = nonEmptyString(rawCounty.countyName);
    const state = nonEmptyString(rawCounty.state);
    if (countyFips && countyName && state) {
      county = { countyFips, countyName, state };
    }
  }

  return {
    missClass: rawClass,
    recognised: (COVERAGE_MISS_CLASSES as readonly string[]).includes(rawClass),
    county,
    state: nonEmptyString(json.outOfCoverageState),
    unavailableReason: nonEmptyString(json.coverageCheckUnavailableReason),
    displayText: nonEmptyString(json.missClassDisplayText),
  };
}

/**
 * True when the answer says the PLACE is outside the area we cover.
 *
 * This is the narrow predicate the fall-through stop keys on (dispatch item
 * 3): only these two classes mean "we had no business looking here". A
 * covered miss (`no-hit`) is a legitimate reason to keep looking down the
 * envelope ladder, and an unavailable check means we do not know — refusing
 * to look in both of those cases would be a worse failure than the one this
 * change fixes.
 */
export function isOutOfCoverage(miss: CoverageMiss | null): boolean {
  return (
    miss?.missClass === "county_out_of_coverage" ||
    miss?.missClass === "out_of_coverage"
  );
}

/**
 * The sentence the customer reads. One per class, and they must not be
 * interchangeable: `A covered miss reads as a covered miss`, an uncovered
 * county names its county and state, out of state names the state, and the
 * unavailable case must never read as "no results".
 */
export function coverageMissSentence(miss: CoverageMiss): string {
  switch (miss.missClass) {
    case "no-hit":
      return "No parcel in our records matches that address.";
    case "county_out_of_coverage": {
      const where = miss.county
        ? `${miss.county.countyName}, ${miss.county.state}`
        : null;
      return where
        ? `We don't cover ${where} yet, so that address is outside the area we can search.`
        : "That address is outside the area we cover.";
    }
    case "out_of_coverage": {
      const where = miss.state ? ` ${miss.state}` : "";
      return where
        ? `That address is outside our coverage area — we don't cover${where} yet.`
        : "That address is outside our coverage area.";
    }
    case "coverage_check_unavailable":
      // Deliberately does NOT say "no results" or "no matches": nothing was
      // found because nothing was looked up.
      return "We couldn't check coverage just now — this is not a no-results answer. Try again in a moment.";
    default:
      // An unrecognised class (cortex's budget refuse, or a class added after
      // this build) is still not a miss, and must not be shown as one.
      return "The parcel search could not answer for that address just now.";
  }
}
