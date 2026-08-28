// SS-W2 — Smart Site consumer surface (P-40).
//
// Pins the two frozen invariants this lane was dispatched against:
//   I3  provenance is a sibling of the value, never inside it
//   I4  failure is not an absence
// (`_catalog/parcel_fact_sheet_contract/CONTRACT_RULES.md`, frozen 2026-08-18)
//
// plus the four presentation defects the operator QA pass reported.
//
// Kept in its own file rather than appended to InspectCard.test.tsx: six lanes
// are editing this repo in parallel and a new file is the smallest merge
// surface. Same renderToStaticMarkup harness as its sibling — effects never
// run, so the presentational pieces are exported as direct test seams (the
// chipsForRow / SetbackXrayDetail precedent) and driven by props.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  InspectCard,
  FactRow,
  SourcesDisclosure,
  splitWeldedProvenance,
  toFactPresentation,
  resolveCardHeading,
  coverageFooterLine,
  joinList,
  ROW_SPECS,
  type FactPresentation,
} from "./InspectCard";
import type { ParcelCardData } from "./liveGis";

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

// ---------------------------------------------------------------------------
// Items 1 and 2 — internal engineering language is off the consumer surface.
// ---------------------------------------------------------------------------

describe("SS-W2 items 1+2 — no internal engineering language on the card", () => {
  const rendered = renderToStaticMarkup(
    <InspectCard
      card={CARD}
      parcelNodeId="48021:141209"
      onClose={noop}
      onMakeSubject={noop}
      onResearch={noop}
      onSaveProperty={noop}
    />,
  );

  it("renders no ICC / WDLL roadmap note — it named one of our work items to customers", () => {
    expect(rendered).not.toContain('data-testid="icc-hold"');
    expect(rendered).not.toContain("WDLL");
    expect(rendered).not.toContain("ICC ingest");
    expect(rendered).not.toContain("credentials pending");
  });

  it("renders no Smart Files dev mount probe", () => {
    expect(rendered).not.toContain('data-testid="smart-files-mount"');
    expect(rendered).not.toContain("Isolation probe");
    expect(rendered).not.toContain("get-by");
  });

  it("carries no gate or access-policy vocabulary on the card face", () => {
    expect(rendered).not.toContain("gate-passed");
    expect(rendered).not.toContain("public-paid");
    expect(rendered).not.toContain("platform-internal");
  });
});

// ---------------------------------------------------------------------------
// Item 3 / invariant I3 — provenance is a sibling of the value.
// ---------------------------------------------------------------------------

describe("SS-W2 item 3 / I3 — provenance is demoted, never welded into the value", () => {
  it("splits the land-use source list the deriver welds onto the value", () => {
    expect(
      splitWeldedProvenance(
        "A1 — Single-family residential (cad-roll · data-export-01.14.2026)",
        "machine-key",
      ),
    ).toEqual({
      value: "A1 — Single-family residential",
      provenance: "cad-roll · data-export-01.14.2026",
    });
  });

  it("splits an acreage derivation method off the value", () => {
    expect(splitWeldedProvenance("0.2345 ac (shoelace-wgs84)", "machine-key")).toEqual({
      value: "0.2345 ac",
      provenance: "shoelace-wgs84",
    });
  });

  it("splits a county FIPS under the fips mode, and only under that mode", () => {
    expect(splitWeldedProvenance("Bastrop County (48021)", "fips")).toEqual({
      value: "Bastrop County",
      provenance: "FIPS 48021",
    });
    expect(splitWeldedProvenance("Bastrop County (48021)", "machine-key")).toEqual({
      value: "Bastrop County (48021)",
      provenance: null,
    });
  });

  it("LEAVES ORDINARY PROSE ALONE — a mangled value is worse than a missed demotion", () => {
    expect(splitWeldedProvenance("A1 — Vacant (rural)", "machine-key")).toEqual({
      value: "A1 — Vacant (rural)",
      provenance: null,
    });
    expect(splitWeldedProvenance("Single family", "machine-key")).toEqual({
      value: "Single family",
      provenance: null,
    });
    expect(splitWeldedProvenance("0.2345 ac (shoelace-wgs84)", undefined)).toEqual({
      value: "0.2345 ac (shoelace-wgs84)",
      provenance: null,
    });
  });

  it("a parenthetical with nothing before it is untouched", () => {
    expect(splitWeldedProvenance("(cad-roll)", "machine-key")).toEqual({
      value: "(cad-roll)",
      provenance: null,
    });
  });

  it("the row shows the value and the provenance is NOT in the row", () => {
    const row = renderToStaticMarkup(
      <dl>
        <FactRow
          label="Land use"
          fact={{
            state: "present",
            value: "A1 — Single-family residential",
            provenance: "cad-roll · data-export-01.14.2026",
          }}
          testid="inspect-landuse"
        />
      </dl>,
    );
    expect(row).toContain("A1 — Single-family residential");
    expect(row).not.toContain("cad-roll");
    expect(row).not.toContain("data-export-01.14.2026");
  });

  it("DEMOTED, NEVER DELETED — the disclosure carries every source key", () => {
    const entries = [
      { label: "Land use", detail: "cad-roll · data-export-01.14.2026" },
    ];
    const collapsed = renderToStaticMarkup(
      <SourcesDisclosure isOpen={false} onToggle={noop} asOf="2026-01-14" entries={entries} />,
    );
    expect(collapsed).toContain("Checked against the county record");
    expect(collapsed).toContain("as of 2026-01-14");
    expect(collapsed).toContain('aria-expanded="false"');
    expect(collapsed).not.toContain("cad-roll");

    const open = renderToStaticMarkup(
      <SourcesDisclosure isOpen={true} onToggle={noop} asOf="2026-01-14" entries={entries} />,
    );
    expect(open).toContain('data-testid="inspect-sources-detail"');
    expect(open).toContain("cad-roll · data-export-01.14.2026");
  });

  it("no entries means no toggle affordance — never an empty disclosure", () => {
    const html = renderToStaticMarkup(
      <SourcesDisclosure isOpen={false} onToggle={noop} asOf={null} entries={[]} />,
    );
    expect(html).not.toContain('data-testid="inspect-sources-toggle"');
  });
});

