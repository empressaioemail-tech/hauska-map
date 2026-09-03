#!/usr/bin/env node
/**
 * P-103 - the legacy install-scoped checkout seam stays retired.
 *
 * The seam is POST /api/brokerage/v1/property-explorer/billing/checkout on
 * api-server. It resolves stripePriceIdForTier to STRIPE_PRO_PRICE_ID, the
 * retired pre-ladder Pro price, so anything that reaches it opens a Stripe
 * checkout at an amount that is not on the locked ladder. P-97 retired the
 * client half; P-103 removed the four BFF artefacts that could reach it:
 *
 *   1. apps/property-explorer/api/pe-billing.ts        (the deployed function)
 *   2. its /api/pe-billing rewrite in vercel.json      (its public route)
 *   3. its /api/pe-billing entry in the vite dev proxy (the local route)
 *   4. the billing prefix in cortexPostPaths, api/spine.ts (a latent permission)
 *
 * WHAT EXECUTES THIS: this script.
 * WHAT TRIGGERS IT: `pnpm --filter property-explorer test` (the PE CI test job
 *   runs exactly that) and a named step in .github/workflows/property-explorer-ci.yml.
 * WHAT FAILS: exit 1, on a pull request, before merge.
 * WHAT BYPASSES IT: a change that does not touch apps/property-explorer (the
 *   workflow's path filter), a direct push to main, and any reintroduction that
 *   is not one of the four shapes below - a new function under a different
 *   basename that forwards to the same upstream path is NOT caught here. That
 *   residual is named rather than implied.
 *
 * DESIGN NOTE - why this is not a grep. Check 4 does not search for a literal
 * string. It extracts the cortexPostPaths array and re-implements the exact
 * matching rule spine.ts applies to it (`p === path || path.startsWith(p + '/')`),
 * then asks whether the seam path would be admitted. A broader prefix such as
 * 'api/brokerage/v1/property-explorer' or 'api/brokerage' reintroduces the
 * permission without ever containing the word "billing", and a literal grep
 * would pass on it.
 *
 * EVERY CHECK CARRIES A POSITIVE CONTROL. A check that can only ever say "not
 * found" is indistinguishable from a check whose extractor went blind, so each
 * one also asserts something that MUST be present: the api directory holds
 * other pe-* functions, vercel.json has api rewrites, the vite dev proxy has
 * api entries, cortexPostPaths still holds the GTM sibling and the predicate
 * still admits it. If any positive control fails, the guard fails - it does
 * not report a pass it could not have earned.
 *
 * Self-test in both directions: scripts/seam-retired-guard.test.mjs runs this
 * against the real tree (expects clean) and against synthetic trees that
 * reintroduce each artefact (expects a named violation each).
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** The upstream path this guard exists to keep unreachable. */
export const SEAM_UPSTREAM_PATH =
  "api/brokerage/v1/property-explorer/billing/checkout";

/** The adjacent, DIFFERENT prefix that must survive - a positive control. */
export const GTM_SIBLING_PREFIX = "api/brokerage/v1/gtm/property-explorer";

/** A GTM path the surviving sibling must still admit - a positive control. */
const GTM_SAMPLE_PATH = "api/brokerage/v1/gtm/property-explorer/consent";

const RETIRED_BASENAME = "pe-billing";

/** spine.ts admits an upstream path when an allowlist entry matches this way. */
function allowlistAdmits(entries, upstreamPath) {
  return entries.some(
    (p) => upstreamPath === p || upstreamPath.startsWith(p + "/"),
  );
}

/**
 * Pull a string array literal out of TS source by variable name.
 *
 * The closing bracket is found by depth counting rather than by indexOf("]"),
 * so a nested array or a "]" inside one of the strings cannot truncate the
 * extraction and hide a later entry. Quoted strings and line comments are
 * skipped while counting, for the same reason.
 */
