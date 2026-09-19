/**
 * P-340 — what the CARD actually serves for the two measured defect classes,
 * through the real adapter (not through `setback-resolution.ts` directly).
 *
 * The divergence suite pins the DECISION; this suite pins the SERVED payload,
 * because the card's corner axis was dropped one layer below the decision —
 * `mapSetbacks` emitted `side_corner_ft` only when it differed from the side
 * yard, so a codified row whose corner IS a real distinct axis never reached
 * the panel even once the decision was right. Both halves of the fix are
 * asserted here:
 *
 *  - FIVE subjects: the codified row's corner is served even where the atom
 *    rule's own corner equals its side yard (Buda `R2`: row 15, atom 10).
 *  - THREE of those five are also R-1 CONFLICTS (both dates unreadable, values
 *    disagree), so the served envelope must carry `setbackSourceConflict` with
 *    both candidates and the pinned sentence appended to its disclosure. The
 *    two that agree must NOT carry it — an agreeing pair is not a conflict.
 */

import { describe, expect, it } from "vitest";

import { adaptAtomChainToBakedFacets } from "./atom-chain-to-facets";
import { SETBACK_SOURCE_CONFLICT_NOTE } from "./setback-source-conflict";

/** A chain whose envelope atom is in the warm-verify-decline shape the adapter serves. */
function chainWith(parcelNodeId: string, jurisdictionKey: string, district: string, rule: unknown) {
  return {
    parcelNodeId,
    zoningFact: {
      district,
      sourceAdapter: `txgio-zoning-stamp:${jurisdictionKey}`,
    },
    setbackRule: rule,
    buildableEnvelope: {
      sourceCitation: "depth-warm-verify-decline",
      warmVerifyDeclineCode: "front-orientation",
      warmVerifyDecline: "front edge index 2 != fresh 0",
      outcome: { kind: "no-buildable-area", reason: "front edge index 2 != fresh 0" },
    },
  };
}

describe("P-340 — the card serves the codified corner axis", () => {
  it("serves Buda R2's row corner (15) although the atom rule's corner equals its side yard (10)", () => {
    const out = adaptAtomChainToBakedFacets(
      chainWith("48209:140047", "buda-tx", "R2", {
        front: 20,
        side: 10,
        rear: 25,
        sideCornerFt: 10,
        districtCode: "R2",
        sourceAdapter: "cortex-tier1-snapshot-breadth-bake",
      }),
    );
    expect(out?.facets.envelope?.status).toBe("ok");
    expect(out?.facets.envelope?.setbacks?.front_ft).toBe(20);
    expect(out?.facets.envelope?.setbacks?.side_ft).toBe(10);
    expect(out?.facets.envelope?.setbacks?.rear_ft).toBe(25);
    // THE measured defect: this was absent on the card and 15 on the route.
    expect(out?.facets.envelope?.setbacks?.side_corner_ft).toBe(15);
  });

  it("serves Dripping Springs SF-2's corner (15), where the atom rule agrees with the row", () => {
    const out = adaptAtomChainToBakedFacets(
      chainWith("48209:142415", "dripping-springs-tx", "SF-2", {
        front: 25,
        side: 15,
        rear: 25,
        sideCornerFt: 15,
        districtCode: "SF-2",
        sourceAdapter: "cortex-tier1-snapshot-breadth-bake",
      }),
    );
    expect(out?.facets.envelope?.setbacks).toMatchObject({
      front_ft: 25,
      side_ft: 15,
      rear_ft: 25,
      side_corner_ft: 15,
    });
  });

  it("serves San Marcos MU's corner (15) although the atom rule says 7.5", () => {
    const out = adaptAtomChainToBakedFacets(
      chainWith("48209:166141", "san-marcos-tx", "MU", {
        front: 25,
        side: 7.5,
        rear: 5,
        sideCornerFt: 7.5,
        districtCode: "MU",
        sourceAdapter: "cortex-tier1-snapshot-breadth-bake",
      }),
    );
    expect(out?.facets.envelope?.setbacks?.side_corner_ft).toBe(15);
  });
});

describe("P-340 — the card serves the R-1 conflict row", () => {
  it("declares both candidates when the sources disagree and both dates are unreadable", () => {
    const out = adaptAtomChainToBakedFacets(
      chainWith("48209:140047", "buda-tx", "R2", {
        front: 20,
        side: 10,
        rear: 25,
        sideCornerFt: 10,
        districtCode: "R2",
        sourceAdapter: "cortex-tier1-snapshot-baked-cad",
      }),
    );
    const row = out?.facets.envelope?.setbackSourceConflict;
    expect(row, "the conflict row must be served").toBeDefined();
    expect(row!.kind).toBe("setback-source-conflict");
    expect(row!.state).toBe("unreadable-absent-at-source");
    expect(row!.candidates).toHaveLength(2);
    expect(row!.candidates.map((c) => c.scalars.side_corner_ft).sort()).toEqual([10, 15]);
    // The sentence is appended to whatever the envelope already disclosed, so a
    // customer reads the value WITH its unsettledness.
    expect(out?.facets.envelope?.disclosure).toContain(SETBACK_SOURCE_CONFLICT_NOTE);
  });

  it("the agreeing control: no conflict row when the sources agree, even undated", () => {
    const out = adaptAtomChainToBakedFacets(
      chainWith("48209:142415", "dripping-springs-tx", "SF-2", {
        front: 25,
        side: 15,
        rear: 25,
        sideCornerFt: 15,
        districtCode: "SF-2",
        sourceAdapter: "cortex-tier1-snapshot-baked-cad",
      }),
    );
    expect(out?.facets.envelope?.setbackSourceConflict).toBeUndefined();
    expect(out?.facets.envelope?.disclosure ?? "").not.toContain(
      SETBACK_SOURCE_CONFLICT_NOTE,
    );
  });

  it("no conflict row for a chain with no usable atom rule (codified candidate alone)", () => {
    const out = adaptAtomChainToBakedFacets(
      chainWith("48209:142415", "dripping-springs-tx", "SF-2", null),
    );
    expect(out?.facets.envelope?.setbacks?.side_corner_ft).toBe(15);
    expect(out?.facets.envelope?.setbackSourceConflict).toBeUndefined();
  });
});
