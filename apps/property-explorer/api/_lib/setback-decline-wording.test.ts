/**
 * P-257 — the decline wording and the planned-development gate, pinned.
 *
 * Two things are asserted here that a normal unit test would not bother with,
 * and both exist because the dispatch's own verification demands them:
 *
 *  1. BOTH DIRECTIONS OF THE WORDING. A parcel whose jurisdiction has a
 *     per-parcel city record (Bastrop) still reads a sentence naming that
 *     record; a parcel that has none (Hays, Caldwell, McLennan, Travis,
 *     Williamson) does not read the word "layer 23" at all. A fix that simply
 *     deleted the sentence would pass the second half and fail the first.
 *  2. THE CROSS-REPO PIN. hauska-map vendors its resolvers instead of importing
 *     legacy-design-tools' packages, so the planned-development pattern, its
 *     flags and the refusal sentence travel as PINNED LITERALS asserted
 *     byte-for-byte. legacy-design-tools' own suite asserts its exported
 *     constants against the identical literals. Do not soften these to
 *     `toMatch`/`toContain` — the point is exact bytes.
 *
 *     WHAT THIS BLOCK DOES AND DOES NOT PROVE (P-331, 2026-09-18). It is a
 *     LOCAL pin: it fails when THIS module's constant changes away from the
 *     literal typed above, which is what catches an accidental edit early. It
 *     cannot fail on drift with legacy-design-tools, because both sides of the
 *     assertion live in this repo and legacy-design-tools' suite asserts its own
 *     copy in its own repo — the claim that "neither repo can drift alone" was
 *     FALSE when it was written (a one-sided edit with this literal updated
 *     passes both CIs). The cross-repo half is now watched from the defining
 *     modules by `scripts/check-cross-repo-literal-drift.mjs` (workflow
 *     `.github/workflows/cross-repo-literal-drift.yml`), which reads
 *     legacy-design-tools' main and fails on disagreement. Keep this test AND
 *     keep it exact: the two controls fail on different things.
 */

import { describe, expect, it } from "vitest";

import {
  PLANNED_DEVELOPMENT_FLAGS,
  PLANNED_DEVELOPMENT_PATTERN,
  PUD_SETBACK_REFUSAL_REASON,
  isPlannedDevelopmentCode,
  plannedDevelopmentSetbackRefusal,
} from "./planned-development-district";
import { hasExactCodifiedDistrictRow } from "./codified-setback-from-zoning";
import { setbackPendingDisclosure } from "./setback-decline-wording";

// ---------------------------------------------------------------------------
// The cross-repo pin. These literals are legacy-design-tools'
// lib/cad-ingest/src/txgio/zoning-layers.ts (pattern + flags) and P-256's
// parcels-setback-cells.mjs PUD_REFUSAL_REASON, copied.
// ---------------------------------------------------------------------------
const LDT_PLANNED_DEVELOPMENT_PATTERN =
  "^(PUD|PDD|PD|PC|P-?U-?D)([\\s-].*)?$";
const LDT_PLANNED_DEVELOPMENT_FLAGS = "i";
const P256_PUD_REFUSAL_REASON =
  "setbacks for this parcel are set by its planned-development ordinance, " +
  "not a district schedule";

describe("P-257 cross-repo pins", () => {
  it("the planned-development pattern is legacy-design-tools' byte for byte", () => {
    expect(PLANNED_DEVELOPMENT_PATTERN).toBe(LDT_PLANNED_DEVELOPMENT_PATTERN);
  });

  it("the planned-development flags are legacy-design-tools' byte for byte", () => {
    expect(PLANNED_DEVELOPMENT_FLAGS).toBe(LDT_PLANNED_DEVELOPMENT_FLAGS);
  });

  it("the refusal sentence is P-256's byte for byte (the ledger writer and the card mean one thing)", () => {
    expect(PUD_SETBACK_REFUSAL_REASON).toBe(P256_PUD_REFUSAL_REASON);
  });
});

describe("a planned-development code is identified by the shared pattern", () => {
  // The four measured PUD-coded subjects, by their own published values.
  it.each([
    ["PD"], // 48021:70907 smithville-tx; 48309:370438 robinson-tx
    ["PD-LADERA"], // 48055:130676 luling-tx
    ["PUD (Eff. 7/19/04)"], // 48453:995707 lakeway-tx
    ["PUD"],
    ["PDD"],
    ["PC"],
    ["P-UD"],
    ["pd"], // case-insensitive
  ])("identifies %s as a planned-development code", (code) => {
    expect(isPlannedDevelopmentCode(code)).toBe(true);
  });

  it.each([
    ["SF-1"],
    ["R-2"],
    ["Recreational"], // 48209:49000's published district
    ["P"], // the one-character token `P Parks and Open Space District`; a
    // 1-char prefix match is already forbidden, and it is not a PUD either
    [""],
    [null],
    [undefined],
  ])("does not identify %s as a planned-development code", (code) => {
    expect(isPlannedDevelopmentCode(code as string | null | undefined)).toBe(
      false,
    );
  });
});

