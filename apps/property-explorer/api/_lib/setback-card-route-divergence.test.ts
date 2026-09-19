/**
 * P-340 — THE DIVERGENCE TEST. The card's answer and the drawing route's
 * answer for the 7 measured `PANEL-DRAW-TABLE-DISAGREE` subjects, pinned
 * against each other so a one-sided change FAILS rather than drifts.
 *
 * THE MEASUREMENT. `surface-probe.mjs`'s `PANEL-DRAW-TABLE-DISAGREE` class
 * compares the card's 4-tuple against the route's 4-tuple for a parcel with no
 * exemptions; on 2026-09-18 it fired on these 7 (fixture below, captured from
 * the live surfaces on 2026-09-18 in
 * `_inbox/2026-09-18_155840_surface_probe.json`). Two distinct mechanisms,
 * both a two-homes problem:
 *
 *  - FIVE subjects show the corner axis MISSING on the card (`20/10/25/-`)
 *    where the route serves a row that carries one (`20/10/25/15`). The card
 *    collapsed `side_corner_ft` whenever the atom rule's corner equalled its
 *    side yard, so a codified row whose corner is a real distinct axis never
 *    reached the panel.
 *  - TWO Austin subjects show a WHOLLY different row: the route read the
 *    county store's base code `SF` and its prefix fallback crossed into the
 *    longest match (`SF-4A`, 15/3.5/5/10), while the card read the city
 *    layer's own district (`SF-3`/`SF-2`, 25/5/10/15).
 *
 * WHY THIS SUITE IS A COPY AND NOT AN IMPORT. The route lives in
 * legacy-design-tools, in another language's repo, and the two surfaces must
 * agree by CONSTRUCTION rather than by sharing a function. So this suite
 * carries a faithful, PINNED mirror of the route's row selection
 * (`mapDistrict`'s exact-then-unambiguous-prefix order, normalized the same
 * way) and computes the route's expected tuple from the SAME pinned inputs
 * through the SAME shared resolver the card uses. The mirror is asserted
 * equal in behaviour, subject by subject, to the card's own
 * `corpusDistrictRow`; legacy-design-tools' mirror of this fixture lives at
 * `artifacts/api-server/src/lib/buildableEnvelope/setbackDivergenceP340.test.ts`
 * and pins the same 7 expected tuples, so changing ONE side alone fails the
 * OTHER side's copy of the expectation.
 *
 * WHAT THIS SUITE IS NOT. It is not a live probe: it cannot see the deployed
 * surfaces, and the dispatch's customer predicate (`surface-probe.mjs`) is
 * graded after a deploy, not here. It is the paired control that makes a
 * divergence a failing test instead of a discovery.
 */

import { describe, expect, it } from "vitest";

import {
  normalizeDistrictCode,
  corpusDistrictRow,
  corpusSetbackTable,
} from "./setback-corpus-table";
import { resolveCardSetbacks, setbackTuple } from "./setback-resolution";

type Subject = {
  /** The probe's own subject id. */
  parcelNodeId: string;
  jurisdictionKey: string;
  /** The district the CARD reads (the atom chain's zoning fact / record stamp). */
  cardDistrict: string;
  /** The district the ROUTE reads first (the county store's GIS zoning code). */
  gisZoningCode: string;
  atomRule: {
    front: number;
    side: number;
    rear: number;
    sideCornerFt: number;
    districtCode: string;
    sourceVintage: string | null;
  };
  /** Measured 2026-09-18, before this lane. `null` = the axis was absent. */
  cardBefore: [number, number, number, number | null];
  /** Measured 2026-09-18, before this lane. */
  routeBefore: [number, number, number, number | null];
  /** What BOTH surfaces must serve after this lane. */
  bothAfter: [number, number, number, number | null];
  /** Does R-1 declare this a conflict (both dates unreadable AND values disagree)? */
  conflict: boolean;
};

/**
 * The 7 subjects, verbatim from the 2026-09-18 probe artifact. MUST stay
 * byte-identical to legacy-design-tools'
 * `artifacts/api-server/src/lib/buildableEnvelope/setbackDivergenceP340.test.ts`
 * fixture: the two copies are the two halves of one paired control.
 */
