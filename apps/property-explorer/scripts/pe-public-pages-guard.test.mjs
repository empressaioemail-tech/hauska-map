// P-108 - the public-pages guard is tested for its ability to FIRE.
//
// A guard observed only passing has not been observed working. Every case below
// builds a synthetic app tree, breaks exactly one thing, and asserts the guard
// names it. The last group tests the guard's own positive controls: an extractor
// that has gone blind must fail rather than report a clean tree.
//
// The real tree is asserted clean first, so a guard that can only ever fail is
// caught too.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkPublicPages,
  normalizeProse,
  readMsConstant,
  STATIC_PAGES,
} from "./pe-public-pages-guard.mjs";

const REAL_APP_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

const SPA_CATCH_ALL = "/((?!api/).*)";

const CLEAN_REWRITES = [
  { source: "/privacy", destination: "/privacy.html" },
  { source: "/privacy/", destination: "/privacy.html" },
  { source: "/terms", destination: "/terms.html" },
  { source: "/terms/", destination: "/terms.html" },
  { source: "/docs", destination: "/docs.html" },
  { source: "/docs/", destination: "/docs.html" },
  { source: "/api/spine/(.*)", destination: "/api/spine?upath=$1" },
  { source: SPA_CATCH_ALL, destination: "/index.html" },
];

const SHARE_TOKEN_SRC = `export const SHARE_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000\n`;
const SESSION_COOKIE_SRC = `const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000\n`;

/** A privacy page that satisfies every check; pieces are swapped per case. */
function privacyHtml(overrides = {}) {
  const share =
    overrides.shareSentence ??
    "A share link stops resolving 30 days after it is created.";
  const session =
    overrides.sessionSentence ??
    "A signed-in session lasts 7 days, after which you sign in again.";
  const deleteSentence =
    overrides.deleteSentence ??
    "There is no delete-my-account button in the product today.";
  const revokeSentence =
    overrides.revokeSentence ??
    "There is no revoke control in the product today; a link can be revoked on request.";
  const heading = overrides.heading ?? "How long we keep things";
  const extra = overrides.extra ?? "";
  return `<!doctype html>
<html lang="en"><body>
  <h2>Shares you create</h2>
  <p>
    A share you mint is a grant you chose to publish. ${revokeSentence}
  </p>
  <h2>${heading}</h2>
  <p>
    This section describes what the system does today. ${share} ${session}
    Both are enforced when the link or the session is used.
  </p>
  <p><strong>Deleting your account.</strong>
    ${deleteSentence} Email support@empressa.io and we will remove your account.
    ${extra}
  </p>
  <p>
    Padding so the normalised prose clears the blind-extractor floor: the page
    holds several hundred characters of real sentences in the shipped article,
    and a synthetic fixture must too or the positive control fires for the
    wrong reason and the case under test is never actually exercised.
  </p>
</body></html>
`;
}

/**
 * The non-privacy pages in a synthetic tree. Long enough to clear check 6's
 * blind-extractor floor: a four-character stub makes the positive control fire
 * and the case under test never runs. That is how this fixture was first
 * written and the guard caught it.
 */
const OTHER_PAGE_HTML = `<!doctype html><html><body><h1>page</h1>
<p>A synthetic page carrying enough ordinary prose that the guard agrees to
screen it, so a case asserting something about its content is actually
exercising that check rather than tripping a positive control on its way in.
Nothing here approves, permits, or certifies anything.</p></body></html>
`;

const made = [];

/** Build a synthetic app tree; overrides replace individual pieces. */
function makeAppRoot(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "p108-guard-"));
  made.push(root);

  mkdirSync(join(root, "public"));
  const pages = overrides.pages ?? STATIC_PAGES.map((p) => p.file);
  for (const file of pages) {
    writeFileSync(
      join(root, "public", file),
      file === "privacy.html"
        ? (overrides.privacy ?? privacyHtml(overrides.privacyParts))
        : OTHER_PAGE_HTML,
    );
  }

  writeFileSync(
    join(root, "vercel.json"),
    overrides.vercelRaw ??
      JSON.stringify({ rewrites: overrides.rewrites ?? CLEAN_REWRITES }, null, 2),
  );

  mkdirSync(join(root, "api", "_lib"), { recursive: true });
  writeFileSync(
    join(root, "api", "_lib", "pe-share-token.ts"),
    overrides.shareTokenSrc ?? SHARE_TOKEN_SRC,
  );
  writeFileSync(
    join(root, "api", "_lib", "session-cookie.ts"),
    overrides.sessionCookieSrc ?? SESSION_COOKIE_SRC,
  );
  writeFileSync(join(root, "api", "auth.ts"), "export default () => {};\n");
  writeFileSync(join(root, "api", "pe-share.ts"), "export default () => {};\n");
  if (overrides.deleteAccountRoute) {
    writeFileSync(
      join(root, "api", "pe-account.ts"),
      "// deleteAccount handler\nexport default () => {};\n",
    );
  }

  mkdirSync(join(root, "src", "share"), { recursive: true });
  writeFileSync(
    join(root, "src", "share", "share-grant-client.ts"),
    overrides.shareClientSrc ??
      "export const url = `/api/pe-share-grant?grantId=${id}&format=json`\n",
  );
  writeFileSync(join(root, "src", "share", "ShareView.tsx"), "export const V = 1;\n");

  return root;
}

