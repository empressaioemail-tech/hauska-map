#!/usr/bin/env node
/**
 * P-331 — a cross-repo pin that can fail on cross-repo drift.
 *
 * WHAT EXECUTES: this file. It extracts each shared literal from the DEFINING
 * MODULE in this repo and from the DEFINING MODULE in the sibling repo, and
 * exits non-zero when the two disagree. It never reads a test's copy of a
 * literal: a test copy is exactly the thing that let the two repos drift with
 * both CIs green (P-257's `setback-decline-wording.test.ts` and P-270's
 * `setback-citation-vintage.test.ts` each assert their own repo's constant
 * against a literal typed INTO THE SAME REPO).
 *
 * WHAT TRIGGERS IT:
 *   - hauska-map: .github/workflows/cross-repo-literal-drift.yml (push to
 *     main, pull_request, and a nightly schedule).
 *   - legacy-design-tools: the same-named workflow file in that repo
 *     (push to main, pull_request, nightly schedule). Each repo reads the
 *     other's main, so the two directions are two jobs in two workflows, not
 *     one job run twice.
 *   A push to ONE repo does not re-run the other's CI. The `schedule:` trigger
 *   in both repos exists for exactly that: it re-reads the sibling's main on a
 *   clock, so a one-sided edit is caught within a day even with zero activity
 *   in the repo that holds the stale copy. Without the schedule the direction
 *   "the sibling changed, we did not push" is unobserved until the next push
 *   here — that is a named bypass, not a silent one.
 *
 * WHAT FAILS (exit codes): 0 PASS · 1 FAIL (values disagree) · 2 REFUSE (a
 * declaration could not be read where it is expected — never a pass) · 3 usage.
 *
 * WHAT BYPASSES IT — the answer is never "nothing":
 *   1. A literal nobody listed here. The table below is the enumeration; a new
 *      cross-repo copy that no one adds to it is unwatched. `HAUSKA_MAP`/
 *      `LEGACY_DESIGN_TOOLS` comments claiming a copy are the trigger to add a
 *      row, not the control.
 *   2. A literal whose defining declaration MOVES or is RENAMED is caught
 *      (REFUSE, exit 2) rather than skipped — but only for literals already in
 *      the table.
 *   3. A literal DEFINED IN hauska-factory cannot be read from here: this repo
 *      is public and hauska-factory is private. Those are checked FROM the
 *      factory's CI against the public copies (hauska-factory
 *      scripts/check-public-literal-drift.mjs). The public-repo direction is
 *      therefore a bypass by construction, and the factory's own check is the
 *      only control on that pair.
 *   4. Deleting the workflow job. The control is the job, not this file.
 *   5. The two copies of THIS FILE are not compared with each other by a row.
 *      They are committed byte-identical (sha256 recorded in the close), but a
 *      row cannot read it: while one side's main lacks the file, a row that
 *      reads it REFUSES (exit 2) on every PR. MEASURED 2026-09-19: both halves
 *      have merged (hauska-map #425, legacy-design-tools #725) and the two
 *      copies read byte-identical at sha256 b2755e6e (33941 bytes,
 *      CRLF-normalised), so that particular window is closed.
 *
 * A ROW WHOSE DECLARATION IS NEW NEEDS TWO LANDINGS, IN ORDER. A row reads the
 * sibling's MAIN, so a row shipped in the same pair of PRs that introduces its
 * declaration exits 2 on BOTH PRs before either merges, and on whichever repo
 * merges first after that — a required check that no single merge can clear,
 * which is the dead gate this file exists to avoid. The P-270 city-half
 * declarations (`SitusCityBasis`, `DECLARED_ABSENCE_VERDICT`,
 * `CITY_LIMITS_INCORPORATED_STATUS` — in map's
 * `apps/property-explorer/src/lib/situs-address.ts` and this repo's
 * `artifacts/api-server/src/lib/situsCompose.ts`) therefore landed first, with
 * the rows held to a follow-up commit the lane's close names row for row and
 * file for file. Each landing is one commit per repo.
 *   6. The `union` extraction compares a `type NAME = ...` union's
 *      STRING-LITERAL members, resolving `typeof SOME_CONST` members through
 *      the same const reader. A member of any other shape (map's
 *      `(string & {})` catch-all) is EXCLUDED, and the exclusion is stated
 *      rather than silent: a catch-all says "any class we do not know passes
 *      through unchanged", which is not a value either side can drift.
 *
 * WHY THE TWO COPIES OF THIS SCRIPT ARE BYTE-IDENTICAL: DEV_PROCESS 2.4. One
 * rule with two implementations diverges into two rules. This file is
 * committed unchanged in both repos; each copy auto-detects which repo it is
 * in (or takes --side), so there is no per-repo branch inside the rule. The
 * --selftest below runs the same predicate over generated fixtures in BOTH
 * directions plus a marker-rename case, so the control is observed failing,
 * not merely observed passing.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const EXIT = { PASS: 0, FAIL: 1, REFUSE: 2, USAGE: 3 };

const HERE = dirname(fileURLToPath(import.meta.url));
const SELF_ROOT = join(HERE, "..");

/* ------------------------------------------------------------------ paths */

