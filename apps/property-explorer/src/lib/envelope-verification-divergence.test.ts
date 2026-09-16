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
import { isDepthWarmPromoted, type PropertyAtomChain } from "../../api/_lib/atom-chain-to-facets";
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
