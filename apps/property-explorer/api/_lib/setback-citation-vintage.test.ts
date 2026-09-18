// P-270 (OPS-24 X11) — unit tests for the ONE place that decides whether a
// setback citation's effective date was readable AT SOURCE and what the
// surface says when it was not. Pure functions: no DOM, no network.
//
// The tests are grouped by the four questions the dispatch asks a lane to be
// able to answer, and each group carries the falsifier it is meant to trip:
//
//   1. THE DECISION IS IN ONE PLACE — the exact sentence is pinned HERE, so a
//      drift between this repo and legacy-design-tools' copy is a failing test
//      rather than a silent difference in what the customer reads.
//   2. THE THREE STATES ARE THREE — absent-at-source, unparseable and
//      never-looked are asserted apart from each other, so collapsing any two
//      into one boolean fails.
//   3. THE ROW IS NEVER PUBLISHED WITHOUT A CITATION, AND NEVER ON A READABLE
//      DATE — the agreeing control, asserted on both sides.
//   4. THE DATE IS NEVER DEFAULTED — every unreadable case asserts
//      `sourceDate === null`, so introducing a fallback date fails here.

import { describe, it, expect } from "vitest";
import {
  NEVER_LOOKED_DATE_READ,
  SETBACK_CITATION_VINTAGE_TOKEN,
  SETBACK_CITATION_VINTAGE_UNREADABLE_NOTE,
  disclosureWithCitationVintage,
  isStrictIsoDate,
  readSetbackDateAtSource,
  readSetbackDateFromRowAtSource,
  setbackCitationVintageRow,
  stateFromWireBasis,
  type SetbackDateReadState,
} from "./setback-citation-vintage";

const CITATION = "https://library.municode.com/tx/pflugerville/ordinances/2026-04-14";

describe("P-270 pin — the one customer sentence", () => {
  /**
   * THE DRIFT GUARD. legacy-design-tools'
   * `artifact/api-server/src/lib/buildableEnvelope/setbackCitationVintage.ts`
   * pins this identical literal in its own test. If either repo edits the
   * sentence alone, exactly one of the two suites fails: the customer cannot
   * be told two different things about one rule.
   */
  it("is byte-identical to the literal legacy-design-tools pins", () => {
    expect(SETBACK_CITATION_VINTAGE_UNREADABLE_NOTE).toBe(
      "Setback rule vintage unknown — the rule is served undated, not as current. Verify with the city.",
    );
  });

  it("names the consequence and the next step, and states no date of its own", () => {
    // A date here would enter the probe's disclosure-text fallback and read as
    // a real vintage — the exact silent pick this lane removes.
    expect(SETBACK_CITATION_VINTAGE_UNREADABLE_NOTE).not.toMatch(/\d{4}/);
    expect(SETBACK_CITATION_VINTAGE_UNREADABLE_NOTE).toContain("not as current");
    expect(SETBACK_CITATION_VINTAGE_UNREADABLE_NOTE).toContain("Verify with the city.");
  });

  it("publishes under the vocabulary token the conflict row is keyed by", () => {
    expect(SETBACK_CITATION_VINTAGE_TOKEN).toBe("setback-citation-vintage-unreadable");
  });
});

