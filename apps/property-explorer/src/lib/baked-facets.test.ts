// Pure tests for the baked node-facet client's view-model derivation — the
// honest-absence contract the inspect card renders. No DOM, no network; the
// fetch path is exercised end-to-end by the app's build + manual verify.
//
// Run: `npx vitest run src/lib/baked-facets.test.ts` (a vitest harness is not
// wired into property-explorer CI today; this file documents + locks the
// deriver contract and runs green under any vitest that picks it up).

import { describe, it, expect } from "vitest";
import { deriveBakedCardModel, type BakedFacetPayload } from "./baked-facets";

const fullPayload: BakedFacetPayload = {
  parcelNodeId: "48055:10068",
  countyFips: "48055",
  countyName: "Caldwell",
  baseFacts: {
    apn: "10068",
    situsAddress: "1391 FM 1854 , DALE, TX",
    landUse: { code: "A1", description: "Single-family residential", source: "cad-roll" },
    acreage: { value: 0.2388 },
  },
  zoning: { district: "R-1" },
  envelope: {
    status: "ok",
    setbacks: { front_ft: 35, side_ft: 20, rear_ft: 30 },
    buildableAreaPct: 62.4,
    disclosure: "Approximate buildable area.",
  },
  facetCoverage: { baseFacts: true, landUse: true, acreage: true, zoning: true, envelope: true },
  provenance: { parcelSource: "txgio", landUseSource: "cad-roll", parcelVintage: "v25" },
  bakedAt: "2026-07-20T22:34:46.946Z",
};

describe("deriveBakedCardModel — present facets", () => {
  it("marks real content as present with rendered values", () => {
    const m = deriveBakedCardModel(fullPayload);
    expect(m.apn).toEqual({ state: "present", value: "10068" });
    // Land-use renders code + description + inline provenance caption.
    expect(m.landUse).toEqual({
      state: "present",
      value: "A1 — Single-family residential (cad-roll)",
    });
    expect(m.zoning).toEqual({ state: "present", value: "R-1" });
    expect(m.acreage).toEqual({ state: "present", value: "0.2388 ac" });
    expect(m.setbacks).toEqual({ state: "present", value: "F 35′ · S 20′ · R 30′" });
    expect(m.buildablePct).toEqual({ state: "present", value: "62%" });
    expect(m.envelopeApproximate).toBe(true);
    expect(m.provenance.landUseSource).toBe("cad-roll");
    expect(m.bakedAt).toBe("2026-07-20T22:34:46.946Z");
  });

  it("NEVER surfaces an owner (no owner field is read or emitted)", () => {
    const withOwner = {
      ...fullPayload,
      baseFacts: { ...fullPayload.baseFacts, owner_name: "SHOULD NOT LEAK" },
    } as BakedFacetPayload;
    const m = deriveBakedCardModel(withOwner);
    expect(JSON.stringify(m)).not.toMatch(/owner/i);
    expect(JSON.stringify(m)).not.toMatch(/SHOULD NOT LEAK/);
  });
});

