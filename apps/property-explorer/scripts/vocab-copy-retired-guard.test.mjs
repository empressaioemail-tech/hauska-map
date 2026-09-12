// P-167 (OPS-23 R-6) - the vocab-copy-retired guard is tested for its
// ability to FIRE, not just to pass. Each case builds a synthetic app tree,
// reintroduces one shape of the retired buildable-display-vocab copy, and
// asserts the guard names it. The last group tests the guard's own positive
// controls.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { checkVocabCopyRetired } from "./vocab-copy-retired-guard.mjs";

const REAL_APP_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

const CLEAN_IMPORT = `import { mapBuildableDisplay } from "@empressaio/atom-contract/display";\n`;
const RETIRED_IMPORT = `import { mapBuildableDisplay } from "./buildable-display-vocab";\n`;

const made = [];

/** Build a synthetic src/lib/ tree; overrides replace or add individual files. */
function makeAppRoot(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "p167-guard-"));
  made.push(root);
  const libDir = join(root, "src", "lib");
  mkdirSync(libDir, { recursive: true });
  // an unrelated file so the "other files exist" positive control is satisfied
  writeFileSync(join(libDir, "baked-facets.ts"), overrides.bakedFacets ?? CLEAN_IMPORT);
  writeFileSync(
    join(libDir, "sheet-to-card-model.ts"),
    overrides.sheetToCardModel ?? CLEAN_IMPORT,
  );
  writeFileSync(join(libDir, "buildable-envelope.ts"), "export {};\n");
  if (overrides.extraLibFiles) {
    for (const [name, body] of Object.entries(overrides.extraLibFiles)) {
      writeFileSync(join(libDir, name), body);
    }
  }
  if (overrides.extraFixtureFiles) {
    const fixturesDir = join(libDir, "__fixtures__");
    mkdirSync(fixturesDir, { recursive: true });
    for (const [name, body] of Object.entries(overrides.extraFixtureFiles)) {
      writeFileSync(join(fixturesDir, name), body);
    }
  }
  return root;
}