// ---------------------------------------------------------------------------
// Item 4 / invariant I4 — failure is not an absence.
// ---------------------------------------------------------------------------

describe("SS-W2 item 4 / I4 — three absences, three registers", () => {
  const render1 = (fact: FactPresentation) =>
    renderToStaticMarkup(
      <dl>
        <FactRow label="Zoning" fact={fact} testid="inspect-zoning" />
      </dl>,
    );

  const covered = render1({
    state: "absent-covered",
    reason: "no zoning value on record here",
    provenance: null,
  });
  const uncovered = render1({
    state: "absent-uncovered",
    reason: "no zoning stamp here",
    wouldBeFilledBy: "a zoning district stamp from this parcel's city or county",
  });
  const unresolved = render1({
    state: "unresolved",
    reason: "Could not load zoning",
    retryable: true,
  });

  const ddStyle = (html: string) =>
    /style="([^"]*)"/.exec(html.slice(html.indexOf("<dd")))?.[1] ?? "";

  it("STRUCTURALLY distinct: each state stamps its own data-state", () => {
    expect(covered).toContain('data-state="absent-covered"');
    expect(uncovered).toContain('data-state="absent-uncovered"');
    expect(unresolved).toContain('data-state="unresolved"');
  });

  it("VISUALLY distinct: ALL FIVE states render a different treatment", () => {
    // Stronger than I4 requires on purpose. absent-covered and pending were
    // byte-identical in the first cut of this renderer, which would have read
    // as "nothing on record" while the value was still loading. Pinning all
    // five pairwise stops any future state collapsing into another.
    const present = render1({ state: "present", value: "R-1", provenance: null });
    const pending = render1({ state: "pending", label: "Loading zoning…" });
    const styles = [present, pending, covered, uncovered, unresolved].map(ddStyle);
    expect(new Set(styles).size).toBe(5);
  });

  it("only `unresolved` wears the error hue — an honest absence never does", () => {
    // chrome v2 renamed --semantic-error -> --ss-err; same hex. The rule the
    // test actually holds (only a FAILED lookup is red) is unchanged.
    expect(unresolved).toMatch(/--ss-err|--semantic-error/);
    expect(covered).not.toContain("--semantic-error");
    expect(covered).not.toContain("--ss-err");
    expect(uncovered).not.toContain("--semantic-error");
    expect(uncovered).not.toContain("--ss-err");
  });

  it("the retired treatment is gone: no absence is grey italic 'not verified here'", () => {
    expect(covered).not.toContain("font-style:italic");
    expect(uncovered).not.toContain("font-style:italic");
    expect(covered).not.toContain("not verified here");
    expect(uncovered).not.toContain("not verified here");
  });

  it("`absent-uncovered` carries the hatch that `absent-covered` does not", () => {
    expect(uncovered).toContain("dashed");
    expect(covered).not.toContain("dashed");
  });

  it("`pending` is not an absence, never says verified, and is not hatched", () => {
    const pending = render1({ state: "pending", label: "Loading zoning…" });
    expect(pending).toContain('data-state="pending"');
    expect(pending).toContain("Loading zoning…");
    expect(pending).not.toContain("verified");
    expect(pending).not.toContain("dashed");
    expect(pending).not.toContain("--semantic-error");
    expect(pending).not.toContain("--ss-err");
  });

  it("a null fact renders nothing — the `unknown` facet stays hidden", () => {
    expect(
      renderToStaticMarkup(
        <dl>
          <FactRow label="Zoning" fact={null} />
        </dl>,
      ),
    ).toBe("<dl></dl>");
  });

  it("an uncovered absence NAMES what would fill it", () => {
    expect(coverageFooterLine(["Zoning", "Setbacks"])).toBe(
      "We have not stamped zoning and setbacks for this area.",
    );
    expect(coverageFooterLine([])).toBe("");
    expect(joinList(["a", "b", "c"])).toBe("a, b and c");
    expect(joinList(["a"])).toBe("a");
    expect(joinList([])).toBe("");
  });
});

