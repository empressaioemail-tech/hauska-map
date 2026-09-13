import { describe, expect, it } from "vitest";

import { ownerFactFromCortexRoot } from "./atom-chain-to-facets";

/**
 * OPS-23 P-152 lane 4 (p152-slate), mission item 2: "the panel's dollar
 * rails and owner are gated in the BFF the same way the report's are."
 *
 * Live verification (2026-09-13, anonymous GET
 * https://smartsite.cloud/api/spine/property-atoms/<id>/facets, all five
 * OPS-23 probe parcels) found this ALREADY TRUE for `ownerFact` today —
 * cortex (legacy-design-tools `ownerFactRead.ts`) already emits
 * `{state:"refused", code:"studio-gated", reason:"owner-fact is Studio or
 * Team only. Anonymous, free, Solo, unlock, and identified-only GET have no
 * owner body."}` and this BFF's `ownerFactFromCortexRoot` (unlike the
 * cadRoll dollar fields before the P152-PANEL fix in
 * `atom-chain-to-facets.cadroll.test.ts`) already accepts any `state`
 * of "present" | "absent" | "refused" generically via `isOwnerFactWire`, so
 * the refusal has never had a collapse-to-undefined bug to fix here.
 *
 * This module had ZERO test coverage for that passthrough before this
 * lane (grep-confirmed: no test file referenced `ownerFactFromCortexRoot`,
 * `isOwnerFactWire`, or `withOwnerFact`). This test pins the already-correct,
 * already-live behavior so a future change to `isOwnerFactWire` or its
 * refused-shape handling cannot silently regress it back to a leak or a
 * silent collapse — the same regression class `atom-chain-to-facets.cadroll
 * .test.ts` already guards for the four dollar fields.
 */
describe("ownerFactFromCortexRoot — studio-gated refusal passthrough (OPS-23 P-152 lane 4)", () => {
  it("passes a studio-gated ownerFact refusal through unchanged (matches the live shape captured 2026-09-13 for 48021:34049)", () => {
    const liveRefusalShape = {
      state: "refused" as const,
      code: "studio-gated",
      source: "owner-fact",
      tried: ["48021:34049", "48021:34049.00000000"],
      reason:
        "owner-fact is Studio or Team only. Anonymous, free, Solo, unlock, and identified-only GET have no owner body.",
      entityType: "owner-fact",
      provenanceClass: "Record",
      subjectKind: "extensional",
      chainAnchoring: "backfill",
      serveLayer: "owner",
    };

    const result = ownerFactFromCortexRoot({ ownerFact: liveRefusalShape });

    expect(result).toEqual(liveRefusalShape);
  });

  it("still carries a present owner fact through unchanged (regression guard — granted callers must keep seeing the real value)", () => {
    const present = {
      state: "present" as const,
      source: "owner-fact",
      evaluatedAt: "2026-01-01T00:00:00.000Z",
    };

    const result = ownerFactFromCortexRoot({ ownerFact: present });

    expect(result).toEqual(present);
  });

  it("rejects a shape with no recognizable state — never fabricates an ownerFact", () => {
    const result = ownerFactFromCortexRoot({ ownerFact: { taxYear: 2026 } });

    expect(result).toBeUndefined();
  });

  it("returns undefined when the root carries no ownerFact key at all", () => {
    const result = ownerFactFromCortexRoot({ facets: {} });

    expect(result).toBeUndefined();
  });
});
