#!/usr/bin/env node
//
// SOURCE ENCODING GUARD (lane SS-W2, 2026-08-18).
//
// WHY THIS EXISTS
// ---------------
// `apps/property-explorer/src/browse/TerrainExportSection.tsx` shipped seven
// literal mojibake sequences to customers. The middle dot in the section
// header, the ellipsis in the busy label and the em dash in the ready notice
// all rendered as two or three garbage Latin-1 characters on the live surface.
// Nothing errored. The file had simply been saved once as UTF-8 and then
// re-saved by a tool that read it as Windows-1252, so every multi-byte
// character was encoded a second time and the corruption was committed as
// source. Three files also carried a UTF-8 BOM from the same double-save.
//
// This will recur, because nothing in the toolchain notices, and a human
// reading a diff of a 300-line component does not reliably spot a garbled
// middle dot.
//
// DESIGN NOTES (DEV_PROCESS)
// --------------------------
// * Rule 0 - a control that depends on someone remembering is not a control.
//   This is a script wired to CI, not a convention.
// * Rule 2.0 - a permanently-red gate is a dead gate. Two files carrying this
//   defect (`api/spine.ts` and `apps/property-explorer/api/spine.ts`) are owned
//   by a different lane and could not be edited by the lane that wrote this
//   guard. They carry a BASELINE COUNT rather than an exemption: the gate fails
//   the moment any file gets WORSE, and a baselined file that gets cleaner
//   passes and is reported so the ceiling can be tightened. A baseline entry
//   can therefore never rot into permission.
// * Rule 2.2 - a gating indicator is tested for its ability to FIRE before it
//   is trusted. `--self-test` runs the detector against known-bad and
//   known-good samples and exits non-zero if it fails to fire OR false-fires.
// * Rule 2.4 - one rule, one implementation. The scan and the self-test call
//   the same pure `detectEncodingDefects`, so they cannot diverge.
// * Rule 2.6 - a source file parsed by a tool has a character set, and it is a
//   hard constraint. EVERY signature and sample below is built from \uXXXX
//   escapes, so this file contains no literal mojibake and is scanned by its
//   own rule with no self-exemption. Writing the samples literally was the
//   first draft of this file and it flagged itself, which is the rule earning
//   its place a second time.
// * Rule 6.1 - a guardrail that does not survive a clone is not a guardrail.
//   The file list comes from `git ls-files`, so a fresh clone is fully covered.
//
// USAGE
//   node scripts/check-source-encoding.mjs             scan the repo
//   node scripts/check-source-encoding.mjs --self-test prove the detector fires
//
// EXIT CODES
//   0  clean (or self-test passed)
//   1  violations found (or self-test failed)
//   2  the guard itself could not run

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

/* ------------------------------------------------------------------ */
/* Signatures. Escapes only - see rule 2.6 above.                      */
/* ------------------------------------------------------------------ */

/** U+FEFF, a real byte-order mark at the head of the file. */
const BOM = "\ufeff";

/**
 * U+00E2 U+20AC. What UTF-8 bytes E2 80 xx become when decoded as Windows-1252
 * and re-encoded. That byte range is the whole General Punctuation block, where
 * the em dash, en dash, ellipsis and curly quotes live. This one signature
 * accounts for four of the seven occurrences that triggered this guard.
 */
const SIG_E2 = "\u00e2\u20ac";

/**
 * U+00C2 followed by U+00A0..U+00BF. What UTF-8 bytes C2 A0..BF become on a
 * double encode: middle dot, non-breaking space, section sign, degree sign,
 * copyright. Two characters are required together so a legitimate lone
 * A-circumflex in prose is not a violation.
 */
const SIG_C2 = /\u00c2[\u00a0-\u00bf]/g;

/**
 * U+00C3 followed by U+0080..U+00BF: the accented-letter family. U+00C3 U+00A9
 * is exactly what a lowercase e-acute becomes.
 */
const SIG_C3 = /\u00c3[\u0080-\u00bf]/g;

/** U+00EF U+00BB U+00BF - a BOM that has itself been double-encoded and now
 *  appears as three visible characters in the body text. */
const SIG_BOM_TEXT = "\u00ef\u00bb\u00bf";

const SCANNED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".css",
  ".html",
  ".json",
  ".md",
  ".yml",
  ".yaml",
]);