afterEach(() => {
  while (made.length) {
    const dir = made.pop();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

describe("P-108 public-pages guard", () => {
  it("passes against the real tree", () => {
    const { violations } = checkPublicPages({ appRoot: REAL_APP_ROOT });
    expect(violations).toEqual([]);
  });

  it("passes against a clean synthetic tree, so the failures below mean something", () => {
    const { violations } = checkPublicPages({ appRoot: makeAppRoot() });
    expect(violations).toEqual([]);
  });

  // ---- check 1: routing --------------------------------------------------

  it("fires when a declared page has no file", () => {
    const root = makeAppRoot({ pages: ["privacy.html", "terms.html"] });
    const { violations } = checkPublicPages({ appRoot: root });
    expect(violations.join("\n")).toMatch(/STATIC PAGE MISSING/);
    expect(violations.join("\n")).toMatch(/docs\.html/);
  });

  it("fires when a page has a file but no rewrite - the SPA-shell defect", () => {
    const root = makeAppRoot({
      rewrites: CLEAN_REWRITES.filter((r) => r.source !== "/docs"),
    });
    const { violations } = checkPublicPages({ appRoot: root });
    expect(violations.join("\n")).toMatch(/STATIC PAGE UNROUTED/);
    expect(violations.join("\n")).toMatch(/"\/docs"/);
  });

  it("fires when the trailing-slash rewrite is missing", () => {
    const root = makeAppRoot({
      rewrites: CLEAN_REWRITES.filter((r) => r.source !== "/docs/"),
    });
    const { violations } = checkPublicPages({ appRoot: root });
    expect(violations.join("\n")).toMatch(/STATIC PAGE UNROUTED/);
    expect(violations.join("\n")).toMatch(/"\/docs\/"/);
  });

  it("fires when a rewrite sits BELOW the SPA catch-all, where it never matches", () => {
    const withoutDocs = CLEAN_REWRITES.filter((r) => r.source !== "/docs");
    const root = makeAppRoot({
      rewrites: [...withoutDocs, { source: "/docs", destination: "/docs.html" }],
    });
    const { violations } = checkPublicPages({ appRoot: root });
    expect(violations.join("\n")).toMatch(/STATIC PAGE SHADOWED/);
  });

  it("fires when a rewrite points at the wrong file", () => {
    const root = makeAppRoot({
      rewrites: CLEAN_REWRITES.map((r) =>
        r.source === "/docs" ? { ...r, destination: "/index.html" } : r,
      ),
    });
    const { violations } = checkPublicPages({ appRoot: root });
    expect(violations.join("\n")).toMatch(/STATIC PAGE MISROUTED/);
  });

  // ---- check 2: prose vs code, the meaning-shaped pair --------------------

  it("fires when the code TTL changes and the page does not", () => {
    const root = makeAppRoot({
      shareTokenSrc: "export const SHARE_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000\n",
    });
    const { violations } = checkPublicPages({ appRoot: root });
    expect(violations.join("\n")).toMatch(/PRIVACY PAGE DISAGREES WITH THE CODE/);
    expect(violations.join("\n")).toMatch(/SHARE_TOKEN_TTL_MS is 14 days/);
  });

  it("fires when the page is reworded away from the derived sentence", () => {
    const root = makeAppRoot({
      privacyParts: { sessionSentence: "Sessions last about a week." },
    });
    const { violations } = checkPublicPages({ appRoot: root });
    expect(violations.join("\n")).toMatch(/SESSION_MAX_AGE_MS is 7 days/);
  });

  it("fires when the derived duration is not a whole number of days", () => {
    const root = makeAppRoot({
      sessionCookieSrc: "const SESSION_MAX_AGE_MS = 90 * 60 * 1000\n",
    });
    const { violations } = checkPublicPages({ appRoot: root });
    expect(violations.join("\n")).toMatch(/DERIVATION UNUSABLE/);
  });

  it("fires when the retention section is gone", () => {
    const root = makeAppRoot({ privacyParts: { heading: "Miscellaneous" } });
    const { violations } = checkPublicPages({ appRoot: root });
    expect(violations.join("\n")).toMatch(/RETENTION SECTION MISSING/);
  });

  // ---- check 3: deletion wording vs api/ ---------------------------------

  it("fires when the page claims a self-serve delete the product does not have", () => {
    const root = makeAppRoot({
      privacyParts: {
        deleteSentence: "You can delete your account from Settings at any time.",
      },
    });
    const { violations } = checkPublicPages({ appRoot: root });
    const text = violations.join("\n");
    expect(text).toMatch(/PRIVACY PAGE OVERSTATES THE PRODUCT/);
    expect(text).toMatch(/self-serve deletion path/);
  });

  it("fires when the honest no-self-serve sentence is dropped", () => {
    const root = makeAppRoot({
      privacyParts: { deleteSentence: "Write to us about your account." },
    });
    const { violations } = checkPublicPages({ appRoot: root });
    expect(violations.join("\n")).toMatch(
      /must say so plainly with the sentence/,
    );
  });

  it("fires in the OTHER direction: a delete route ships and the page still denies it", () => {
    const root = makeAppRoot({ deleteAccountRoute: true });
    const { violations } = checkPublicPages({ appRoot: root });
    expect(violations.join("\n")).toMatch(/PRIVACY PAGE UNDERSTATES THE PRODUCT/);
    expect(violations.join("\n")).toMatch(/pe-account\.ts/);
  });

  // ---- check 4: revoke wording vs src/share ------------------------------

  it("fires when the page drops the no-revoke sentence while nothing revokes", () => {
    const root = makeAppRoot({
      privacyParts: { revokeSentence: "Shares can be managed in the app." },
    });
    const { violations } = checkPublicPages({ appRoot: root });
    expect(violations.join("\n")).toMatch(/must carry "There is no revoke control/);
  });

  it("fires in the OTHER direction: a revoke call ships and the page still denies it", () => {
    const root = makeAppRoot({
      shareClientSrc:
        "await fetch(`/api/pe-share-grant/${id}/revoke`, { method: 'POST' })\n",
    });
    const { violations } = checkPublicPages({ appRoot: root });
    expect(violations.join("\n")).toMatch(/PRIVACY PAGE UNDERSTATES THE PRODUCT/);
    expect(violations.join("\n")).toMatch(/revoke path/);
  });

  // ---- check 5: the lexical screen ---------------------------------------

  it("fires on an automatic-deletion promise no job enforces", () => {
    const root = makeAppRoot({
      privacyParts: { extra: "We automatically delete inactive accounts." },
    });
    const { violations } = checkPublicPages({ appRoot: root });
    expect(violations.join("\n")).toMatch(/UNENFORCED RETENTION PROMISE/);
  });

  it("fires on a timed-deletion promise no job enforces", () => {
    const root = makeAppRoot({
      privacyParts: { extra: "Browse records are purged after 90 days." },
    });
    const { violations } = checkPublicPages({ appRoot: root });
    expect(violations.join("\n")).toMatch(/UNENFORCED RETENTION PROMISE/);
  });

  it("does NOT fire on the true manual sentence it must leave alone", () => {
    const root = makeAppRoot({
      privacyParts: { extra: "Email us and we will remove your account." },
    });
    const { violations } = checkPublicPages({ appRoot: root });
    expect(violations.join("\n")).not.toMatch(/UNENFORCED RETENTION PROMISE/);
  });

  // ---- check 6: claims the masters forbid --------------------------------

  it("fires on an ROI or percentage figure", () => {
    const root = makeAppRoot({
      privacyParts: { extra: "Customers cut research time by 40%." },
    });
    const { violations } = checkPublicPages({ appRoot: root });
    expect(violations.join("\n")).toMatch(/FORBIDDEN CLAIM/);
    expect(violations.join("\n")).toMatch(/ROI figure/);
  });

  it("fires on a claim that the system certifies something", () => {
    const root = makeAppRoot({
      privacyParts: { extra: "Smart Site certifies the buildable envelope." },
    });
    const { violations } = checkPublicPages({ appRoot: root });
    expect(violations.join("\n")).toMatch(/approves, permits or certifies/);
  });

  it("fires on a 3D promise", () => {
    const root = makeAppRoot({
      privacyParts: { extra: "The product provides a 3D view of the site." },
    });
    const { violations } = checkPublicPages({ appRoot: root });
    expect(violations.join("\n")).toMatch(/3D capability promise/);
  });

  it("fires on a county count presented as the extent of coverage", () => {
    const root = makeAppRoot({
      privacyParts: { extra: "We serve 34 counties across Texas." },
    });
    const { violations } = checkPublicPages({ appRoot: root });
    expect(violations.join("\n")).toMatch(/county enumeration/);
  });

  it("fires on the coverage line master 06 retired by name", () => {
    const root = makeAppRoot({
      privacyParts: {
        extra: "We can confirm your jurisdiction on request.",
      },
    });
    const { violations } = checkPublicPages({ appRoot: root });
    expect(violations.join("\n")).toMatch(/retired by name on 2026-08-10/);
  });

  it("fires on a comps or sold-price claim", () => {
    const root = makeAppRoot({
      privacyParts: { extra: "We provide nearby comps for every parcel." },
    });
    const { violations } = checkPublicPages({ appRoot: root });
    expect(violations.join("\n")).toMatch(/comps or sold-price claim/);
  });

  it("does NOT fire on the honest denials the pages are supposed to carry", () => {
    const root = makeAppRoot({
      privacyParts: {
        extra:
          "Nothing here approves, permits, or certifies anything. There are no comps and no sold prices. There is no 3D view.",
      },
    });
    const { violations } = checkPublicPages({ appRoot: root });
    expect(violations.join("\n")).not.toMatch(/FORBIDDEN CLAIM/);
  });

  it("screens terms.html too, not only the pages this card wrote", () => {
    const root = makeAppRoot();
    writeFileSync(
      join(root, "public", "terms.html"),
      `<html><body><p>Terms. Smart Site certifies every submittal, and it is a long
       enough paragraph to clear the blind-extractor floor that the guard applies
       before it agrees to screen a page at all, which it must for this case to
       actually exercise check six rather than a positive control.</p></body></html>`,
    );
    const { violations } = checkPublicPages({ appRoot: root });
    expect(violations.join("\n")).toMatch(/public\/terms\.html carries/);
  });

  // ---- positive controls: a blind extractor must FAIL, not pass ----------

  it("fails rather than passing when the SPA catch-all is absent", () => {
    const root = makeAppRoot({
      rewrites: CLEAN_REWRITES.filter((r) => r.source !== SPA_CATCH_ALL),
    });
    const { violations } = checkPublicPages({ appRoot: root });
    expect(violations.join("\n")).toMatch(/POSITIVE CONTROL FAILED/);
    expect(violations.join("\n")).toMatch(/vacuously true/);
  });

  it("fails rather than passing when vercel.json does not parse", () => {
    const root = makeAppRoot({ vercelRaw: "{ not json" });
    const { violations } = checkPublicPages({ appRoot: root });
    expect(violations.join("\n")).toMatch(/did not parse as JSON/);
  });

  it("fails rather than passing when a TTL constant cannot be read", () => {
    const root = makeAppRoot({
      shareTokenSrc: "export const SHARE_TOKEN_TTL_MS = computeTtl()\n",
    });
    const { violations } = checkPublicPages({ appRoot: root });
    expect(violations.join("\n")).toMatch(/The extractor is blind/);
    expect(violations.join("\n")).toMatch(/SHARE_TOKEN_TTL_MS/);
  });

  it("fails rather than passing when the privacy page is a stub", () => {
    const root = makeAppRoot({ privacy: "<html></html>" });
    const { violations } = checkPublicPages({ appRoot: root });
    expect(violations.join("\n")).toMatch(/characters of prose/);
  });

  it("fails rather than passing when api/ holds no functions", () => {
    const root = makeAppRoot();
    rmSync(join(root, "api", "auth.ts"));
    rmSync(join(root, "api", "pe-share.ts"));
    rmSync(join(root, "api", "_lib"), { recursive: true, force: true });
    const { violations } = checkPublicPages({ appRoot: root });
    expect(violations.join("\n")).toMatch(/api\/ holds no TypeScript functions/);
  });

  it("fails rather than passing when src/share is empty", () => {
    const root = makeAppRoot();
    rmSync(join(root, "src", "share"), { recursive: true, force: true });
    mkdirSync(join(root, "src", "share"), { recursive: true });
    const { violations } = checkPublicPages({ appRoot: root });
    expect(violations.join("\n")).toMatch(/src\/share holds no source files/);
  });

  // ---- the helpers themselves -------------------------------------------

  it("readMsConstant evaluates arithmetic and refuses anything else", () => {
    expect(readMsConstant("const X = 30 * 24 * 60 * 60 * 1000", "X")).toBe(
      2592000000,
    );
    expect(readMsConstant("const X = 7 * 24 * 60 * 60 * 1000", "X")).toBe(
      604800000,
    );
    expect(readMsConstant("const X = process.env.TTL", "X")).toBeNull();
    expect(readMsConstant("const X = 0", "X")).toBeNull();
    expect(readMsConstant("const Y = 5", "X")).toBeNull();
  });

  it("normalizeProse joins a wrapped sentence and drops inline tags", () => {
    const html = "<p>\n  A signed-in\n  session lasts <strong>7</strong> days.\n</p>";
    expect(normalizeProse(html)).toContain("A signed-in session lasts 7 days.");
  });
});
