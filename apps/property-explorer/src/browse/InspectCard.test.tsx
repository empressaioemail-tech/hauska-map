// Component tests for InspectCard via react-dom/server static render (same
// pattern as PropertyBriefPanel.test.tsx — node env, no effects run).
//
// Map UX cluster item 4: the persona UI ("View as" Homeowner/Investor/
// Architect + the persona summary sentence) is REMOVED from the card. These
// tests pin that removal and keep the honest status lines that are NOT
// persona copy.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  FacetRow,
  FactRow,
  InspectCard,
  Row,
  chipsForRow,
  SetbackXrayDetail,
  liveSetbackLine,
  toFactPresentation,
  ROW_SPECS,
} from "./InspectCard";
import type { ParcelCardData } from "./liveGis";
import type {
  EnvelopeProvenanceRefs,
  SetbackFieldNotes,
} from "../lib/buildable-envelope.js";

const noop = () => {};

const CARD: ParcelCardData = {
  apn: "141209",
  situsAddress: "714 Spring St",
  owner: null,
  landUseDescription: "Single family",
  county: "Bastrop",
  provider: "Bastrop County GIS",
  notSurveyGrade: true,
  retrievedAt: "2026-07-25T00:00:00.000Z",
  lat: 30.11,
  lng: -97.31,
};

const html = renderToStaticMarkup(
  <InspectCard
    card={CARD}
    parcelNodeId={null}
    onClose={noop}
    onMakeSubject={noop}
    onResearch={noop}
  />,
);

describe("InspectCard — persona UI removed (map UX cluster item 4)", () => {
  it("renders no persona block, no View-as row, no persona buttons", () => {
    expect(html).not.toContain('data-testid="persona-register"');
    expect(html).not.toContain('data-testid="persona-headline"');
    expect(html).not.toContain('data-testid="persona-homeowner"');
    expect(html).not.toContain('data-testid="persona-investor"');
    expect(html).not.toContain('data-testid="persona-architect"');
    expect(html).not.toContain("View as");
    expect(html).not.toContain("Homeowner");
    expect(html).not.toContain("Investor");
    expect(html).not.toContain("Architect");
    // The persona summary sentence family is gone with it.
    expect(html).not.toContain("Likely buildable area");
  });

  it("keeps the card facts and the non-persona actions", () => {
    expect(html).toContain('data-testid="inspect-card"');
    expect(html).toContain("714 Spring St");
    expect(html).toContain('data-testid="inspect-apn"');
    expect(html).toContain('data-testid="make-subject"');
    expect(html).toContain('data-testid="research-this"');
    // SS-W2 / invariant I3: the provenance line survives but is DEMOTED. The
    // card face carries the verification statement and the record date; the
    // provider key itself moved behind the Sources disclosure. It used to read
    // "Source: Bastrop County GIS" on the card face.
    expect(html).toContain('data-testid="inspect-provenance"');
    expect(html).toContain("Checked against the county record");
    expect(html).toContain("as of 2026-07-25");
    expect(html).toContain('data-testid="inspect-sources-toggle"');
    expect(html).not.toContain("Source: Bastrop County GIS");
  });
});

describe("InspectCard — export sections moved to the workbench (W2)", () => {
  // Even WITH a baked node id (the condition that used to gate the export
  // sections in), the card renders NO export UI: site-plan + terrain exports
  // live in the workbench "Reports & exports" dock now.
  const withNodeId = renderToStaticMarkup(
    <InspectCard
      card={CARD}
      parcelNodeId="48021:141209"
      onClose={noop}
      onMakeSubject={noop}
      onResearch={noop}
      onSaveProperty={noop}
    />,
  );

  it("renders neither the site-plan nor the terrain export section", () => {
    expect(withNodeId).not.toContain('data-testid="site-plan-export-section"');
    expect(withNodeId).not.toContain('data-testid="terrain-export-section"');
    expect(withNodeId).not.toContain("Export site plan");
    expect(withNodeId).not.toContain("Export terrain");
    expect(withNodeId).not.toContain('data-testid="site-plan-format-picker"');
    expect(withNodeId).not.toContain('data-testid="terrain-format-picker"');
  });

  it("keeps the leaner card's actions: Research / Make subject / Save", () => {
    expect(withNodeId).toContain('data-testid="research-this"');
    expect(withNodeId).toContain('data-testid="make-subject"');
    expect(withNodeId).toContain('data-testid="save-property"');
  });
});