function extractStringArrayLiteral(source, varName) {
  const start = source.indexOf(`${varName} = [`);
  if (start === -1) return null;
  const open = source.indexOf("[", start);
  if (open === -1) return null;
  let depth = 0;
  let close = -1;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (ch === "'" || ch === '"' || ch === "`") {
      const quote = ch;
      i++;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === "\\") i++;
        i++;
      }
      continue;
    }
    if (ch === "/" && source[i + 1] === "/") {
      const nl = source.indexOf("\n", i);
      if (nl === -1) break;
      i = nl;
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      if (end === -1) break;
      i = end + 1;
      continue;
    }
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close === -1) return null;
  const body = source.slice(open + 1, close);
  const out = [];
  // Strip line comments first so a commented-out entry is not counted.
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/\/\/.*$/, "");
    for (const m of line.matchAll(/['"`]([^'"`]+)['"`]/g)) out.push(m[1]);
  }
  return out;
}

/**
 * @param {{ appRoot: string, repoRoot?: string }} opts
 * @returns {{ violations: string[], notes: string[] }}
 */
export function checkSeamRetired({ appRoot, repoRoot }) {
  const violations = [];
  const notes = [];

  // ---- CHECK 1: no pe-billing function under api/ -------------------------
  const apiDir = join(appRoot, "api");
  if (!existsSync(apiDir)) {
    violations.push(
      `POSITIVE CONTROL FAILED: ${apiDir} does not exist, so check 1 could not run. Refusing to report a pass.`,
    );
  } else {
    const apiFiles = readdirSync(apiDir);
    const otherPeFunctions = apiFiles.filter(
      (f) => /^pe-.*\.[cm]?[jt]s$/.test(f) && !f.startsWith(RETIRED_BASENAME),
    );
    if (otherPeFunctions.length === 0) {
      violations.push(
        `POSITIVE CONTROL FAILED: api/ holds no other pe-* function, so a directory scan finding nothing proves nothing. Refusing to report a pass.`,
      );
    } else {
      notes.push(`check 1 control: ${otherPeFunctions.length} other pe-* functions in api/`);
    }
    const reintroduced = apiFiles.filter((f) => f.startsWith(RETIRED_BASENAME));
    for (const f of reintroduced) {
      violations.push(
        `RETIRED SEAM REINTRODUCED: api/${f} exists. The install-scoped checkout function was retired under P-103.`,
      );
    }
  }

  // ---- CHECK 2: no /api/pe-billing route in vercel.json -------------------
  const vercelPath = join(appRoot, "vercel.json");
  if (!existsSync(vercelPath)) {
    violations.push(
      `POSITIVE CONTROL FAILED: ${vercelPath} does not exist, so check 2 could not run.`,
    );
  } else {
    let vercel;
    try {
      vercel = JSON.parse(readFileSync(vercelPath, "utf8"));
    } catch (err) {
      violations.push(
        `POSITIVE CONTROL FAILED: vercel.json did not parse as JSON (${err.message}), so check 2 could not run.`,
      );
      vercel = null;
    }
    if (vercel) {
      const rewrites = Array.isArray(vercel.rewrites) ? vercel.rewrites : [];
      const apiRewrites = rewrites.filter((r) =>
        String(r?.source ?? "").startsWith("/api/"),
      );
      if (apiRewrites.length === 0) {
        violations.push(
          `POSITIVE CONTROL FAILED: vercel.json has no /api/* rewrites, so an absent pe-billing rewrite proves nothing.`,
        );
      } else {
        notes.push(`check 2 control: ${apiRewrites.length} /api/* rewrites in vercel.json`);
      }
      for (const r of rewrites) {
        const src = String(r?.source ?? "");
        const dest = String(r?.destination ?? "");
        if (src.includes(RETIRED_BASENAME) || dest.includes(RETIRED_BASENAME)) {
          violations.push(
            `RETIRED SEAM REINTRODUCED: vercel.json rewrite ${JSON.stringify(r)} routes to the retired install-scoped checkout function.`,
          );
        }
      }
      for (const key of Object.keys(vercel.functions ?? {})) {
        if (key.includes(RETIRED_BASENAME)) {
          violations.push(
            `RETIRED SEAM REINTRODUCED: vercel.json functions entry "${key}" names the retired install-scoped checkout function.`,
          );
        }
      }
    }
  }

  // ---- CHECK 3: no /api/pe-billing entry in the vite dev proxy ------------
  const vitePath = join(appRoot, "vite.config.ts");
  if (!existsSync(vitePath)) {
    violations.push(
      `POSITIVE CONTROL FAILED: ${vitePath} does not exist, so check 3 could not run.`,
    );
  } else {
    const viteSrc = readFileSync(vitePath, "utf8");
    const proxyAt = viteSrc.indexOf("proxy: {");
    if (proxyAt === -1) {
      violations.push(
        `POSITIVE CONTROL FAILED: no "proxy: {" block in vite.config.ts, so check 3 could not run.`,
      );
    } else {
      const proxyKeys = [
        ...viteSrc.slice(proxyAt).matchAll(/["']([/][^"']*)["']\s*:\s*\{/g),
      ].map((m) => m[1]);
      const apiProxyKeys = proxyKeys.filter((k) => k.startsWith("/api/"));
      if (apiProxyKeys.length === 0) {
        violations.push(
          `POSITIVE CONTROL FAILED: the vite dev proxy has no /api/* keys, so an absent pe-billing key proves nothing.`,
        );
      } else {
        notes.push(`check 3 control: ${apiProxyKeys.length} /api/* dev-proxy keys`);
      }
      for (const k of proxyKeys) {
        if (k.includes(RETIRED_BASENAME)) {
          violations.push(
            `RETIRED SEAM REINTRODUCED: vite.config.ts dev proxy forwards "${k}" to the retired install-scoped checkout function.`,
          );
        }
      }
    }
  }

  // ---- CHECK 4: cortexPostPaths must not ADMIT the seam path --------------
  const spineTargets = [{ label: "apps/property-explorer/api/spine.ts", path: join(appRoot, "api", "spine.ts"), required: true }];
  if (repoRoot) {
    const rootSpine = join(repoRoot, "api", "spine.ts");
    if (existsSync(rootSpine)) {
      spineTargets.push({ label: "api/spine.ts (command-center copy)", path: rootSpine, required: false });
    } else {
      notes.push(
        "check 4 declared exclusion: the repo-root api/spine.ts is not present in this tree and was not checked.",
      );
    }
  } else {
    notes.push("check 4 declared exclusion: no repoRoot given, so only the app's own spine.ts was checked.");
  }

  for (const target of spineTargets) {
    if (!existsSync(target.path)) {
      violations.push(
        `POSITIVE CONTROL FAILED: ${target.label} does not exist, so check 4 could not run against it.`,
      );
      continue;
    }
    const src = readFileSync(target.path, "utf8");
    const entries = extractStringArrayLiteral(src, "cortexPostPaths");
    if (!entries || entries.length === 0) {
      violations.push(
        `POSITIVE CONTROL FAILED: could not extract a non-empty cortexPostPaths array from ${target.label}. The extractor is blind; refusing to report a pass.`,
      );
      continue;
    }
    if (!allowlistAdmits(entries, GTM_SAMPLE_PATH)) {
      if (target.required) {
        violations.push(
          `POSITIVE CONTROL FAILED: ${target.label} cortexPostPaths no longer admits "${GTM_SAMPLE_PATH}". Either the GTM sibling prefix "${GTM_SIBLING_PREFIX}" was removed (a different subject from P-103, restore it) or the extractor is reading the wrong array.`,
        );
      } else {
        notes.push(
          `check 4 note: ${target.label} does not carry the GTM sibling; its ${entries.length} entries were still tested against the seam path.`,
        );
      }
    } else {
      notes.push(`check 4 control: ${target.label} still admits the GTM sibling path`);
    }
    if (allowlistAdmits(entries, SEAM_UPSTREAM_PATH)) {
      const culprits = entries.filter(
        (p) => SEAM_UPSTREAM_PATH === p || SEAM_UPSTREAM_PATH.startsWith(p + "/"),
      );
      violations.push(
        `RETIRED SEAM REINTRODUCED: ${target.label} cortexPostPaths admits "${SEAM_UPSTREAM_PATH}" via ${culprits.map((c) => JSON.stringify(c)).join(", ")}.`,
      );
    }
  }

  return { violations, notes };
}

const isCli =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isCli) {
  const appRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
  const repoRoot = join(appRoot, "..", "..");
  const { violations, notes } = checkSeamRetired({ appRoot, repoRoot });
  for (const n of notes) console.log(`  ${n}`);
  if (violations.length > 0) {
    console.error(
      "\nP-103 seam-retired guard FAILED:\n" +
        violations.map((v) => `  - ${v}`).join("\n") +
        "\n\nThe install-scoped checkout seam resolves the retired STRIPE_PRO_PRICE_ID.\n" +
        "See _decisions / OPS-16 P-103. Do not re-add these; the price is off the ladder.\n",
    );
    process.exit(1);
  }
  console.log("P-103 seam-retired guard passed (4 checks, each with a live positive control).");
}
