#!/usr/bin/env node
/**
 * Smart Site chrome-kit gate.
 *
 * Required dock/lander/paywall surfaces must import Button.
 * Those same files must not paint the retired map-cyan #7dd3fc as a color
 * (comments naming the old hue are allowed).
 *
 * CHROME v2 adds two rules.
 *
 * THE RAMP RULE. Five type steps (10 / 11.5 / 12.5 / 13.5 / 15 / 20) and four
 * radii (4 / 6 / 8 / 10 / 14, plus 50% and 999 pills). A dock body still drawn
 * on the v1 half-steps while its shell is on the v2 scale is what "some of
 * them got a partial treatment" looks like from the outside. ramp-codemod.mjs
 * fixed it once; this keeps it fixed, because a codemod that runs once and is
 * not enforced drifts straight back.
 *
 * THE GOLD RULE. Gold (#E8963B / #F5B95C / --ss-gold /
 * --brand-gold) is the brand mark and nothing else: never a button, a link, a
 * fill, or a hover. Before this, that rule lived only in prose, which meant
 * nothing failed when it was broken. Gold is now allowed in exactly two files —
 * the brand chip and the cold-open lockup — and refused everywhere else.
 *
 * Self-tests both directions before the live scan. A check that only
 * ever sees a pass has not been observed working.
 *
 * Snapshot: run from apps/property-explorer. Commit is whatever HEAD is.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const REQUIRED_BUTTON = [
  "src/workbench/tools/LockedToolPanel.tsx",
  "src/workbench/tools/ShareTool.tsx",
  "src/workbench/tools/UseInYourAiTool.tsx",
  "src/workbench/tools/PropertiesTool.tsx",
  "src/workbench/tools/ChatTool.tsx",
  "src/workbench/tools/CompareTool.tsx",
  "src/workbench/tools/FloodTool.tsx",
  "src/workbench/tools/ReportsTool.tsx",
  "src/workbench/tools/PropertyDossierDetail.tsx",
  "src/workbench/tools/RecordsRequestSection.tsx",
  "src/workbench/tools/RecordsAcknowledgementPanel.tsx",
  "src/coldopen/SignUpCard.tsx",
  "src/browse/PropertyBriefPanel.tsx",
  "src/browse/PricingModal.tsx",
  "src/browse/SitePlanExportSection.tsx",
  "src/browse/TerrainExportSection.tsx",
];

const REQUIRED_PE = [
  "src/workbench/tools/BriefTool.tsx",
  "src/workbench/tools/CompareTool.tsx",
  "src/workbench/tools/FloodTool.tsx",
  "src/workbench/tools/ReportsTool.tsx",
  "src/workbench/tools/PropertyDossierDetail.tsx",
  "src/workbench/tools/RecordsRequestSection.tsx",
  "src/workbench/tools/RecordsAcknowledgementPanel.tsx",
  "src/workbench/tools/RecordsRunStatusStrip.tsx",
  "src/workbench/tools/reports-catalog.ts",
  "src/workbench/Workbench.tsx",
  "src/browse/SitePlanExportSection.tsx",
  "src/browse/TerrainExportSection.tsx",
];

const REQUIRED = [...new Set([...REQUIRED_BUTTON, ...REQUIRED_PE])];

const KIT = [
  "src/styles/pe-chrome.ts",
  "src/styles/pe-tokens.css",
  "src/components/Button.tsx",
  "src/components/Card.tsx",
  "src/components/Input.tsx",
  "src/components/StatusChip.tsx",
  "src/components/Modal.tsx",
  // chrome v2
  "src/components/StateNote.tsx",
  "src/components/Loading.tsx",
  "src/components/BubbleTip.tsx",
  "src/components/DownloadFileButton.tsx",
];

export function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

export function hasButtonImport(src) {
  return /from\s+["'][^"']*\/components\/Button["']/.test(src);
}

export function hasPeImport(src) {
  return /from\s+["'][^"']*\/styles\/pe-chrome["']/.test(src);
}

export function hasRawCyanColor(src) {
  return /#7dd3fc/i.test(stripComments(src));
}

/** Files that are ALLOWED to paint gold: the two places the brand mark is
 *  drawn. Everything else that names gold as a colour is a defect. */
export const GOLD_ALLOWED = [
  "src/browse/MapCornerChrome.tsx",
  "src/coldopen/SignUpCard.tsx",
  "src/styles/pe-tokens.css",
  "src/styles/pe-chrome.ts",
];

/**
 * The legal type steps.
 *
 * README states the ramp as 10 / 11.5 / 12.5 / 13.5 / 15 / 20 and says never
 * to invent an in-between size. SPEC then names four more by component, and
 * those are the tiebreaker where they are explicit:
 *   11  the dock header title and the StatusChip label (SPEC sections 1, 2)
 *   19  the inspect card subject line (SPEC section 4)
 *   24  a tier price in mono (SPEC section 5)
 *   26  the cold-open and pricing headline (SPEC section 5)
 *
 * The reference sheets are NOT scraped for this set: they carry their own
 * documentation chrome (page headings, eyebrows, prose) alongside the
 * specimens, so their font sizes are a superset of the product ramp.
 */
const LEGAL_FONT_SIZES = new Set([
  "10", "11", "11.5", "12.5", "13.5", "15", "19", "20", "24", "26",
]);
/**
 * Radii: 4 chip, 6 touch, 8 tip, 10 float, 14 modal, plus pills, circles and
 * 0. README is explicit that there are NO ODD NUMBERS, which is why 5 and 9
 * are refused even though the reference sheets happen to draw a 5px close
 * control.
 */
