#!/usr/bin/env node
/**
 * Smart Site chrome-kit gate.
 *
 * Required dock/lander/paywall surfaces must import Button.
 * Those same files must not paint the retired map-cyan #7dd3fc as a color
 * (comments naming the old hue are allowed).
 *
 * THE RAMP RULE. Six type steps (11.5 / 12.5 / 14.5 / 15.5 / 17.5 / 26) and
 * five radii (8 / 10 / 12 / 14 / 18, plus 50% and 999 pills and 0). A dock body
 * still drawn on the old half-steps while its shell is on the new scale is what
 * "some of them got a partial treatment" looks like from the outside.
 *
 * THE DISPLAY RULE. 32 is a SEVENTH type step and it is not a UI step. It is
 * legal in exactly the three files in DISPLAY_ALLOWED and refused everywhere
 * else. The ALLOW-LIST is the control, not the number: a rule that only checked
 * the value would happily permit a 32px headline inside a dock, which is the
 * thing the ruling exists to prevent.
 *
 * THE GOLD RULE. Gold (#E8963B / #F5B95C / --ss-gold / --brand-gold) is the
 * brand mark, and as of 2026-08-27 also the rail's unread dot by operator
 * ruling. It is never a button, a link, a fill, or a hover. Gold is allowed in
 * the files listed in GOLD_ALLOWED below and refused everywhere else.
 *
 * THE COLOUR-LITERAL RULES. Four forms, not one — see the block above
 * colorLiteralCounts(). Before the Stone port this gate saw raw hex ONLY, and
 * only in .tsx, which measured 7.1% coverage of the colour literals actually in
 * the tree: 25 lines seen, 327 blind. That is how 169 literal-beside-token
 * sites accumulated while CI reported ok. A gate that reports ok on 92.9%
 * unmeasured is not a weak gate, it is a misleading one.
 *
 * Self-tests both directions before the live scan. A check that only ever sees
 * a pass has not been observed working.
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
 * THE WRITE-PATH RULES — colour literals and native buttons.
 *
 * WHY A BASELINE AND NOT A BAN. The write path already carries colour literals
 * across dozens of files. A blanket ban would fail on commit one and be
 * switched off by the next person. So the rule is a RATCHET: every existing
 * violation is recorded in a baseline with a count, and the gate fails when a
 * file exceeds its count or when a file with no entry has any violation at all.
 * New code cannot add either. Old code is grandfathered, counted, and visible —
 * a declared degradation rather than a silent one, and the file is the bill.
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
 * The token files. These are the ONE place a colour literal belongs — a
 * palette has to spell its colours somewhere or it is not a palette. Every
 * other file must reach them through a var().
 */
export const TOKEN_FILES = ["src/styles/pe-tokens.css"];

export function isTokenFile(rel) {
  return TOKEN_FILES.includes(rel.split("\\").join("/"));
}

/**
 * Raw hex colours written into source. Hex inside a COMMENT is not a paint,
 * so comments are stripped first — the same treatment every rule here uses.
 */
export function rawHexes(src) {
  return (stripComments(src).match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).map((h) =>
    h.toLowerCase(),
  );
}

/**
 * A DECIMAL TRIPLE — `255, 255, 255` — is what an rgb()/rgba() colour looks
 * like once you stop looking for a `#`. This gate never saw one, which is why
 * the four .pe-btn hover veils and every rgba() token fallback in pe-chrome.ts
 * sat in plain sight through every green CI run.
 *
 * Measured against the tree at be60021 this fires 216 times across 43 files and
 * the hits are almost entirely real colours — 11,14,19 (the retired ink),
 * 154,166,178 (the retired hairline hue), 59,130,246 (the retired blue),
 * 255,255,255, 0,0,0. The known false-positive class is prose and fixture data
 * that happens to carry three comma-separated numbers; those get billed to the
 * baseline like anything else rather than being carved out by a pattern that
 * would also let real colours through.
 */
export function decimalTriples(src) {
  return stripComments(src).match(/\d{1,3},\s*\d{1,3},\s*\d{1,3}/g) ?? [];
}

/** hsl()/hsla() colours. Not used in this app today; the rule exists so the
 *  first one to be written fails rather than being discovered later. */
