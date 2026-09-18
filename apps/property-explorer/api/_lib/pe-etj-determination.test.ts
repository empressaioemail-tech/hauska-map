import { describe, expect, it } from "vitest";

import {
  NO_DETERMINATION_REASON,
  normalizeAdoptedCityLimitsEtj,
  rawEtjStatusInHand,
  readEtjFact,
  resolveEtjDetermination,
} from "./pe-etj-determination";
import { isCityLimitsFactWire } from "./atom-chain-to-facets";

/**
 * P-332 (OPS-24 wave 1). The fixtures below are the REAL `cityLimitsFact`
 * objects served by cortex-api (P-296) for the two parcels the dispatch names,
 * captured live 2026-09-18 through the Property Explorer spine's own cortex
 * proxy:
 *
 *   GET https://smartsite.cloud/api/spine/cortex/api/brokerage/v1/place/node/<id>/facets
 *
 * They are transcribed, not paraphrased: `etjFact` is NESTED inside
 * `cityLimitsFact` (it is not a cortex root sibling), and the parcel that
 * carries the conflict — incorporated city limits AND an ETJ-present read — is
 * 48453:134392, exactly the parcel the dispatch's table names.
 */
const LIVE_48453_134392_CITY_LIMITS = {
  status: "incorporated",
  etjStatus: "present",
  source: "tx_city_boundary",
  basis:
    "parcel_record cityLimits: incorporated, city 'Austin' (source: landing_parcel_jurisdiction, vintage: 2026-09-17T19:23:36.801Z). ETJ: point-in-polygon against tx_etj_boundary etj_id=austin-tx:39 (Austin: \"AUSTIN 2 MILE ETJ\", ring 39)",
  cityName: "Austin",
  queryPoint: { longitude: -97.85514, latitude: 30.35297 },
  etjFact: {
    status: "present",
    source: "tx_etj_boundary",
    basis:
      "point-in-polygon against tx_etj_boundary etj_id=austin-tx:39 (Austin: \"AUSTIN 2 MILE ETJ\", ring 39)",
    cityKey: "austin-tx",
    cityName: "Austin",
    ringLabel: "AUSTIN 2 MILE ETJ",
    etjId: "austin-tx:39",
    sourceCitation:
      "https://services.arcgis.com/0L95CJ0VTaxqcmED/arcgis/rest/services/BOUNDARIES_jurisdictions/FeatureServer/0",
    queryPoint: { longitude: -97.85514, latitude: 30.35297 },
  },
};

const LIVE_48209_97658_CITY_LIMITS = {
  status: "incorporated",
  etjStatus: "absent",
  source: "tx_city_boundary",
  basis:
    "parcel_record cityLimits: incorporated, city 'San Marcos' (source: landing_parcel_jurisdiction, vintage: 2026-09-17T19:06:57.582Z). ETJ: point-in-polygon against 1 published ETJ ring(s) from 1 publisher(s) whose own published extent covers this point (san-marcos-tx); no published ETJ ring contains it, so ETJ is verified absent here",
  cityName: "San Marcos",
  queryPoint: { longitude: -97.92589, latitude: 29.8719 },
  etjFact: {
    status: "absent",
    source: "tx_etj_boundary",
    basis:
      "point-in-polygon against 1 published ETJ ring(s) from 1 publisher(s) whose own published extent covers this point (san-marcos-tx); no published ETJ ring contains it, so ETJ is verified absent here",
    coveredBy: ["san-marcos-tx"],
    ringsConsulted: 1,
    queryPoint: { longitude: -97.92589, latitude: 29.8719 },
  },
};

function determinationFor(
  cityLimits: Record<string, unknown>,
): ReturnType<typeof normalizeAdoptedCityLimitsEtj> {
  return normalizeAdoptedCityLimitsEtj(cityLimits as never);
}

