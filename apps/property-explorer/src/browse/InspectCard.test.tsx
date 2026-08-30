// Component tests for InspectCard via react-dom/server static render (same
// pattern as PropertyBriefPanel.test.tsx — node env, no effects run).
//
// Map UX cluster item 4: the persona UI ("View as" Homeowner/Investor/
// Architect + the persona summary sentence) is REMOVED from the card. These
// tests pin that removal and keep the honest status lines that are NOT
// persona copy.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { gateOwnerPresentation, OWNER_STUDIO_UPGRADE_CUE } from "../lib/owner-paint";
import {
  FacetRow,
  FactRow,
  FacetsLoadErrorBanner,
  InspectCard,
  Row,
  chipsForLayerAbsence,
  chipsForRow,
  inspectCardStateFromResolve,
  showsFacetsLoadError,
  SetbackXrayDetail,
  liveSetbackLine,
  toFactPresentation,
  customerValueSlot,
  whoServesFactPresentation,
  ROW_SPECS,
  inspectRowGroup,
  inspectHighLevelLabel,
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
    expect(html).toContain('data-testid="inspect-high-level"');
    expect(html).toContain('data-testid="inspect-accordion"');
    expect(html).toContain('data-testid="inspect-accordion-toggle"');
    expect(html).toContain('aria-expanded="false"');
  });
});

