// apps/property-explorer/src/lib/envelope-verification-divergence.test.ts
//
// P-249 item 5 — THE DIVERGENCE TEST (this repo's leg).
//
// FOUR predicates in THREE repos read ONE fact: "is this parcel's buildable
// envelope backed by a VERIFIED atom?" (A-184's trap: four predicates, three
// repos, one fact.)
//
//   1. hauska-map   `isDepthWarmPromoted`            (atom-chain-to-facets.ts)  ← THIS FILE
//   2. legacy-design-tools `isEnvelopeAtomVerified`  (reconcileAtomEnvelope.ts)
//   3. legacy-design-tools `isMachineVerifyDiagnostic` (reconcileAtomEnvelope.ts, reason text)
//   4. doc_repo     `scripts/envelope-draw-gap.mjs`  (string and boolean forms)
//
// The fixture below is the shared declaration (`fixtureSet:
// "envelope-verification-v1"`, byte-identical in both product repos). A
// predicate edited ALONE fails here, on the case whose declared answer it now
// contradicts — which is the whole point: the four cannot silently drift.
//
// A fixture that only agreed with one side would be worthless, so the cases
// deliberately include both directions and the near misses (a version-shifted
// marker, a citation substring that is one letter short) that a loose
// predicate would wrongly promote.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  adaptAtomChainToBakedFacets,
  isDepthWarmPromoted,
  noDistrictDeclineBasis,
  type PropertyAtomChain,
} from "../../api/_lib/atom-chain-to-facets";
import { deriveBakedCardModel, type BakedFacetPayload } from "./baked-facets";
import { facetsNeedLiveEnvelopeDerive } from "./live-envelope-augment";

type Case = {
  id: string;
  atom: { depthWarmPromotion?: string | null; sourceCitation?: string | null } | null;
  reason: string | null;
  verified: boolean;
  machineVerifyDiagnostic: boolean;
  note: string;
};

type Fixture = {
  fixtureSet: string;
  purpose: string;
  casesSha256: string;
  cases: Case[];
};

const FIXTURE_PATH = new URL("./__fixtures__/envelope-verification.json", import.meta.url);
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as Fixture;

/** The chain shape `isDepthWarmPromoted` actually receives on the wire. */
function chainFor(c: Case): PropertyAtomChain {
  return {
    parcelNodeId: "48209:97658",
    buildableEnvelope: c.atom
      ? {
          outcome: { kind: "no-buildable-area", areaSqFt: 0, ...(c.reason ? { reason: c.reason } : {}) },
          ...(c.atom.depthWarmPromotion ? { depthWarmPromotion: c.atom.depthWarmPromotion } : {}),
          ...(c.atom.sourceCitation ? { sourceCitation: c.atom.sourceCitation } : {}),
        }
      : null,
  } as PropertyAtomChain;
}

/**
 * The fixture chain as the ADAPTER receives it. `atomChainIsUsable` gates the
 * route on a zoning fact or a non-empty atom list, and the fixture's predicate
 * chains carry neither (they model the `buildableEnvelope` atom alone), so an
 * inert probe atom is added. The adapter reads `buildableEnvelope` on this
 * leg, so the probe changes nothing else.
 */
function adapterChainFor(c: Case): PropertyAtomChain {
  return { ...chainFor(c), atoms: [{ kind: "p303-fixture-probe" }] } as PropertyAtomChain;
}

describe("envelope-verification fixture — the shared declaration", () => {
  it("is the declared shared set, unedited (editing a case without updating casesSha256 fails)", () => {
    expect(fixture.fixtureSet).toBe("envelope-verification-v1");
    expect(createHash("sha256").update(JSON.stringify(fixture.cases)).digest("hex")).toBe(
      fixture.casesSha256,
    );
  });

  it("declares BOTH answers on every case (a fixture that only says 'verified' cannot catch a loose reason predicate)", () => {
    for (const c of fixture.cases) {
      expect(typeof c.verified, `${c.id}.verified`).toBe("boolean");
      expect(typeof c.machineVerifyDiagnostic, `${c.id}.machineVerifyDiagnostic`).toBe("boolean");
    }
    // Not vacuous: the set carries at least one case on each side of each question.
    expect(fixture.cases.some((c) => c.verified)).toBe(true);
    expect(fixture.cases.some((c) => !c.verified)).toBe(true);
    expect(fixture.cases.some((c) => c.machineVerifyDiagnostic)).toBe(true);
    expect(fixture.cases.some((c) => !c.machineVerifyDiagnostic)).toBe(true);
  });
});