const MAP_FILES = {
  plannedDevelopmentDistrict:
    "apps/property-explorer/api/_lib/planned-development-district.ts",
  setbackCitationVintage:
    "apps/property-explorer/api/_lib/setback-citation-vintage.ts",
  peRecordToFacets: "apps/property-explorer/api/_lib/pe-record-to-facets.ts",
  peSitusSearchCore: "apps/property-explorer/api/_lib/pe-situs-search-core.ts",
  envelopeVerificationFixture:
    "apps/property-explorer/src/lib/__fixtures__/envelope-verification.json",
};

const LDT_FILES = {
  zoningLayers: "lib/cad-ingest/src/txgio/zoning-layers.ts",
  txgioAddressResolve: "artifacts/api-server/src/lib/txgioAddressResolve.ts",
  plannedDevelopmentSetback:
    "artifacts/api-server/src/lib/buildableEnvelope/plannedDevelopmentSetback.ts",
  setbackCitationVintage:
    "artifacts/api-server/src/lib/buildableEnvelope/setbackCitationVintage.ts",
  envelopeVerificationFixture:
    "artifacts/api-server/src/lib/buildableEnvelope/__fixtures__/envelope-verification.json",
  factFlood: "artifacts/api-server/src/lib/floodHazardFactRead.ts",
  factSpecialDistrict:
    "artifacts/api-server/src/lib/specialDistrictFactRead.ts",
  factWell: "artifacts/api-server/src/lib/wellFactRead.ts",
  factSchoolDistrict:
    "artifacts/api-server/src/lib/schoolDistrictFactRead.ts",
  factUtilityService:
    "artifacts/api-server/src/lib/utilityServiceFactRead.ts",
  factOverlayDistricts:
    "artifacts/api-server/src/lib/overlayDistrictsFactRead.ts",
  factAgValuation: "artifacts/api-server/src/lib/agValuationFactRead.ts",
  factMaxImperviousCoverPct:
    "artifacts/api-server/src/lib/maxImperviousCoverPctFactRead.ts",
};

/**
 * THE TABLE. One row per shared literal that this pair of repos must agree on.
 * `map.why` / `ldt.why` name where the copy came from, so a reader can tell a
 * deliberate vendored copy from an oversight.
 *
 * `kind`:
 *   const      — a `const NAME = <string expression>` declaration.
 *   disclosure — a leading run of string chunks in the named function (head),
 *                or the last quoted string in it (tail). The full disclosure
 *                sentence is composed from these parts, so pinning the parts
 *                pins the composition.
 *   template   — the template literal returned by the named function, with
 *                `${...}` normalised to `${}` (the interpolation expressions
 *                differ in spelling, the shared bytes are the sentence around
 *                them).
 *   file       — the file's sha256, for a fixture that is byte-identical on
 *                purpose.
 *   regex      — a `const NAME = /pattern/flags` declaration, compared to the
 *                other repo's pattern+flags pair (hauska-factory only).
 *   union      — the string-literal members of a `type NAME = ...` union, as a
 *                sorted set (order in a vocabulary is not semantic). Members
 *                that are `typeof SOME_CONST` are resolved to that const's
 *                value; members of any other shape are not compared.
 */