describe("deriveBakedCardModel — present values are trusted over coverage flags", () => {
  it("renders land use + acreage when the values are present but coverage says false", () => {
    // The bug this locks: a baked payload carrying real baseFacts.landUse and
    // baseFacts.acreage was forced to "not verified here" whenever the
    // facetCoverage boolean was false/missing. Present values must render.
    const covFalse: BakedFacetPayload = {
      parcelNodeId: "48055:10068",
      countyName: "Caldwell",
      baseFacts: {
        apn: "10068",
        landUse: {
          code: "A1",
          description: "Single-family residential",
          source: "cad-roll",
          vintage: "2024",
        },
        acreage: { value: 1.23, sqft: 53579, method: "cad-roll" },
      },
      facetCoverage: { baseFacts: true, landUse: false, acreage: false },
    };
    const m = deriveBakedCardModel(covFalse);
    expect(m.landUse).toEqual({
      state: "present",
      value: "A1 — Single-family residential (cad-roll · 2024)",
    });
    expect(m.acreage).toEqual({ state: "present", value: "1.23 ac (cad-roll)" });
  });

  it("renders present values when facetCoverage is entirely missing", () => {
    const noCov: BakedFacetPayload = {
      parcelNodeId: "48055:10068",
      baseFacts: {
        landUse: { code: "A1" },
        acreage: { value: 0.5 },
      },
    };
    const m = deriveBakedCardModel(noCov);
    expect(m.landUse).toEqual({ state: "present", value: "A1" });
    expect(m.acreage).toEqual({ state: "present", value: "0.5 ac" });
  });

  it("caption formatting: code-only, description-only, partial provenance", () => {
    const descOnly = deriveBakedCardModel({
      baseFacts: { landUse: { code: "", description: "Commercial", vintage: "2023" } },
    } as BakedFacetPayload);
    expect(descOnly.landUse).toEqual({ state: "present", value: "Commercial (2023)" });

    const codeOnly = deriveBakedCardModel({
      baseFacts: { landUse: { code: "B2", source: "cad-roll" } },
    });
    expect(codeOnly.landUse).toEqual({ state: "present", value: "B2 (cad-roll)" });
  });

  it("coverage=true with a NULL value is honest-absent with covered wording — never a default", () => {
    const coveredButNull: BakedFacetPayload = {
      parcelNodeId: "48055:1",
      baseFacts: { apn: "1", landUse: null, acreage: null },
      facetCoverage: { baseFacts: true, landUse: true, acreage: true },
    };
    const m = deriveBakedCardModel(coveredButNull);
    expect(m.landUse.state).toBe("absent");
    expect(m.landUse.value).toBe("no land-use value on record here");
    expect(m.acreage.state).toBe("absent");
    expect(m.acreage.value).toBe("no acreage value on record here");
  });

  it("absent stays absent: null values + falsy coverage keep the default not-verified treatment", () => {
    const trulyAbsent: BakedFacetPayload = {
      parcelNodeId: "48091:2",
      baseFacts: { apn: "2", landUse: null, acreage: null },
      facetCoverage: { baseFacts: true, landUse: false, acreage: false },
    };
    const m = deriveBakedCardModel(trulyAbsent);
    expect(m.landUse).toEqual({ state: "absent", value: null });
    expect(m.acreage).toEqual({ state: "absent", value: null });
  });

  it("a non-numeric acreage value never fabricates a rendered acreage", () => {
    const bogus = deriveBakedCardModel({
      baseFacts: { acreage: { value: NaN } },
    } as BakedFacetPayload);
    expect(bogus.acreage.state).toBe("absent");
    expect(bogus.acreage.value).toBeNull();
  });
});