describe("P-332 write site W7 — isCityLimitsFactWire no longer rejects a real determination", () => {
  it("ADMITS a fact carrying etjStatus 'present' and its nested etjFact (pre-change this returned false and the whole fact was dropped)", () => {
    expect(isCityLimitsFactWire(LIVE_48453_134392_CITY_LIMITS)).toBe(true);
  });

  it("ADMITS a checked absence", () => {
    expect(isCityLimitsFactWire(LIVE_48209_97658_CITY_LIMITS)).toBe(true);
  });

  it("still REJECTS the shapes it always rejected — the widening is not a hole", () => {
    expect(isCityLimitsFactWire(null)).toBe(false);
    expect(isCityLimitsFactWire({ ...LIVE_48209_97658_CITY_LIMITS, source: "landing_parcel_jurisdiction" })).toBe(false);
    expect(isCityLimitsFactWire({ ...LIVE_48209_97658_CITY_LIMITS, status: "maybe" })).toBe(false);
    expect(isCityLimitsFactWire({ ...LIVE_48209_97658_CITY_LIMITS, etjStatus: "probably" })).toBe(false);
    expect(isCityLimitsFactWire({ ...LIVE_48209_97658_CITY_LIMITS, basis: "" })).toBe(false);
  });
});

describe("P-332 F3 — the declared conflict (48453:134392, live shape)", () => {
  const served = determinationFor(LIVE_48453_134392_CITY_LIMITS);

  it("serves the DECLARED CONFLICT, not a clean 'present' beside 'incorporated'", () => {
    expect(served.etjStatus).toBe("conflicting");
    // The other direction, stated so this test cannot pass by accident: a
    // fixture that forwarded cortex's `present` verbatim would serve "present"
    // here, and that must never be what this code produces.
    expect(served.etjStatus).not.toBe("present");
  });

  it("names BOTH sources and BOTH bases on the served conflict", () => {
    const conflict = served.etjConflict;
    expect(conflict).not.toBeNull();
    if (!conflict) throw new Error("unreachable");
    expect(conflict.state).toBe("conflicting");
    // city-limits side
    expect(conflict.cityLimits.state).toBe("incorporated");
    expect(conflict.cityLimits.source).toBe("tx_city_boundary");
    expect(conflict.cityLimits.cityName).toBe("Austin");
    expect(conflict.cityLimits.basis).toContain("landing_parcel_jurisdiction");
    // ETJ side
    expect(conflict.etj.state).toBe("present");
    expect(conflict.etj.source).toBe("tx_etj_boundary");
    expect(conflict.etj.basis).toContain("tx_etj_boundary");
    expect(conflict.etj.ringLabel).toBe("AUSTIN 2 MILE ETJ");
    expect(conflict.etj.etjId).toBe("austin-tx:39");
    // and it says what the disagreement IS
    expect(conflict.note).toContain("unincorporated");
  });

  it("neither side is silently dropped: the raw determination and the city-limits basis both survive", () => {
    expect(served.etjFact?.status).toBe("present");
    expect(served.etjFact?.etjId).toBe("austin-tx:39");
    expect(served.status).toBe("incorporated");
    // no unresolved reason on a conflicting fact — it is not unresolved
    expect(served.etjReason).toBeUndefined();
  });
});

describe("P-332 F2 — agreeing controls", () => {
  it("a checked absence serves 'absent', with its publishers and ring count intact (48209:97658, live shape)", () => {
    const served = determinationFor(LIVE_48209_97658_CITY_LIMITS);
    expect(served.etjStatus).toBe("absent");
    expect(served.etjConflict).toBeUndefined();
    expect(served.etjReason).toBeUndefined();
    expect(served.etjFact?.coveredBy).toEqual(["san-marcos-tx"]);
    expect(served.etjFact?.ringsConsulted).toBe(1);
  });

  it("a present read on UNINCORPORATED city limits is coherent and serves 'present' (the ETJ case that is not a conflict)", () => {
    const served = determinationFor({ ...LIVE_48453_134392_CITY_LIMITS, status: "unincorporated", cityName: undefined });
    expect(served.etjStatus).toBe("present");
    expect(served.etjConflict).toBeUndefined();
  });

  it("a payload carrying NO determination serves 'unresolved' and SAYS WHY", () => {
    const served = determinationFor({
      status: "incorporated",
      etjStatus: "unresolved",
      source: "tx_city_boundary",
      basis: "prior good read",
      cityName: "Bastrop",
    });
    expect(served.etjStatus).toBe("unresolved");
    expect(served.etjReason).toBe(NO_DETERMINATION_REASON);
    expect(served.etjReason).not.toBe("");
    expect(served.etjFact).toBeUndefined();
  });

  it("a payload whose determination is itself unresolved carries that determination's own reason", () => {
    const served = determinationFor({
      status: "unincorporated",
      etjStatus: "unresolved",
      source: "tx_city_boundary",
      basis: "city limits basis",
      etjFact: { status: "unresolved", source: "tx_etj_boundary", basis: "no ETJ rings published for this county" },
    });
    expect(served.etjStatus).toBe("unresolved");
    expect(served.etjReason).toBe("no ETJ rings published for this county");
  });
});