export const LITERALS = [
  {
    id: "planned-development-pattern",
    kind: "const",
    name: "PLANNED_DEVELOPMENT_PATTERN",
    map: { file: MAP_FILES.plannedDevelopmentDistrict, why: "vendored copy" },
    ldt: {
      file: LDT_FILES.zoningLayers,
      why: "the one definition this repo owns (P-255 census, P-257)",
    },
    value: "^(PUD|PDD|PD|PC|P-?U-?D)([\\s-].*)?$",
  },
  {
    id: "planned-development-flags",
    kind: "const",
    name: "PLANNED_DEVELOPMENT_FLAGS",
    map: { file: MAP_FILES.plannedDevelopmentDistrict, why: "vendored copy" },
    ldt: { file: LDT_FILES.zoningLayers, why: "the one definition" },
    value: "i",
  },
  {
    id: "pud-setback-refusal-reason",
    kind: "const",
    name: "PUD_SETBACK_REFUSAL_REASON",
    map: {
      file: MAP_FILES.plannedDevelopmentDistrict,
      why: "copied verbatim from hauska-factory's P-256 PUD_REFUSAL_REASON",
    },
    ldt: {
      file: LDT_FILES.plannedDevelopmentSetback,
      why: "copied verbatim from hauska-factory's P-256 PUD_REFUSAL_REASON",
    },
    value:
      "setbacks for this parcel are set by its planned-development ordinance, not a district schedule",
  },
  {
    id: "planned-development-disclosure-head",
    kind: "disclosure",
    part: "head",
    name: "plannedDevelopmentDisclosure",
    map: { file: MAP_FILES.plannedDevelopmentDistrict, why: "composed here" },
    ldt: { file: LDT_FILES.plannedDevelopmentSetback, why: "composed here" },
  },
  {
    id: "planned-development-disclosure-tail",
    kind: "disclosure",
    part: "tail",
    name: "plannedDevelopmentDisclosure",
    map: { file: MAP_FILES.plannedDevelopmentDistrict, why: "composed here" },
    ldt: { file: LDT_FILES.plannedDevelopmentSetback, why: "composed here" },
  },
  {
    id: "setback-citation-vintage-token",
    kind: "const",
    name: "SETBACK_CITATION_VINTAGE_TOKEN",
    map: { file: MAP_FILES.setbackCitationVintage, why: "composed here" },
    ldt: { file: LDT_FILES.setbackCitationVintage, why: "composed here" },
    value: "setback-citation-vintage-unreadable",
  },
  {
    id: "setback-citation-future-effective-token",
    kind: "const",
    name: "SETBACK_CITATION_FUTURE_EFFECTIVE_TOKEN",
    map: { file: MAP_FILES.setbackCitationVintage, why: "composed here" },
    ldt: { file: LDT_FILES.setbackCitationVintage, why: "composed here" },
    value: "setback-citation-future-effective",
  },
  {
    id: "setback-citation-vintage-unreadable-note",
    kind: "const",
    name: "SETBACK_CITATION_VINTAGE_UNREADABLE_NOTE",
    map: { file: MAP_FILES.setbackCitationVintage, why: "composed here" },
    ldt: { file: LDT_FILES.setbackCitationVintage, why: "composed here" },
    value:
      "Setback rule vintage unknown — the rule is served undated, not as current. Verify with the city.",
  },
  {
    id: "setback-future-effective-note",
    kind: "template",
    name: "setbackFutureEffectiveNote",
    map: { file: MAP_FILES.setbackCitationVintage, why: "composed here" },
    ldt: { file: LDT_FILES.setbackCitationVintage, why: "composed here" },
  },
  {
    id: "setback-future-effective-card-marker",
    kind: "template",
    name: "setbackFutureEffectiveCardMarker",
    map: { file: MAP_FILES.setbackCitationVintage, why: "composed here" },
    ldt: { file: LDT_FILES.setbackCitationVintage, why: "composed here" },
  },
  {
    id: "envelope-verification-v1-fixture",
    kind: "file",
    map: { file: MAP_FILES.envelopeVerificationFixture, why: "byte-identical copy" },
    ldt: { file: LDT_FILES.envelopeVerificationFixture, why: "byte-identical copy" },
  },
  {
    id: "situs-search-miss-class-vocabulary",
    kind: "union",
    name: "SitusSearchMissClass",
    map: {
      file: MAP_FILES.peSitusSearchCore,
      why: "the BFF's copy of cortex's search vocabulary; map's own test cites txgioAddressResolve.ts line 602",
    },
    ldt: {
      file: LDT_FILES.txgioAddressResolve,
      why: "the search route that emits the vocabulary (P-205/P-210)",
    },
    value:
      "county_out_of_coverage | coverage_check_unavailable | no-hit | out_of_coverage | situs-search-budget-exceeded",
  },
  // Fact-family `source` strings. hauska-map vendors LDT's `<rail>FactRead.ts`
  // constants into pe-record-to-facets.ts instead of importing them (the
  // parser's own header says so). Each pair is one string on one wire.
  ...[
    ["FLOOD_HAZARD_FACT_SOURCE", "factFlood", "flood-hazard-fact"],
    ["SPECIAL_DISTRICT_FACT_SOURCE", "factSpecialDistrict", "special-district-fact"],
    ["WELL_FACT_SOURCE", "factWell", "well-fact"],
    ["SCHOOL_DISTRICT_FACT_SOURCE", "factSchoolDistrict", "school-district-fact"],
    ["UTILITY_SERVICE_FACT_SOURCE", "factUtilityService", "utility-service-fact"],
    ["OVERLAY_DISTRICTS_FACT_SOURCE", "factOverlayDistricts", "overlay-districts-fact"],
    ["AG_VALUATION_FACT_SOURCE", "factAgValuation", "ag-valuation-fact"],
    [
      "MAX_IMPERVIOUS_COVER_PCT_FACT_SOURCE",
      "factMaxImperviousCoverPct",
      "max-impervious-cover-pct-fact",
    ],
  ].map(([name, ldtKey, value]) => ({
    id: name.toLowerCase().replace(/_/g, "-"),
    kind: "const",
    name,
    map: { file: MAP_FILES.peRecordToFacets, why: "vendored verbatim from LDT" },
    ldt: { file: LDT_FILES[ldtKey], why: "the one definition" },
    value,
  })),
];

