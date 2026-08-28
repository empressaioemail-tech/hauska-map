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
 * THE GOLD RULE. Gold (#E8963B / #F5B95C / --ss-gold / --brand-gold) is the
 * brand mark, and as of 2026-08-27 also the rail's unread dot by operator
 * ruling. It is never a button, a link, a fill, or a hover. Before this the
 * rule lived only in prose, which meant nothing failed when it was broken.
 * Gold is allowed in the files listed in GOLD_ALLOWED below — see the note
 * there for why the second job exists and why the carve-out is file-narrow —
 * and refused everywhere else.
 *
 * Self-tests both directions before the live scan. A check that only
 * ever sees a pass has not been observed working.
 *
 * Snapshot: run from apps/property-explorer. Commit is whatever HEAD is.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
  "src/components/Dock.tsx",
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

/* ---------------------------------------------------------------------------
 * W9 (P-93): THE WRITE-PATH RULES — raw hex and native buttons.
 *
 * WHY THE OLD GATE COULD NOT CATCH THESE. It scanned a HAND-MAINTAINED
 * `REQUIRED` list. A brand-new chrome file was never opened, so a new file
 * full of raw hex passed by not being looked at. A hand-declared file list
 * drifts one way only: things get added to the tree, not to the list. These
 * rules walk the tree instead.
 *
 * WHY A BASELINE AND NOT A BAN. The write path already carries 121 raw hexes
 * across 30 files and native buttons in 26. Converting them is explicitly out
 * of this card's scope ("does not restyle the product"). A blanket ban would
 * fail on commit one and be switched off by the next person. So the rule is a
 * RATCHET: every existing violation is recorded in a baseline with a count,
 * and the gate fails when a file exceeds its count or when a file with no
 * entry has any violation at all. New code cannot add either. Old code is
 * grandfathered, counted, and visible — a declared degradation rather than a
 * silent one, and the file is the bill.
 *
 * ISLANDS are exempt outright, not baselined: they are allowed to keep their
 * own palettes forever (map overlay cyan, print gold, Stripe checkout).
 * ------------------------------------------------------------------------- */

/** Named islands. These keep their own look by ruling, not by oversight. */
export const ISLAND_PREFIXES = [
  "src/checkout/",           // Stripe night/Inter — do not restyle
  "src/browse/brief-print",  // print gold
  "src/browse/road-overlay", // map overlay cyan
  "src/browse/flood-map-overlay",
];

export function isIsland(rel) {
  const norm = rel.split("\\").join("/");
  return ISLAND_PREFIXES.some((p) => norm.startsWith(p));
}

/**
 * Raw hex colours written into source. Hex inside a COMMENT is not a paint,
 * so comments are stripped first — the same treatment the gold rule uses.
 */
export function rawHexes(src) {
  return (stripComments(src).match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).map((h) =>
    h.toLowerCase(),
  );
}

/**
 * Native chrome buttons. The kit Button is the only button in chrome.
 *
 * `<button` inside a STRING is markup this file emits for some other
 * document (print HTML, an email), not a React control, so only real JSX
 * opens count. Comments are stripped for the same reason as above.
 */
export function rawButtons(src) {
  return stripComments(src).match(/<button[\s/>]/g) ?? [];
}

export function hasRawCyanColor(src) {
  return /#7dd3fc/i.test(stripComments(src));
}

/**
 * Files ALLOWED to paint gold. Everything else naming gold as a colour is a
 * defect and this gate fails on it.
 *
 * Gold has TWO jobs as of 2026-08-27, not one:
 *   1. the brand mark   — MapCornerChrome (chip), SignUpCard (cold-open lockup)
 *   2. the rail unread dot — Workbench, by operator ruling
 *
 * The second was taken against a recommendation and the recommendation is
 * recorded rather than buried: the original v2 SPEC specified a BLUE dot, and
 * giving gold a second meaning ("new") weakens the one-hue-one-job rule the
 * kit itself states two sections later. The operator chose gold with that in
 * front of them. The carve-out is therefore FILE-NARROW — Workbench.tsx and
 * nowhere else — so the exception cannot quietly spread to a third surface.
 */
export const GOLD_ALLOWED = [
  "src/browse/MapCornerChrome.tsx",
  "src/coldopen/SignUpCard.tsx",
  "src/workbench/Workbench.tsx",
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
    // ---- W9 (P-93) write-path rules ----
    // These exist because the FIRST cut of rawHexes shipped a literal 0x08
    // backspace where  was meant. It matched nothing, so it passed every
    // input and would have armed a gate that could never fire. Reading the
    // file showed ""; only probing with a known-positive caught it. Both
    // directions, every time, for exactly that reason.
    {
      name: "raw hex is found (NOT VACUOUS — this is the backspace-regex guard)",
      ok: rawHexes('color: "#aabbcc"').length === 1,
    },
    {
      name: "two raw hexes are both found",
      ok: rawHexes("a #112233 b #445566").length === 2,
    },
    { name: "token colour is not a raw hex", ok: rawHexes("var(--ss-t1)").length === 0 },
    { name: "hex inside a comment is not a paint", ok: rawHexes("/* #ffffff */").length === 0 },
    { name: "native button open is found", ok: rawButtons("<button>").length === 1 },
    { name: "native button with attrs is found", ok: rawButtons("<button onClick={x}>").length === 1 },
    {
      name: "SELF-CLOSING native button is found (missed by the first regex)",
      ok: rawButtons("<button/>").length === 1,
    },
    { name: "kit Button is not a native button", ok: rawButtons("<Button/>").length === 0 },
    { name: "a longer word starting with button is not a match", ok: rawButtons("<buttonish>").length === 0 },
    { name: "Stripe checkout is an island", ok: isIsland("src/checkout/CheckoutPage.tsx") },
    { name: "print gold is an island", ok: isIsland("src/browse/brief-print-html.ts") },
    { name: "ordinary chrome is NOT an island", ok: !isIsland("src/browse/InspectCard.tsx") },
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

/**
 * Every chrome source file, found by WALKING the tree.
 *
 * The REQUIRED list above is hand-maintained and only ever gets things added
 * to the tree, not to the list — so a brand-new chrome file was never opened
 * by this gate and passed by not being looked at. That is how falsifiers 1
 * and 2 of this card were true. This walks instead.
 */
export function chromeFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === "dist") continue;
        walk(p);
        continue;
      }
      if (!e.name.endsWith(".tsx")) continue;
      if (e.name.endsWith(".test.tsx")) continue;
      out.push(p);
    }
  };
  walk(join(ROOT, "src"));
  return out.sort();
}