describe("the planned-development gate refuses a table, and only for a code with no row of its own", () => {
  it("refuses Smithville's measured PD (48021:70907), naming the class and the district", () => {
    const refusal = plannedDevelopmentSetbackRefusal({
      districtCode: "PD",
      jurisdictionKey: "smithville-tx",
    });
    expect(refusal).not.toBeNull();
    expect(refusal!.declineReason).toBe("pud-ordinance");
    expect(refusal!.district).toBe("PD");
    expect(refusal!.reason).toContain("planned-development code");
    expect(refusal!.reason).toContain("PD");
    expect(refusal!.reason).toContain("smithville-tx");
    // X10's half: the surface must NAME the class, not merely refuse.
    expect(refusal!.reason).toMatch(/planned-development|PUD/);
    expect(refusal!.refusalReason).toBe(PUD_SETBACK_REFUSAL_REASON);
    expect(refusal!.reason.toLowerCase()).toContain(PUD_SETBACK_REFUSAL_REASON);
  });

  it("refuses the other three measured PUD-coded subjects", () => {
    for (const [district, jurisdictionKey] of [
      ["PD-LADERA", "luling-tx"],
      ["PUD (Eff. 7/19/04)", "lakeway-tx"],
      ["PD", "robinson-tx"],
    ] as const) {
      expect(
        plannedDevelopmentSetbackRefusal({ districtCode: district, jurisdictionKey }),
      ).not.toBeNull();
    }
  });

  it("DOES NOT refuse a genuine Euclidean district (the fix must not make everything refuse)", () => {
    for (const district of ["SF-3", "SF-S", "RE", "R-1"]) {
      expect(
        plannedDevelopmentSetbackRefusal({
          districtCode: district,
          jurisdictionKey: "austin-tx",
        }),
      ).toBeNull();
    }
  });

  it("DOES NOT refuse a planned-development-pattern code that its own table really rows", () => {
    // The two measured instances: smithville-tx rows `PD-Z Zero Lot Line Garden
    // Home District` (Sec. 2.2.17) and grand-county-ut rows `PUD Planned Unit
    // Development`. Neither is vendored in this repo, so the escape is
    // exercised through the seam; legacy-design-tools pins the same two against
    // its real corpus.
    for (const [district, jurisdictionKey] of [
      ["PD-Z", "smithville-tx"],
      ["PUD", "grand-county-ut"],
    ] as const) {
      expect(
        plannedDevelopmentSetbackRefusal({
          districtCode: district,
          jurisdictionKey,
          hasExactRow: (code, key) => code === district && key === jurisdictionKey,
        }),
      ).toBeNull();
      // and the same codes DO refuse when their table does not row them
      expect(
        plannedDevelopmentSetbackRefusal({
          districtCode: district,
          jurisdictionKey,
          hasExactRow: () => false,
        }),
      ).not.toBeNull();
    }
  });

  it("the vendored-table exact-row lookup answers for real rows and not for a PUD pattern that has none", () => {
    expect(hasExactCodifiedDistrictRow("austin-tx", "SF-3")).toBe(true);
    expect(hasExactCodifiedDistrictRow("austin-tx", "PD")).toBe(false);
    expect(hasExactCodifiedDistrictRow("smithville-tx", "PD-Z")).toBe(false);
    expect(hasExactCodifiedDistrictRow(null, "PD")).toBe(false);
  });

  it("leaves an unrecognised code alone: no refusal, so it keeps today's decline", () => {
    // Unmeasured, never "treat as Euclidean": the gate adds a refusal and never
    // a value.
    expect(
      plannedDevelopmentSetbackRefusal({
        districtCode: "QQ-9",
        jurisdictionKey: "austin-tx",
      }),
    ).toBeNull();
  });
});

describe("the pending-setback sentence is composed from the parcel's own jurisdiction", () => {
  it("NAMES the per-parcel record where the parcel's jurisdiction really has one (Bastrop)", () => {
    for (const jurisdictionKey of [
      "bastrop-city-tx",
      "bastrop-tx",
      "bastrop-development-code",
      "bastrop-per-parcel-record",
    ]) {
      const text = setbackPendingDisclosure({ jurisdictionKey, district: "SF-1" });
      expect(text).toMatch(/layer 23/);
      expect(text).toMatch(/per-parcel record/);
      expect(text).toMatch(/Bastrop/);
    }
  });

  it("DOES NOT name layer 23 anywhere else — the six measured XD-4 subjects", () => {
    for (const [jurisdictionKey, district] of [
      ["woodcreek-tx", "Recreational"], // 48209:49000, the first XD-4 instance
      ["austin-tx", "SF-2"], // 48209:150937
      ["waco-tx", "R-2"], // 48309:187374
      ["luling-tx", "PD-LADERA"],
      ["lakeway-tx", "PUD (Eff. 7/19/04)"],
      ["robinson-tx", "PD"],
    ] as const) {
      const text = setbackPendingDisclosure({ jurisdictionKey, district });
      expect(text).not.toMatch(/layer-23|layer 23/i);
      // and it says something TRUE of this parcel instead of nothing
      expect(text).toContain(district);
      expect(text).toMatch(/verify with the city/i);
      expect(text.length).toBeGreaterThan(40);
    }
  });

  it("names the parcel's own city, not a template default", () => {
    expect(
      setbackPendingDisclosure({ jurisdictionKey: "woodcreek-tx", district: "Recreational" }),
    ).toContain("Woodcreek");
    expect(
      setbackPendingDisclosure({
        jurisdictionKey: "dripping-springs-tx",
        district: "SF-2",
      }),
    ).toContain("Dripping Springs");
  });

  it("still says something usable when the payload carries no jurisdiction", () => {
    const text = setbackPendingDisclosure({ jurisdictionKey: null, district: null });
    expect(text).not.toMatch(/layer-23|layer 23/i);
    expect(text).toMatch(/verify with the city/i);
    expect(text).toContain("this parcel's district");
  });

  it("renders two different sentences for Bastrop and for a Hays parcel (the whole defect in one assertion)", () => {
    const bastrop = setbackPendingDisclosure({
      jurisdictionKey: "bastrop-tx",
      district: "SF-1",
    });
    const hays = setbackPendingDisclosure({
      jurisdictionKey: "woodcreek-tx",
      district: "Recreational",
    });
    expect(bastrop).not.toBe(hays);
  });
});