describe("P-270 — reading a date AT SOURCE", () => {
  it("a strict yyyy-mm-dd in a PRESENT key reads as `read`, carrying the date", () => {
    expect(readSetbackDateAtSource({ present: true, value: "2026-04-14" })).toEqual({
      sourceDate: "2026-04-14",
      state: "read",
    });
  });

  it("a key that is MISSING reads as absent-at-source, not unparseable", () => {
    expect(readSetbackDateAtSource({ present: false, value: undefined })).toEqual({
      sourceDate: null,
      state: "unreadable-absent-at-source",
    });
  });

  it("a PRESENT key that is explicitly null reads as absent-at-source: the source states it carries no date", () => {
    expect(readSetbackDateAtSource({ present: true, value: null })).toEqual({
      sourceDate: null,
      state: "unreadable-absent-at-source",
    });
  });

  it("a POPULATED key this module will not accept as a date reads as unparseable — a different defect with a different fix", () => {
    for (const bad of ["April 2026", "2026-4-1", "2026", "not a date", "", "2026-13-01"]) {
      expect(readSetbackDateAtSource({ present: true, value: bad })).toEqual({
        sourceDate: null,
        state: "unreadable-unparseable",
      });
    }
  });

  it("NEVER falls back to a default date: every unreadable read carries sourceDate null", () => {
    // The dispatch's item 4. A defaulted date would enter a most-current-wins
    // comparison and silently win or lose it.
    const reads = [
      readSetbackDateAtSource({ present: false, value: undefined }),
      readSetbackDateAtSource({ present: true, value: null }),
      readSetbackDateAtSource({ present: true, value: "garbage" }),
      NEVER_LOOKED_DATE_READ,
      stateFromWireBasis("unreadable"),
      stateFromWireBasis(undefined),
    ];
    for (const read of reads) expect(read.sourceDate).toBeNull();
  });

  it("reads the first PRESENT key out of a companion row, so a null first key is not skipped for a later value", () => {
    expect(
      readSetbackDateFromRowAtSource(
        { effectiveDate: null, effective_date: "2026-04-14" },
        ["effectiveDate", "effective_date"],
      ),
    ).toEqual({ sourceDate: null, state: "unreadable-absent-at-source" });
  });

  it("reads the source's own snake_case spelling when that is the key present", () => {
    expect(
      readSetbackDateFromRowAtSource({ effective_date: "2026-04-14" }, [
        "effectiveDate",
        "effective_date",
      ]),
    ).toEqual({ sourceDate: "2026-04-14", state: "read" });
  });

  it("a row with none of the keys is absent-at-source (the rail WAS consulted and stated nothing)", () => {
    expect(readSetbackDateFromRowAtSource({ citationUrl: CITATION }, ["effectiveDate"])).toEqual({
      sourceDate: null,
      state: "unreadable-absent-at-source",
    });
  });
});

describe("P-270 — strict ISO, deliberately not Date.parse", () => {
  it("accepts only strict yyyy-mm-dd", () => {
    expect(isStrictIsoDate("2026-04-14")).toBe(true);
    expect(isStrictIsoDate("2024-02-29")).toBe(true); // a real leap day
    expect(isStrictIsoDate("2026-4-14")).toBe(false);
    expect(isStrictIsoDate("2026-04-14T00:00:00Z")).toBe(false);
    expect(isStrictIsoDate("April 14, 2026")).toBe(false);
    expect(isStrictIsoDate(20260414)).toBe(false);
    expect(isStrictIsoDate(null)).toBe(false);
  });

  it("rejects a roll-forward day that Date.parse would have accepted as a real date", () => {
    // `Date.parse("2026-02-31")` rolls to March. Without the round-trip check
    // a bad value in a good field would read as a readable date and enter a
    // most-current-wins comparison.
    expect(isStrictIsoDate("2026-02-31")).toBe(false);
    expect(isStrictIsoDate("2026-02-29")).toBe(false); // 2026 is not a leap year
  });
});

