// P-103 - the seam-retired guard is tested for its ability to FIRE.
//
// A guard observed only passing has not been observed working. Every case
// below builds a synthetic app tree, reintroduces exactly one shape of the
// retired install-scoped checkout seam, and asserts the guard names it. The
// last group tests the guard's own positive controls: an extractor that has
// gone blind must fail rather than report a clean tree.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { checkSeamRetired, SEAM_UPSTREAM_PATH } from "./seam-retired-guard.mjs";

const REAL_APP_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const REAL_REPO_ROOT = join(REAL_APP_ROOT, "..", "..");

const CLEAN_VERCEL = {
  rewrites: [
    { source: "/api/spine/(.*)", destination: "/api/spine?upath=$1" },
    { source: "/api/pe-gtm", destination: "/api/pe-gtm" },
  ],
  functions: { "api/spine.ts": { maxDuration: 60 } },
};

const CLEAN_VITE = `import { defineConfig } from "vite";
export default defineConfig({
  server: {
    proxy: {
      "/api/spine": { target: t, changeOrigin: true },
      "/api/pe-gtm": { target: t, changeOrigin: true },
    },
  },
});
`;

function spineSource(entries) {
  return `export default async function handler(req, res) {
  if (path[0] === 'cortex') {
    const cortexPostPaths = [
${entries.map((e) => `      '${e}',`).join("\n")}
    ]
  }
}
`;
}

const CLEAN_ENTRIES = [
  "api/engagements",
  "api/saved-spaces",
  "api/brokerage/v1/gtm/property-explorer",
  "api/plan-review/engagements",
];

const made = [];

/** Build a synthetic app tree; overrides replace individual pieces. */
function makeAppRoot(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "p103-guard-"));
  made.push(root);
  mkdirSync(join(root, "api"));
  // other pe-* functions so check 1's positive control is satisfied
  writeFileSync(join(root, "api", "pe-gtm.ts"), "export default () => {};\n");
  writeFileSync(join(root, "api", "pe-share.ts"), "export default () => {};\n");
  writeFileSync(
    join(root, "api", "spine.ts"),
    overrides.spine ?? spineSource(overrides.entries ?? CLEAN_ENTRIES),
  );
  writeFileSync(
    join(root, "vercel.json"),
    overrides.vercelRaw ?? JSON.stringify(overrides.vercel ?? CLEAN_VERCEL, null, 2),
  );
  writeFileSync(join(root, "vite.config.ts"), overrides.vite ?? CLEAN_VITE);
  if (overrides.extraApiFiles) {
    for (const [name, body] of Object.entries(overrides.extraApiFiles)) {
      writeFileSync(join(root, "api", name), body);
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

describe("seam-retired guard - the real tree", () => {
  it("passes against the actual property-explorer tree", () => {
    const { violations } = checkSeamRetired({
      appRoot: REAL_APP_ROOT,
      repoRoot: REAL_REPO_ROOT,
    });
    expect(violations).toEqual([]);
  });

  it("NOT-VACUOUS: the synthetic clean tree also passes, so the fixtures below fail for their content", () => {
    const { violations } = checkSeamRetired({ appRoot: makeAppRoot() });
    expect(violations).toEqual([]);
  });
});

describe("seam-retired guard - each retired artefact reintroduced is caught", () => {
  it("1. api/pe-billing.ts back on disk", () => {
    const root = makeAppRoot({
      extraApiFiles: { "pe-billing.ts": "export default () => {};\n" },
    });
    const { violations } = checkSeamRetired({ appRoot: root });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/RETIRED SEAM REINTRODUCED/);
    expect(violations[0]).toMatch(/api\/pe-billing\.ts/);
  });

  it("1b. the same function under a .js extension is caught too", () => {
    const root = makeAppRoot({
      extraApiFiles: { "pe-billing.js": "module.exports = () => {};\n" },
    });
    const { violations } = checkSeamRetired({ appRoot: root });
    expect(violations.join("\n")).toMatch(/api\/pe-billing\.js/);
  });

  it("2. the /api/pe-billing rewrite back in vercel.json", () => {
    const root = makeAppRoot({
      vercel: {
        ...CLEAN_VERCEL,
        rewrites: [
          ...CLEAN_VERCEL.rewrites,
          { source: "/api/pe-billing", destination: "/api/pe-billing" },
        ],
      },
    });
    const { violations } = checkSeamRetired({ appRoot: root });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/vercel\.json rewrite/);
  });

  it("2b. a vercel.json functions entry naming it is caught", () => {
    const root = makeAppRoot({
      vercel: {
        ...CLEAN_VERCEL,
        functions: { "api/pe-billing.ts": { maxDuration: 60 } },
      },
    });
    const { violations } = checkSeamRetired({ appRoot: root });
    expect(violations.join("\n")).toMatch(/functions entry "api\/pe-billing\.ts"/);
  });

  it("3. the /api/pe-billing entry back in the vite dev proxy", () => {
    const root = makeAppRoot({
      vite: CLEAN_VITE.replace(
        '"/api/pe-gtm": { target: t, changeOrigin: true },',
        '"/api/pe-gtm": { target: t, changeOrigin: true },\n      "/api/pe-billing": { target: t, changeOrigin: true },',
      ),
    });
    const { violations } = checkSeamRetired({ appRoot: root });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/dev proxy forwards "\/api\/pe-billing"/);
  });

  it("4. the exact billing prefix back in cortexPostPaths", () => {
    const root = makeAppRoot({
      entries: [...CLEAN_ENTRIES, "api/brokerage/v1/property-explorer/billing"],
    });
    const { violations } = checkSeamRetired({ appRoot: root });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/cortexPostPaths admits/);
    expect(violations[0]).toMatch(/property-explorer\/billing/);
  });

  it("4b. a BROADER prefix that never says 'billing' is caught - the reason this is not a grep", () => {
    const root = makeAppRoot({
      entries: [...CLEAN_ENTRIES, "api/brokerage/v1/property-explorer"],
    });
    const { violations } = checkSeamRetired({ appRoot: root });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/cortexPostPaths admits/);
    expect(violations[0]).not.toMatch(/billing'/);
    expect(violations[0]).toMatch(/api\/brokerage\/v1\/property-explorer/);
  });

  it("4c. the full seam path listed exactly is caught", () => {
    const root = makeAppRoot({ entries: [...CLEAN_ENTRIES, SEAM_UPSTREAM_PATH] });
    const { violations } = checkSeamRetired({ appRoot: root });
    expect(violations.join("\n")).toMatch(/cortexPostPaths admits/);
  });

  it("4e. a nested array earlier in the literal does not truncate the scan and hide a later entry", () => {
    const root = makeAppRoot({
      spine: `const cortexPostPaths = [
      'api/engagements',
      ...['api/nested/one', 'api/nested/two'],
      'api/brokerage/v1/gtm/property-explorer',
      'api/brokerage/v1/property-explorer/billing',
    ]
`,
    });
    const { violations } = checkSeamRetired({ appRoot: root });
    expect(violations.join("\n")).toMatch(/cortexPostPaths admits/);
  });

  it("4f. a ']' inside a string does not truncate the scan", () => {
    const root = makeAppRoot({
      spine: `const cortexPostPaths = [
      'api/weird]path',
      'api/brokerage/v1/gtm/property-explorer',
      'api/brokerage/v1/property-explorer/billing',
    ]
`,
    });
    const { violations } = checkSeamRetired({ appRoot: root });
    expect(violations.join("\n")).toMatch(/cortexPostPaths admits/);
  });

  it("4d. a commented-out entry is NOT a violation - the guard reads code, not prose", () => {
    const root = makeAppRoot({
      spine: `const cortexPostPaths = [
      'api/engagements',
      'api/brokerage/v1/gtm/property-explorer',
      // 'api/brokerage/v1/property-explorer/billing',  <- retired under P-103
    ]
`,
    });
    const { violations } = checkSeamRetired({ appRoot: root });
    expect(violations).toEqual([]);
  });
});