describe("SS-W2 — the CardFacet shim maps today's model onto the contract states", () => {
  it("a labelled absence on a COVERED row is absent-covered", () => {
    expect(
      toFactPresentation(
        { state: "absent", value: "no land-use value on record here" },
        { wouldBeFilledBy: "a land-use code", labelledAbsenceIsCovered: true },
      ),
    ).toEqual({
      state: "absent-covered",
      reason: "no land-use value on record here",
      provenance: null,
    });
  });

  it("a bare absence is absent-uncovered and inherits wouldBeFilledBy", () => {
    expect(
      toFactPresentation(
        { state: "absent", value: null },
        { wouldBeFilledBy: "a land-use code", labelledAbsenceIsCovered: true },
      ),
    ).toEqual({
      state: "absent-uncovered",
      reason: "Not stamped here",
      wouldBeFilledBy: "a land-use code",
    });
  });

  it("zoning's labelled absence stays UNCOVERED — its labels describe an unstamped area", () => {
    expect(
      toFactPresentation(
        { state: "absent", value: "no zoning stamp here" },
        { wouldBeFilledBy: "a zoning district stamp" },
      ),
    ).toEqual({
      state: "absent-uncovered",
      reason: "no zoning stamp here",
      wouldBeFilledBy: "a zoning district stamp",
    });
  });

  it("pending survives as pending, never as an absence", () => {
    expect(
      toFactPresentation(
        { state: "pending", value: "Loading setbacks…" },
        { wouldBeFilledBy: "x" },
      ),
    ).toEqual({ state: "pending", label: "Loading setbacks…" });
  });

  it("unknown maps to null, unchanged", () => {
    expect(
      toFactPresentation({ state: "unknown", value: null }, { wouldBeFilledBy: "x" }),
    ).toBeNull();
  });

  it("a present value is split according to its row spec", () => {
    expect(
      toFactPresentation(
        { state: "present", value: "0.2345 ac (shoelace-wgs84)" },
        { wouldBeFilledBy: "x", splitProvenance: "machine-key" },
      ),
    ).toEqual({ state: "present", value: "0.2345 ac", provenance: "shoelace-wgs84" });
  });
});

// ---------------------------------------------------------------------------
// Item 5 — saved-property state.
// ---------------------------------------------------------------------------

describe("SS-W2 item 5 — the Save control reads its own state", () => {
  const unsaved = renderToStaticMarkup(
    <InspectCard
      card={CARD}
      parcelNodeId="48021:141209"
      isSaved={false}
      onClose={noop}
      onMakeSubject={noop}
      onResearch={noop}
      onSaveProperty={noop}
    />,
  );
  const alreadySaved = renderToStaticMarkup(
    <InspectCard
      card={CARD}
      parcelNodeId="48021:141209"
      isSaved={true}
      onClose={noop}
      onMakeSubject={noop}
      onResearch={noop}
      onSaveProperty={noop}
      onUnsaveProperty={noop}
    />,
  );

  const saveBlock = (html: string) => {
    const after = html.slice(html.indexOf('data-testid="save-property"'));
    return after.slice(0, after.indexOf("</button>"));
  };

  it("an unsaved property offers Save", () => {
    expect(unsaved).toContain("Save property");
    expect(saveBlock(unsaved)).toContain('aria-pressed="false"');
    expect(unsaved).not.toContain('data-saved="true"');
  });

  it("an already-saved property does not re-offer Save; it offers Remove in place", () => {
    expect(alreadySaved).not.toContain(">Save property<");
    expect(alreadySaved).toContain("Saved · Remove");
    expect(alreadySaved).toContain('data-saved="true"');
    expect(saveBlock(alreadySaved)).toContain('aria-pressed="true"');
  });

  it("stays ENABLED when saved — unlike make-subject, the opposite of save is an action", () => {
    const block = saveBlock(alreadySaved);
    expect(block.slice(0, block.indexOf(">"))).not.toContain("disabled");
  });

  it("make-subject keeps its own inert-when-active behavior (the pattern this copies)", () => {
    const asSubject = renderToStaticMarkup(
      <InspectCard
        card={CARD}
        parcelNodeId="48021:141209"
        isSubject={true}
        onClose={noop}
        onMakeSubject={noop}
        onResearch={noop}
      />,
    );
    expect(asSubject).toContain("Subject property");
    const after = asSubject.slice(asSubject.indexOf('data-testid="make-subject"'));
    expect(after.slice(0, after.indexOf(">"))).toContain("disabled");
  });

  it("no save affordance at all when the parent passes no save handler", () => {
    const noSave = renderToStaticMarkup(
      <InspectCard
        card={CARD}
        parcelNodeId="48021:141209"
        onClose={noop}
        onMakeSubject={noop}
        onResearch={noop}
      />,
    );
    expect(noSave).not.toContain('data-testid="save-property"');
  });
});

