/**
 * OPS-16 P-185 — the PromoteKit tag and the CSP that lets it run.
 *
 * WHY A GUARD AND NOT JUST THE UNIT TEST NEXT TO IT. `billing-client-promotekit.test.ts`
 * pins the reading half (a body carries the referral when `window.promotekit_referral`
 * is set, and carries no key when it is not). It says nothing about whether the tag
 * that SETS that global ever reaches a browser. Two files can silently break that,
 * and neither is TypeScript-checked, imported by any module, or covered by any other
 * suite:
 *
 *   1. `index.html` — delete the tag (an HTML tidy, a head refactor) and every
 *      checkout still succeeds while `window.promotekit_referral` is never set:
 *      attribution stops, nothing errors, no test fails.
 *   2. `vercel.json` — a CSP tighten re-lists `script-src` and drops
 *      `cdn.promotekit.com`. The tag is then BLOCKED IN PRODUCTION ONLY (the block
 *      shows up in the customer's console, not in CI), and again nothing errors.
 *
 * DEV_PROCESS: a control that depends on someone remembering is not a control, and a
 * guardrail that does not survive a clone is not a guardrail. Both files travel with
 * the clone, so both directions are asserted here — the tag present and unblocked.
 *
 * The site id is PromoteKit's PUBLIC site id (the dispatch says so explicitly); it is
 * not a secret, and pinning it is the point: a swapped id attributes to the wrong
 * PromoteKit site and is invisible everywhere else.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const APP_ROOT = resolve(__dirname, "../..");
const INDEX_HTML = readFileSync(resolve(APP_ROOT, "index.html"), "utf8");
const VERCEL_JSON = JSON.parse(
  readFileSync(resolve(APP_ROOT, "vercel.json"), "utf8"),
) as {
  headers?: { source?: string; headers?: { key?: string; value?: string }[] }[];
};

const PROMOTEKIT_SITE_ID = "5d6458ec-b6b9-47df-a587-c2c255db7e8d";
const PROMOTEKIT_HOST = "https://cdn.promotekit.com";

/** The CSP value served for a given `headers[].source`, or undefined. */
function cspFor(source: string): string | undefined {
  for (const entry of VERCEL_JSON.headers ?? []) {
    if (entry.source !== source) continue;
    for (const h of entry.headers ?? []) {
      if (h.key === "Content-Security-Policy") return h.value;
    }
  }
  return undefined;
}

/** One directive ("script-src ...") of a CSP string, as its own token list. */
function directive(csp: string, name: string): string[] {
  const found = csp
    .split(";")
    .map((d) => d.trim())
    .find((d) => d === name || d.startsWith(`${name} `));
  return found ? found.split(/\s+/).slice(1) : [];
}

describe("PromoteKit tag in index.html (OPS-16 P-185)", () => {
  it("loads pk.js from the PromoteKit CDN with this site's id", () => {
    expect(INDEX_HTML).toContain(PROMOTEKIT_HOST + "/pk.js");
    expect(INDEX_HTML).toContain(`data-promotekit="${PROMOTEKIT_SITE_ID}"`);
  });

  it("is a static <script> in <head>, async — not injected by app code", () => {
    const head = INDEX_HTML.slice(0, INDEX_HTML.indexOf("</head>"));
    const tag = /<script\b[^>]*cdn\.promotekit\.com[^>]*>/.exec(head)?.[0];
    expect(tag, "no PromoteKit <script> tag inside <head>").toBeTruthy();
    // `async` keeps a slow CDN off the critical path; without it the tag blocks
    // first paint on a third party, which is why the dispatch specifies it.
    expect(tag).toMatch(/\basync\b/);
    // A module/mount-time injection would be defeated by any error earlier in
    // the bundle — the tag must not depend on app code running at all.
    expect(INDEX_HTML.slice(0, INDEX_HTML.indexOf("</head>"))).not.toMatch(
      /promotekit_referral\s*=/,
    );
  });
});

describe("CSP admits the PromoteKit CDN (OPS-16 P-185)", () => {
  it("the catch-all header grants cdn.promotekit.com in script-src", () => {
    const csp = cspFor("/(.*)");
    expect(csp, "no catch-all Content-Security-Policy header in vercel.json").toBeTruthy();
    expect(directive(csp!, "script-src")).toContain(PROMOTEKIT_HOST);
  });

  it("grants it in script-src and NOT merely via default-src", () => {
    const csp = cspFor("/(.*)")!;
    // A host listed only in default-src would read as "allowed" to a careless
    // check while script-src (which is present here, so it wins) omits it.
    expect(directive(csp, "script-src").length).toBeGreaterThan(0);
    expect(directive(csp, "script-src")).toContain(PROMOTEKIT_HOST);
  });

  it("still admits the other third-party scripts the app needs", () => {
    // The tighten that drops PromoteKit is the same edit that could drop Stripe
    // or Google sign-in. Pinned here so the guard fails on the real regression
    // rather than on the first host it happens to check.
    const scriptSrc = directive(cspFor("/(.*)")!, "script-src");
    expect(scriptSrc).toContain("https://js.stripe.com");
    expect(scriptSrc).toContain("https://accounts.google.com");
    expect(scriptSrc).toContain("'self'");
  });
});