describe("inspect accordion — high-level first, rest collapsed", () => {
  it("places zone / flood / lot in the high-level group", () => {
    expect(inspectRowGroup("landUse")).toBe("high");
    expect(inspectRowGroup("flood")).toBe("high");
    expect(inspectRowGroup("acreage")).toBe("high");
    expect(inspectHighLevelLabel("landUse", "Land use")).toBe("Land use");
    expect(inspectHighLevelLabel("acreage", "Acreage")).toBe("Lot");
  });

  it("collapses special district, who serves, and zoning", () => {
    expect(inspectRowGroup("specialDistrict")).toBe("collapsed");
    expect(inspectRowGroup("whoServes")).toBe("collapsed");
    expect(inspectRowGroup("zoning")).toBe("collapsed");
  });

  it("mobile and desktop use the same click-to-expand toggle (not hover)", () => {
    const src = readFileSync(resolve(__dirname, "InspectCard.tsx"), "utf8");
    expect(src).toContain('data-testid="inspect-accordion-toggle"');
    expect(src).toContain("onClick={onToggleDetails}");
    expect(src).not.toMatch(/inspect-accordion-toggle[\s\S]{0,400}onMouseEnter/);
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

describe("P-96 join hold never reaches the customer value slot", () => {
  const leaked =
    "LANDUSE_JOIN_HOLD county 48491 — TxGIO prop_id does not join CAD property_use_code";
  const sentence =
    "Not read — the county's parcel id does not match the appraisal record, so zoning is unavailable.";

  it("customerValueSlot keeps the token in the source note only", () => {
    const slot = customerValueSlot(leaked);
    expect(slot.face).toBe(sentence);
    expect(slot.sourceNote).toBe(leaked);
    expect(slot.face).not.toMatch(/LANDUSE_JOIN_HOLD|property_use_code|48491/);
  });

  it("a present leaked hold becomes absent-covered with the prescribed sentence", () => {
    const fact = toFactPresentation(
      { state: "present", value: leaked },
      ROW_SPECS.landUse,
    );
    expect(fact?.state).toBe("absent-covered");
    if (fact?.state !== "absent-covered") throw new Error("expected covered");
    expect(fact.reason).toBe(sentence);
    expect(fact.provenance).toBe(leaked);
    const html = renderToStaticMarkup(
      <dl>
        <FactRow label="Zone" fact={fact} testid="inspect-landuse" />
      </dl>,
    );
    expect(html.replace(/&#x27;/g, "'")).toContain(sentence);
    expect(html).not.toContain("LANDUSE_JOIN_HOLD");
    expect(html).not.toContain("property_use_code");
    expect(html).not.toContain("48491");
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

  it("year built with source renders; bare year is hidden", () => {
    const withSource = renderToStaticMarkup(
      <dl>
        <FactRow
          label="Year built"
          fact={toFactPresentation(
            { state: "present", value: "2021 (cad_property)" },
            ROW_SPECS.yearBuilt,
          )}
          testid="inspect-year-built"
        />
      </dl>,
    );
    expect(withSource).toContain('data-testid="inspect-year-built"');
    expect(withSource).toContain("2021 (cad_property)");
    const bare = toFactPresentation(
      { state: "unknown", value: null },
      ROW_SPECS.yearBuilt,
    );
    expect(bare).toBeNull();
    expect(ROW_SPECS.yearBuilt.inCoverageBlock).toBeUndefined();
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

describe("InspectCard Well row — wellFact (P-50)", () => {
  it("present fixture shows apiNumber14=42000001030000", () => {
    const html = renderToStaticMarkup(
      <dl>
        <FactRow
          label="Well"
          fact={toFactPresentation(
            { state: "present", value: "42000001030000 · dry" },
            ROW_SPECS.well,
          )}
          testid="inspect-well"
        />
      </dl>,
    );
    expect(html).toContain('data-testid="inspect-well"');
    expect(html).toContain("42000001030000");
    expect(html).not.toContain(":none");
  });

  it("gold-shaped atom-miss fixture stays visible and does not paint a well or :none", () => {
    const html = renderToStaticMarkup(
      <dl>
        <FactRow
          label="Well"
          fact={toFactPresentation(
            { state: "pending", value: "well-fact atom-miss" },
            ROW_SPECS.well,
          )}
          testid="inspect-well"
        />
      </dl>,
    );
    expect(html).toContain('data-testid="inspect-well"');
    expect(html).toContain("well-fact");
    expect(html).toContain("atom-miss");
    expect(html).not.toContain("42000001030000");
    expect(html).not.toContain(":none");
  });

  it("missing wellFact hides the Well row (unknown, not invented)", () => {
    const html = renderToStaticMarkup(
      <dl>
        <FactRow
          label="Well"
          fact={toFactPresentation(
            { state: "unknown", value: null },
            ROW_SPECS.well,
          )}
          testid="inspect-well"
        />
      </dl>,
    );
    expect(html).not.toContain("inspect-well");
    expect(html).not.toContain("Well");
    expect(html).not.toContain("42000001030000");
    expect(html).not.toContain(":none");
  });
});

describe("InspectCard Footprint row — buildingFootprintFact (P-51)", () => {
  it("present fixture shows structureRole=primary from the body", () => {
    const html = renderToStaticMarkup(
      <dl>
        <FactRow
          label="Footprint"
          fact={toFactPresentation(
            { state: "present", value: "primary" },
            ROW_SPECS.footprint,
          )}
          testid="inspect-footprint"
        />
      </dl>,
    );
    expect(html).toContain('data-testid="inspect-footprint"');
    expect(html).toContain("Footprint");
    expect(html).toContain("primary");
    expect(html).not.toContain(":primary");
  });

  it("gold-shaped atom-miss fixture stays visible and does not paint a footprint or :primary", () => {
    const html = renderToStaticMarkup(
      <dl>
        <FactRow
          label="Footprint"
          fact={toFactPresentation(
            { state: "pending", value: "building-footprint atom-miss" },
            ROW_SPECS.footprint,
          )}
          testid="inspect-footprint"
        />
      </dl>,
    );
    expect(html).toContain('data-testid="inspect-footprint"');
    expect(html).toContain("building-footprint");
    expect(html).toContain("atom-miss");
    expect(html).not.toContain(":primary");
    expect(html).not.toContain("48001:10136");
  });

  it("role inversion: accessory body is not painted as primary", () => {
    const html = renderToStaticMarkup(
      <dl>
        <FactRow
          label="Footprint"
          fact={toFactPresentation(
            { state: "present", value: "accessory" },
            ROW_SPECS.footprint,
          )}
          testid="inspect-footprint"
        />
      </dl>,
    );
    expect(html).toContain("accessory");
    expect(html).not.toContain(">primary<");
    expect(html).not.toContain(":primary");
  });

  it("missing buildingFootprintFact hides the Footprint row (unknown, not invented)", () => {
    const html = renderToStaticMarkup(
      <dl>
        <FactRow
          label="Footprint"
          fact={toFactPresentation(
            { state: "unknown", value: null },
            ROW_SPECS.footprint,
          )}
          testid="inspect-footprint"
        />
      </dl>,
    );
    expect(html).not.toContain("inspect-footprint");
    expect(html).not.toContain("Footprint");
    expect(html).not.toContain(":primary");
  });
});

describe("InspectCard Boundary row — boundaryEdgeFact (P-53)", () => {
  it("gold-shaped present fixture shows role=front from the body", () => {
    const html = renderToStaticMarkup(
      <dl>
        <FactRow
          label="Boundary"
          fact={toFactPresentation(
            { state: "present", value: "front" },
            ROW_SPECS.boundary,
          )}
          testid="inspect-boundary"
        />
      </dl>,
    );
    expect(html).toContain('data-testid="inspect-boundary"');
    expect(html).toContain("Boundary");
    expect(html).toContain("front");
    expect(html).not.toContain("txgio_parcel");
    expect(html).not.toContain("GIS");
  });

  it("gold-shaped atom-miss fixture stays visible and does not paint a GIS ring", () => {
    const html = renderToStaticMarkup(
      <dl>
        <FactRow
          label="Boundary"
          fact={toFactPresentation(
            { state: "pending", value: "property-boundary-edge atom-miss" },
            ROW_SPECS.boundary,
          )}
          testid="inspect-boundary"
        />
      </dl>,
    );
    expect(html).toContain('data-testid="inspect-boundary"');
    expect(html).toContain("property-boundary-edge");
    expect(html).toContain("atom-miss");
    expect(html).not.toContain("txgio_parcel");
    expect(html).not.toContain("parcelRing");
  });

  it("last token is not role: front body is not painted as 0", () => {
    const html = renderToStaticMarkup(
      <dl>
        <FactRow
          label="Boundary"
          fact={toFactPresentation(
            { state: "present", value: "front" },
            ROW_SPECS.boundary,
          )}
          testid="inspect-boundary"
        />
      </dl>,
    );
    expect(html).toContain("front");
    expect(html).not.toContain(">0<");
    expect(html).not.toContain("txgio_parcel");
  });

  it("missing boundaryEdgeFact hides the Boundary row (unknown, not invented)", () => {
    const html = renderToStaticMarkup(
      <dl>
        <FactRow
          label="Boundary"
          fact={toFactPresentation(
            { state: "unknown", value: null },
            ROW_SPECS.boundary,
          )}
          testid="inspect-boundary"
        />
      </dl>,
    );
    expect(html).not.toContain("inspect-boundary");
    expect(html).not.toContain("Boundary");
    expect(html).not.toContain("txgio_parcel");
  });
});

describe("InspectCard Owner row — ownerFact (P-54)", () => {
  it("identified gold-shaped present fixture cites owner-fact taxYear", () => {
    const html = renderToStaticMarkup(
      <dl>
        <FactRow
          label="Owner"
          fact={toFactPresentation(
            { state: "present", value: "2025" },
            ROW_SPECS.owner,
          )}
          testid="inspect-owner"
        />
      </dl>,
    );
    expect(html).toContain('data-testid="inspect-owner"');
    expect(html).toContain("Owner");
    expect(html).toContain("2025");
    expect(html).not.toContain("ownerName");
    expect(html).not.toContain("cad-parcel-roll");
  });

  it("anonymous identified-session-required stays visible and has no owner body", () => {
    const html = renderToStaticMarkup(
      <dl>
        <FactRow
          label="Owner"
          fact={toFactPresentation(
            { state: "pending", value: "owner-fact identified-session-required" },
            ROW_SPECS.owner,
          )}
          testid="inspect-owner"
        />
      </dl>,
    );
    expect(html).toContain('data-testid="inspect-owner"');
    expect(html).toContain("owner-fact");
    expect(html).toContain("identified-session-required");
    expect(html).not.toContain("ownerName");
    expect(html).not.toContain("mailing");
  });

  it("gold-shaped atom-miss fixture stays visible and does not paint a CAD-roll name", () => {
    const html = renderToStaticMarkup(
      <dl>
        <FactRow
          label="Owner"
          fact={toFactPresentation(
            { state: "pending", value: "owner-fact atom-miss" },
            ROW_SPECS.owner,
          )}
          testid="inspect-owner"
        />
      </dl>,
    );
    expect(html).toContain('data-testid="inspect-owner"');
    expect(html).toContain("owner-fact");
    expect(html).toContain("atom-miss");
    expect(html).not.toContain("cad-parcel-roll");
    expect(html).not.toContain("BAKE CAD OWNER");
  });

  it("missing ownerFact hides the Owner row (unknown, not invented)", () => {
    const html = renderToStaticMarkup(
      <dl>
        <FactRow
          label="Owner"
          fact={toFactPresentation(
            { state: "unknown", value: null },
            ROW_SPECS.owner,
          )}
          testid="inspect-owner"
        />
      </dl>,
    );
    expect(html).not.toContain("inspect-owner");
    expect(html).not.toContain("Owner");
    expect(html).not.toContain("cad-parcel-roll");
  });

  it("free/Solo fixture with a CAD side-channel name does not render it", () => {
    const html = renderToStaticMarkup(
      <dl>
        <FactRow
          label="Owner"
          fact={gateOwnerPresentation(
            toFactPresentation(
              { state: "present", value: "GEAUXNU HOLDINGS LLC" },
              ROW_SPECS.owner,
            ),
            "solo",
          )}
          testid="inspect-owner"
        />
      </dl>,
    );
    expect(html).toContain('data-testid="inspect-owner"');
    expect(html).toContain(OWNER_STUDIO_UPGRADE_CUE);
    expect(html).not.toContain("GEAUXNU");
    expect(html).not.toContain("cad-parcel-roll");
  });

  it("Studio fixture with ownerFact.ownerName may render it", () => {
    const html = renderToStaticMarkup(
      <dl>
        <FactRow
          label="Owner"
          fact={gateOwnerPresentation(
            toFactPresentation(
              { state: "present", value: "GEAUXNU HOLDINGS LLC" },
              ROW_SPECS.owner,
            ),
            "studio",
          )}
          testid="inspect-owner"
        />
      </dl>,
    );
    expect(html).toContain("GEAUXNU HOLDINGS LLC");
    expect(html).not.toContain(OWNER_STUDIO_UPGRADE_CUE);
  });

  it("InspectCard wires the studio gate and never paints card.owner", () => {
    const src = readFileSync(resolve(__dirname, "InspectCard.tsx"), "utf8");
    expect(src).toContain("gateOwnerPresentation");
    expect(src).not.toMatch(/card\.owner/);
  });
});

describe("InspectCard City limits row — cityLimitsFact (P-76)", () => {
  it("incorporated fixture shows city name and ETJ unresolved", () => {
    const html = renderToStaticMarkup(
      <dl>
        <FactRow
          label="City limits"
          fact={toFactPresentation(
            {
              state: "present",
              value: "Incorporated — Bastrop · ETJ unresolved",
            },
            ROW_SPECS.cityLimits,
          )}
          testid="inspect-city-limits"
        />
      </dl>,
    );
    expect(html).toContain('data-testid="inspect-city-limits"');
    expect(html).toContain("Incorporated — Bastrop");
    expect(html).toContain("ETJ unresolved");
    expect(html).not.toContain("situsCity");
  });

  it("missing cityLimitsFact hides the City limits row", () => {
    const html = renderToStaticMarkup(
      <dl>
        <FactRow
          label="City limits"
          fact={toFactPresentation(
            { state: "unknown", value: null },
            ROW_SPECS.cityLimits,
          )}
          testid="inspect-city-limits"
        />
      </dl>,
    );
    expect(html).not.toContain("inspect-city-limits");
  });
});

describe("InspectCard Who serves row — who-serves BFF (P-75)", () => {
  it("measured fixture shows holder summary and residual", () => {
    const html = renderToStaticMarkup(
      <dl>
        <FactRow
          label="Who serves"
          fact={whoServesFactPresentation({
            state: "present",
            summary: "water — City of Bastrop",
            residual:
              "SERVICE-LETTER-REQUIRED — territory is not tap/capacity/extension commitment.",
            error: null,
          })}
          testid="inspect-who-serves"
        />
      </dl>,
    );
    expect(html).toContain('data-testid="inspect-who-serves"');
    expect(html).toContain("water — City of Bastrop");
    expect(html).toContain("SERVICE-LETTER-REQUIRED");
  });

  it("unmeasured fixture stays visible with basis only", () => {
    const html = renderToStaticMarkup(
      <dl>
        <FactRow
          label="Who serves"
          fact={whoServesFactPresentation({
            state: "absent",
            summary: "tx_utility_territory_staging row count is 0",
            residual: null,
            error: null,
          })}
          testid="inspect-who-serves"
        />
      </dl>,
    );
    expect(html).toContain("tx_utility_territory_staging row count is 0");
    expect(html).not.toContain("SERVICE-LETTER-REQUIRED");
  });

  it("InspectCard source wires who-serves fetch seam", () => {
    const src = readFileSync(resolve(__dirname, "InspectCard.tsx"), "utf8");
    expect(src).toContain("loadWhoServesPresentation");
    expect(src).toContain("whoServesQueryPointFromCentroid");
    expect(src).toContain('testid: "inspect-who-serves"');
  });
});

describe("InspectCard — P-63 layer absence verdict UI", () => {
  const lookupFailed = {
    state: "absent" as const,
    value: "lookup-failed",
    layerAbsence: {
      verdict: "lookup-failed" as const,
      authority: "Tarrant Appraisal District",
      scopeSearched: "tier:stratmap-roll; county_fips:48439",
      asOf: "2026-08-22",
      basis: "Registry bulk_primary=true; CAMA export not loaded",
    },
  };

  const notApplicable = {
    state: "absent" as const,
    value: "not-applicable",
    layerAbsence: {
      verdict: "not-applicable" as const,
      authority: "none",
      scopeSearched: "unincorporated — no zoning authority",
      asOf: "2026-08-22",
      basis: "Category does not exist for this parcel shape",
    },
  };

  const absentVerified = {
    state: "absent" as const,
    value: "absent-verified",
    layerAbsence: {
      verdict: "absent-verified" as const,
      authority: "Bastrop County CAD",
      scopeSearched: "cad_property.living_area_sqft",
      asOf: "2026-08-22",
      basis: "No improvement area on record",
    },
  };

  it("lookup-failed renders verdict with basis visible in the DOM", () => {
    const html = renderToStaticMarkup(
      <dl>
        <FacetRow
          label="Living area"
          facet={lookupFailed}
          testid="inspect-living-area"
          layerOpenChipId={null}
          onLayerChipToggle={() => {}}
        />
      </dl>,
    );
    expect(html).toContain('data-verdict="lookup-failed"');
    expect(html).toContain("lookup-failed");
    expect(html).toContain("bulk_primary=true");
    expect(html).toContain('data-testid="layer-absence-basis"');
    expect(html).not.toContain("atom-miss");
  });

  it("not-applicable renders distinctly from absent-verified", () => {
    const naHtml = renderToStaticMarkup(
      <dl>
        <FacetRow
          label="Zoning"
          facet={notApplicable}
          testid="inspect-zoning"
          layerOpenChipId={null}
          onLayerChipToggle={() => {}}
        />
      </dl>,
    );
    const avHtml = renderToStaticMarkup(
      <dl>
        <FacetRow
          label="Living area"
          facet={absentVerified}
          testid="inspect-living-area"
          layerOpenChipId={null}
          onLayerChipToggle={() => {}}
        />
      </dl>,
    );
    expect(naHtml).toContain('data-verdict="not-applicable"');
    expect(avHtml).toContain('data-verdict="absent-verified"');
    expect(naHtml).not.toContain("absent-verified");
    expect(avHtml).not.toContain("not-applicable");
  });

  it("silent-empty structural row is flagged, not treated as success", () => {
    const html = renderToStaticMarkup(
      <dl>
        <FacetRow
          label="Living area"
          facet={{
            state: "absent",
            value: "structural layer undeclared",
            silentEmpty: true,
          }}
          testid="inspect-living-area"
        />
      </dl>,
    );
    expect(html).toContain('data-silent-empty="true"');
    expect(html).toContain("undeclared");
    expect(html).not.toContain('data-verdict="lookup-failed"');
  });

  it("chipsForLayerAbsence exposes authority, scope, asOf, basis", () => {
    expect(chipsForLayerAbsence(lookupFailed.layerAbsence).map((c) => c.label)).toEqual([
      "authority",
      "scope",
      "asOf",
      "basis",
    ]);
  });
});

describe("InspectCard — unplaceable is not facets-load-error (P-60 WDLL 2)", () => {
  it("unplaceable used to paint the red box; now it must not", () => {
    const state = inspectCardStateFromResolve({
      kind: "unplaceable",
      reason:
        "No boundary or coordinate is on file for this parcel, so it cannot be placed on the map.",
    });
    expect(state.env.status).not.toBe("error");
    expect(showsFacetsLoadError(state.source, state.env)).toBe(false);
    const html = renderToStaticMarkup(
      showsFacetsLoadError(state.source, state.env) ? (
        <FacetsLoadErrorBanner onRetry={noop} />
      ) : (
        <div data-testid="inspect-card" />
      ),
    );
    expect(html).not.toContain('data-testid="facets-load-error"');
    expect(html).not.toContain("Could not load");
  });

  it("throw / transient still renders facets-load-error", () => {
    const state = inspectCardStateFromResolve({
      kind: "failed",
      message: "Parcel facts temporarily unreachable for 48021:35772 — retry.",
    });
    expect(state.env.status).toBe("error");
    expect(showsFacetsLoadError(state.source, state.env)).toBe(true);
    const html = renderToStaticMarkup(
      <FacetsLoadErrorBanner onRetry={noop} />,
    );
    expect(html).toContain('data-testid="facets-load-error"');
    expect(html).toContain("Could not load");
    expect(html).toContain('data-testid="facets-retry"');
  });
});

describe("resolveSheetWithTransientRetry", () => {
  it("retries retryable FactSheetResolveError then succeeds", async () => {
    const { resolveSheetWithTransientRetry } = await import("./InspectCard");
    const { FactSheetResolveError } = await import("../lib/fact-sheet-resolver");
    let calls = 0;
    const out = await resolveSheetWithTransientRetry(
      async () => {
        calls += 1;
        if (calls === 1) {
          throw new FactSheetResolveError(
            "unresolved",
            "Parcel facts temporarily unreachable",
            true,
          );
        }
        return "ok";
      },
      { backoffMs: [1], sleep: async () => {} },
    );
    expect(out).toBe("ok");
    expect(calls).toBe(2);
  });

  it("does not retry non-retryable failures", async () => {
    const { resolveSheetWithTransientRetry } = await import("./InspectCard");
    const { FactSheetResolveError } = await import("../lib/fact-sheet-resolver");
    let calls = 0;
    await expect(
      resolveSheetWithTransientRetry(async () => {
        calls += 1;
        throw new FactSheetResolveError("not-found", "missing", false);
      }),
    ).rejects.toThrow("missing");
    expect(calls).toBe(1);
  });
});

describe("InspectCard — cited brief lives in the left card", () => {
  it("researchOpen mounts inspect-brief and relabels the CTA", async () => {
    const { WorkbenchProvider } = await import("../workbench/WorkbenchContext");
    const { createWorkbenchToolStateStore } = await import(
      "../workbench/tool-state-store"
    );
    const html = renderToStaticMarkup(
      <WorkbenchProvider
        activeParcelNodeId="48021:1"
        closeDock={noop}
        host={{ openPaywall: noop }}
        store={createWorkbenchToolStateStore({ storage: null })}
      >
        <InspectCard
          card={CARD}
          parcelNodeId="48021:1"
          onClose={noop}
          onMakeSubject={noop}
          onResearch={noop}
          researchOpen
        />
      </WorkbenchProvider>,
    );
    expect(html).toContain('data-testid="inspect-brief"');
    expect(html).toContain("Hide brief");
    expect(html).not.toContain("Research this →");
  });
});

describe("the fact list is ONE column", () => {
  // Two columns squeezed prose-length values — SPECIAL DISTRICT runs to a
  // paragraph, WHO SERVES to several lines — into roughly 180px inside a
  // 380px dock, and left a dead cell whenever a row had no partner (FLOOD sat
  // beside nothing). Operator 2026-08-28: one column.
  //
  // Pinned on BOTH lists, because they are separate grids and fixing one and
  // not the other is exactly how this half-reverts.
  // Uses the module-level render at the top of this file.

  it("the high-level list is single column", () => {
    const at = html.indexOf('data-testid="inspect-high-level"');
    expect(at).toBeGreaterThan(-1);
    expect(html.slice(at, at + 400)).not.toContain("1fr 1fr");
  });

  it("the expanded fact list is single column", () => {
    const at = html.indexOf('data-testid="inspect-accordion-body"');
    expect(at).toBeGreaterThan(-1);
    expect(html.slice(at, at + 400)).not.toContain("1fr 1fr");
  });
});