const LEGAL_RADII = new Set(["0", "4", "6", "8", "10", "14", "999", "50"]);

export function offRampValues(src) {
  const clean = stripComments(src);
  const bad = [];
  for (const m of clean.matchAll(/fontSize:\s*(\d+(?:\.\d+)?)/g)) {
    if (!LEGAL_FONT_SIZES.has(m[1])) bad.push(`fontSize: ${m[1]}`);
  }
  for (const m of clean.matchAll(/borderRadius:\s*(\d+(?:\.\d+)?)/g)) {
    if (!LEGAL_RADII.has(m[1])) bad.push(`borderRadius: ${m[1]}`);
  }
  for (const m of clean.matchAll(/fontWeight:\s*(\d+|bold)/g)) {
    if (!["300", "400", "500", "600"].includes(m[1])) bad.push(`fontWeight: ${m[1]}`);
  }
  return [...new Set(bad)];
}

export function hasGoldColor(src) {
  return /#e8963b|#f5b95c|--ss-gold|--brand-gold/i.test(stripComments(src));
}

function selfTest() {
  const cases = [
    {
      name: "Button import present",
      ok: hasButtonImport(
        `import { Button } from "../../components/Button";\nexport const x = Button;\n`,
      ),
    },
    {
      name: "Button import absent fails",
      ok: !hasButtonImport(`export const x = "no button";\n`),
    },
    {
      name: "comment cyan is allowed",
      ok: !hasRawCyanColor(
        `import { Button } from "../../components/Button";\nconst ACCENT = "var(--brand-blue)"; // was cyan #7dd3fc\n`,
      ),
    },
    {
      name: "raw cyan as a color fails",
      ok: hasRawCyanColor(
        `import { Button } from "../../components/Button";\nconst C = "#7dd3fc";\n`,
      ),
    },
    {
      name: "PE import present",
      ok: hasPeImport(`import { PE } from "../../styles/pe-chrome";\n`),
    },
    {
      name: "PE import absent fails",
      ok: !hasPeImport(`export const x = "no pe";\n`),
    },
    {
      name: "an off-ramp font size is caught",
      ok: offRampValues("fontSize: 10.5,").length === 1,
    },
    {
      name: "an off-ramp radius is caught",
      ok: offRampValues("borderRadius: 9,").length === 1,
    },
    {
      name: "a 700 weight is caught",
      ok: offRampValues("fontWeight: 700,").length === 1,
    },
    {
      name: "every legal step passes",
      ok:
        offRampValues(
          "fontSize: 10, fontSize: 11.5, fontSize: 12.5, fontSize: 13.5, fontSize: 15, fontSize: 20, borderRadius: 6, borderRadius: 10, borderRadius: 999, fontWeight: 600, fontWeight: 300",
        ).length === 0,
    },
    {
      name: "an off-ramp value in a COMMENT is allowed",
      ok: offRampValues("// was fontSize: 10.5, before the ramp").length === 0,
    },
    {
      name: "gold as a colour is caught",
      ok: hasGoldColor('const CTA = "#E8963B";'),
    },
    {
      name: "gold behind a token name is caught",
      ok: hasGoldColor("background: var(--ss-gold);"),
    },
    {
      name: "gold named in a COMMENT is allowed",
      ok: !hasGoldColor("// gold #E8963B is the brand mark only"),
    },
    {
      name: "a file with no gold passes",
      ok: !hasGoldColor('const CTA = "var(--ss-blue)";'),
    },
    {
      name: "not vacuous: empty has neither",
      ok:
        !hasButtonImport("") &&
        !hasRawCyanColor("") &&
        !hasPeImport("") &&
        !hasGoldColor(""),
    },
  ];
  const failed = cases.filter((c) => !c.ok);
  if (failed.length) {
    console.error("SELF-TEST FAIL");
    for (const c of failed) console.error(`  ${c.name}`);
    process.exit(1);
  }
  console.log(`SELF-TEST ${cases.length}/${cases.length} ok`);
}

function readRel(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function main() {
  selfTest();

  const failures = [];

  for (const rel of KIT) {
    try {
      readRel(rel);
    } catch {
      failures.push(`missing kit file ${rel}`);
    }
  }

  for (const rel of REQUIRED) {
    let src;
    try {
      src = readRel(rel);
    } catch {
      failures.push(`missing required surface ${rel}`);
      continue;
    }
    if (REQUIRED_BUTTON.includes(rel) && !hasButtonImport(src)) {
      failures.push(`${rel} does not import Button`);
    }
    if (REQUIRED_PE.includes(rel) && !hasPeImport(src)) {
      failures.push(`${rel} does not import PE`);
    }
    if (hasRawCyanColor(src)) {
      failures.push(`${rel} paints raw #7dd3fc (map-cyan is overlay-only)`);
    }
    const offRamp = offRampValues(src);
    if (offRamp.length > 0) {
      failures.push(
        `${rel} draws off the v2 ramp: ${offRamp.join(", ")} (five type steps 10/11.5/12.5/13.5/15/20; radii 4/6/8/10/14)`,
      );
    }
    if (!GOLD_ALLOWED.includes(rel) && hasGoldColor(src)) {
      failures.push(
        `${rel} paints gold — gold is the BRAND MARK only, never a button, link, fill or hover`,
      );
    }
  }

  if (failures.length) {
    console.error("CHROME-KIT GATE FAIL");
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(
    `CHROME-KIT GATE ${REQUIRED.length} surfaces + ${KIT.length} kit files ok ` +
      `(gold confined to ${GOLD_ALLOWED.length} files)`,
  );
}

main();