describe("deriveBakedCardModel — honest absence", () => {
  it("Comal land-use null (coverage false) is ABSENT, not fabricated", () => {
    const comal: BakedFacetPayload = {
      parcelNodeId: "48091:99999",
      countyFips: "48091",
      countyName: "Comal",
      baseFacts: { apn: "99999", landUse: null, acreage: { value: 1 } },
      zoning: null,
      envelope: { status: "declined", declineReason: "no-setback-table" },
      facetCoverage: { baseFacts: true, landUse: false, acreage: true, zoning: false, envelope: false },
      provenance: { parcelSource: "txgio", landUseSource: null },
    };
    const m = deriveBakedCardModel(comal);
    // Absent, not a blank and not a fake value.
    expect(m.landUse.state).toBe("absent");
    expect(m.landUse.value).toBeNull();
    expect(m.zoning.state).toBe("absent");
    // A declined envelope is honest absence, and it must NOT read as approximate.
    expect(m.setbacks.state).toBe("absent");
    expect(m.buildablePct.state).toBe("absent");
    expect(m.envelopeApproximate).toBe(false);
    expect(m.envelopeDeclineReason).toBe("no-setback-table");
    // Facets that DO resolve stay present.
    expect(m.acreage.state).toBe("present");
    expect(m.apn.state).toBe("present");
  });

  it("gate-blocked land-use surfaces the reconciliation reason", () => {
    const blocked: BakedFacetPayload = {
      parcelNodeId: "48491:5",
      countyName: "Williamson",
      baseFacts: { apn: "5", landUse: null, acreage: { value: 2 } },
      zoning: null,
      envelope: { status: "ok", setbacks: { front_ft: 25, side_ft: 10, rear_ft: 20 }, buildableAreaPct: 40 },
      facetCoverage: { baseFacts: true, landUse: false, acreage: true, zoning: false, envelope: true },
      provenance: { parcelSource: "txgio", landUseSource: null, landUseGateBlocked: true },
    };
    const m = deriveBakedCardModel(blocked);
    expect(m.landUse.state).toBe("absent");
    expect(m.provenance.landUseGateBlocked).toBe(true);
    // Envelope present -> approximate treatment still applies.
    expect(m.envelopeApproximate).toBe(true);
    expect(m.setbacks.state).toBe("present");
  });

  it("no-buildable-area envelope keeps setbacks present (honest empty, still Tier-1)", () => {
    const empty: BakedFacetPayload = {
      parcelNodeId: "48453:7",
      countyName: "Travis",
      baseFacts: { apn: "7", landUse: { code: "B", description: "Commercial" }, acreage: { value: 0.1 } },
      zoning: { district: "C-1" },
      envelope: { status: "no-buildable-area", setbacks: { front_ft: 50, side_ft: 25, rear_ft: 25 } },
      facetCoverage: { baseFacts: true, landUse: true, acreage: true, zoning: true, envelope: true },
    };
    const m = deriveBakedCardModel(empty);
    expect(m.setbacks.state).toBe("present");
    expect(m.buildablePct).toEqual({ state: "present", value: "0% — setbacks consume lot" });
    expect(m.buildableDisplayKind).toBe("declined-consume");
    expect(m.envelopeApproximate).toBe(true);
  });

  it("not_specified axes never render as S 0′ / consume-lot", () => {
    const p3: BakedFacetPayload = {
      parcelNodeId: "48021:141209",
      countyName: "Bastrop",
      baseFacts: { apn: "141209" },
      zoning: { district: "P-3" },
      envelope: {
        status: "ok",
        setbacks: {
          front_ft: 25,
          side_ft: 0,
          rear_ft: 0,
          not_specified: { side: true, rear: true, sideCorner: true },
        },
        disclosure: "build-to-line governs",
      },
      facetCoverage: { baseFacts: true, landUse: false, acreage: false, zoning: true, envelope: true },
    };
    const m = deriveBakedCardModel(p3);
    expect(m.setbacks.state).toBe("present");
    expect(m.setbacks.value).toMatch(/not specified/i);
    expect(m.setbacks.value).toMatch(/build-to-line/i);
    expect(m.setbacks.value).not.toMatch(/S 0/);
    expect(m.buildablePct.state).toBe("pending");
    expect(m.buildablePct.value).toMatch(/build-to-line/i);
  });

  it("QA-3: setbacks present without buildableAreaPct is pending, not absent", () => {
    const partial: BakedFacetPayload = {
      parcelNodeId: "48021:34169",
      countyName: "Bastrop",
      baseFacts: { apn: "34169" },
      zoning: { district: "SF-2" },
      envelope: {
        status: "ok",
        setbacks: { front_ft: 25, side_ft: 5, rear_ft: 10 },
        // intentionally omit buildableAreaPct
      },
      facetCoverage: { baseFacts: true, landUse: false, acreage: false, zoning: true, envelope: true },
      provenance: { parcelSource: "property-atom-chain" },
    };
    const m = deriveBakedCardModel(partial);
    expect(m.zoning.state).toBe("present");
    expect(m.setbacks.state).toBe("present");
    expect(m.buildablePct.state).toBe("pending");
    expect(m.buildablePct.value).toMatch(/pending/i);
    expect(m.buildableDisplayKind).toBe("pending");
    expect(m.buildableAgreementToken).toBe("pending");
  });

  it("B3: buildableAreaSqFt present without pct is buildable-with-area, not bare pending", () => {
    const warmArea: BakedFacetPayload = {
      parcelNodeId: "48021:34785",
      countyName: "Bastrop",
      baseFacts: { apn: "34785" },
      zoning: { district: "SF-7" },
      envelope: {
        status: "ok",
        setbacks: { front_ft: 15, side_ft: 0, rear_ft: 0 },
        buildableAreaSqFt: 13641,
        // pct omitted — historical pending path
      },
      facetCoverage: { baseFacts: true, landUse: false, acreage: false, zoning: true, envelope: true },
    };
    const m = deriveBakedCardModel(warmArea);
    expect(m.buildableDisplayKind).toBe("buildable-with-area");
    expect(m.buildablePct.state).toBe("present");
    expect(m.buildablePct.value).toMatch(/13,?641/);
    expect(m.buildablePct.value).not.toMatch(/pending/i);
    expect(m.buildableAgreementToken).toMatch(/^buildable:/);
  });

  it("Gate C: atom_path_pending is pending/loading — never not-verified", () => {
    const model = deriveBakedCardModel({
      parcelNodeId: "48021:141209",
      zoning: null,
      envelope: {
        status: "declined",
        declineReason: "atom_path_pending",
      },
      facetCoverage: {
        zoning: false,
        envelope: false,
      },
    });
    expect(model.zoning.state).toBe("pending");
    expect(model.setbacks.state).toBe("pending");
    expect(model.zoning.value).toMatch(/Loading/i);
    expect(String(model.zoning.value)).not.toMatch(/not verified/i);
  });

  it("QA-3: no-zoning-stamp surfaces honest-absence label on zoning", () => {
    const none: BakedFacetPayload = {
      parcelNodeId: "48029:1",
      envelope: { status: "declined", declineReason: "no-zoning-stamp" },
      facetCoverage: { zoning: false, envelope: false },
    };
    const m = deriveBakedCardModel(none);
    expect(m.zoning.state).toBe("absent");
    expect(m.zoning.value).toBe("no zoning stamp here");
  });
});