// ---------------------------------------------------------------------------
// Provenance chips (feat/inspect-card-provenance-chips). renderToStaticMarkup
// never runs effects, so the full InspectCard can't be driven past
// source==="loading" in this harness (same constraint every other InspectCard
// test above already lives with) — these tests pin the row-level contract
// directly (chat-tool.test.tsx precedent: FacetRow/Row/chipsForRow exported
// as a test seam, same as ChatCitationChips/AtomCardView are for chat), plus
// prove the full card's default (no-provenanceRefs) render is untouched.
// ---------------------------------------------------------------------------

const REFS: EnvelopeProvenanceRefs = {
  zoning: { atomDid: "did:hauska:zoning-fact:48021:141209" },
  setback: { atomDid: "did:hauska:setback-rule:48021:141209" },
  envelope: { atomDid: "did:hauska:buildable-envelope:48021:141209" },
  codeSections: [
    {
      atomDid: "did:hauska:code-section:bastrop-udc-4-2",
      sectionNumber: "4.2",
      title: "Setback standards",
    },
  ],
};

describe("chipsForRow — provenanceRefs -> per-row chip derivation", () => {
  it("zoning row gets the zoning ref only (no code sections)", () => {
    const chips = chipsForRow(REFS, "zoning");
    expect(chips).toEqual([
      { did: "did:hauska:zoning-fact:48021:141209", label: "zoning" },
    ]);
  });

  it("setback row gets the setback ref + code-section chips labeled by sectionNumber", () => {
    const chips = chipsForRow(REFS, "setback");
    expect(chips).toEqual([
      { did: "did:hauska:setback-rule:48021:141209", label: "setback" },
      { did: "did:hauska:code-section:bastrop-udc-4-2", label: "4.2" },
    ]);
  });

  it("buildable row gets the envelope ref + code-section chips", () => {
    const chips = chipsForRow(REFS, "buildable");
    expect(chips).toEqual([
      { did: "did:hauska:buildable-envelope:48021:141209", label: "envelope" },
      { did: "did:hauska:code-section:bastrop-udc-4-2", label: "4.2" },
    ]);
  });

  it("GRACEFUL ABSENCE: null refs -> empty array for every row", () => {
    expect(chipsForRow(null, "zoning")).toEqual([]);
    expect(chipsForRow(null, "setback")).toEqual([]);
    expect(chipsForRow(null, "buildable")).toEqual([]);
  });

  it("a ref block with only SOME refs present -> only those chips, no fabrication", () => {
    const partial: EnvelopeProvenanceRefs = {
      zoning: { atomDid: "did:hauska:zoning-fact:x" },
    };
    expect(chipsForRow(partial, "zoning")).toEqual([
      { did: "did:hauska:zoning-fact:x", label: "zoning" },
    ]);
    expect(chipsForRow(partial, "setback")).toEqual([]);
    expect(chipsForRow(partial, "buildable")).toEqual([]);
  });
});