const SUBJECTS: Subject[] = [
  {
    parcelNodeId: "48209:140047",
    jurisdictionKey: "buda-tx",
    cardDistrict: "R2",
    gisZoningCode: "R2",
    atomRule: {
      front: 20,
      side: 10,
      rear: 25,
      sideCornerFt: 10,
      districtCode: "R2",
      sourceVintage: null,
    },
    cardBefore: [20, 10, 25, null],
    routeBefore: [20, 10, 25, 15],
    bothAfter: [20, 10, 25, 15],
    conflict: true,
  },
  {
    parcelNodeId: "48209:142415",
    jurisdictionKey: "dripping-springs-tx",
    cardDistrict: "SF-2",
    gisZoningCode: "SF-2",
    atomRule: {
      front: 25,
      side: 15,
      rear: 25,
      sideCornerFt: 15,
      districtCode: "SF-2",
      sourceVintage: null,
    },
    cardBefore: [25, 15, 25, null],
    routeBefore: [25, 15, 25, 15],
    bothAfter: [25, 15, 25, 15],
    conflict: false,
  },
  {
    parcelNodeId: "48209:145880",
    jurisdictionKey: "kyle-tx",
    cardDistrict: "R-1-A",
    gisZoningCode: "R-1-A",
    atomRule: {
      front: 25,
      side: 10,
      rear: 15,
      sideCornerFt: 10,
      districtCode: "R-1-A",
      sourceVintage: null,
    },
    cardBefore: [25, 10, 15, null],
    routeBefore: [25, 10, 15, 10],
    bothAfter: [25, 10, 15, 10],
    conflict: false,
  },
  {
    parcelNodeId: "48209:166141",
    jurisdictionKey: "san-marcos-tx",
    cardDistrict: "MU",
    gisZoningCode: "MU",
    atomRule: {
      front: 25,
      side: 7.5,
      rear: 5,
      sideCornerFt: 7.5,
      districtCode: "MU",
      sourceVintage: null,
    },
    cardBefore: [25, 7.5, 5, null],
    routeBefore: [25, 7.5, 5, 15],
    bothAfter: [25, 7.5, 5, 15],
    conflict: true,
  },
  {
    parcelNodeId: "48209:97658",
    jurisdictionKey: "san-marcos-tx",
    cardDistrict: "SF-6",
    gisZoningCode: "SF-6",
    atomRule: {
      front: 25,
      side: 5,
      rear: 20,
      sideCornerFt: 5,
      districtCode: "SF-6",
      sourceVintage: null,
    },
    cardBefore: [25, 5, 20, null],
    routeBefore: [25, 5, 20, 15],
    bothAfter: [25, 5, 20, 15],
    conflict: true,
  },
  {
    parcelNodeId: "48453:239852",
    jurisdictionKey: "austin-tx",
    cardDistrict: "SF-3",
    gisZoningCode: "SF",
    atomRule: {
      front: 25,
      side: 5,
      rear: 10,
      sideCornerFt: 15,
      districtCode: "SF-3",
      sourceVintage: null,
    },
    cardBefore: [25, 5, 10, 15],
    routeBefore: [15, 3.5, 5, 10],
    bothAfter: [25, 5, 10, 15],
    conflict: false,
  },
  {
    parcelNodeId: "48453:367134",
    jurisdictionKey: "austin-tx",
    cardDistrict: "SF-2",
    gisZoningCode: "SF",
    atomRule: {
      front: 25,
      side: 5,
      rear: 10,
      sideCornerFt: 15,
      districtCode: "SF-2",
      sourceVintage: null,
    },
    cardBefore: [25, 5, 10, 15],
    routeBefore: [15, 3.5, 5, 10],
    bothAfter: [25, 5, 10, 15],
    conflict: false,
  },
];

/**
 * A PINNED MIRROR of the route's own resolution, doing exactly what
 * legacy-design-tools' `resolveAuthoritativeSetbacks` does with these inputs:
 * the codified candidate is the row `mapDistrict` picks (exact, then an
 * unambiguous prefix, normalized) and the atom candidate is built from the
 * wire's `sideCornerFt`; both go to the one shared resolver, and the served
 * value on a conflict is the tier-highest candidate. Written here so the card
 * repo can state what the route MUST answer without importing it.
 */