describe("deriveBakedCardModel — provenanceRefs (forward-compat, type-only)", () => {
  it("threads envelope.provenanceRefs straight through when present", () => {
    const withRefs: BakedFacetPayload = {
      ...fullPayload,
      envelope: {
        ...fullPayload.envelope!,
        provenanceRefs: {
          zoning: { atomDid: "did:hauska:zoning-fact:48055:10068" },
          setback: { atomDid: "did:hauska:setback-rule:48055:10068" },
          envelope: { atomDid: "did:hauska:buildable-envelope:48055:10068" },
          codeSections: [
            {
              atomDid: "did:hauska:code-section:caldwell-udc-4-2",
              sectionNumber: "4.2",
              title: "Setback standards",
            },
          ],
        },
      },
    };
    const m = deriveBakedCardModel(withRefs);
    expect(m.provenanceRefs).toEqual({
      zoning: { atomDid: "did:hauska:zoning-fact:48055:10068" },
      setback: { atomDid: "did:hauska:setback-rule:48055:10068" },
      envelope: { atomDid: "did:hauska:buildable-envelope:48055:10068" },
      codeSections: [
        {
          atomDid: "did:hauska:code-section:caldwell-udc-4-2",
          sectionNumber: "4.2",
          title: "Setback standards",
        },
      ],
    });
  });

  it("GRACEFUL ABSENCE: no provenanceRefs on the payload -> null, everything else unchanged", () => {
    const m = deriveBakedCardModel(fullPayload);
    expect(m.provenanceRefs).toBeNull();
    // The rest of the model renders exactly as the pre-existing assertion
    // above (present facets) — this fixture carries no provenanceRefs at all
    // and the model must not fabricate or infer one.
    expect(m.zoning).toEqual({ state: "present", value: "R-1" });
    expect(m.setbacks).toEqual({ state: "present", value: "F 35′ · S 20′ · R 30′" });
  });

  it("no envelope at all -> provenanceRefs is null, not an error", () => {
    const m = deriveBakedCardModel({ parcelNodeId: "48021:1" });
    expect(m.provenanceRefs).toBeNull();
  });
});

describe("deriveBakedCardModel — governed_by resolution + X-ray field notes (Elgin ratification, 2026-08-04)", () => {
  it("a not_specified axis with governedBy resolves in the rendered setbacks string, citing the section", () => {
    const withGovernedBy: BakedFacetPayload = {
      ...fullPayload,
      envelope: {
        status: "ok",
        setbacks: {
          front_ft: 0,
          side_ft: 10,
          rear_ft: 20,
          not_specified: { front: true },
          governedBy: {
            front: {
              value_ft: 25,
              condition: "if adjoining a dwelling district",
              section_number: "4.02.003",
            },
          },
        },
      },
      facetCoverage: { ...fullPayload.facetCoverage, envelope: true },
    };
    const m = deriveBakedCardModel(withGovernedBy);
    expect(m.setbacks.state).toBe("present");
    expect(m.setbacks.value).toContain("F 25 ft if adjoining a dwelling district (§4.02.003)");
    expect(m.setbackGovernedBy).toEqual(withGovernedBy.envelope!.setbacks!.governedBy);
  });

  it("GRACEFUL ABSENCE: no governedBy on the payload -> setbackGovernedBy null, setbacks render unchanged", () => {
    const m = deriveBakedCardModel(fullPayload);
    expect(m.setbackGovernedBy).toBeNull();
    expect(m.setbacks).toEqual({ state: "present", value: "F 35′ · S 20′ · R 30′" });
  });

  it("fieldNotes thread onto the model for the X-ray surface, independent of governedBy", () => {
    const withNotes: BakedFacetPayload = {
      ...fullPayload,
      envelope: {
        status: "ok",
        setbacks: {
          front_ft: 25,
          side_ft: 10,
          rear_ft: 20,
          fieldNotes: {
            side: "One-story: 10 ft. Two-story: 15 ft on the second story only.",
          },
        },
      },
      facetCoverage: { ...fullPayload.facetCoverage, envelope: true },
    };
    const m = deriveBakedCardModel(withNotes);
    // The modeled minimum scalar is UNCHANGED — the note doesn't alter the display value.
    expect(m.setbacks).toEqual({ state: "present", value: "F 25′ · S 10′ · R 20′" });
    expect(m.setbackFieldNotes).toEqual({
      side: "One-story: 10 ft. Two-story: 15 ft on the second story only.",
    });
  });

  it("GRACEFUL ABSENCE: no fieldNotes -> setbackFieldNotes null", () => {
    const m = deriveBakedCardModel(fullPayload);
    expect(m.setbackFieldNotes).toBeNull();
  });

  it("no envelope at all -> setbackGovernedBy and setbackFieldNotes are both null, not an error", () => {
    const m = deriveBakedCardModel({ parcelNodeId: "48021:1" });
    expect(m.setbackGovernedBy).toBeNull();
    expect(m.setbackFieldNotes).toBeNull();
  });
});