export function hslColors(src) {
  return stripComments(src).match(/\bhsla?\s*\(/gi) ?? [];
}

/**
 * CSS NAMED COLOURS — `color: "red"`, `background: white`.
 *
 * MEANING SHAPED, NOT PRESENCE SHAPED. The rule needs TWO things to agree
 * before it fires: a colour-bearing property AND a value that is a real CSS
 * colour keyword. Matching the bare word would flag every variable called
 * `red`, every `tan()` call and the word "gold" in a sentence — a control
 * broader than its claim, which teaches people to reach for the bypass.
 *
 * `transparent`, `currentColor`, `inherit`, `none` and friends are not colour
 * keywords and are not flagged: they carry no palette decision.
 */
export const CSS_NAMED_COLORS = new Set([
  "aliceblue", "antiquewhite", "aqua", "aquamarine", "azure", "beige", "bisque",
  "black", "blanchedalmond", "blue", "blueviolet", "brown", "burlywood",
  "cadetblue", "chartreuse", "chocolate", "coral", "cornflowerblue", "cornsilk",
  "crimson", "cyan", "darkblue", "darkcyan", "darkgoldenrod", "darkgray",
  "darkgreen", "darkgrey", "darkkhaki", "darkmagenta", "darkolivegreen",
  "darkorange", "darkorchid", "darkred", "darksalmon", "darkseagreen",
  "darkslateblue", "darkslategray", "darkslategrey", "darkturquoise",
  "darkviolet", "deeppink", "deepskyblue", "dimgray", "dimgrey", "dodgerblue",
  "firebrick", "floralwhite", "forestgreen", "fuchsia", "gainsboro",
  "ghostwhite", "gold", "goldenrod", "gray", "green", "greenyellow", "grey",
  "honeydew", "hotpink", "indianred", "indigo", "ivory", "khaki", "lavender",
  "lavenderblush", "lawngreen", "lemonchiffon", "lightblue", "lightcoral",
  "lightcyan", "lightgoldenrodyellow", "lightgray", "lightgreen", "lightgrey",
  "lightpink", "lightsalmon", "lightseagreen", "lightskyblue", "lightslategray",
  "lightslategrey", "lightsteelblue", "lightyellow", "lime", "limegreen",
  "linen", "magenta", "maroon", "mediumaquamarine", "mediumblue", "mediumorchid",
  "mediumpurple", "mediumseagreen", "mediumslateblue", "mediumspringgreen",
  "mediumturquoise", "mediumvioletred", "midnightblue", "mintcream", "mistyrose",
  "moccasin", "navajowhite", "navy", "oldlace", "olive", "olivedrab", "orange",
  "orangered", "orchid", "palegoldenrod", "palegreen", "paleturquoise",
  "palevioletred", "papayawhip", "peachpuff", "peru", "pink", "plum",
  "powderblue", "purple", "rebeccapurple", "red", "rosybrown", "royalblue",
  "saddlebrown", "salmon", "sandybrown", "seagreen", "seashell", "sienna",
  "silver", "skyblue", "slateblue", "slategray", "slategrey", "snow",
  "springgreen", "steelblue", "tan", "teal", "thistle", "tomato", "turquoise",
  "violet", "wheat", "white", "whitesmoke", "yellow", "yellowgreen",
]);

const COLOR_PROP =
  "(?:background|backgroundColor|background-color|color|borderColor|" +
  "border-color|border|borderTop|borderBottom|borderLeft|borderRight|" +
  "outline|outlineColor|outline-color|fill|stroke|boxShadow|box-shadow|" +
  "textDecorationColor|caretColor|accentColor)";

/**
 * THE VALUE MUST BE QUOTED, and that is not a detail — it is the whole rule.
 *
 * The first cut of this check matched an unquoted word too, and it produced
 * ELEVEN false positives across five real files on its first live scan:
 *   RecordsRequestSection.tsx:780  color: BLUE,
 *   RecordsRequestSection.tsx:817  color: teal ? ATOM : SLATE,
 *   ReportsTool.tsx:498,510,638,875  color: BLUE,
 *   ...and BLUE again in three more files.
 * `BLUE` is a local const holding PE.blue, and `teal` is a BOOLEAN. Both are
 * correct token-respecting code that the rule called a defect.
 *
 * In a JS/TS style object an unquoted value is an IDENTIFIER by the language's
 * own semantics — `{ color: red }` reads a variable named red, it does not
 * paint red. Only a quoted value can be a CSS keyword. That is the second
 * independent thing this check requires before it fires, and it is what makes
 * it meaning shaped rather than presence shaped.
 *
 * The quoted value is then scanned WORD BY WORD so shorthands are covered
 * (`border: "1px solid red"` is a named-colour paint), with custom-property
 * names stripped first — otherwise `color: "var(--ss-gold)"` would report the
 * word "gold" as a paint, which is the same false-positive class one level
 * down.
 *
 * This rule finds NOTHING in the tree today. That is a real measurement, not a
 * disarmed check: the self-tests below fire it in both directions, so it is
 * armed and the app genuinely has no named-colour paints. Absent, not zero.
 */
export function namedColors(src) {
  const clean = stripComments(src);
  const re = new RegExp(`\\b${COLOR_PROP}\\s*:\\s*(["'\`])([^"'\`\\n]*)\\1`, "g");
  const out = [];
  for (const m of clean.matchAll(re)) {
    const value = m[2]
      .toLowerCase()
      // A ${...} interpolation is JavaScript, not CSS. Without this,
      // border: `1px solid ${focused ? PE.blue : PE.line14}` reports "blue".
      .replace(/\$\{[^}]*\}/g, " ")
      // A custom-property NAME is not a paint: var(--ss-gold) is not gold.
      .replace(/--[a-z0-9-]+/g, " ");
    for (const word of value.match(/[a-z]+/g) ?? []) {
      if (CSS_NAMED_COLORS.has(word)) out.push(word);
    }
  }
  return out;
}