/* ------------------------------------------------------------------ */
/* Baseline - a CEILING, not an exemption. Ratchets one way only.      */
/* ------------------------------------------------------------------ */

/**
 * Known-dirty files at the time this guard landed (2026-08-18, lane SS-W2),
 * with counts measured at source. Both are owned by lane P-39, which the lane
 * that wrote this guard may not edit; both are reported to the planner in the
 * SS-W2 close.
 *
 * To tighten: fix the file, then lower or delete its entry. The guard prints a
 * NOTICE (never a failure) when a baselined file measures below its ceiling, so
 * a stale ceiling is visible without breaking the lane that did the fixing.
 */
const BASELINE = {
  "api/spine.ts": { mojibake: 2, bom: 1 },
  "apps/property-explorer/api/spine.ts": { mojibake: 2, bom: 1 },
};

/* ------------------------------------------------------------------ */
/* Detector. Pure, and the single implementation of the rule.          */
/* ------------------------------------------------------------------ */

function codepoints(s) {
  return [...s]
    .map((c) => "U+" + c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0"))
    .join(" ");
}

/**
 * @param {string} text file contents decoded as UTF-8
 * @returns {{ mojibake: Array<{line:number, sample:string, signature:string}>, bom: boolean }}
 */
export function detectEncodingDefects(text) {
  const bom = text.charCodeAt(0) === 0xfeff;
  const body = bom ? text.slice(1) : text;
  const mojibake = [];
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const hits = [];
    if (line.includes(SIG_E2)) hits.push(SIG_E2);
    if (line.includes(SIG_BOM_TEXT)) hits.push(SIG_BOM_TEXT);
    for (const re of [SIG_C2, SIG_C3]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line)) !== null) hits.push(m[0]);
    }
    for (const hit of hits) {
      mojibake.push({
        line: i + 1,
        sample: line.trim().slice(0, 90),
        signature: codepoints(hit),
      });
    }
  }
  return { mojibake, bom };
}

/* ------------------------------------------------------------------ */
/* Self-test - proves the gate can FIRE (rule 2.2).                    */
/* ------------------------------------------------------------------ */

function selfTest() {
  const failures = [];

  // The real strings this guard was built from, rebuilt from escapes.
  // Escapes only: a literal sample here would make this file fail its own
  // scan, which is exactly what the first draft of this guard did.
  const positives = [
    ["garbled middle dot", "Terrain export \u00c2\u00b7 public-paid"],
    ["garbled ellipsis", "Exporting\u00e2\u20ac\u00a6"],
    ["garbled em dash", "ready \u00e2\u20ac\u201d download below"],
    ["garbled accented letter", "caf\u00c3\u00a9"],
    ["double-encoded bom in body text", "\u00ef\u00bb\u00bfimport x"],
  ];
  for (const [name, sample] of positives) {
    if (detectEncodingDefects(sample).mojibake.length === 0) {
      failures.push(`detector FAILED TO FIRE on a known-bad sample: ${name}`);
    }
  }

  if (!detectEncodingDefects(BOM + "import x").bom) {
    failures.push("detector FAILED TO FIRE on a leading UTF-8 BOM");
  }

  // Correct characters must NOT fire. A gate that flags healthy source gets
  // switched off, which is rule 0's failure mode wearing a different costume.
  const negatives = [
    ["correct middle dot", "Terrain export \u00b7 paid"],
    ["correct ellipsis", "Exporting\u2026"],
    ["correct em dash", "ready \u2014 download below"],
    ["correct en dash", "2026\u20132027"],
    ["correct accented letter", "caf\u00e9"],
    ["lone A-circumflex in prose", "\u00c2 is a letter"],
    ["prime marks used for feet", "F 25\u2032 \u00b7 S 10\u2032"],
    ["plain ascii", "Terrain export - paid"],
  ];
  for (const [name, sample] of negatives) {
    const found = detectEncodingDefects(sample);
    if (found.mojibake.length > 0 || found.bom) {
      failures.push(`detector FALSE-FIRED on a known-good sample: ${name}`);
    }
  }

  if (failures.length > 0) {
    console.error("SELF-TEST FAILED - this guard cannot be trusted:");
    for (const f of failures) console.error("  - " + f);
    return 1;
  }
  console.log(
    `source-encoding guard self-test PASSED (${positives.length + 1} fire cases, ${negatives.length} no-fire cases)`,
  );
  return 0;
}