afterEach(() => {
  while (made.length) {
    try {
      rmSync(made.pop(), { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

describe("vocab-copy-retired guard - the real tree", () => {
  it("passes against the actual property-explorer tree", () => {
    const { violations } = checkVocabCopyRetired({ appRoot: REAL_APP_ROOT });
    expect(violations).toEqual([]);
  });

  it("NOT-VACUOUS: the synthetic clean tree also passes, so the fixtures below fail for their content", () => {
    const { violations } = checkVocabCopyRetired({ appRoot: makeAppRoot() });
    expect(violations).toEqual([]);
  });
});

describe("vocab-copy-retired guard - each retired artefact reintroduced is caught", () => {
  it("the module itself back on disk", () => {
    const root = makeAppRoot({
      extraLibFiles: { "buildable-display-vocab.ts": "export {};\n" },
    });
    const { violations } = checkVocabCopyRetired({ appRoot: root });
    expect(violations.join("\n")).toMatch(/RETIRED VOCAB COPY REINTRODUCED/);
    expect(violations.join("\n")).toMatch(/buildable-display-vocab\.ts/);
  });

  it("its unit test back on disk (no runtime import, still a reappeared copy)", () => {
    const root = makeAppRoot({
      extraLibFiles: { "buildable-display-vocab.test.ts": "export {};\n" },
    });
    const { violations } = checkVocabCopyRetired({ appRoot: root });
    expect(violations.join("\n")).toMatch(/buildable-display-vocab\.test\.ts/);
  });

  it("its parity test back on disk", () => {
    const root = makeAppRoot({
      extraLibFiles: { "buildable-display-vocab.parity.test.ts": "export {};\n" },
    });
    const { violations } = checkVocabCopyRetired({ appRoot: root });
    expect(violations.join("\n")).toMatch(/buildable-display-vocab\.parity\.test\.ts/);
  });

  it("a .js extension copy is caught too", () => {
    const root = makeAppRoot({
      extraLibFiles: { "buildable-display-vocab.js": "module.exports = {};\n" },
    });
    const { violations } = checkVocabCopyRetired({ appRoot: root });
    expect(violations.join("\n")).toMatch(/buildable-display-vocab\.js/);
  });

  it("the parity lock fixture back on disk", () => {
    const root = makeAppRoot({
      extraFixtureFiles: { "buildable-display-vocab.parity.lock.json": "{}\n" },
    });
    const { violations } = checkVocabCopyRetired({ appRoot: root });
    expect(violations.join("\n")).toMatch(/RETIRED PARITY ARTEFACT REINTRODUCED/);
    expect(violations.join("\n")).toMatch(/parity\.lock\.json/);
  });

  it("the peer fixture back on disk", () => {
    const root = makeAppRoot({
      extraFixtureFiles: { "buildable-display-vocab.peer.fixture": "export {}\n" },
    });
    const { violations } = checkVocabCopyRetired({ appRoot: root });
    expect(violations.join("\n")).toMatch(/peer\.fixture/);
  });

  it("baked-facets.ts importing the local copy again is caught", () => {
    const root = makeAppRoot({ bakedFacets: RETIRED_IMPORT });
    const { violations } = checkVocabCopyRetired({ appRoot: root });
    expect(violations.join("\n")).toMatch(/RETIRED IMPORT REINTRODUCED/);
    expect(violations.join("\n")).toMatch(/baked-facets\.ts/);
  });

  it("sheet-to-card-model.ts importing the local copy again is caught", () => {
    const root = makeAppRoot({ sheetToCardModel: RETIRED_IMPORT });
    const { violations } = checkVocabCopyRetired({ appRoot: root });
    expect(violations.join("\n")).toMatch(/RETIRED IMPORT REINTRODUCED/);
    expect(violations.join("\n")).toMatch(/sheet-to-card-model\.ts/);
  });
});

describe("vocab-copy-retired guard - its own positive controls fail loudly", () => {
  it("a src/lib/ holding only retired-pattern files fails rather than passing", () => {
    const root = mkdtempSync(join(tmpdir(), "p167-guard-bare-"));
    made.push(root);
    mkdirSync(join(root, "src", "lib"), { recursive: true });
    writeFileSync(
      join(root, "src", "lib", "buildable-display-vocab.ts"),
      "export {};\n",
    );
    const { violations } = checkVocabCopyRetired({ appRoot: root });
    expect(violations.join("\n")).toMatch(/POSITIVE CONTROL FAILED/);
    expect(violations.join("\n")).toMatch(/no file other than ones matching the retired pattern/);
  });

  it("a missing src/lib/ fails rather than passing", () => {
    const root = mkdtempSync(join(tmpdir(), "p167-guard-nolib-"));
    made.push(root);
    const { violations } = checkVocabCopyRetired({ appRoot: root });
    expect(violations.join("\n")).toMatch(/POSITIVE CONTROL FAILED/);
    expect(violations.join("\n")).toMatch(/does not exist/);
  });

  it("an importer file that imports mapBuildableDisplay from neither shape fails rather than passing", () => {
    const root = makeAppRoot({ bakedFacets: `export const x = 1;\n` });
    const { violations } = checkVocabCopyRetired({ appRoot: root });
    expect(violations.join("\n")).toMatch(/POSITIVE CONTROL FAILED/);
    expect(violations.join("\n")).toMatch(/baked-facets\.ts imports mapBuildableDisplay from neither/);
  });

  it("a missing importer file fails rather than passing", () => {
    const root = mkdtempSync(join(tmpdir(), "p167-guard-noimporter-"));
    made.push(root);
    mkdirSync(join(root, "src", "lib"), { recursive: true });
    writeFileSync(join(root, "src", "lib", "other.ts"), "export {};\n");
    const { violations } = checkVocabCopyRetired({ appRoot: root });
    expect(violations.join("\n")).toMatch(/POSITIVE CONTROL FAILED/);
    expect(violations.join("\n")).toMatch(/baked-facets\.ts does not exist/);
  });
});