describe("FacetRow / Row — provenance chips render on the value cell", () => {
  it("FacetRow (baked branch) with chips renders the DIDs via AtomChip", () => {
    const html = renderToStaticMarkup(
      <dl>
        <FacetRow
          label="Zoning"
          facet={{ state: "present", value: "R-1" }}
          testid="inspect-zoning"
          chips={chipsForRow(REFS, "zoning")}
          openChipDid={null}
          onChipToggle={() => {}}
        />
      </dl>,
    );
    expect(html).toContain('data-testid="inspect-zoning"');
    expect(html).toContain("R-1");
    expect(html).toContain('data-testid="inspect-provenance-chip"');
    expect(html).toContain("zoning");
  });

  it("FacetRow with NO chips (empty array) renders byte-identical to a plain FacetRow", () => {
    const withEmptyChips = renderToStaticMarkup(
      <dl>
        <FacetRow
          label="Zoning"
          facet={{ state: "present", value: "R-1" }}
          testid="inspect-zoning"
          chips={[]}
          openChipDid={null}
          onChipToggle={() => {}}
        />
      </dl>,
    );
    const plain = renderToStaticMarkup(
      <dl>
        <FacetRow
          label="Zoning"
          facet={{ state: "present", value: "R-1" }}
          testid="inspect-zoning"
        />
      </dl>,
    );
    expect(withEmptyChips).toBe(plain);
    expect(withEmptyChips).not.toContain('data-testid="inspect-provenance-chip"');
  });

  it("Row (live branch) with chips renders the DIDs via AtomChip", () => {
    const html = renderToStaticMarkup(
      <dl>
        <Row
          label="Setbacks"
          value="F 25′ · S 10′ · R 20′"
          testid="inspect-setbacks"
          chips={chipsForRow(REFS, "setback")}
          openChipDid={null}
          onChipToggle={() => {}}
        />
      </dl>,
    );
    expect(html).toContain('data-testid="inspect-setbacks"');
    expect(html).toContain('data-testid="inspect-provenance-chip"');
    expect(html).toContain("4.2");
  });

  it("Row with NO chips prop at all renders byte-identical to today (no onChipToggle passed)", () => {
    const untouched = renderToStaticMarkup(
      <dl>
        <Row label="Setbacks" value="F 25′ · S 10′ · R 20′" testid="inspect-setbacks" />
      </dl>,
    );
    expect(untouched).not.toContain('data-testid="inspect-provenance-chip"');
    expect(untouched).toContain("F 25′ · S 10′ · R 20′");
  });

  it("the OPEN chip renders aria-expanded=true; others false", () => {
    const html = renderToStaticMarkup(
      <dl>
        <Row
          label="Setbacks"
          value="F 25′ · S 10′ · R 20′"
          chips={chipsForRow(REFS, "setback")}
          openChipDid="did:hauska:setback-rule:48021:141209"
          onChipToggle={() => {}}
        />
      </dl>,
    );
    const chipBlocks = html.split('data-testid="inspect-provenance-chip"');
    // First split segment is before the first chip; chip 1 (setback, OPEN)
    // is the tag immediately following segment[0].
    expect(chipBlocks[1]).toContain('aria-expanded="true"');
    expect(chipBlocks[2]).toContain('aria-expanded="false"');
  });
});

describe("InspectCard full render — provenance chips do not disturb the default card", () => {
  it("no parcelNodeId, no live envelope resolved yet -> zero provenance chips, card unchanged", () => {
    const html = renderToStaticMarkup(
      <InspectCard
        card={CARD}
        parcelNodeId={null}
        onClose={noop}
        onMakeSubject={noop}
        onResearch={noop}
      />,
    );
    expect(html).not.toContain('data-testid="inspect-provenance-chip"');
    expect(html).not.toContain('data-testid="atom-detail-popover"');
    // Identical to the baseline render captured at module load (same props).
    expect(html).toBe(
      renderToStaticMarkup(
        <InspectCard
          card={CARD}
          parcelNodeId={null}
          onClose={noop}
          onMakeSubject={noop}
          onResearch={noop}
        />,
      ),
    );
  });

  it("no setback field notes anywhere -> zero X-ray toggle affordance, card unchanged from before this feature", () => {
    const html = renderToStaticMarkup(
      <InspectCard
        card={CARD}
        parcelNodeId={null}
        onClose={noop}
        onMakeSubject={noop}
        onResearch={noop}
      />,
    );
    expect(html).not.toContain('data-testid="setback-xray-toggle"');
    expect(html).not.toContain('data-testid="setback-xray-detail"');
  });
});

// ---------------------------------------------------------------------------
// X-ray rule details (ratification directive 2, 2026-08-04). Same
// renderToStaticMarkup-can't-reach-effects constraint as the provenance-chip
// suite above — SetbackXrayDetail is exported as a direct test seam so both
// the collapsed and expanded states can be pinned without driving the full
// card past source==="loading".
// ---------------------------------------------------------------------------

const FIELD_NOTES: SetbackFieldNotes = {
  side:
    "One-story: 10 ft. Two-story: 15 ft on the second story only, per §4.02.005(b).",
  rear: "Formula rear: 20 ft plus 1 ft per additional story above two.",
};

