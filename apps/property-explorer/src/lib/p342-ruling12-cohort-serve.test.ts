// P-342 Task 4 — the RULING 12 COHORT on the SERVING surface.
//
// `_decisions/2026-09-18_phase0_closeout_rulings.md` (OPS-16 A-215) Ruling 12: the
// atoms the P-263 movement census cannot classify are "withheld as unverified on every
// surface and never served as the legacy 'Setbacks consume the lot' claim", and their
// proper re-derivation is P-343. The census measured that cohort at 30,434 atoms and
// named its reason classes (`_inbox/2026-09-17_p260-p263_p263-movement-census.json`,
// re-measured by this lane in CP2).
//
// This file is the surface half of that ruling, on the shapes the STORE ACTUALLY
// CONTAINS rather than on one hand-picked sentence:
//
//   - reason `no per-parcel layer-23 setback row`  — 1,948 atoms (Bastrop), the
//     largest single reason class in the cohort;
//   - reason `edge N: …`                           — the failed-computation family the
//     dispatch samples ("edge 0: R32 0ft != expected 15ft for role front");
//   - reason ABSENT                                — 26,598 of the 30,434 atoms. This is
//     the dominant shape and the one no reason-shaped gate can see, which is why the
//     assertion below is the whole-payload string search and not a per-branch one.
//
// Both directions are pinned, per DEV_PROCESS 2.2: every withholding assertion is
// paired with the same atom carrying the depth-warm promotion marker, so the fixture
// proves the gate is PROMOTION and not a branch that refuses everything. That paired
// case is the RESIDUAL this lane measured as empty on record: 0 of the 30,434 carry the
// marker, so no member of the cohort reaches the claim branch today. It is asserted
// here on purpose — if a promoted, reason-less `no-buildable-area` atom ever appears in
// the cohort, this fixture is where the surfaces' remaining gap becomes visible.

import { describe, expect, it } from "vitest";

import {
  adaptAtomChainToBakedFacets,
  DEPTH_WARM_PROMOTION_MARKER,
  type PropertyAtomChain,
} from "../../api/_lib/atom-chain-to-facets";

const LEGACY_CLAIM = "Setbacks consume the lot";

/** The real 48209 shape: district + codified setback table, envelope atom unpromoted. */
function cohortChain(reason: string | undefined, promotion?: string): PropertyAtomChain {
  return {
    parcelNodeId: "48209:97658",
    zoningFact: {
      district: "SF-6",
      sourceAdapter: "txgio-zoning-stamp:san-marcos-tx",
      extractedAt: "2026-09-02T14:45:16.934Z",
    },
    setbackRule: {
      front: 25,
      side: 5,
      rear: 20,
      sideCornerFt: 15,
      districtCode: "SF-6",
    },
    buildableEnvelope: {
      outcome: {
        kind: "no-buildable-area",
        ...(reason === undefined ? {} : { reason }),
      },
      ...(promotion === undefined ? {} : { depthWarmPromotion: promotion }),
    },
    atoms: [{}, {}, {}],
  } as PropertyAtomChain;
}

const COHORT: Array<{ name: string; reason: string | undefined; atoms: string }> = [
  {
    name: "reason absent — 26,598 of the 30,434",
    reason: undefined,
    atoms: "23,712 Hays + 2,886 Caldwell",
  },
  {
    name: "no per-parcel layer-23 setback row — 1,948 atoms, the largest named class",
    reason: "no per-parcel layer-23 setback row",
    atoms: "Bastrop",
  },
  {
    name: "the failed-computation family the dispatch samples",
    reason: "edge 0: R32 0ft != expected 15ft for role front",
    atoms: "Bastrop",
  },
  {
    name: "a labeling decline that names no absence of law or data",
    reason: "fresh labeling produced no front edge",
    atoms: "Bastrop (232)",
  },
];

describe("P-342 Task 4 — Ruling 12's cohort is never served the legacy claim", () => {
  for (const shape of COHORT) {
    it(`withholds the legacy claim for: ${shape.name}`, () => {
      const resp = adaptAtomChainToBakedFacets(cohortChain(shape.reason));
      expect(resp).not.toBeNull();

      // The strongest form of the ruling, over the WHOLE payload and not one field:
      // no field of the response may carry the sentence, whatever branch produced it.
      expect(JSON.stringify(resp)).not.toContain(LEGACY_CLAIM);

      const envelope = resp!.facets.envelope;
      expect(envelope?.status).not.toBe("no-buildable-area");
      expect(envelope?.emptyReason).toBeUndefined();
      // The figure goes with the claim: an unverified zero is never served as fact.
      expect(envelope?.buildableAreaPct).toBeUndefined();
      expect(envelope?.buildableAreaSqFt).toBeUndefined();
    });
  }

  it("serves the ruled setback distances even while the claim is withheld (the refusal is not an over-refusal)", () => {
    const resp = adaptAtomChainToBakedFacets(cohortChain(undefined));
    expect(resp!.facets.envelope?.setbacks).toEqual({
      front_ft: 25,
      side_ft: 5,
      rear_ft: 20,
      side_interior_ft: 5,
      side_corner_ft: 15,
    });
  });

  it("RESIDUAL, pinned: the SAME atom WITH the promotion marker does reach the claim branch", () => {
    // This is the gap between the ruling's words ("no computed zero") and the axis the
    // surfaces implement (depth-warm promotion). The lane measured 0 of the 30,434 in
    // this state, so Ruling 12 holds today; the assertion keeps the gap visible instead
    // of leaving it to be rediscovered, and it is the falsifier for P-343.
    const promoted = adaptAtomChainToBakedFacets(
      cohortChain(undefined, DEPTH_WARM_PROMOTION_MARKER),
    );
    expect(promoted!.facets.envelope?.status).toBe("no-buildable-area");
    expect(promoted!.facets.envelope?.buildableAreaPct).toBe(0);
    expect(promoted!.facets.envelope?.emptyReason).toContain(LEGACY_CLAIM);
    // A claim WITHOUT a reason is what escapes: a reason diverts to the decline branch
    // before the claim branch is reached, promotion or not.
    const promotedWithReason = adaptAtomChainToBakedFacets(
      cohortChain("no per-parcel layer-23 setback row", DEPTH_WARM_PROMOTION_MARKER),
    );
    expect(JSON.stringify(promotedWithReason)).not.toContain(LEGACY_CLAIM);
  });
});