/* ------------------------------------------------------------------ */
/* Scan.                                                               */
/* ------------------------------------------------------------------ */

function repoRoot() {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  }).trim();
}

function trackedFiles(root) {
  const out = execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out
    .split("\0")
    .filter(Boolean)
    .filter((rel) => SCANNED_EXTENSIONS.has(path.extname(rel).toLowerCase()));
}

function scan() {
  const root = repoRoot();
  const files = trackedFiles(root);
  const violations = [];
  const notices = [];
  let scanned = 0;

  for (const rel of files) {
    let text;
    try {
      text = readFileSync(path.join(root, rel), "utf8");
    } catch {
      continue; // unreadable or removed between ls-files and read
    }
    scanned++;
    const found = detectEncodingDefects(text);
    const allowed = BASELINE[rel] ?? { mojibake: 0, bom: 0 };

    if (found.mojibake.length > allowed.mojibake) {
      violations.push({
        rel,
        kind: "mojibake",
        count: found.mojibake.length,
        allowed: allowed.mojibake,
        hits: found.mojibake,
      });
    } else if (BASELINE[rel] && found.mojibake.length < allowed.mojibake) {
      notices.push(
        `${rel}: mojibake is now ${found.mojibake.length}, baseline ceiling is ${allowed.mojibake} - lower the ceiling in scripts/check-source-encoding.mjs`,
      );
    }

    const bomCount = found.bom ? 1 : 0;
    if (bomCount > allowed.bom) {
      violations.push({ rel, kind: "bom", count: 1, allowed: allowed.bom, hits: [] });
    } else if (BASELINE[rel] && bomCount < allowed.bom) {
      notices.push(
        `${rel}: BOM is gone, baseline ceiling is ${allowed.bom} - lower the ceiling in scripts/check-source-encoding.mjs`,
      );
    }
  }

  // The counting rule travels with the number (DEV_PROCESS 1.1 / 1.2).
  console.log(
    `source-encoding guard: scanned ${scanned} of ${files.length} tracked files matching ${[...SCANNED_EXTENSIONS].sort().join(",")} (denominator = git ls-files, so a fresh clone is fully covered)`,
  );

  for (const n of notices) console.log("NOTICE " + n);

  if (violations.length === 0) {
    console.log(
      `source-encoding guard: PASS. ${Object.keys(BASELINE).length} file(s) carry a baseline ceiling and none exceeded it.`,
    );
    return 0;
  }

  console.error("");
  console.error("SOURCE ENCODING VIOLATIONS");
  console.error("--------------------------");
  for (const v of violations) {
    if (v.kind === "bom") {
      console.error(`${v.rel}: file starts with a UTF-8 BOM (allowed ${v.allowed})`);
      continue;
    }
    console.error(
      `${v.rel}: ${v.count} double-encoded sequence(s), allowed ${v.allowed}`,
    );
    for (const h of v.hits.slice(0, 10)) {
      console.error(`  line ${h.line} [${h.signature}]  ${h.sample}`);
    }
    if (v.hits.length > 10) console.error(`  ... ${v.hits.length - 10} more`);
  }
  console.error("");
  console.error(
    "These are UTF-8 characters decoded as Windows-1252, re-encoded, and committed.",
  );
  console.error(
    "Fix: re-save the file as UTF-8 with no BOM and restore the intended characters",
  );
  console.error(
    "(the usual four are the middle dot, the ellipsis, the em dash and the en dash).",
  );
  return 1;
}

/* ------------------------------------------------------------------ */

function main() {
  const arg = process.argv[2];
  if (arg === "--self-test") return selfTest();
  if (arg && arg !== "--scan") {
    console.error(`unknown argument: ${arg}`);
    console.error("usage: node scripts/check-source-encoding.mjs [--self-test]");
    return 2;
  }
  return scan();
}

// Run only when invoked directly, so the detector stays importable.
const invokedDirectly =
  !!process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

if (invokedDirectly) {
  let code;
  try {
    code = main();
  } catch (err) {
    console.error("source-encoding guard could not run:", err?.message ?? err);
    code = 2;
  }
  process.exit(code);
}
