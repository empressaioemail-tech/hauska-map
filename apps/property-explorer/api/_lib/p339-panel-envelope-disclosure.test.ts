/**
 * P-339 (OPS-24, ruling 15) — the panel's envelope sentence must not deny what
 * the same payload and the same route serve.
 *
 * THE INSTRUMENT'S CONTRACT, transcribed from `scripts/surface-probe.mjs` at
 * doc_repo c5eb6666 (the probe owns these lists; this copy exists only so a
 * second hand-typed sentence in hauska-map fails here rather than in a live
 * run after a deploy). If the probe's lists change, this copy is drift and the
 * revert-and-run evidence will catch it:
 *   RULE_REFUSAL_PHRASES     = ["unruled", "no ruled table", "rules pending",
 *                               "no setback rule", "setback table (unknown)",
 *                               "setback table unknown"]        (line 1807)
 *   GEOMETRY_REFUSAL_PHRASES = ["depth-warm geometry withheld", "geometry
 *                               withheld", "geometry unavailable", "envelope
 *                               geometry withheld", "atom_path_pending",
 *                               "atom-path-pending", "no envelope geometry",
 *                               "geometry pending"]             (line 1808)
 *   saysOutlineDrawn         = /outline is (?:modelled|modeled|drawn)|drawn for
 *                               reference|outline is served|outline served/i
 *                                                              (line 1809)
 * A finding needs a phrase AND the thing the phrase denies; the geometry class
 * additionally needs the text to MISS saysOutlineDrawn.
 */
import { describe, expect, it } from "vitest";

import { codifiedTableEnvelopeDisclosure } from "./setback-table-envelope-wording.js";

const RULE_REFUSAL_PHRASES = [
  "unruled",
  "no ruled table",
  "rules pending",
  "no setback rule",
  "setback table (unknown)",
  "setback table unknown",
];
const GEOMETRY_REFUSAL_PHRASES = [
  "depth-warm geometry withheld",
  "geometry withheld",
  "geometry unavailable",
  "envelope geometry withheld",
  "atom_path_pending",
  "atom-path-pending",
  "no envelope geometry",
  "geometry pending",
];
const saysOutlineDrawn = (text: string) =>
  /outline is (?:modelled|modeled|drawn)|drawn for reference|outline is served|outline served/i.test(
    text,
  );

const hits = (text: string, phrases: string[]) =>
  phrases.filter((p) => text.toLowerCase().includes(p));

/** The exact pre-change string, reconstructed from the artifact of record's
 *  `requiredCases[0].measuredPanelHalf.panelDisclosure` (48453:367134), up to
 *  the two notes appended downstream (`applyEnvelopeSetbackOverride`,
 *  `disclosureWithCitationVintage`). */
const PRE_CHANGE_MEASURED =
  "Codified setback table (unknown); depth-warm geometry withheld — " +
  "warm-verify-decline Reader-composed axis override (parcel_record) applied to one or more " +
  "setback axes; other axes remain atom-chain-sourced. Setback rule vintage unknown — the rule " +
  "is served undated, not as current. Verify with the city.";

/** The note `pe-property-atoms.ts` appends, and the vintage sentence
 *  `setback-citation-vintage.ts` appends. Both stay: neither is a refusal
 *  phrase, and both are true of the payload they travel with. */
const DOWNSTREAM_APPENDIX =
  " Reader-composed axis override (parcel_record) applied to one or more setback axes; other " +
  "axes remain atom-chain-sourced. Setback rule vintage unknown — the rule is served undated, " +
  "not as current. Verify with the city.";

describe("P-339 panel — the pre-change string IS the measured contradiction (both directions proven)", () => {
  it("a ruled table + drawn geometry means this sentence trips BOTH phrase classes", () => {
    expect(hits(PRE_CHANGE_MEASURED, RULE_REFUSAL_PHRASES)).toContain(
      "setback table (unknown)",
    );
    // "depth-warm geometry withheld" also contains the shorter "geometry
    // withheld" entry; either is enough to trip the class.
    expect(hits(PRE_CHANGE_MEASURED, GEOMETRY_REFUSAL_PHRASES)).toContain(
      "depth-warm geometry withheld",
    );
    expect(hits(PRE_CHANGE_MEASURED, GEOMETRY_REFUSAL_PHRASES).length).toBeGreaterThan(0);
    expect(saysOutlineDrawn(PRE_CHANGE_MEASURED)).toBe(false);
  });
});

describe("P-339 panel — the measured live cases after the change", () => {
  it("48453:367134 / 48453:239852 / 48453:445501: no jurisdiction stamp, axes from the chain's own rule", () => {
    const text = codifiedTableEnvelopeDisclosure({
      jurisdictionKey: null,
      servedFromAtomChainRule: true,
      warmVerifyDeclineReason: "warm-verify-decline",
    });
    expect(hits(text, RULE_REFUSAL_PHRASES)).toEqual([]);
    expect(hits(text, GEOMETRY_REFUSAL_PHRASES)).toEqual([]);
    expect(saysOutlineDrawn(text)).toBe(true);
    expect(text).toContain("property atom chain's own setback rule");
  });

  it("48021:51735: a stamped jurisdiction is NAMED, never reported as unknown", () => {
    const text = codifiedTableEnvelopeDisclosure({
      jurisdictionKey: "bastrop-city-tx",
      servedFromAtomChainRule: false,
      warmVerifyDeclineReason: "front-orientation",
    });
    expect(text).toContain("bastrop-city-tx");
    expect(hits(text, RULE_REFUSAL_PHRASES)).toEqual([]);
    expect(hits(text, GEOMETRY_REFUSAL_PHRASES)).toEqual([]);
    expect(saysOutlineDrawn(text)).toBe(true);
  });

  it("the downstream appendix keeps the whole served string clean", () => {
    const composed =
      codifiedTableEnvelopeDisclosure({
        jurisdictionKey: null,
        servedFromAtomChainRule: true,
        warmVerifyDeclineReason: "warm-verify-decline",
      }) + DOWNSTREAM_APPENDIX;
    expect(hits(composed, RULE_REFUSAL_PHRASES)).toEqual([]);
    expect(hits(composed, GEOMETRY_REFUSAL_PHRASES)).toEqual([]);
    expect(saysOutlineDrawn(composed)).toBe(true);
  });

  it("falsifier: the sentence must not clear the lists by claiming nothing at all", () => {
    const text = codifiedTableEnvelopeDisclosure({
      jurisdictionKey: null,
      servedFromAtomChainRule: true,
      warmVerifyDeclineReason: "warm-verify-decline",
    });
    // It names its source, names the owner, and carries the route's own note.
    expect(text).toContain("Setbacks read from");
    expect(text).toContain("drawing route");
    expect(text).toContain("warm-verify-decline");
    expect(text.length).toBeGreaterThan(120);
  });

  it("falsifier: an absent stamp is declared, and the words 'unknown' never attach to a served table", () => {
    const text = codifiedTableEnvelopeDisclosure({
      jurisdictionKey: null,
      servedFromAtomChainRule: false,
      warmVerifyDeclineReason: null,
    });
    expect(text).toContain("no jurisdiction stamp on this payload");
    expect(text).not.toContain("setback table (unknown)");
    expect(hits(text, RULE_REFUSAL_PHRASES)).toEqual([]);
    expect(saysOutlineDrawn(text)).toBe(true);
  });
});