/** Raw-hex and native-button counts for one file. Islands report zero. */
export function violationsFor(abs) {
  const rel = relative(ROOT, abs).split("\\").join("/");
  if (isIsland(rel)) return { hex: 0, buttons: 0 };
  const src = readFileSync(abs, "utf8");
  return { hex: rawHexes(src).length, buttons: rawButtons(src).length };
}

/**
 * The ratchet. Fails when a file exceeds its recorded debt, or when a file
 * with no entry has any at all. Counts may go down freely; the baseline is
 * regenerated by scripts/chrome-kit-baseline.mjs after real conversion.
 */
export function ratchetFailures(baseline) {
  const failures = [];
  for (const abs of chromeFiles()) {
    const rel = relative(ROOT, abs).split("\\").join("/");
    const v = violationsFor(abs);
    const allowed = baseline[rel] ?? { hex: 0, buttons: 0 };
    if (v.hex > allowed.hex) {
      failures.push(
        `${rel} adds a raw hex (${v.hex} > ${allowed.hex} allowed). Use a token from pe-tokens.css / PE in pe-chrome.ts. Islands: map overlay, print gold, Stripe.`,
      );
    }
    if (v.buttons > allowed.buttons) {
      failures.push(
        `${rel} adds a native <button> (${v.buttons} > ${allowed.buttons} allowed). Use the kit Button from components/Button.tsx.`,
      );
    }
  }
  return failures;
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

  // W9 (P-93) RATCHET. Walks the tree, so a NEW chrome file is scanned rather
  // than passing by not being on the hand-maintained REQUIRED list above.
  let baseline = {};
  try {
    baseline = JSON.parse(readRel("scripts/chrome-kit-baseline.json"));
  } catch {
    // FAIL CLOSED. A missing or unreadable baseline must not silently disable
    // the ratchet — that is exactly the dormant-control defect this card is
    // about. No baseline means no debt is allowed anywhere.
    failures.push(
      "scripts/chrome-kit-baseline.json missing or unparseable — regenerate with scripts/chrome-kit-baseline.mjs",
    );
  }
  failures.push(...ratchetFailures(baseline));

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

// Run only when executed directly. Importing this module (the baseline
// generator does) must not run the gate as a side effect.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
