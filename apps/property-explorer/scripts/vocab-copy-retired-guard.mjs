#!/usr/bin/env node
/**
 * P-167 (OPS-23 R-6) - the local buildable-display-vocab copy stays retired.
 *
 * Before this row, `buildable-display-vocab.ts` was one of five
 * byte-identical hand-synced copies of the buildable/setback display
 * vocabulary (hauska-map, twice in hauska-engine), locked together by a
 * parity fixture + lock file this repo also carried
 * (`__fixtures__/buildable-display-vocab.parity.lock.json` /
 * `.peer.fixture`) and a parity test. All of that is deleted; the vocabulary
 * now lives once, in `@empressaio/atom-contract/display`
 * (`baked-facets.ts` and `sheet-to-card-model.ts` import
 * `mapBuildableDisplay` from there). This guard fails if any of those
 * shapes reappears under `apps/property-explorer/src/lib/`.
 *
 * WHAT EXECUTES THIS: this script.
 * WHAT TRIGGERS IT: `pnpm --filter property-explorer test`.
 * WHAT FAILS: exit 1, before merge, naming the exact reappeared path.
 * WHAT BYPASSES IT: a copy placed outside `src/lib/` (a different directory
 *   entirely), or a copy under a name this guard's pattern does not match
 *   (`RETIRED_NAME_PATTERN` below) - that residual is named here rather than
 *   implied.
 *
 * POSITIVE CONTROL: a scan that only ever reports "not found" is
 * indistinguishable from a scan whose directory read went blind. This guard
 * also asserts `src/lib/` exists and holds other files, and that the two
 * still-live importers (`baked-facets.ts`, `sheet-to-card-model.ts`) both
 * import `mapBuildableDisplay` from `@empressaio/atom-contract/display`
 * rather than a local module - if either check finds nothing, it fails
 * loudly rather than passing silently.
 *
 * Self-test in both directions: vocab-copy-retired-guard.test.mjs runs this
 * against the real tree (expects clean) and against a synthetic tree that
 * reintroduces a copy (expects a named violation).
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** Matches the retired module and its test/parity siblings, any extension. */
const RETIRED_NAME_PATTERN = /^buildable-display-vocab(\..*)?\.[cm]?[jt]sx?$/;
/** Matches the retired parity fixture/lock basenames specifically. */
const RETIRED_FIXTURE_PATTERN = /^buildable-display-vocab\.(peer\.fixture|parity\.lock\.json)$/;

const PACKAGE_IMPORT = "@empressaio/atom-contract/display";
const LIVE_IMPORTERS = ["baked-facets.ts", "sheet-to-card-model.ts"];

/**
 * @param {{ appRoot: string }} opts
 * @returns {{ violations: string[], notes: string[] }}
 */
export function checkVocabCopyRetired({ appRoot }) {
  const violations = [];
  const notes = [];

  const libDir = join(appRoot, "src", "lib");
  if (!existsSync(libDir)) {
    violations.push(
      `POSITIVE CONTROL FAILED: ${libDir} does not exist, so this guard could not run.`,
    );
    return { violations, notes };
  }

  const libFiles = readdirSync(libDir);
  const otherLibFiles = libFiles.filter((f) => !RETIRED_NAME_PATTERN.test(f));
  if (otherLibFiles.length === 0) {
    violations.push(
      `POSITIVE CONTROL FAILED: src/lib/ holds no file other than ones matching the retired pattern, so an empty result proves nothing.`,
    );
  } else {
    notes.push(`control: src/lib/ holds ${otherLibFiles.length} other files`);
  }

  const reintroduced = libFiles.filter((f) => RETIRED_NAME_PATTERN.test(f));
  for (const f of reintroduced) {
    violations.push(
      `RETIRED VOCAB COPY REINTRODUCED: src/lib/${f} exists. The buildable/setback display vocabulary lives once, in ${PACKAGE_IMPORT} (P-167, OPS-23 R-6).`,
    );
  }

  const fixturesDir = join(libDir, "__fixtures__");
  if (existsSync(fixturesDir)) {
    const fixtureFiles = readdirSync(fixturesDir).filter((f) =>
      RETIRED_FIXTURE_PATTERN.test(f),
    );
    for (const f of fixtureFiles) {
      violations.push(
        `RETIRED PARITY ARTEFACT REINTRODUCED: src/lib/__fixtures__/${f} exists. The parity lock this fixture served was deleted at P-167; there is one copy now, so there is nothing left to lock.`,
      );
    }
  }

  for (const importer of LIVE_IMPORTERS) {
    const p = join(libDir, importer);
    if (!existsSync(p)) {
      violations.push(
        `POSITIVE CONTROL FAILED: src/lib/${importer} does not exist, so its import could not be checked.`,
      );
      continue;
    }
    const src = readFileSync(p, "utf8");
    const importsPackage = src.includes(`"${PACKAGE_IMPORT}"`) || src.includes(`'${PACKAGE_IMPORT}'`);
    const importsLocalCopy = /from\s+["']\.\/buildable-display-vocab["']/.test(src);
    if (importsLocalCopy) {
      violations.push(
        `RETIRED IMPORT REINTRODUCED: src/lib/${importer} imports from "./buildable-display-vocab" instead of "${PACKAGE_IMPORT}".`,
      );
    } else if (!importsPackage) {
      violations.push(
        `POSITIVE CONTROL FAILED: src/lib/${importer} imports mapBuildableDisplay from neither the local retired copy nor ${PACKAGE_IMPORT}; the import shape changed in a way this guard does not recognize.`,
      );
    } else {
      notes.push(`control: src/lib/${importer} imports mapBuildableDisplay from ${PACKAGE_IMPORT}`);
    }
  }

  return { violations, notes };
}

const isCli =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isCli) {
  const appRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
  const { violations, notes } = checkVocabCopyRetired({ appRoot });
  for (const n of notes) console.log(`  ${n}`);
  if (violations.length > 0) {
    console.error(
      "\nP-167 vocab-copy-retired guard FAILED:\n" +
        violations.map((v) => `  - ${v}`).join("\n") +
        "\n\nThe buildable/setback display vocabulary lives once, in\n" +
        `${PACKAGE_IMPORT} (OPS-23 R-6, P-167). Do not re-add a local copy.\n`,
    );
    process.exit(1);
  }
  console.log("P-167 vocab-copy-retired guard passed.");
}