/** The four colour-literal forms, counted separately for the failure message
 *  and summed for the ratchet. */
export function colorLiteralCounts(src) {
  return {
    hex: rawHexes(src).length,
    triples: decimalTriples(src).length,
    hsl: hslColors(src).length,
    named: namedColors(src).length,
  };
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
 * recorded rather than buried: the original SPEC specified a BLUE dot, and
 * giving gold a second meaning ("new") weakens the one-hue-one-job rule the
 * kit itself states. The operator chose gold with that in front of them. The
 * carve-out is therefore FILE-NARROW — Workbench.tsx and nowhere else — so the
 * exception cannot quietly spread to a third surface.
 */
export const GOLD_ALLOWED = [
  "src/browse/MapCornerChrome.tsx",
  "src/coldopen/SignUpCard.tsx",
  "src/workbench/Workbench.tsx",
  "src/styles/pe-tokens.css",
  "src/styles/pe-chrome.ts",
];

/**
 * Files ALLOWED to draw the 32px display step. Modelled on GOLD_ALLOWED above
 * and narrow for the same reason.
 *
 * Display is the seventh type step and it is NOT a UI step: the cold open, the
 * pricing headline and checkout are surfaces seen once, not the dense surfaces
 * an operator works in. 32 never appears in a panel, a dock, a row, a chip, or
 * over the map.
 *
 * ENFORCE THE ALLOW-LIST, NOT THE NUMBER. Admitting 32 to LEGAL_FONT_SIZES
 * would permit a 32px headline inside a dock, which is precisely what the
 * ruling exists to prevent — the value would be legal everywhere and the rule
 * would read as enforcement while enforcing nothing about placement.
 *
 * COVERAGE BOUNDARY, STATED RATHER THAN LEFT TO BE DISCOVERED. The ramp rule
 * runs over REQUIRED only, exactly like the gold rule. Of the three files
 * below, PricingModal.tsx and SignUpCard.tsx are in REQUIRED and are really
 * scanned; CheckoutPage.tsx is NOT in REQUIRED (it is also a Stripe island), so
 * its entry here is inert today and is a declaration of policy rather than a
 * live carve-out. It becomes live the moment checkout joins REQUIRED.
 */
export const DISPLAY_ALLOWED = [
  "src/browse/PricingModal.tsx",
  "src/checkout/CheckoutPage.tsx",
  "src/coldopen/SignUpCard.tsx",
];

export const DISPLAY_FONT_SIZE = "32";

/**
 * The legal type steps — the six Stone UI steps and nothing else.
 *
 * 32 is deliberately ABSENT: it is gated by DISPLAY_ALLOWED, not by membership
 * here. The old ramp's extra sizes (10, 11, 19, 20, 24) are gone with the v2
 * scale they belonged to.
 */
const LEGAL_FONT_SIZES = new Set([
  "11.5", "12.5", "14.5", "15.5", "17.5", "26",
]);

/**
 * Radii: 8 chip, 10 touch, 12 tip, 14 float, 18 modal, plus pills, circles
 * and 0. No odd numbers, and none of the v2 set (4 and 6) survive.
 */
const LEGAL_RADII = new Set(["0", "8", "10", "12", "14", "18", "999", "50"]);

/**
 * Legal font weights. 700 was admitted in the Stone port because the ruling
 * introduced two steps that carry it — TYPE.head (11.5 uppercase at 700) and
 * TYPE.display (32 at 700). Refusing it here while the kit ships it would be a
 * control contradicting the ruling it is meant to enforce, and lanes would
 * learn to route around the gate rather than around the defect.
 */
const LEGAL_FONT_WEIGHTS = new Set(["300", "400", "500", "600", "700"]);

/**
 * Off-ramp type sizes, radii and weights in one file.
 *
 * `rel` IS REQUIRED FOR THE DISPLAY CARVE-OUT AND THE DEFAULT IS CLOSED: called
 * without a path, 32 is refused. A caller that forgets to pass the file gets a
 * failure, never a silent pass.
 */
export function offRampValues(src, rel = null) {
  const clean = stripComments(src);
  const norm = rel ? rel.split("\\").join("/") : null;
  const displayOk = norm !== null && DISPLAY_ALLOWED.includes(norm);
  const bad = [];
  for (const m of clean.matchAll(/fontSize:\s*(\d+(?:\.\d+)?)/g)) {
    const v = m[1];
    if (LEGAL_FONT_SIZES.has(v)) continue;
    if (v === DISPLAY_FONT_SIZE) {
      if (displayOk) continue;
      bad.push(
        `fontSize: ${v} (the display step is allow-listed to ${DISPLAY_ALLOWED.join(", ")})`,
      );
      continue;
    }
    bad.push(`fontSize: ${v}`);
  }
  for (const m of clean.matchAll(/borderRadius:\s*(\d+(?:\.\d+)?)/g)) {
    if (!LEGAL_RADII.has(m[1])) bad.push(`borderRadius: ${m[1]}`);
  }
  for (const m of clean.matchAll(/fontWeight:\s*(\d+|bold)/g)) {
    if (!LEGAL_FONT_WEIGHTS.has(m[1])) bad.push(`fontWeight: ${m[1]}`);
  }
  return [...new Set(bad)];
}

export function hasGoldColor(src) {
  return /#e8963b|#f5b95c|--ss-gold|--brand-gold/i.test(stripComments(src));
}

function selfTest() {
  const cases = [
    // ---- write-path rules ----
    // These exist because the FIRST cut of rawHexes shipped a literal 0x08
    // backspace where \b was meant. It matched nothing, so it passed every
    // input and would have armed a gate that could never fire. Reading the
    // file showed "\b"; only probing with a known-positive caught it. Both
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

    // ---- decimal-triple rule (NEW) ----
    {
      name: "TRIPLE: an rgba() veil is found (NOT VACUOUS)",
      ok: decimalTriples("background: rgba(255,255,255,.07)").length === 1,
    },
    {
      name: "TRIPLE: a spaced rgb() is found",
      ok: decimalTriples("rgb(11, 14, 19)").length === 1,
    },
    {
      name: "TRIPLE: two triples are both found",
      ok: decimalTriples("rgba(0,0,0,.4) and rgb(154,166,178)").length === 2,
    },
    {
      name: "TRIPLE: a token read is not a triple",
      ok: decimalTriples("var(--ss-line-14)").length === 0,
    },
    {
      name: "TRIPLE: only TWO numbers is not a triple",
      ok: decimalTriples("translate(10, 20)").length === 0,
    },
    {
      name: "TRIPLE: a triple in a COMMENT is allowed",
      ok: decimalTriples("// was rgba(255,255,255,.07) before the port").length === 0,
    },

    // ---- hsl rule (NEW) ----
    { name: "HSL: hsl() is found (NOT VACUOUS)", ok: hslColors("color: hsl(210 40% 90%)").length === 1 },
    { name: "HSL: hsla() is found", ok: hslColors("hsla(210,40%,90%,.5)").length === 1 },
    { name: "HSL: uppercase HSL is found", ok: hslColors("HSL(0,0%,0%)").length === 1 },
    { name: "HSL: a token read is not an hsl", ok: hslColors("var(--ss-t1)").length === 0 },
    { name: "HSL: the word 'hsl' in a comment is allowed", ok: hslColors("// no hsl() here").length === 0 },

    // ---- named-colour rule (NEW) ----
    {
      name: "NAMED: color: \"red\" is found (NOT VACUOUS)",
      ok: namedColors('color: "red"').length === 1,
    },
    {
      name: "NAMED: borderColor with a named colour is found",
      ok: namedColors('borderColor: "slategray"').length === 1,
    },
    {
      name: "NAMED: a named colour inside a SHORTHAND is found",
      ok: namedColors('border: "1px solid red"').length === 1,
    },
    {
      name: "NAMED: background: \"white\" is found",
      ok: namedColors('background: "white"').length === 1,
    },
    // The three below are REAL LINES from the tree that the first cut of this
    // rule wrongly failed. They are regression tests, not hypotheticals.
    {
      name: "NAMED: `color: BLUE` is an IDENTIFIER, not a paint (RecordsRequestSection.tsx:780)",
      ok: namedColors("color: BLUE,").length === 0,
    },
    {
      name: "NAMED: `teal` as a BOOLEAN is not a paint (RecordsRequestSection.tsx:817)",
      ok: namedColors("color: teal ? ATOM : SLATE,").length === 0,
    },
    {
      name: "NAMED: a custom-property NAME containing a colour word is not a paint",
      ok: namedColors('color: "var(--ss-gold)"').length === 0,
    },
    {
      name: "NAMED: a ${} interpolation is JS, not CSS (SearchBar.tsx:113)",
      ok: namedColors("border: `1px solid ${focused ? PE.blue : PE.line14}`").length === 0,
    },
    {
      name: "NAMED: a real paint INSIDE a template literal is still found",
      ok: namedColors("border: `1px solid red`").length === 1,
    },
    {
      name: "NAMED: a token read in a colour slot is NOT a named colour",
      ok: namedColors("color: PE.t3").length === 0,
    },
    {
      name: "NAMED: transparent / currentColor / inherit are not palette decisions",
      ok: namedColors('background: "transparent"; fill: "currentColor"; color: "inherit"').length === 0,
    },
    {
      name: "NAMED: the word is only a colour in a COLOUR PROPERTY (scope guard)",
      ok: namedColors("const red = 1; const gold = tan(x);").length === 0,
    },
    {
      name: "NAMED: a longer word containing a colour name is not a match",
      ok: namedColors('color: "tanned"').length === 0,
    },
    {
      name: "NAMED: a named colour in a COMMENT is allowed",
      ok: namedColors('// color: "red" was the old error state').length === 0,
    },

    // ---- token-file carve-out (NEW) ----
    { name: "TOKENS: pe-tokens.css is the token file", ok: isTokenFile("src/styles/pe-tokens.css") },
    { name: "TOKENS: a component is NOT the token file", ok: !isTokenFile("src/browse/InspectCard.tsx") },

    // ---- native buttons ----
    { name: "native button open is found", ok: rawButtons("<button>").length === 1 },
    { name: "native button with attrs is found", ok: rawButtons("<button onClick={x}>").length === 1 },
    {
      name: "SELF-CLOSING native button is found (missed by the first regex)",
      ok: rawButtons("<button/>").length === 1,
    },
    { name: "kit Button is not a native button", ok: rawButtons("<Button/>").length === 0 },
    { name: "a longer word starting with button is not a match", ok: rawButtons("<buttonish>").length === 0 },

    // ---- islands ----
    { name: "Stripe checkout is an island", ok: isIsland("src/checkout/CheckoutPage.tsx") },
    { name: "print gold is an island", ok: isIsland("src/browse/brief-print-html.ts") },
    { name: "ordinary chrome is NOT an island", ok: !isIsland("src/browse/InspectCard.tsx") },

    // ---- imports ----
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

    // ---- the Stone ramp ----
    {
      name: "RAMP: every Stone step passes",
      ok:
        offRampValues(
          "fontSize: 11.5, fontSize: 12.5, fontSize: 14.5, fontSize: 15.5, fontSize: 17.5, fontSize: 26",
          "src/browse/InspectCard.tsx",
        ).length === 0,
    },
    {
      name: "RAMP: every Stone radius passes",
      ok:
        offRampValues(
          "borderRadius: 0, borderRadius: 8, borderRadius: 10, borderRadius: 12, borderRadius: 14, borderRadius: 18, borderRadius: 999, borderRadius: 50",
          "src/browse/InspectCard.tsx",
        ).length === 0,
    },
    {
      name: "RAMP: a RETIRED v2 size (20) is now caught",
      ok: offRampValues("fontSize: 20,", "src/browse/InspectCard.tsx").length === 1,
    },
    {
      name: "RAMP: a RETIRED v2 size (10) is now caught",
      ok: offRampValues("fontSize: 10,", "src/browse/InspectCard.tsx").length === 1,
    },
    {
      name: "RAMP: a RETIRED v2 radius (4) is now caught",
      ok: offRampValues("borderRadius: 4,", "src/browse/InspectCard.tsx").length === 1,
    },
    {
      name: "RAMP: a RETIRED v2 radius (6) is now caught",
      ok: offRampValues("borderRadius: 6,", "src/browse/InspectCard.tsx").length === 1,
    },
    {
      name: "RAMP: an off-ramp size is caught",
      ok: offRampValues("fontSize: 10.5,", "src/browse/InspectCard.tsx").length === 1,
    },
    {
      name: "RAMP: an off-ramp radius is caught",
      ok: offRampValues("borderRadius: 9,", "src/browse/InspectCard.tsx").length === 1,
    },
    {
      name: "WEIGHT: 700 is legal (the head and display steps carry it)",
      ok: offRampValues("fontWeight: 700,", "src/browse/InspectCard.tsx").length === 0,
    },
    {
      name: "WEIGHT: 800 is still caught (700 was admitted, not the whole scale)",
      ok: offRampValues("fontWeight: 800,", "src/browse/InspectCard.tsx").length === 1,
    },
    {
      name: "RAMP: an off-ramp value in a COMMENT is allowed",
      ok: offRampValues("// was fontSize: 10.5, before the ramp", "src/browse/InspectCard.tsx").length === 0,
    },

    // ---- the display allow-list (NEW) ----
    {
      name: "DISPLAY: 32 is legal in an allow-listed file",
      ok: offRampValues("fontSize: 32,", "src/browse/PricingModal.tsx").length === 0,
    },
    {
      name: "DISPLAY: 32 is legal in the cold open",
      ok: offRampValues("fontSize: 32,", "src/coldopen/SignUpCard.tsx").length === 0,
    },
    {
      name: "DISPLAY: 32 in a DOCK is refused — the allow-list is the control, not the number",
      ok: offRampValues("fontSize: 32,", "src/workbench/tools/ChatTool.tsx").length === 1,
    },
    {
      name: "DISPLAY: 32 with NO file is refused (fail closed on a forgetful caller)",
      ok: offRampValues("fontSize: 32,").length === 1,
    },
    {
      name: "DISPLAY: an allow-listed file may still not draw OTHER off-ramp sizes",
      ok: offRampValues("fontSize: 33,", "src/browse/PricingModal.tsx").length === 1,
    },

    // ---- gold ----
    { name: "gold as a colour is caught", ok: hasGoldColor('const CTA = "#E8963B";') },
    { name: "gold behind a token name is caught", ok: hasGoldColor("background: var(--ss-gold);") },
    { name: "gold named in a COMMENT is allowed", ok: !hasGoldColor("// gold #E8963B is the brand mark only") },
    { name: "a file with no gold passes", ok: !hasGoldColor('const CTA = "var(--ss-blue)";') },

    // ---- the walk (NEW: .ts as well as .tsx) ----
    {
      name: "WALK: .ts files are scanned (they were invisible before the Stone port)",
      ok: chromeFiles().some((p) => p.split("\\").join("/").endsWith("src/styles/pe-chrome.ts")),
    },
    {
      name: "WALK: .tsx files are still scanned",
      ok: chromeFiles().some((p) => p.split("\\").join("/").endsWith(".tsx")),
    },
    {
      name: "WALK: test files are excluded",
      ok: !chromeFiles().some((p) => /\.test\.tsx?$/.test(p)),
    },
    {
      name: "WALK: .d.ts declaration files are excluded",
      ok: !chromeFiles().some((p) => p.endsWith(".d.ts")),
    },

    {
      name: "not vacuous: empty input trips nothing",
      ok:
        !hasButtonImport("") &&
        !hasRawCyanColor("") &&
        !hasPeImport("") &&
        !hasGoldColor("") &&
        decimalTriples("").length === 0 &&
        hslColors("").length === 0 &&
        namedColors("").length === 0 &&
        rawHexes("").length === 0,
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
 * The REQUIRED list above is hand-maintained and only ever gets things added to
 * the tree, not to the list — so a brand-new chrome file was never opened by
 * this gate and passed by not being looked at. This walks instead.
 *
 * .ts IS WALKED AS OF THE STONE PORT. It was not before, and the omission was
 * not cosmetic: pe-chrome.ts, mobile-layout.ts, atom-accent.ts and every other
 * style module in the app is a .ts, which is where the colour literals actually
 * live. The gate was reading the surfaces and skipping the palette.
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
      if (!e.name.endsWith(".ts") && !e.name.endsWith(".tsx")) continue;
      if (/\.test\.tsx?$/.test(e.name)) continue;
      if (e.name.endsWith(".d.ts")) continue;
      out.push(p);
    }
  };
  walk(join(ROOT, "src"));
  return out.sort();
}

/**
 * Colour-literal and native-button counts for one file. Islands and the token
 * file report zero.
 *
 * `hex` IS NOW A TOTAL OF ALL FOUR COLOUR-LITERAL FORMS, not just `#rrggbb`.
 * The key keeps its old name ON PURPOSE: scripts/chrome-kit-baseline.mjs reads
 * `v.hex` to write the baseline, so renaming it would silently write
 * `hex: undefined` into the bill and disarm the ratchet. The name is a
 * misnomer; the alternative was a broken generator. `breakdown` carries the
 * per-form counts for the failure message.
 */
export function violationsFor(abs) {
  const rel = relative(ROOT, abs).split("\\").join("/");
  const zero = { hex: 0, triples: 0, hsl: 0, named: 0 };
  if (isIsland(rel) || isTokenFile(rel)) {
    return { hex: 0, buttons: 0, breakdown: zero };
  }
  const src = readFileSync(abs, "utf8");
  const b = colorLiteralCounts(src);
  return {
    hex: b.hex + b.triples + b.hsl + b.named,
    buttons: rawButtons(src).length,
    breakdown: b,
  };
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
      const b = v.breakdown;
      failures.push(
        `${rel} adds a colour literal (${v.hex} > ${allowed.hex} allowed; ` +
          `hex ${b.hex}, rgb-triples ${b.triples}, hsl ${b.hsl}, named ${b.named}). ` +
          `Use a token from pe-tokens.css / PE in pe-chrome.ts.`,
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
    const offRamp = offRampValues(src, rel);
    if (offRamp.length > 0) {
      failures.push(
        `${rel} draws off the Stone ramp: ${offRamp.join(", ")} ` +
          `(six type steps 11.5/12.5/14.5/15.5/17.5/26; radii 8/10/12/14/18)`,
      );
    }
    if (!GOLD_ALLOWED.includes(rel) && hasGoldColor(src)) {
      failures.push(
        `${rel} paints gold — gold is the BRAND MARK only, never a button, link, fill or hover`,
      );
    }
  }

  // THE RATCHET. Walks the tree, so a NEW chrome file is scanned rather than
  // passing by not being on the hand-maintained REQUIRED list above.
  let baseline = {};
  try {
    baseline = JSON.parse(readRel("scripts/chrome-kit-baseline.json"));
  } catch {
    // FAIL CLOSED. A missing or unreadable baseline must not silently disable
    // the ratchet — that is exactly the dormant-control defect this rule is
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
      `(gold confined to ${GOLD_ALLOWED.length} files, display to ${DISPLAY_ALLOWED.length})`,
  );
}

// Run only when executed directly. Importing this module (the baseline
// generator does) must not run the gate as a side effect.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
