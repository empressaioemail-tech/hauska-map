/**
 * P-340 — the R-1 conflict row's shape, its one customer sentence, and the
 * agreeing control that keeps it honest, on the CARD's copy of the rule.
 *
 * This is the card half of a paired pin. The sentence is pinned BYTE-FOR-BYTE
 * against legacy-design-tools' copy
 * (`artifacts/api-server/src/lib/buildableEnvelope/setbackSourceConflict.ts`),
 * exactly as the P-270 citation-vintage pair is: two repos, one literal, a test
 * in each, so a drift is a failing suite rather than a silent difference between
 * what the card tells a customer and what the drawing tells them. The row SHAPE
 * is pinned here too, because a pinned sentence on a row that lost its
 * `candidates` would still be a regression.
 */

import { describe, expect, it } from "vitest";

import { resolveCardSetbacks } from "./setback-resolution.js";
import {
  SETBACK_SOURCE_CONFLICT_NOTE,
  SETBACK_SOURCE_CONFLICT_TOKEN,
  disclosureWithSourceConflict,
  setbackSourceConflictRow,
  setbackSourceConflictUnreadableState,
  sourceConflictRowForResolution,
} from "./setback-source-conflict.js";

describe("SETBACK_SOURCE_CONFLICT_NOTE", () => {
  it("is the one pinned customer sentence (byte-identical to legacy-design-tools' copy)", () => {
    expect(SETBACK_SOURCE_CONFLICT_NOTE).toBe(
      "Setback sources disagree on this parcel and at least one source's effective date could not be read at source — both candidates are served and neither is settled. Verify with the city.",
    );
    expect(SETBACK_SOURCE_CONFLICT_TOKEN).toBe("setback-source-conflict");
    // The em dash is ONE U+2014, not a mojibake pair: the sentence is printed to
    // customers by both surfaces and a mangled dash is a visible defect that a
    // same-bytes comparison would happily carry across both copies.
    expect([...SETBACK_SOURCE_CONFLICT_NOTE].filter((c) => c === "\u2014")).toHaveLength(1);
    expect(SETBACK_SOURCE_CONFLICT_NOTE).not.toContain("\uFFFD");
  });
});

describe("setbackSourceConflictUnreadableState", () => {
  it("names the cause off the candidate that has one, not off the winner", () => {
    expect(setbackSourceConflictUnreadableState(null)).toBe("unreadable-never-looked");
    expect(setbackSourceConflictUnreadableState({ dateBasis: "unreadable" })).toBe(
      "unreadable-absent-at-source",
    );
    // A DATED winner disagreeing with an UNDATED candidate is still a conflict,
    // and the row must name the undated side's cause rather than the winner's
    // `ordinance-effective-date` (which is not an unreadable cause at all).
    expect(
      setbackSourceConflictUnreadableState({
        dateBasis: "ordinance-effective-date",
        conflict: {
          candidates: [
            { sourceDate: "2026-04-14", dateBasis: "ordinance-effective-date" },
            { sourceDate: null, dateBasis: "unreadable" },
          ],
        },
      }),
    ).toBe("unreadable-absent-at-source");
  });
});

describe("sourceConflictRowForResolution", () => {
  it("serves both candidates when the sources disagree and a date is unreadable", () => {
    // Measured P-340 subject: Buda `48209:140047`. The corpus row says the
    // corner is 15; the atom rule says 10; neither carries a readable date (no
    // corpus table for these seven jurisdictions has an `effectiveDate`, and the
    // atom has no `sourceVintage`). R-1: a conflict, both values served.
    const resolved = resolveCardSetbacks({
      jurisdictionKey: "buda-tx",
      districtCode: "R2",
      atomRule: {
        front: 20,
        side: 10,
        rear: 25,
        sideCornerFt: 10,
        districtCode: "R2",
        sourceVintage: null,
      },
    })!;
    expect(resolved.conflict).toBeDefined();
    const row = sourceConflictRowForResolution(resolved)!;
    expect(row.kind).toBe(SETBACK_SOURCE_CONFLICT_TOKEN);
    expect(row.state).toBe("unreadable-absent-at-source");
    expect(row.note).toBe(SETBACK_SOURCE_CONFLICT_NOTE);
    expect(row.candidates).toHaveLength(2);
    const cornerValues = row.candidates
      .map((c) => c.scalars.side_corner_ft)
      .sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(cornerValues).toEqual([10, 15]);
    // The tier-highest candidate is still SERVED (the interim stance both
    // surfaces take), disclosed rather than presented as settled.
    expect(resolved.scalars.side_corner_ft).toBe(15);
  });

  it("the agreeing control: an undated but AGREEING pair is not a conflict", () => {
    // Dripping Springs `48209:142415`: the row and the atom agree on all four
    // axes and both dates are unreadable. A row here would teach a customer to
    // distrust a value both sources agree on, so there must not be one.
    const resolved = resolveCardSetbacks({
      jurisdictionKey: "dripping-springs-tx",
      districtCode: "SF-2",
      atomRule: {
        front: 25,
        side: 15,
        rear: 25,
        sideCornerFt: 15,
        districtCode: "SF-2",
        sourceVintage: null,
      },
    })!;
    expect(resolved.conflict).toBeUndefined();
    expect(sourceConflictRowForResolution(resolved)).toBeNull();
  });

  it("declares nothing when there is no conflict, and never for one candidate", () => {
    expect(sourceConflictRowForResolution(null)).toBeNull();
    expect(
      setbackSourceConflictRow({
        conflict: {
          reason: "single candidate",
          candidates: [
            {
              sourceKind: "atom-chain",
              sourceLabel: "x",
              scalars: { front_ft: 1, side_ft: 1, rear_ft: 1 },
              sourceDate: null,
              dateBasis: "unreadable",
            },
          ],
        },
        state: "unreadable-absent-at-source",
      }),
    ).toBeNull();
  });
});

describe("disclosureWithSourceConflict", () => {
  it("appends the sentence, and is a no-op without a row", () => {
    expect(disclosureWithSourceConflict("Existing note.", null)).toBe("Existing note.");
    expect(disclosureWithSourceConflict(null, null)).toBeUndefined();
    expect(disclosureWithSourceConflict("", null)).toBeUndefined();
    const row = {
      kind: SETBACK_SOURCE_CONFLICT_TOKEN,
      state: "unreadable-absent-at-source" as const,
      reason: "r",
      candidates: [],
      note: SETBACK_SOURCE_CONFLICT_NOTE,
    };
    expect(disclosureWithSourceConflict("Existing note.", row)).toBe(
      `Existing note. ${SETBACK_SOURCE_CONFLICT_NOTE}`,
    );
    expect(disclosureWithSourceConflict(null, row)).toBe(SETBACK_SOURCE_CONFLICT_NOTE);
  });
});