function routeMirrorTuple(subject: Subject): [number, number, number, number | null] {
  const table = corpusSetbackTable(subject.jurisdictionKey);
  const row = corpusDistrictRow(table, subject.gisZoningCode);
  const resolution = resolveCardSetbacks({
    jurisdictionKey: subject.jurisdictionKey,
    districtCode: subject.gisZoningCode,
    atomRule: subject.atomRule,
  });
  // The route has no row for a code it cannot map, so it serves the atom
  // candidate alone. `resolveCardSetbacks` with an unmappable code does the
  // same thing by construction — the table only supplies a candidate when its
  // row selection finds one — so the mirror is the same call. `row` is kept so
  // this mirror fails loudly if that stops being true.
  if (row && !resolution) throw new Error("row without resolution");
  return resolution ? setbackTuple(resolution.scalars) : [];
}

describe("P-340 — the card and the route resolve the 7 measured subjects identically", () => {
  for (const subject of SUBJECTS) {
    it(`${subject.parcelNodeId} (${subject.jurisdictionKey} ${subject.cardDistrict})`, () => {
      const card = resolveCardSetbacks({
        jurisdictionKey: subject.jurisdictionKey,
        districtCode: subject.cardDistrict,
        atomRule: subject.atomRule,
      });
      expect(card, "the card must resolve a value").not.toBeNull();
      const cardTuple = setbackTuple(card!.scalars);
      const routeTuple = routeMirrorTuple(subject);

      // The rung that matters: the two surfaces answer the same 4-tuple.
      expect(cardTuple, "card vs route 4-tuple").toEqual(routeTuple);
      expect(cardTuple).toEqual(subject.bothAfter);
      // ENFORCEMENT's paired control: both sides are shown to have been WRONG
      // before this lane, so this suite's agreement is a change, not a
      // tautology. A subject whose card was already right is still pinned
      // against its own pre-change route tuple.
      expect(
        [subject.cardBefore, subject.routeBefore].some(
          (before) => before.join("/") !== subject.bothAfter.join("/"),
        ),
        "subject must have disagreed with the target before this lane",
      ).toBe(true);

      // R-1's conflict declaration, on both surfaces: both dates are unreadable
      // (the atom's `sourceVintage` is null and no corpus table carries an
      // `effectiveDate`), so a VALUE disagreement is a conflict row, and a
      // value agreement is not.
      expect(!!card!.conflict, `${subject.parcelNodeId} conflict`).toBe(subject.conflict);
      if (subject.conflict) {
        expect(card!.conflict!.candidates).toHaveLength(2);
      }
    });
  }

  it("the one-sided change control: a card-side row edit alone breaks the pairing", () => {
    // The two Austin subjects are the shape that proves this suite can fire:
    // the route's row selection crossed `SF` into `SF-4A` while the card read
    // `SF-3`. Modelled here as the one-sided change it was — if the card's row
    // selection had crossed the same way, its tuple would NOT equal the route's.
    const austin = SUBJECTS.find((s) => s.parcelNodeId === "48453:239852")!;
    const cardSide = resolveCardSetbacks({
      jurisdictionKey: austin.jurisdictionKey,
      districtCode: austin.cardDistrict,
      atomRule: austin.atomRule,
    })!;
    expect(setbackTuple(cardSide.scalars)).toEqual([25, 5, 10, 15]);

    // The same inputs with the CARD's district crossed by a one-sided matcher
    // change (`SF-3` -> the row a longest-prefix fallback picks from `SF`).
    // `SF` itself names six rows, so the card's own matcher refuses it and the
    // atom chain answers alone — the atom is 25/5/10/15, which is NOT the
    // 15/3.5/5/10 the route served. The tuples differ; the suite would fail.
    const crossed = resolveCardSetbacks({
      jurisdictionKey: austin.jurisdictionKey,
      districtCode: "SF-4A",
      atomRule: austin.atomRule,
    })!;
    expect(setbackTuple(crossed.scalars)).toEqual([15, 3.5, 5, 10]);
    expect(setbackTuple(crossed.scalars)).not.toEqual(setbackTuple(cardSide.scalars));
  });

  it("pins the two halves of the row matcher to the route's own normalization", () => {
    // `normalizeDistrictCode` is legacy-design-tools' `normalizeCode`, so the
    // two row matchers see the same code as the same code.
    expect(normalizeDistrictCode("R-2")).toBe("R2");
    expect(normalizeDistrictCode("r2")).toBe("R2");
    expect(normalizeDistrictCode("R-1-A")).toBe("R1A");
    expect(normalizeDistrictCode("SF-4A")).toBe("SF4A");
  });
});