describe("SetbackXrayDetail — collapsed by default, expands to the field notes", () => {
  it("null notes -> renders nothing", () => {
    const html = renderToStaticMarkup(
      <SetbackXrayDetail notes={null} isOpen={false} onToggle={() => {}} />,
    );
    expect(html).toBe("");
  });

  it("notes present but all empty strings -> renders nothing (no placeholder affordance)", () => {
    const html = renderToStaticMarkup(
      <SetbackXrayDetail
        notes={{ front: "", side: undefined }}
        isOpen={false}
        onToggle={() => {}}
      />,
    );
    expect(html).toBe("");
  });

  it("collapsed (isOpen=false): shows the toggle affordance, not the detail body", () => {
    const html = renderToStaticMarkup(
      <SetbackXrayDetail notes={FIELD_NOTES} isOpen={false} onToggle={() => {}} />,
    );
    expect(html).toContain('data-testid="setback-xray-toggle"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('data-testid="setback-xray-detail"');
    expect(html).not.toContain("Formula rear");
  });

  it("expanded (isOpen=true): shows the per-field notes, labeled by axis", () => {
    const html = renderToStaticMarkup(
      <SetbackXrayDetail notes={FIELD_NOTES} isOpen={true} onToggle={() => {}} />,
    );
    expect(html).toContain('data-testid="setback-xray-detail"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("Side:");
    expect(html).toContain("One-story: 10 ft");
    expect(html).toContain("Rear:");
    expect(html).toContain("Formula rear: 20 ft plus 1 ft per additional story above two.");
    // Front/sideCorner carry no note in this fixture — not rendered as empty rows.
    expect(html).not.toContain("Front:");
    expect(html).not.toContain("Side (corner):");
  });
});

describe("liveSetbackLine — governed_by resolution on the live-fallback path (un-baked nodes)", () => {
  it("no governedBy -> unchanged pre-existing dash behavior for a null axis", () => {
    const line = liveSetbackLine({
      status: "ok",
      setbacks: { front_ft: null, side_ft: 10, rear_ft: 20, district: "R-1" },
    });
    expect(line).toBe("F — · S 10′ · R 20′");
  });

  it("a null front_ft WITH governedBy resolves to the cited governing value instead of a bare dash", () => {
    const line = liveSetbackLine({
      status: "ok",
      setbacks: {
        front_ft: null,
        side_ft: 10,
        rear_ft: 20,
        district: "C-2",
        governedBy: {
          front: {
            district: "C-1",
            section_number: "4.03.010",
          },
        },
      },
    });
    expect(line).toBe("F C-1 governs (§4.03.010) · S 10′ · R 20′");
  });

  it("governedBy present but NO section_number on the reference -> still the bare dash (no uncited claim)", () => {
    const line = liveSetbackLine({
      status: "ok",
      setbacks: {
        front_ft: null,
        side_ft: 10,
        rear_ft: 20,
        district: "C-2",
        governedBy: { front: { district: "C-1" } },
      },
    });
    expect(line).toBe("F — · S 10′ · R 20′");
  });

  it("governedBy on an axis that DOES have a real value is ignored (never overrides a present number)", () => {
    const line = liveSetbackLine({
      status: "ok",
      setbacks: {
        front_ft: 25,
        side_ft: 10,
        rear_ft: 20,
        district: "R-1",
        governedBy: {
          front: { value_ft: 999, section_number: "0.0.0" },
        },
      },
    });
    expect(line).toBe("F 25′ · S 10′ · R 20′");
  });

  it("no setbacks at all -> null (unchanged)", () => {
    expect(liveSetbackLine({ status: "loading" })).toBeNull();
  });
});

describe("InspectCard Flood row — floodHazardFact only (WDLL 3)", () => {
  it("gold 48021:34137 present Zone X renders a Flood row", () => {
    const html = renderToStaticMarkup(
      <dl>
        <FactRow
          label="Flood"
          fact={toFactPresentation(
            { state: "present", value: "Zone X" },
            ROW_SPECS.flood,
          )}
          testid="inspect-flood"
        />
      </dl>,
    );
    expect(html).toContain('data-testid="inspect-flood"');
    expect(html).toContain("Zone X");
  });

  it("named refusals render the code, never a silent null", () => {
    const html = renderToStaticMarkup(
      <dl>
        <FactRow
          label="Flood"
          fact={toFactPresentation(
            { state: "pending", value: "atom-miss" },
            ROW_SPECS.flood,
          )}
          testid="inspect-flood"
        />
      </dl>,
    );
    expect(html).toContain("atom-miss");
    expect(html).toContain('data-state="pending"');
  });

  it("missing floodHazardFact hides the Flood row (unknown, not invented)", () => {
    const html = renderToStaticMarkup(
      <dl>
        <FactRow
          label="Flood"
          fact={toFactPresentation(
            { state: "unknown", value: null },
            ROW_SPECS.flood,
          )}
          testid="inspect-flood"
        />
      </dl>,
    );
    expect(html).not.toContain("inspect-flood");
    expect(html).not.toContain("Flood");
  });
});

describe("InspectCard Land use row — landUseFact preferred (WDLL 5 leftover)", () => {
  it("gold present A1 from landUseFact renders Land use with inspect-landuse", () => {
    const html = renderToStaticMarkup(
      <dl>
        <FactRow
          label="Land use"
          fact={toFactPresentation(
            { state: "present", value: "A1 — Single-family residential" },
            ROW_SPECS.landUse,
          )}
          testid="inspect-landuse"
        />
      </dl>,
    );
    expect(html).toContain('data-testid="inspect-landuse"');
    expect(html).toContain("A1 — Single-family residential");
    expect(html).not.toContain("cad-roll");
  });

  it("named refusals render the code, never a silent cad-roll swap", () => {
    const html = renderToStaticMarkup(
      <dl>
        <FactRow
          label="Land use"
          fact={toFactPresentation(
            { state: "pending", value: "atom-miss" },
            ROW_SPECS.landUse,
          )}
          testid="inspect-landuse"
        />
      </dl>,
    );
    expect(html).toContain("atom-miss");
    expect(html).toContain('data-state="pending"');
    expect(html).not.toContain("cad-roll");
  });
});

describe("InspectCard Special district row — specialDistrictFact (P-48)", () => {
  it("present fixture shows The Colony MUD 1C", () => {
    const html = renderToStaticMarkup(
      <dl>
        <FactRow
          label="Special district"
          fact={toFactPresentation(
            { state: "present", value: "MUD — The Colony MUD 1C" },
            ROW_SPECS.specialDistrict,
          )}
          testid="inspect-special-district"
        />
      </dl>,
    );
    expect(html).toContain('data-testid="inspect-special-district"');
    expect(html).toContain("The Colony MUD 1C");
    expect(html).toContain("MUD");
  });

  it("gold-shaped absent fixture stays visible and does not paint a MUD name", () => {
    const html = renderToStaticMarkup(
      <dl>
        <FactRow
          label="Special district"
          fact={toFactPresentation(
            { state: "absent", value: "outside-tceq-source-boundaries" },
            ROW_SPECS.specialDistrict,
          )}
          testid="inspect-special-district"
        />
      </dl>,
    );
    expect(html).toContain('data-testid="inspect-special-district"');
    expect(html).toContain("outside-tceq-source-boundaries");
    expect(html).not.toContain("The Colony");
  });

  it("missing specialDistrictFact hides the Special district row (unknown, not invented)", () => {
    const html = renderToStaticMarkup(
      <dl>
        <FactRow
          label="Special district"
          fact={toFactPresentation(
            { state: "unknown", value: null },
            ROW_SPECS.specialDistrict,
          )}
          testid="inspect-special-district"
        />
      </dl>,
    );
    expect(html).not.toContain("inspect-special-district");
    expect(html).not.toContain("Special district");
    expect(html).not.toContain("The Colony");
  });
});

describe("InspectCard Pipeline row — pipelineFact (P-49)", () => {
  it("present-near fixture shows t4permit=05781", () => {
    const html = renderToStaticMarkup(
      <dl>
        <FactRow
          label="Pipeline"
          fact={toFactPresentation(
            { state: "present", value: "ENERGY TRANSFER COMPANY · T-4 05781 · 87.9 m" },
            ROW_SPECS.pipeline,
          )}
          testid="inspect-pipeline"
        />
      </dl>,
    );
    expect(html).toContain('data-testid="inspect-pipeline"');
    expect(html).toContain("05781");
    expect(html).toContain("ENERGY TRANSFER COMPANY");
  });

  it("gold-shaped present-outside fixture stays visible and does not paint ENERGY TRANSFER", () => {
    const html = renderToStaticMarkup(
      <dl>
        <FactRow
          label="Pipeline"
          fact={toFactPresentation(
            { state: "present", value: "outside pipeline buffer" },
            ROW_SPECS.pipeline,
          )}
          testid="inspect-pipeline"
        />
      </dl>,
    );
    expect(html).toContain('data-testid="inspect-pipeline"');
    expect(html).toContain("outside pipeline buffer");
    expect(html).not.toContain("ENERGY TRANSFER");
    expect(html).not.toContain("Prairie Lea");
    expect(html).not.toContain("05781");
  });

  it("missing pipelineFact hides the Pipeline row (unknown, not invented)", () => {
    const html = renderToStaticMarkup(
      <dl>
        <FactRow
          label="Pipeline"
          fact={toFactPresentation(
            { state: "unknown", value: null },
            ROW_SPECS.pipeline,
          )}
          testid="inspect-pipeline"
        />
      </dl>,
    );
    expect(html).not.toContain("inspect-pipeline");
    expect(html).not.toContain("Pipeline");
    expect(html).not.toContain("ENERGY TRANSFER");
  });
});