/* --------------------------------------------------------------- extraction */

class DriftRefuse extends Error {
  constructor(code, id, detail) {
    super(`${code}: ${detail}`);
    this.code = code;
    this.literalId = id;
  }
}

function skipTrivia(text, i) {
  for (;;) {
    while (i < text.length && /\s/.test(text[i])) i++;
    if (text[i] === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      continue;
    }
    if (text[i] === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 2;
      continue;
    }
    return i;
  }
}

function readQuoted(text, i) {
  const quote = text[i];
  let out = "";
  i++;
  while (i < text.length && text[i] !== quote) {
    if (text[i] === "\\") {
      const next = text[i + 1];
      out += next === "n" ? "\n" : next === "t" ? "\t" : next;
      i += 2;
      continue;
    }
    out += text[i];
    i++;
  }
  if (text[i] !== quote) throw new Error("unterminated string literal");
  return { value: out, end: i + 1 };
}

function readTemplate(text, i) {
  let out = "";
  i++;
  while (i < text.length && text[i] !== "`") {
    if (text[i] === "\\") {
      out += text[i + 1];
      i += 2;
      continue;
    }
    if (text[i] === "$" && text[i + 1] === "{") {
      let depth = 1;
      let j = i + 2;
      while (j < text.length && depth > 0) {
        if (text[j] === "{") depth++;
        else if (text[j] === "}") depth--;
        j++;
      }
      out += "${" + text.slice(i + 2, j - 1) + "}";
      i = j;
      continue;
    }
    out += text[i];
    i++;
  }
  if (text[i] !== "`") throw new Error("unterminated template literal");
  return { value: out, end: i + 1 };
}

/** Read a run of adjacent string/template literals joined by `+`. */
function readLiteralRun(text, i) {
  let out = "";
  let chunks = 0;
  for (;;) {
    const at = skipTrivia(text, i);
    const ch = text[at];
    if (ch === '"' || ch === "'") {
      const r = readQuoted(text, at);
      out += r.value;
      i = r.end;
      chunks++;
    } else if (ch === "`") {
      const r = readTemplate(text, at);
      out += r.value;
      i = r.end;
      chunks++;
    } else {
      break;
    }
    const plus = skipTrivia(text, i);
    if (text[plus] === "+") {
      i = plus + 1;
      continue;
    }
    break;
  }
  return { value: out, chunks, end: i };
}

