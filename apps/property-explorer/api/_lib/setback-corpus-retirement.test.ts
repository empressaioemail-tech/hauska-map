/**
 * P-340 — THE RETIREMENT GUARD. The card's vendored setback table is retired
 * BY DECLINE, and this suite is what makes that a fact rather than an
 * intention: it fails if the retired module, the vendored table directory, or
 * a hand-copied row reappears anywhere in the app's source.
 *
 * WHY DECLINE AND NOT "KEPT FOR A NAMED REASON". `codified-setback-from-zoning.ts`
 * carried four vendored JSON tables (`setback-tables/austin-tx.json` and three
 * siblings) and resolved by exact leading-token match. It was a SECOND home for
 * setback law beside `@empressaio/setback-corpus` — the package the drawing
 * route already reads — and the two homes had drifted: the vendored austin-tx
 * table was a nine-row subset of the corpus's 37, and its `MF-2`/`MF-3` front
 * yard (15 ft) is the pre-correction value the corpus's own note records as
 * now 25 ft. Every extra home is another place for the card and the route to
 * disagree, which is the defect class this lane exists to close, so the module
 * is deleted rather than kept beside the corpus. See
 * `setback-corpus-table.ts` for what replaced it and `setback-resolution.ts`
 * for the decision that now runs on top of it.
 *
 * A test, not a comment, because a comment cannot fail: the next edit that
 * reaches for a local table has to delete this suite first, in the same diff,
 * where a reviewer sees it.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The app root this guard covers (its api/ sources and its UI sources).
 * Derived from THIS file's own location (`<app>/api/_lib/...`) rather than
 * from `process.cwd()`, so the guard covers the same tree however the suite is
 * invoked — a guard that silently walks an empty directory passes for the
 * wrong reason.
 */
const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** This file, which necessarily names the retired paths. */
const SELF = "setback-corpus-retirement.test.ts";

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next" || entry === "dist") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mts|cts|js|mjs|cjs|json)$/.test(entry)) out.push(full);
  }
  return out;
}

const FILES = walk(APP_ROOT).filter((f) => !f.endsWith(SELF));

describe("the card's vendored setback table is retired by decline (P-340)", () => {
  it("no file imports or re-exports the retired module", () => {
    // Built at runtime so this suite's own source is not the thing it finds.
    const retired = ["codified-setback-from-zoning"];
    const offenders: string[] = [];
    for (const file of FILES) {
      const text = readFileSync(file, "utf8");
      for (const name of retired) {
        if (new RegExp(`from\\s+["'][^"']*${name}[^"']*["']`).test(text)) {
          offenders.push(`${file}: ${name}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the vendored table directory and its rows are gone", () => {
    const retiredDir = join(APP_ROOT, "api", "_lib", "setback-tables");
    let exists = true;
    try {
      statSync(retiredDir);
    } catch {
      exists = false;
    }
    expect(exists, "api/_lib/setback-tables must not exist").toBe(false);
    expect(FILES.some((f) => f.includes(`${join("_lib", "setback-tables")}`))).toBe(false);
  });

  it("the corpus is the one table home the app reads", () => {
    // The positive half: the replacement module is present and every table
    // read goes through it. A change that adds a second table reader without
    // deleting this expectation is a second home.
    const readers = FILES.filter((f) => {
      const text = readFileSync(f, "utf8");
      return /from\s+["']@empressaio\/setback-corpus["']/.test(text);
    }).map((f) => f.replace(/\\/g, "/"));
    expect(readers.some((f) => f.endsWith("api/_lib/setback-corpus-table.ts"))).toBe(true);
    // Only the table module may import the bare package root; every other
    // consumer goes through it or through the resolver subpath.
    const bareRootReaders = readers.filter(
      (f) => !f.endsWith("api/_lib/setback-corpus-table.ts"),
    );
    expect(bareRootReaders).toEqual([]);
  });
});