describe("seam-retired guard - its own positive controls fail loudly", () => {
  it("an unparseable vercel.json fails rather than passing", () => {
    const root = makeAppRoot({ vercelRaw: "{ not json" });
    const { violations } = checkSeamRetired({ appRoot: root });
    expect(violations.join("\n")).toMatch(/POSITIVE CONTROL FAILED/);
    expect(violations.join("\n")).toMatch(/did not parse as JSON/);
  });

  it("a vercel.json with no /api rewrites fails rather than passing", () => {
    const root = makeAppRoot({
      vercel: { rewrites: [{ source: "/terms", destination: "/terms.html" }] },
    });
    const { violations } = checkSeamRetired({ appRoot: root });
    expect(violations.join("\n")).toMatch(/no \/api\/\* rewrites/);
  });

  it("a renamed cortexPostPaths array fails rather than passing", () => {
    const root = makeAppRoot({
      spine: "const somethingElse = [ 'api/engagements' ]\n",
    });
    const { violations } = checkSeamRetired({ appRoot: root });
    expect(violations.join("\n")).toMatch(
      /could not extract a non-empty cortexPostPaths array/,
    );
  });

  it("losing the GTM sibling fails - that prefix is a different subject and must survive", () => {
    const root = makeAppRoot({
      entries: CLEAN_ENTRIES.filter(
        (e) => e !== "api/brokerage/v1/gtm/property-explorer",
      ),
    });
    const { violations } = checkSeamRetired({ appRoot: root });
    expect(violations.join("\n")).toMatch(/no longer admits/);
    expect(violations.join("\n")).toMatch(/gtm\/property-explorer/);
  });

  it("a vite config with no proxy block fails rather than passing", () => {
    const root = makeAppRoot({ vite: "export default {};\n" });
    const { violations } = checkSeamRetired({ appRoot: root });
    expect(violations.join("\n")).toMatch(/no "proxy: \{" block/);
  });

  it("an api directory holding no other pe-* function fails rather than passing", () => {
    const root = mkdtempSync(join(tmpdir(), "p103-guard-bare-"));
    made.push(root);
    mkdirSync(join(root, "api"));
    writeFileSync(join(root, "api", "spine.ts"), spineSource(CLEAN_ENTRIES));
    writeFileSync(join(root, "vercel.json"), JSON.stringify(CLEAN_VERCEL));
    writeFileSync(join(root, "vite.config.ts"), CLEAN_VITE);
    const { violations } = checkSeamRetired({ appRoot: root });
    expect(violations.join("\n")).toMatch(/no other pe-\* function/);
  });
});