describe("P-332 F4 — never default, never derive", () => {
  it("does NOT derive ETJ from city limits: incorporated + no determination stays unresolved", () => {
    for (const status of ["incorporated", "unincorporated", "unmeasured"] as const) {
      const served = determinationFor({ status, etjStatus: "unresolved", source: "tx_city_boundary", basis: "b" });
      expect(served.etjStatus).toBe("unresolved");
    }
  });

  it("does NOT derive city limits from ETJ: every served etjStatus is a function of the read, not of the city", () => {
    const withAbsent = determinationFor({ ...LIVE_48209_97658_CITY_LIMITS });
    expect(withAbsent.status).toBe("incorporated");
    const withPresentUnincorporated = determinationFor({
      ...LIVE_48453_134392_CITY_LIMITS,
      status: "unincorporated",
    });
    expect(withPresentUnincorporated.status).toBe("unincorporated");
  });

  it("refuses a determination that carries no basis rather than serving an unfounded one", () => {
    expect(readEtjFact({ status: "present", source: "tx_etj_boundary" })).toBeNull();
    expect(readEtjFact({ status: "present", source: "tx_etj_boundary", basis: "   " })).toBeNull();
    expect(readEtjFact({ status: "maybe", source: "tx_etj_boundary", basis: "b" })).toBeNull();
    expect(readEtjFact(null)).toBeNull();
  });

  it("a refused block does not become a default: the top-level state still carries, and the conflict's ETJ basis falls back to cortex's own `ETJ:` segment rather than to a generic sentence", () => {
    const served = determinationFor({
      status: "incorporated",
      etjStatus: "present",
      source: "tx_city_boundary",
      basis: "parcel_record cityLimits: incorporated, city 'Austin'. ETJ: point-in-polygon against tx_etj_boundary etj_id=austin-tx:39",
      // no well-formed etjFact block — only the summary state
      etjFact: { status: "present", source: "tx_etj_boundary" },
    });
    expect(served.etjStatus).toBe("conflicting");
    expect(served.etjFact).toBeUndefined();
    expect(served.etjConflict?.etj.basis).toBe(
      "point-in-polygon against tx_etj_boundary etj_id=austin-tx:39",
    );
  });

  it("...and when even that segment is absent, the conflict says the basis was not served instead of inventing one", () => {
    const served = determinationFor({
      status: "incorporated",
      etjStatus: "present",
      source: "tx_city_boundary",
      basis: "parcel_record cityLimits: incorporated, city 'Austin'.",
    });
    expect(served.etjStatus).toBe("conflicting");
    expect(served.etjConflict?.etj.basis).toBe(
      "the ETJ read returned present with no basis served alongside it.",
    );
  });

  it("a top-level 'present' with NO determination carrier at all is not a determination — it stays unresolved with its reason", () => {
    const served = determinationFor({
      status: "incorporated",
      source: "tx_city_boundary",
      basis: "b",
    });
    expect(served.etjStatus).toBe("unresolved");
    expect(served.etjReason).toBe(NO_DETERMINATION_REASON);
  });

  it("conflicting is emitted ONLY for incorporated + present", () => {
    const cases: Array<[string, string, string]> = [
      ["incorporated", "present", "conflicting"],
      ["incorporated", "absent", "absent"],
      ["unincorporated", "present", "present"],
      ["unincorporated", "absent", "absent"],
      ["unmeasured", "present", "present"],
    ];
    for (const [status, raw, want] of cases) {
      const served = resolveEtjDetermination({
        cityLimitsStatus: status as never,
        cityName: "X",
        cityLimitsSource: "tx_city_boundary",
        cityLimitsBasis: "b",
        etjFact: { status: raw as never, source: "tx_etj_boundary", basis: "etj basis" },
        etjStatusInHand: raw,
      });
      expect([status, raw, served.etjStatus]).toEqual([status, raw, want]);
    }
  });
});