// ---------------------------------------------------------------------------
// Item 7 — a missing address is a display gap, not a broken header.
// ---------------------------------------------------------------------------

describe("SS-W2 item 7 — the vacant-parcel header", () => {
  it("a bare quote character off the county roll is NOT an address", () => {
    expect(resolveCardHeading('"', "141209")).toEqual({
      title: "Parcel 141209",
      isAddress: false,
    });
  });

  it("whitespace-only and punctuation-only situs values fall through the same way", () => {
    expect(resolveCardHeading("  ", "141209").title).toBe("Parcel 141209");
    expect(resolveCardHeading("--", "141209").title).toBe("Parcel 141209");
    expect(resolveCardHeading(null, "141209").title).toBe("Parcel 141209");
    expect(resolveCardHeading(undefined, "141209").title).toBe("Parcel 141209");
  });

  it("no address AND no parcel number still renders a designed state", () => {
    expect(resolveCardHeading('"', null)).toEqual({
      title: "Selected parcel",
      isAddress: false,
    });
  });

  it("a real address wins and is reported as an address", () => {
    expect(resolveCardHeading("714 Spring St", "141209")).toEqual({
      title: "714 Spring St",
      isAddress: true,
    });
  });

  it("Travis-style , TX sentinel is not an address title (P-74)", () => {
    expect(resolveCardHeading(", TX", "280239")).toEqual({
      title: "Parcel 280239",
      isAddress: false,
    });
    expect(resolveCardHeading("908 PINE , BASTROP, TX 78602", "34137")).toEqual({
      title: "908 PINE , BASTROP, TX 78602",
      isAddress: true,
    });
  });

  it("the card renders the designed caption, never a stray quote as the title", () => {
    const vacant = renderToStaticMarkup(
      <InspectCard
        card={{ ...CARD, situsAddress: '"' }}
        parcelNodeId={null}
        onClose={noop}
        onMakeSubject={noop}
        onResearch={noop}
      />,
    );
    expect(vacant).toContain('data-testid="inspect-no-address"');
    expect(vacant).toContain("No street address on the county record");
    expect(/data-testid="inspect-title">([^<]*)</.exec(vacant)?.[1]).toBe("Parcel 141209");
  });

  it("an addressed parcel shows no no-address caption", () => {
    const addressed = renderToStaticMarkup(
      <InspectCard
        card={CARD}
        parcelNodeId={null}
        onClose={noop}
        onMakeSubject={noop}
        onResearch={noop}
      />,
    );
    expect(addressed).not.toContain('data-testid="inspect-no-address"');
    expect(/data-testid="inspect-title">([^<]*)</.exec(addressed)?.[1]).toBe("714 Spring St");
  });
});

// ---------------------------------------------------------------------------
// Coverage-block scope — which rows are allowed to claim a coverage gap.
// ---------------------------------------------------------------------------

describe("SS-W2 — the coverage block only speaks for STAMPED rows", () => {
  it("exactly land use, zoning and setbacks claim coverage", () => {
    const inBlock = Object.keys(ROW_SPECS).filter(
      (k) => ROW_SPECS[k].inCoverageBlock === true,
    );
    expect(inBlock.sort()).toEqual(["landUse", "setbacks", "zoning"]);
  });

  it("`buildable` is derived, so it never claims a coverage gap of its own", () => {
    // Otherwise the block reads "buildable fills in from zoning setbacks for
    // this parcel" next to the zoning and setbacks rows already saying so.
    expect(ROW_SPECS.buildable.inCoverageBlock).toBeUndefined();
  });

  it("identity rows never claim a coverage gap", () => {
    expect(ROW_SPECS.apn.inCoverageBlock).toBeUndefined();
    expect(ROW_SPECS.county.inCoverageBlock).toBeUndefined();
  });

  it("EVERY row names what would fill it — an unnamed absence is just empty", () => {
    for (const [key, spec] of Object.entries(ROW_SPECS)) {
      expect(spec.wouldBeFilledBy, key).toBeTruthy();
      expect(spec.wouldBeFilledBy.length, key).toBeGreaterThan(10);
    }
  });
});
