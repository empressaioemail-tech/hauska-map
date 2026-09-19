/**
 * P-340 — the card's codified table is the ONE published corpus.
 *
 * This suite replaces `codified-setback-from-zoning.test.ts`, which pinned the
 * card's own four vendored JSON tables (`setback-tables/*.json`, now retired
 * by decline). It keeps that suite's measured rows — so a corpus table
 * regressing on a row this repo already relied on fails here — and adds the
 * two properties the vendored copy could not have: the card's table set is the
 * route's table set, and the exact-row matcher has NO prefix fallback (the
 * `SF` -> `SF-4A` crossing that produced the two Austin `PANEL-DRAW-TABLE-DISAGREE`
 * subjects is a prefix match, and it is refused here).
 */

import { describe, expect, it } from "vitest";

import {
  codifiedScalarsFromRow,
  corpusDistrictRow,
  corpusSetbackTable,
  hasExactCorpusDistrictRow,
  jurisdictionRequiresPerParcelSetbackRecord,
  normalizeJurisdictionKey,
  PER_PARCEL_RECORD_ONLY_SETBACK_KEYS,
} from "./setback-corpus-table";

describe("corpusDistrictRow", () => {
  it("resolves the rows the retired vendored tables served, with the corpus's own values", () => {
    const cases: Array<[string, string, ReturnType<typeof codifiedScalarsFromRow>]> = [
      ["austin-tx", "SF-3", { front_ft: 25, side_ft: 5, rear_ft: 10, side_corner_ft: 15 }],
      ["pflugerville-tx", "SF-S", { front_ft: 25, side_ft: 7.5, rear_ft: 20, side_corner_ft: 15 }],
      ["elgin-development-code", "R-1", { front_ft: 25, side_ft: 7.5, rear_ft: 10, side_corner_ft: 15 }],
      ["san-antonio-tx", "RE", { front_ft: 15, side_ft: 5, rear_ft: 30, side_corner_ft: 5 }],
    ];
    for (const [jkey, code, expected] of cases) {
      const row = corpusDistrictRow(corpusSetbackTable(jkey), code);
      expect(row, `${jkey} ${code}`).not.toBeNull();
      expect(codifiedScalarsFromRow(row!), `${jkey} ${code}`).toEqual(expected);
    }
  });

  it("matches the route's row selection: normalized exact first, then an unambiguous prefix", () => {
    const table = corpusSetbackTable("austin-tx");
    expect(corpusDistrictRow(table, "SF-3")?.district_name).toBe("SF-3 Family Residence");
    // Punctuation is not part of a code: the record rail's own `R2` spelling
    // reaches the corpus's `R-2 Suburban Residential` row (measured, Buda
    // `48209:140047`), exactly as the route's `normalizeCode` reaches it.
    expect(corpusDistrictRow(corpusSetbackTable("buda-tx"), "R2")?.district_name).toBe(
      "R-2 Suburban Residential",
    );
    expect(corpusDistrictRow(corpusSetbackTable("kyle-tx"), "R-1-A")?.district_name).toBe(
      "R-1-A Single-Family Attached",
    );
    // The measured P-340 crossing: `SF` names six Austin rows, so it names
    // none. The pre-P-340 route crossed it into the LONGEST match (`SF-4A`,
    // 15/3.5/5/10) for two parcels whose own city layer says `SF-3`/`SF-2`.
    expect(corpusDistrictRow(table, "SF")).toBeNull();
    expect(hasExactCorpusDistrictRow("austin-tx", "SF")).toBe(false);
    expect(corpusDistrictRow(table, "")).toBeNull();
    expect(corpusDistrictRow(null, "SF-3")).toBeNull();
  });

  it("resolves an unambiguous suffix variant by prefix, and refuses a plural one", () => {
    // A one-row jurisdiction still rows its own code exactly (`PD-Z`), which is
    // what keeps Smithville's real row out of the planned-development refusal.
    expect(corpusDistrictRow(corpusSetbackTable("smithville-tx"), "PD-Z")?.district_name).toBe(
      "PD-Z Zero Lot Line Garden Home District",
    );
    // ...and `PD` is NOT that row: names four-plus Kyle rows and no Smithville
    // row of its own. The gate's exact-only half is what refuses it.
    expect(hasExactCorpusDistrictRow("smithville-tx", "PD")).toBe(false);
    expect(hasExactCorpusDistrictRow("austin-tx", "PD")).toBe(false);
    // Kyle's `R-1` prefixes four rows (`R-1-1`, `R-1-2`, `R-1-3`, `R-1-A`), so
    // it names none of them; the full codes resolve exactly.
    const kyle = corpusSetbackTable("kyle-tx");
    expect(corpusDistrictRow(kyle, "R-1")).toBeNull();
    expect(corpusDistrictRow(kyle, "R-1-3")?.district_name).toBe(
      "R-1-3 Single-Family Residential 3",
    );
    // Punctuation is not part of a code in either direction (`R1-3` is `R13`).
    expect(corpusDistrictRow(kyle, "R1-3")?.district_name).toBe(
      "R-1-3 Single-Family Residential 3",
    );
  });

  it("knows the per-parcel-record-only jurisdictions and nothing else", () => {
    for (const key of PER_PARCEL_RECORD_ONLY_SETBACK_KEYS) {
      expect(jurisdictionRequiresPerParcelSetbackRecord(key)).toBe(true);
      expect(jurisdictionRequiresPerParcelSetbackRecord(key.replace(/-/g, "_"))).toBe(true);
    }
    expect(jurisdictionRequiresPerParcelSetbackRecord("austin-tx")).toBe(false);
    expect(jurisdictionRequiresPerParcelSetbackRecord(null)).toBe(false);
  });

  it("normalizes jurisdiction keys the corpus's own way", () => {
    expect(normalizeJurisdictionKey("Buda_TX")).toBe("buda-tx");
    expect(normalizeJurisdictionKey("  ")).toBeNull();
    expect(corpusSetbackTable("buda-tx")).not.toBeNull();
    expect(corpusSetbackTable("no-such-city-tx")).toBeNull();
  });
});