describe("hauska-map isDepthWarmPromoted — agrees with every declared answer", () => {
  for (const c of fixture.cases) {
    it(`${c.id}: verified=${c.verified}`, () => {
      expect(isDepthWarmPromoted(chainFor(c))).toBe(c.verified);
    });
  }

  it("reads the atom FIELD depthWarmPromotion — there is no depthWarmPromoted field on the atom", () => {
    // A-184's trap: the map writes a flag by that other name into its own
    // output, which nothing reads. This predicate must not start reading it.
    const withWronglyNamedField = {
      parcelNodeId: "48209:97658",
      buildableEnvelope: { outcome: { kind: "no-buildable-area" }, depthWarmPromoted: true },
    } as unknown as PropertyAtomChain;
    expect(isDepthWarmPromoted(withWronglyNamedField)).toBe(false);
  });
});

describe("P-249 branch shape — the unverified cases the fixture declares are the ones that now draw", () => {
  /** Exactly what `atom-chain-to-facets.ts` now serves on the unverified branch. */
  const unverifiedBranch: BakedFacetPayload = {
    parcelNodeId: "48209:97658",
    envelope: {
      status: "ok",
      declineReason: "envelope-unverified",
      figureWithheld: true,
      district: "SF-6",
      setbacks: { front_ft: 25, side_ft: 5, rear_ft: 20 },
      approximate: true,
      provisional: true,
      disclosure:
        "Buildable area withheld — this parcel's buildable-envelope outcome has not " +
        "passed ground-truth verification (no confirmed road-frontage edge labeling).",
    },
    facetCoverage: { envelope: true },
  };

  it("is the shape that fires the live derive (the only source of the drawn polygon)", () => {
    expect(facetsNeedLiveEnvelopeDerive(unverifiedBranch)).toBe(true);
  });

  it("prints NO figure through the baked-payload card projection", () => {
    // Before the live pass: setbacks on record, no area, no geometry yet.
    const before = deriveBakedCardModel(unverifiedBranch);
    expect(before.envelopeStatus).toBe("ok");
    expect(before.buildablePct.value ?? "").not.toMatch(/\d/);
    // After the live pass: the modelled polygon is on the payload and the
    // card says so — still with no area figure it could have printed.
    const after = deriveBakedCardModel({
      ...unverifiedBranch,
      envelope: {
        ...unverifiedBranch.envelope!,
        geojson: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: { kind: "buildable-envelope", source: "live-derive" },
              geometry: {
                type: "Polygon",
                coordinates: [[[-97.32, 30.11], [-97.319, 30.11], [-97.319, 30.109], [-97.32, 30.11]]],
              },
            },
          ],
        },
      },
    } as BakedFacetPayload);
    expect(after.buildablePct.value ?? "").not.toMatch(/\d/);
    expect(after.buildableDisplayKind).not.toBe("buildable-with-area");
    // The branch token stays readable for surfaces and for this fixture.
    expect(after.envelopeDeclineReason).toBeNull();
    expect(after.envelopeStatus).toBe("ok");
  });
});

/**
 * P-303 (2026-09-17) — THE FIXTURE RUNS THROUGH THE DECLINE BRANCH.
 *
 * The fixture declares, per case, the PREDICATE answer ("is this atom's
 * envelope backed by a verified atom?"). P-249's map leg only ever asked the
 * predicate; it never checked that the not-onboarded cohort REACHES the
 * branch the predicate governs. It did not: the adapter's first branch
 * (`absenceKind === "no-zoning-stamp"`) refused before any district or
 * setback table was considered, so `_inbox/2026-09-17_p249_canary_proof.md`
 * recorded XD-2 as FAIL at the panel while LDT's own route drew the same
 * parcel. These cases therefore run every declared case through the ADAPTER
 * with a record-stamped district and a served setback table, and assert the
 * routing each case's own reason implies — so a future edit that re-routes a
 * class the fixture did not declare a draw for fails here, on the case that
 * contradicts it.
 *
 * The record stamp is the live XD-2 shape (`R-1B` / `waco-tx`); the axis
 * numbers are fixture scalars in the record's own shape, not a claim about
 * the live cells (this lane did not read them).
 */
