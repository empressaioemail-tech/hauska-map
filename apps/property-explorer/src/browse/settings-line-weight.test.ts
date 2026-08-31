// P-95 Settings line-weight pins. No jsdom: read the write path.
//
// pe-tokens.css states the line vocabulary by ROLE, and it is the authority:
//   --ss-line-06  #414247  rules INSIDE a surface
//   --ss-line-14  #56575C  the edge OF a surface
//   --ss-line-28  #8A8A8F  focus, outline buttons, emphasis
//
// SettingsModal painted ordinary structure with the emphasis token ten times
// and the raised Card edge made it eleven, which is why Settings read white
// beside the docks. These pins hold the reclassification.
//
// THE EXEMPTION IS TIED TO ITS WEIGHT, NOT TO A LINE NUMBER. Exactly one
// line28 survives in SettingsModal: the 2px Aside marker, which signals rather
// than structures. Asserting "one line28" alone would be presence-shaped and a
// new 1px border could take the slot the moment the Aside was removed. So the
// assertion is on the DECLARATION TEXT: the surviving use must be 2px. A 1px
// structural line cannot satisfy it, which is the whole point.
//
// stripComments is imported from the chrome-kit gate rather than respelled
// here, so the two instruments cannot disagree about what a comment is. That
// module is import-safe (it runs only under a direct-execution guard).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error - .mjs gate module, no type declarations; allowJs covers it
import { stripComments } from "../../scripts/pe-chrome-kit-gate.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Source with comments removed, so a token named in prose is never counted. */
function code(rel: string): string {
  return stripComments(readFileSync(join(ROOT, rel), "utf8")) as string;
}

function count(src: string, re: RegExp): number {
  return (src.match(re) || []).length;
}

const SETTINGS = "browse/SettingsModal.tsx";
/** Every file that paints a line on the Settings surface. */
const SETTINGS_TREE = [SETTINGS, "components/Card.tsx", "components/Modal.tsx"];

describe("P-95 Settings line weight", () => {
  it("the only line28 left in SettingsModal is the 2px Aside marker", () => {
    const src = code(SETTINGS);
    const declarations = [...src.matchAll(/`([^`]*?)\$\{PE\.line28\}/g)].map(
      (m) => m[1],
    );
    // One survivor, and it is 2px. Emphasis, not structure.
    expect(declarations).toEqual(["2px solid "]);
  });

  it("no 1px structural line28 survives anywhere in the Settings tree", () => {
    for (const file of SETTINGS_TREE) {
      expect(code(file)).not.toMatch(/1px\s+(?:solid|dashed)\s+\$\{PE\.line28\}/);
    }
  });

  it("the raised Card edge is line14, the edge-OF-a-surface token", () => {
    const card = code("components/Card.tsx");
    // The raised branch is the modal shell: raised fill, then its own edge.
    expect(card).toMatch(
      /background:\s*PE\.modalBg,\s*border:\s*`1px solid \$\{PE\.line14\}`/,
    );
    // And the emphasis token is gone from the component entirely.
    expect(card).not.toContain("PE.line28");
  });

  it("Modal's header rule stays line06 — a rule inside a surface", () => {
    expect(code("components/Modal.tsx")).toContain(
      "borderBottom: `1px solid ${PE.line06}`",
    );
  });

  it("Settings splits 7 surface edges / 7 internal rules / 1 emphasis", () => {
    // Counted, not sampled: a flip in either direction moves a number here.
    // 15 line sites total, which is what the file carried before the
    // reclassification too — this changed no line's existence, only its token.
    const src = code(SETTINGS);
    expect(count(src, /PE\.line14/g)).toBe(7);
    expect(count(src, /PE\.line06/g)).toBe(7);
    expect(count(src, /PE\.line28/g)).toBe(1);
  });

  it("the three lines the operator named by sight carry the rule token", () => {
    // The counted pin above cannot tell a line14 edge swapped with a line06
    // rule from the correct split, because 7/7 survives the swap. That is a
    // DECLARED hole in the instrument. These three close it for the sites the
    // operator actually pointed at, keyed on text unique to each call site
    // rather than on a line number, which would rot on the next edit.
    const src = code(SETTINGS);
    // The account/plan row separator inside Panel: only Row is conditional on `last`.
    expect(src).toContain("last ? undefined : `1px solid ${PE.line06}`");
    // The vertical divider before the ON THIS TAB rail: the only 1px borderLeft.
    expect(src).toMatch(/borderLeft:\s*`1px solid \$\{PE\.line06\}`/);
    // The Aside marker is the only borderLeft that is not 1px, and it is the emphasis.
    expect(src).toMatch(/borderLeft:\s*`2px solid \$\{PE\.line28\}`/);
  });

  it("the vocabulary this rests on is still what pe-tokens.css says", () => {
    // A second derivation. If the palette author repoints a token, these pins
    // are reasoning from a definition that no longer holds, and this fails
    // rather than letting the rest of the file pass on a stale premise.
    const tokens = readFileSync(join(ROOT, "styles/pe-tokens.css"), "utf8");
    expect(tokens).toMatch(/--ss-line-06:\s+#414247;\s+\/\* rules INSIDE a surface/);
    expect(tokens).toMatch(/--ss-line-14:\s+#56575C;\s+\/\* the edge OF a surface/);
    expect(tokens).toMatch(
      /--ss-line-28:\s+#8A8A8F;\s+\/\* focus, outline buttons, emphasis/,
    );
  });
});