describe("P-332 — normalisation is idempotent across the two adoption points", () => {
  it("re-normalising an already-normalised conflict does not drift state", () => {
    const once = determinationFor(LIVE_48453_134392_CITY_LIMITS);
    const twice = normalizeAdoptedCityLimitsEtj(once as never);
    expect(twice.etjStatus).toBe("conflicting");
    expect(twice.etjConflict).toEqual(once.etjConflict);
    expect(twice.etjFact).toEqual(once.etjFact);
  });

  it("strips residue instead of merging over it: a stale conflicting state does not survive the city-limits reading changing", () => {
    const once = determinationFor(LIVE_48453_134392_CITY_LIMITS);
    expect(once.etjStatus).toBe("conflicting");
    const twice = normalizeAdoptedCityLimitsEtj({
      ...(once as unknown as Record<string, unknown>),
      status: "unincorporated",
    } as never);
    expect(twice.etjStatus).toBe("present");
    expect(twice.etjConflict).toBeUndefined();
  });

  it("strips residue at the other end too: a stale unresolved reason does not survive a determination arriving", () => {
    const once = determinationFor({
      status: "incorporated",
      etjStatus: "unresolved",
      source: "tx_city_boundary",
      basis: "b",
    });
    expect(once.etjReason).toBe(NO_DETERMINATION_REASON);
    const twice = normalizeAdoptedCityLimitsEtj({
      ...(once as unknown as Record<string, unknown>),
      etjStatus: "absent",
      etjFact: { status: "absent", source: "tx_etj_boundary", basis: "checked against published rings" },
    } as never);
    expect(twice.etjStatus).toBe("absent");
    expect(twice.etjReason).toBeUndefined();
  });

  it("'conflicting' in hand is read back as a raw 'present', which is the only raw that can produce it", () => {
    expect(rawEtjStatusInHand(null, "conflicting")).toBe("present");
    expect(rawEtjStatusInHand(null, "present")).toBe("present");
    expect(rawEtjStatusInHand(null, "absent")).toBe("absent");
    expect(rawEtjStatusInHand(null, "unresolved")).toBe("unresolved");
    expect(rawEtjStatusInHand(null, undefined)).toBeNull();
    expect(rawEtjStatusInHand(null, "something-else")).toBeNull();
  });

  it("the raw block wins over the served summary when both are present", () => {
    const presentBlock = { status: "present" as const, source: "tx_etj_boundary", basis: "b" };
    expect(rawEtjStatusInHand(presentBlock, "absent")).toBe("present");
  });
});

describe("P-332 — five literals became one writer", () => {
  it("the reason constant is non-empty (a state that says 'unresolved' with no reason is the defaulting this lane removes)", () => {
    expect(NO_DETERMINATION_REASON.length).toBeGreaterThan(40);
  });

  it("carries the determination's own ring/source/citation fields through untouched", () => {
    const served = determinationFor(LIVE_48453_134392_CITY_LIMITS);
    expect(served.etjFact?.sourceCitation).toContain("BOUNDARIES_jurisdictions");
    expect(served.etjFact?.cityKey).toBe("austin-tx");
    expect(served.etjFact?.queryPoint).toEqual({ longitude: -97.85514, latitude: 30.35297 });
  });
});