describe("P-303 — the shared fixture runs through the decline branch", () => {
  /** The cases whose OWN declared reason is a no-district (stamp-gap) reason — the only ones a record stamp may re-route. */
  const NO_DISTRICT_CLASS_CASE_IDS = ["not-onboarded", "unzoned"];

  const recordStamp = {
    district: "R-1B",
    jurisdictionKey: "waco-tx",
    setbackAxisOverrides: { front_ft: 25, side_ft: 5, rear_ft: 25 },
  };

  it("the fixture's declared reason strings are exactly the ones the class predicate claims", () => {
    // Not vacuous: the class is declared by the fixture's reason text and the
    // predicate must agree, case by case.
    const declared = fixture.cases.filter((c) => c.reason !== null);
    expect(declared.length).toBeGreaterThan(0);
    for (const c of fixture.cases) {
      const basis = noDistrictDeclineBasis({ envelopeDeclineReason: c.reason });
      const inClass = NO_DISTRICT_CLASS_CASE_IDS.includes(c.id);
      expect(basis !== null, `${c.id} (reason: ${c.reason})`).toBe(inClass);
    }
    // The R32 diagnostic reason is never in the class: a named validation
    // complaint must not be re-routed by a district stamp.
    const r32 = fixture.cases.find((c) => c.id === "r32-mechanical-verify-diagnostic");
    expect(noDistrictDeclineBasis({ envelopeDeclineReason: r32!.reason })).toBeNull();
  });

  it("only the no-district class is re-routed by a payload whose record stamps a district and table", () => {
    for (const c of fixture.cases) {
      const resp = adaptAtomChainToBakedFacets(adapterChainFor(c), {
        recordZoningSetback: recordStamp,
      });
      expect(resp, c.id).not.toBeNull();
      const env = resp!.facets.envelope!;
      if (NO_DISTRICT_CLASS_CASE_IDS.includes(c.id)) {
        // The branch the fixture's own reason implies: drawn, figure withheld.
        expect(env.status, c.id).toBe("ok");
        expect(env.declineReason, c.id).toBe("envelope-unverified");
        expect(env.figureWithheld, c.id).toBe(true);
        expect(env.district, c.id).toBe("R-1B");
        expect(env.setbackSource, c.id).toBe("parcel-record");
        // and the drawn envelope is what fires the live derive (the polygon).
        expect(
          facetsNeedLiveEnvelopeDerive({
            parcelNodeId: resp!.parcelNodeId,
            envelope: env,
            facetCoverage: { envelope: true },
          } as BakedFacetPayload),
          c.id,
        ).toBe(true);
      } else {
        // Never promoted: verified atoms have nothing to un-verify, the R32
        // case is a named validation decline, and an absent atom has no
        // outcome to reconcile — none of them may wear a record-sourced draw.
        expect(env.setbackSource, c.id).not.toBe("parcel-record");
        expect(env.status, c.id).not.toBe("ok");
        expect(env.figureWithheld, c.id).toBeUndefined();
      }
    }
  });

  it("with NO district in the payload the same cases decline `no-zoning-stamp` and draw nothing (falsifier 2)", () => {
    for (const c of fixture.cases) {
      const resp = adaptAtomChainToBakedFacets(adapterChainFor(c));
      const env = resp!.facets.envelope!;
      expect(env.status, c.id).toBe("declined");
      expect(env.setbacks, c.id).toBeUndefined();
      expect(env.figureWithheld, c.id).toBeUndefined();
      expect(env.district, c.id).toBeUndefined();
      if (NO_DISTRICT_CLASS_CASE_IDS.includes(c.id)) {
        expect(env.declineReason, c.id).toBe("no-zoning-stamp");
      }
    }
  });
});