function findFunctionBody(text, name) {
  const re = new RegExp(`(?:export\\s+)?function\\s+${name}\\s*\\(`);
  const m = re.exec(text);
  if (!m) throw new Error(`function ${name} not found`);
  // Walk the PARAMETER LIST first: a parameter's own object type annotation
  // carries braces, and taking the first `{` after the name would brace-match
  // the type instead of the body (it did, in the first selftest run).
  let i = m.index + m[0].length - 1; // at the "("
  let parens = 0;
  for (; i < text.length; i++) {
    if (text[i] === "(") parens++;
    else if (text[i] === ")") {
      parens--;
      if (parens === 0) break;
    }
  }
  const open = text.indexOf("{", i);
  if (open === -1) throw new Error(`function ${name} has no body`);
  let depth = 0;
  let j = open;
  for (; j < text.length; j++) {
    if (text[j] === "{") depth++;
    else if (text[j] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  return { body: text.slice(open, j + 1), start: open };
}

export function extractConst(source, name, id) {
  const re = new RegExp(`(?:^|\\n)\\s*(?:export\\s+)?const\\s+${name}\\s*=\\s*`, "m");
  const m = re.exec(source);
  if (!m) {
    throw new DriftRefuse("DRIFT_MARKER_MISSING", id, `const ${name} not found`);
  }
  const run = readLiteralRun(source, m.index + m[0].length);
  if (run.chunks === 0) {
    throw new DriftRefuse(
      "DRIFT_MARKER_MISSING",
      id,
      `const ${name} is not a string literal expression (the declaration moved or changed shape)`,
    );
  }
  return run.value;
}

export function extractRegex(source, name) {
  const re = new RegExp(`(?:^|\\n)\\s*(?:export\\s+)?const\\s+${name}\\s*=\\s*/(.*)/([a-z]*)\\s*;`, "m");
  const m = re.exec(source);
  if (!m) {
    throw new DriftRefuse(
      "DRIFT_MARKER_MISSING",
      name,
      `regex const ${name} not found as /pattern/flags`,
    );
  }
  return { pattern: m[1], flags: m[2] };
}

export function extractDisclosureHead(source, name, id) {
  const { body, start } = findFunctionBody(source, name);
  const ret = body.indexOf("return");
  if (ret === -1) {
    throw new DriftRefuse("DRIFT_MARKER_MISSING", id, `${name} has no return`);
  }
  // The disclosure returns a parenthesised concatenation (`return ( "a" + ... )`).
  // Step over the opening paren(s) so the run starts at the first literal.
  let at = skipTrivia(source, start + ret + "return".length);
  while (source[at] === "(") at = skipTrivia(source, at + 1);
  const run = readLiteralRun(source, at);
  if (run.chunks === 0) {
    throw new DriftRefuse(
      "DRIFT_MARKER_MISSING",
      id,
      `${name}'s return does not begin with a string run`,
    );
  }
  return run.value;
}

export function extractDisclosureTail(source, name, id) {
  const { body, start } = findFunctionBody(source, name);
  const quoted = /(["'])(?:(?!\1)[^\\]|\\.)*\1/g;
  let last = null;
  let m;
  while ((m = quoted.exec(body))) last = m;
  if (!last) {
    throw new DriftRefuse("DRIFT_MARKER_MISSING", id, `${name} has no quoted string`);
  }
  const value = readQuoted(source, start + last.index);
  return value.value;
}

export function extractTemplateReturn(source, name, id) {
  const { body, start } = findFunctionBody(source, name);
  const ret = body.lastIndexOf("return");
  if (ret === -1) {
    throw new DriftRefuse("DRIFT_MARKER_MISSING", id, `${name} has no return`);
  }
  const run = readLiteralRun(source, start + ret + "return".length);
  if (run.chunks !== 1) {
    throw new DriftRefuse(
      "DRIFT_MARKER_MISSING",
      id,
      `${name}'s return is not a single template literal (${run.chunks} chunks)`,
    );
  }
  return run.value.replace(/\$\{[^}]*\}/g, "${}");
}

/**
 * The string-literal members of `type NAME = "a" | "b" | typeof CONST | ...`,
 * as a SORTED SET joined by " | ". A vocabulary's ORDER is not semantic (map
 * lists the budget class last, LDT lists it in the union's own order), so
 * comparing order would be a permanent false positive.
 *
 * Members that are not string literals and not `typeof NAME` are EXCLUDED —
 * map's `(string & {})` catch-all is the one in the table — and that exclusion
 * is stated in the header rather than silently applied.
 */
export function extractStringUnion(source, name, id) {
  const re = new RegExp(`(?:^|\\n)\\s*(?:export\\s+)?type\\s+${name}\\s*=`, "m");
  const m = re.exec(source);
  if (!m) {
    throw new DriftRefuse("DRIFT_MARKER_MISSING", id, `type ${name} not found`);
  }
  const from = m.index + m[0].length;
  let depth = 0;
  let end = -1;
  for (let i = from; i < source.length; i++) {
    const ch = source[i];
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    else if (ch === ";" && depth === 0) {
      end = i;
      break;
    }
  }
  if (end === -1) {
    throw new DriftRefuse("DRIFT_MARKER_MISSING", id, `type ${name} has no terminating ";"`);
  }
  const members = [];
  for (const raw of source.slice(from, end).split("|")) {
    const part = raw.trim();
    if (!part) continue;
    const literal = /^(["'])(.*)\1$/.exec(part);
    if (literal) {
      members.push(literal[2]);
      continue;
    }
    const typeOf = /^typeof\s+([A-Za-z_$][\w$]*)$/.exec(part);
    if (typeOf) {
      members.push(extractConst(source, typeOf[1], id));
      continue;
    }
    // Not a value either repo can drift: see the header's exclusion note.
  }
  if (members.length === 0) {
    throw new DriftRefuse(
      "DRIFT_MARKER_MISSING",
      id,
      `type ${name} has no string-literal member (the declaration moved or changed shape)`,
    );
  }
  return [...new Set(members)].sort().join(" | ");
}

export function extractValue(source, literal) {
  switch (literal.kind) {
    case "const":
      return extractConst(source, literal.name, literal.id);
    case "disclosure":
      return literal.part === "tail"
        ? extractDisclosureTail(source, literal.name, literal.id)
        : extractDisclosureHead(source, literal.name, literal.id);
    case "template":
      return extractTemplateReturn(source, literal.name, literal.id);
    case "union":
      return extractStringUnion(source, literal.name, literal.id);
    default:
      throw new Error(`unknown kind ${literal.kind}`);
  }
}

/* ------------------------------------------------------------------ reading */

function readSideFile(root, path, id, side) {
  const full = join(root, path);
  if (existsSync(full)) return readFileSync(full, "utf8");
  try {
    return execFileSync("git", ["-C", root, "show", `HEAD:${path}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    throw new DriftRefuse(
      "REMOTE_UNREADABLE",
      id,
      `${side} copy of ${path} could not be read from ${root}: ${String(
        err.stderr ?? err.message ?? err,
      ).trim()}`,
    );
  }
}

/* -------------------------------------------------------------------- check */

export function checkPair({ mapRoot, ldtRoot }) {
  const diffs = [];
  const checked = [];
  for (const literal of LITERALS) {
    const local = literal.map.file;
    const remote = literal.ldt.file;
    if (literal.kind === "file") {
      // LINE ENDINGS ARE NOT CONTENT. hauska-map and legacy-design-tools apply
      // different eol attributes on checkout, so the same stored blob lands as
      // CRLF in one working tree and LF in the other (measured 2026-09-18:
      // 5694 vs 5547 bytes for envelope-verification.json, exactly the 147
      // newlines). Comparing raw working-tree bytes would be a permanent false
      // positive on Windows and would say nothing about the blob. The counting
      // rule is therefore stated inline: sha256 of the file read as UTF-8 with
      // CRLF normalised to LF.
      const ha = sha256(readFileSync(join(mapRoot, local), "utf8").replace(/\r\n/g, "\n"));
      const hb = sha256(readFileSync(join(ldtRoot, remote), "utf8").replace(/\r\n/g, "\n"));
      if (ha !== hb) {
        diffs.push({
          id: literal.id,
          map: `${ha} (${mapRoot}/${local})`,
          ldt: `${hb} (${ldtRoot}/${remote})`,
          reason: "fixture is not byte-identical across repos",
        });
      }
      checked.push(literal.id);
      continue;
    }
    const mapValue = extractValue(readSideFile(mapRoot, local, literal.id, "hauska-map"), literal);
    const ldtValue = extractValue(readSideFile(ldtRoot, remote, literal.id, "legacy-design-tools"), literal);
    if (mapValue !== ldtValue) {
      diffs.push({
        id: literal.id,
        map: JSON.stringify(mapValue),
        ldt: JSON.stringify(ldtValue),
        reason: "extracted values differ",
      });
    }
    checked.push(literal.id);
  }
  return { diffs, checked };
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

/* ------------------------------------------------------------------ selftest */

const DISCLOSURE_FIXTURE = `export function plannedDevelopmentDisclosure(input: {
  districtCode: string;
  jurisdictionKey?: string | null;
}): string {
  const where = (input.jurisdictionKey ?? "").trim();
  return (
    \`\${input.districtCode} is a planned-development code, not a Euclidean \` +
    "district: its dimensional standards are set by the development's own " +
    "ordinance and development plan, not by a district schedule, so no " +
    "setback table is served" +
    (where ? \` for \${where}\` : "") +
    ". Verify the development plan's own standards with the city."
  );
}
`;

const NOTE_FIXTURE = `export function setbackFutureEffectiveNote(
  adoptedDate: string | null,
  effectiveDate: string,
): string {
  const adopted = adoptedDate ? \`adopted \${adoptedDate}, \` : "";
  return \`Setback rule \${adopted}takes effect \${effectiveDate} — the rule is served ahead of its effective date, not as current. Verify with the city.\`;
}
`;

const MARKER_FIXTURE = `export function setbackFutureEffectiveCardMarker(
  adoptedDate: string | null,
  effectiveDate: string,
): string {
  const adopted = adoptedDate ? \`adopted \${adoptedDate}, \` : "";
  return \`\${adopted}takes effect \${effectiveDate}\`;
}
`;

function fixtureContent(literal, side, value) {
  if (literal.kind === "disclosure") return DISCLOSURE_FIXTURE;
  if (literal.kind === "template") {
    return literal.name === "setbackFutureEffectiveNote" ? NOTE_FIXTURE : MARKER_FIXTURE;
  }
  if (literal.kind === "union") {
    const members = (value ?? literal.value).split(" | ");
    return `export type ${literal.name} =\n${members
      .map((m) => `  | ${JSON.stringify(m)}`)
      .join("\n")};\n`;
  }
  if (literal.kind === "file") {
    return JSON.stringify({ fixtureSet: "envelope-verification-v1", cases: [] }, null, 2) + "\n";
  }
  const v = value ?? literal.value;
  return side === "map"
    ? `const ${literal.name} = ${JSON.stringify(v)};\n`
    : `export const ${literal.name} = ${JSON.stringify(v)} as const;\n`;
}

function writeFixtureTree(root, side, values = {}) {
  /** file -> ordered, de-duplicated declaration pieces (one file can hold several literals). */
  const byFile = new Map();
  for (const literal of LITERALS) {
    const spec = side === "map" ? literal.map : literal.ldt;
    const piece = fixtureContent(literal, side, values[literal.id]);
    const pieces = byFile.get(spec.file) ?? [];
    if (!pieces.includes(piece)) pieces.push(piece);
    byFile.set(spec.file, pieces);
  }
  for (const [file, pieces] of byFile) {
    const full = join(root, file);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, pieces.join(""));
  }
}

function expect(condition, message, failures) {
  if (!condition) failures.push(message);
}

function selftest() {
  const root = mkdtempSync(join(tmpdir(), "p331-drift-"));
  const failures = [];
  try {
    const mapRoot = join(root, "hauska-map");
    const ldtRoot = join(root, "legacy-design-tools");
    writeFixtureTree(mapRoot, "map");
    writeFixtureTree(ldtRoot, "ldt");

    // 1. agreeing fixtures pass.
    const agree = checkPair({ mapRoot, ldtRoot });
    expect(
      agree.diffs.length === 0,
      `selftest/agree: expected no diffs, got ${JSON.stringify(agree.diffs)}`,
      failures,
    );
    expect(
      agree.checked.length === LITERALS.length,
      `selftest/agree: checked ${agree.checked.length} of ${LITERALS.length} literals`,
      failures,
    );

    // 2. a one-sided change fails, naming the changed literal.
    const target = "planned-development-pattern";
    writeFixtureTree(ldtRoot, "ldt", { [target]: "^(PUD|PDD|PD)([\\s-].*)?$" });
    let oneSided = null;
    let oneSidedRefused = null;
    try {
      oneSided = checkPair({ mapRoot, ldtRoot });
    } catch (err) {
      oneSidedRefused = err;
    }
    expect(
      oneSided !== null && oneSided.diffs.some((d) => d.id === target),
      `selftest/one-sided: expected a diff on ${target}, got ${
        oneSidedRefused ? oneSidedRefused.message : JSON.stringify(oneSided?.diffs)
      }`,
      failures,
    );
    expect(
      oneSided !== null && oneSided.diffs.every((d) => d.id === target),
      `selftest/one-sided: expected ONLY ${target} to differ`,
      failures,
    );

    // 3. both sides changed together pass (the drift check is not a lockfile).
    writeFixtureTree(mapRoot, "map", { [target]: "^(PUD|PDD|PD)([\\s-].*)?$" });
    const both = checkPair({ mapRoot, ldtRoot });
    expect(
      both.diffs.length === 0,
      `selftest/both-sides: expected no diffs, got ${JSON.stringify(both.diffs)}`,
      failures,
    );

    // 3b. the `union` kind fails one-sided too. Its subject is a vocabulary, so
    //     the mutation is a member DROPPED on one side (the shape a rename or a
    //     forgotten class takes), not a changed character.
    const unionTarget = "situs-search-miss-class-vocabulary";
    writeFixtureTree(mapRoot, "map");
    writeFixtureTree(ldtRoot, "ldt");
    writeFixtureTree(ldtRoot, "ldt", {
      [unionTarget]:
        "county_out_of_coverage | coverage_check_unavailable | no-hit | out_of_coverage",
    });
    const unionOneSided = checkPair({ mapRoot, ldtRoot });
    expect(
      unionOneSided.diffs.length === 1 && unionOneSided.diffs[0].id === unionTarget,
      `selftest/union-one-sided: expected a diff on ${unionTarget}, got ${JSON.stringify(
        unionOneSided.diffs,
      )}`,
      failures,
    );
    writeFixtureTree(ldtRoot, "ldt");
    writeFixtureTree(mapRoot, "map");

    // 4. a renamed declaration refuses, loudly (never a skip).
    writeFixtureTree(ldtRoot, "ldt");
    const renamedPath = join(ldtRoot, LDT_FILES.zoningLayers);
    writeFileSync(
      renamedPath,
      readFileSync(renamedPath, "utf8").replace(
        "PLANNED_DEVELOPMENT_PATTERN",
        "PLANNED_DEVELOPMENT_PATTERN_RENAMED",
      ),
    );
    let refused = null;
    try {
      checkPair({ mapRoot, ldtRoot });
    } catch (err) {
      refused = err;
    }
    expect(
      refused !== null && refused.code === "DRIFT_MARKER_MISSING",
      `selftest/renamed: expected DRIFT_MARKER_MISSING, got ${
        refused ? `${refused.code}: ${refused.message}` : "no refusal"
      }`,
      failures,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  if (failures.length) {
    console.error(
      JSON.stringify({ selftest: "FAIL", failures }, null, 2),
    );
    return EXIT.FAIL;
  }
  console.log(
    JSON.stringify(
      {
        selftest: "PASS",
        scenarios: [
          "agreeing fixtures pass",
          "one-sided change fails naming the literal",
          "both sides changed together pass",
          "union kind: a member dropped on one side fails",
          "renamed declaration refuses (DRIFT_MARKER_MISSING)",
        ],
        literals: LITERALS.length,
      },
      null,
      2,
    ),
  );
  return EXIT.PASS;
}

/* --------------------------------------------------------------------- main */

function parseArgs(argv) {
  const args = { side: null, mapRoot: null, ldtRoot: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--side") args.side = argv[++i];
    else if (a === "--map-root") args.mapRoot = argv[++i];
    else if (a === "--ldt-root") args.ldtRoot = argv[++i];
  }
  return args;
}

function detectSide(root) {
  const name = basename(root).toLowerCase();
  if (name.includes("hauska-map")) return "map";
  if (name.includes("legacy-design-tools")) return "ldt";
  return null;
}

function defaultRemoteRoot(side) {
  if (side === "map") {
    return (
      process.env.LDT_REPO_PATH ??
      process.env.LEGACY_DESIGN_TOOLS_REPO_PATH ??
      "P:/seat-worktrees/property/legacy-design-tools"
    );
  }
  return (
    process.env.HAUSKA_MAP_REPO_PATH ??
    process.env.MAP_REPO_PATH ??
    "P:/hauska-map"
  );
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--selftest")) process.exit(selftest());

  const args = parseArgs(argv);
  const side = args.side ?? detectSide(SELF_ROOT);
  if (!side) {
    console.error(
      JSON.stringify(
        {
          error:
            "cannot tell which repo this is; pass --side map|ldt (this script is byte-identical in both repos)",
        },
        null,
        2,
      ),
    );
    process.exit(EXIT.USAGE);
  }

  const mapRoot = args.mapRoot ?? (side === "map" ? SELF_ROOT : defaultRemoteRoot(side));
  const ldtRoot = args.ldtRoot ?? (side === "ldt" ? SELF_ROOT : defaultRemoteRoot(side));

  try {
    const { diffs, checked } = checkPair({ mapRoot, ldtRoot });
    if (diffs.length) {
      console.error(
        JSON.stringify(
          {
            error: `DRIFT_MISMATCH: ${diffs.length} of ${checked.length} shared literals disagree`,
            code: "DRIFT_MISMATCH",
            diffs,
          },
          null,
          2,
        ),
      );
      process.exit(EXIT.FAIL);
    }
    console.log(
      JSON.stringify({ ok: true, side, checked: checked.length, literals: checked }),
    );
    process.exit(EXIT.PASS);
  } catch (err) {
    if (err instanceof DriftRefuse) {
      console.error(
        JSON.stringify(
          { error: err.message, code: err.code, literalId: err.literalId },
          null,
          2,
        ),
      );
      process.exit(EXIT.REFUSE);
    }
    console.error(JSON.stringify({ error: String(err?.stack ?? err) }, null, 2));
    process.exit(EXIT.REFUSE);
  }
}

if (process.argv[1] && basename(process.argv[1]) === "check-cross-repo-literal-drift.mjs") {
  main();
}