describe("P-270 — the conflict row", () => {
  const unreadable = (state: SetbackDateReadState = "unreadable-absent-at-source") => ({
    sourceDate: null,
    state,
  });

  it("THE AGREEING CONTROL: a readable date publishes NO row", () => {
    expect(
      setbackCitationVintageRow({
        date: { sourceDate: "2026-04-14", state: "read" },
        citationUrl: CITATION,
        sourceLabel: "parcel_record setbackRules (record)",
      }),
    ).toBeNull();
  });

  it("publishes no row when there is no citation: there is nothing to qualify", () => {
    for (const url of [null, undefined, "", "   "]) {
      expect(
        setbackCitationVintageRow({ date: unreadable(), citationUrl: url, sourceLabel: "x" }),
      ).toBeNull();
    }
  });

  it("carries the state, the citation it is about, the source label and the one sentence", () => {
    const row = setbackCitationVintageRow({
      date: unreadable("unreadable-unparseable"),
      citationUrl: CITATION,
      sourceLabel: "parcel_record setbackRules (record)",
    });
    expect(row).toEqual({
      kind: SETBACK_CITATION_VINTAGE_TOKEN,
      state: "unreadable-unparseable",
      sourceLabel: "parcel_record setbackRules (record)",
      citationUrl: CITATION,
      note: SETBACK_CITATION_VINTAGE_UNREADABLE_NOTE,
    });
  });

  it("KEEPS THE THREE STATES APART — the same input differing only in state yields three different rows", () => {
    const states: SetbackDateReadState[] = [
      "unreadable-absent-at-source",
      "unreadable-unparseable",
      "unreadable-never-looked",
    ];
    const rows = states.map((state) =>
      setbackCitationVintageRow({ date: unreadable(state), citationUrl: CITATION, sourceLabel: null }),
    );
    expect(rows.map((r) => r?.state)).toEqual(states);
    expect(new Set(rows.map((r) => r?.state)).size).toBe(3);
    // ...and the note is deliberately the SAME sentence for all three, so the
    // cause lives only in the machine-readable member.
    expect(new Set(rows.map((r) => r?.note)).size).toBe(1);
  });

  it("a missing source label is null, never the string `undefined`", () => {
    const row = setbackCitationVintageRow({
      date: unreadable(),
      citationUrl: CITATION,
      sourceLabel: "  ",
    });
    expect(row?.sourceLabel).toBeNull();
  });
});

describe("P-270 — the disclosure", () => {
  const row = () =>
    setbackCitationVintageRow({
      date: { sourceDate: null, state: "unreadable-absent-at-source" },
      citationUrl: CITATION,
      sourceLabel: null,
    });

  it("appends the sentence to whatever disclosure the envelope already carries", () => {
    expect(disclosureWithCitationVintage("Geometry is advisory.", row())).toBe(
      `Geometry is advisory. ${SETBACK_CITATION_VINTAGE_UNREADABLE_NOTE}`,
    );
  });

  it("is the sentence alone when the envelope had no disclosure", () => {
    expect(disclosureWithCitationVintage(null, row())).toBe(
      SETBACK_CITATION_VINTAGE_UNREADABLE_NOTE,
    );
  });

  it("NO ROW: returns the disclosure unchanged, and `undefined` when there was none", () => {
    // This is what keeps a payload with a readable date (or no citation at all)
    // byte-identical to what it was before this lane.
    expect(disclosureWithCitationVintage("Geometry is advisory.", null)).toBe(
      "Geometry is advisory.",
    );
    expect(disclosureWithCitationVintage(null, null)).toBeUndefined();
    expect(disclosureWithCitationVintage("   ", null)).toBeUndefined();
  });
});

describe("P-270 — the atom-chain wire, where two causes cannot be told apart", () => {
  it("a basis that says `unreadable` reads as absent-at-source: the source states no readable date", () => {
    expect(stateFromWireBasis("unreadable")).toEqual({
      sourceDate: null,
      state: "unreadable-absent-at-source",
    });
  });

  it("no basis at all is never-looked: the atom was minted before the date read existed", () => {
    expect(stateFromWireBasis(undefined)).toEqual(NEVER_LOOKED_DATE_READ);
    expect(stateFromWireBasis(null)).toEqual(NEVER_LOOKED_DATE_READ);
    expect(stateFromWireBasis("")).toEqual(NEVER_LOOKED_DATE_READ);
  });

  it("does not invent a fourth state to represent its own ignorance of the wire", () => {
    // Bounded and named rather than papered over: on this one wire the two
    // causes collapse, so the module picks the honest weaker one instead of a
    // member that would claim a distinction it cannot see.
    const state = stateFromWireBasis("unreadable").state;
    expect([
      "read",
      "unreadable-absent-at-source",
      "unreadable-unparseable",
      "unreadable-never-looked",
    ]).toContain(state);
    expect(state).not.toBe("read");
  });
});
