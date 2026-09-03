#!/usr/bin/env node
/**
 * P-108 - the public pages serve real HTML, and the privacy page stays true.
 *
 * Two defects this exists to make impossible.
 *
 * 1. A documentation page that silently serves the SPA shell. /privacy and
 *    /terms serve real HTML only because vercel.json rewrites them to a file in
 *    public/ ABOVE the /((?!api/).*) catch-all. Drop either half and the route
 *    still answers 200 with the app shell, which reads as working. That is how
 *    nine candidate routes came to "exist" while describing nothing.
 *
 * 2. A privacy claim that no code path supports. terms.html once promised a
 *    Stripe billing-portal cancellation path while zero billing-portal
 *    references existed anywhere in the app; it took a blocking card (A-062) to
 *    fix. Checks 2 to 4 below compare the PROSE against an INDEPENDENTLY
 *    DERIVED value from the source, so no edit to one half alone can pass.
 *
 * 3. A public page drifting off the Smart Site masters, which govern what may
 *    be said and win any conflict. Check 6 screens every declared page,
 *    terms.html included, for the claims masters 01 and 08 forbid outright.
 *
 * WHAT EXECUTES THIS: this script.
 * WHAT TRIGGERS IT: `pnpm --filter property-explorer test` (the PE CI test job
 *   runs exactly that) and a named step in .github/workflows/property-explorer-ci.yml,
 *   so a reorganisation of either one does not silently take the guard out of CI.
 * WHAT FAILS: exit 1, on a pull request, before merge.
 * WHAT BYPASSES IT: a change that does not touch apps/property-explorer (the
 *   workflow's path filter); a direct push to main; a NEW public page added
 *   without adding its entry to STATIC_PAGES below, because that list is data
 *   and this guard cannot know about a page nobody declared; and anything that
 *   changes what the deployed host serves without changing this repository,
 *   since the guard reads files and never the network. Those residuals are
 *   named rather than implied.
 *
 * DESIGN NOTE - what is meaning-shaped here and what is not. Checks 2, 3 and 4
 * each read TWO independently derived inputs and ask whether they agree: a
 * sentence written by a human in privacy.html, and a constant or a call site in
 * TypeScript written by a different act. One party editing one side cannot
 * satisfy both. Checks 5 and 6 are honestly weaker: they are lexical screens,
 * one for promise-shaped retention language and one for the claims the masters
 * forbid, and they are declared as such rather than dressed up. Check 5 catches
 * the shape ("deleted after 90 days") that this product has no job to enforce;
 * check 6 catches an ROI figure or a 3D promise. Neither can catch a novel
 * phrasing, and saying so is part of their contract.
 *
 * EVERY CHECK CARRIES A POSITIVE CONTROL. A check that can only say "not found"
 * is indistinguishable from a check whose extractor went blind, so each one
 * also asserts something that MUST be present. If a positive control fails, the
 * guard fails: it does not report a pass it could not have earned.
 *
 * Self-test in both directions: scripts/pe-public-pages-guard.test.mjs runs
 * this against the real tree (expects clean) and against synthetic trees that
 * break each check one at a time (expects a named violation each).
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The static pages that must serve real HTML rather than the SPA shell.
 * Adding a page means adding it here; the guard cannot know about one nobody
 * declared, and that residual is named in the header.
 */
export const STATIC_PAGES = [
  { route: "/privacy", file: "privacy.html" },
  { route: "/terms", file: "terms.html" },
  { route: "/docs", file: "docs.html" },
];

/** The SPA catch-all every static rewrite must sit above. */
const SPA_CATCH_ALL = "/((?!api/).*)";

/** The privacy page, whose prose checks 2 to 5 read. Check 6 reads them all. */
const PRIVACY_FILE = "privacy.html";

/**
 * Promise-shaped retention language with a time quantity. Nothing in this
 * product deletes user data on a schedule: no pg_cron, no trigger, no
 * scheduled workflow, and none of the four in-process sweeps touches a pe_*
 * table (established by store read 2026-09-02, recorded in
 * doc_repo/_inbox/2026-09-03_p108-public-pages_cp1.json). A sentence of this
 * shape would therefore be a target presented as a fact.
 *
 * Deliberately NOT matched: "we will remove your account" and similar, which
 * describe a person acting on an emailed request. That is a true statement
 * about a manual process, not a claim that a mechanism exists.
 */
const UNENFORCED_RETENTION_PATTERNS = [
  {
    label: "an automatic-deletion promise",
    re: /\bwe\s+(?:will\s+)?(?:automatically\s+)?(?:delete|purge|erase)\b/i,
  },
  {
    label: "a timed-deletion promise",
    re: /\b(?:deleted|removed|purged|erased)\s+(?:automatically\s+)?after\s+\d+\s+(?:day|days|month|months|year|years)\b/i,
  },
];

/**
 * Claims the Smart Site masters forbid in market-facing material
 * (_smartsite_masters/00 README, 01 positioning "What we never say", 08
 * "Claims you may never make", 06 coverage posture). Screened over every
 * declared static page, terms.html included: this guard READS that file and
 * never writes it.
 *
 * Each pattern is written to match the AFFIRMATIVE claim and to leave the
 * honest denial alone, because the pages are supposed to carry the denials.
 * "Nothing here approves, permits, or certifies anything" must pass; "the
 * system certifies" must not. That is why the subject is in the pattern.
 */
const FORBIDDEN_CLAIM_PATTERNS = [
  {
    label: "a cycle-time, savings, percentage or ROI figure",
    re: /\b(?:ROI|return on investment)\b|\b\d+(?:\.\d+)?\s*%|\bsaves?\s+(?:you\s+)?(?:\$|\d)/i,
  },
  {
    label: "a claim that the system approves, permits or certifies something",
    re: /\b(?:we|smart site|the (?:system|product|app|platform))\s+(?:approves?|permits?|certifies)\b/i,
  },
  {
    label: "a 3D capability promise (the 3D push is deliberately paused)",
    re: /\b(?:offers?|provides?|includes?|supports?|shows?)\s+(?:a\s+|full\s+)?3D\b/i,
  },
  {
    label: "a county enumeration or count presented as the extent of coverage",
    re: /\b\d+\s+counties\b|\bcounties\s+(?:we|currently)\s+(?:cover|support)/i,
  },
  {
    label:
      "the coverage line master 06 retired by name on 2026-08-10 (it puts a human in the loop)",
    re: /confirm(?:ed)?\s+(?:your|their)?\s*jurisdiction\s+on\s+request/i,
  },
  {
    label:
      "a comps or sold-price claim (Texas is a non-disclosure state and the MLS vendor route is closed)",
    re: /\b(?:we|smart site|the product)\s+(?:provides?|includes?|offers?|shows?)\s+[^.]{0,40}\b(?:comps|comparable sales|sold price)/i,
  },
];

/** Wording the page must NOT carry while no self-serve delete route exists. */
const SELF_SERVE_DELETE_CLAIMS = [
  /\bdelete\s+your\s+account\s+(?:from|in|through)\s+(?:the\s+)?(?:app|product|settings)\b/i,
  /\bdelete[- ]my[- ]account\s+button\s+(?:is|sits)\b/i,
  /\byou\s+can\s+delete\s+your\s+account\s+(?:from|in|at)\b/i,
];

/** The sentence the page must carry while no self-serve delete route exists. */
const NO_SELF_SERVE_DELETE_SENTENCE =
  "There is no delete-my-account button in the product today.";

/** The sentence the page must carry while the app never calls grant revoke. */
const NO_REVOKE_SENTENCE =
  "There is no revoke control in the product today";

/**
 * Read a `NAME = <integer arithmetic>` constant out of TS source and evaluate
 * the arithmetic. Returns null when the shape is not found, so the caller can
 * fail rather than assume.
 *
 * Only digits, `*`, `+`, whitespace and underscores are accepted, so this can
 * never evaluate arbitrary source.
 */
export function readMsConstant(source, name) {
  const re = new RegExp(`\\b${name}\\s*(?::[^=]*)?=\\s*([0-9_ *+]+)`);
  const m = source.match(re);
  if (!m) return null;
  const expr = m[1].replace(/_/g, "").trim();
  if (!/^[0-9 *+]+$/.test(expr) || expr.length === 0) return null;
  let value;
  try {
    value = Function(`"use strict";return (${expr});`)();
  } catch {
    return null;
  }
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The page's prose as one whitespace-normalised line, with tags replaced by a
 * single space so an inline `<strong>` or a line wrap cannot hide a sentence.
 *
 * This is here because the first run of this guard failed on the real tree for
 * exactly that reason: the session sentence was correct and split across two
 * source lines. A guard that fails on formatting would have been trained around
 * within a week, and a guard "fixed" by weakening the sentence to a keyword
 * would have stopped being meaning-shaped. Normalising the input is the fix.
 */
export function normalizeProse(html) {
  return html
    // Drop style and script BODIES first. Tag-stripping alone leaves CSS in the
    // text, and `calc(100% - 40px)` then reads as a percentage claim to check 6.
    // Found by running check 6's patterns before wiring it in.
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {{ appRoot: string }} opts
 * @returns {{ violations: string[], notes: string[] }}
 */
export function checkPublicPages({ appRoot }) {
  const violations = [];
  const notes = [];

  const publicDir = join(appRoot, "public");
  const vercelPath = join(appRoot, "vercel.json");

  // ---- CHECK 1: every declared page is a file AND a rewrite above the SPA --
  let vercel = null;
  if (!existsSync(vercelPath)) {
    violations.push(
      `POSITIVE CONTROL FAILED: ${vercelPath} does not exist, so check 1 could not run. Refusing to report a pass.`,
    );
  } else {
    try {
      vercel = JSON.parse(readFileSync(vercelPath, "utf8"));
    } catch (err) {
      violations.push(
        `POSITIVE CONTROL FAILED: vercel.json did not parse as JSON (${err.message}), so check 1 could not run.`,
      );
    }
  }

  if (vercel) {
    const rewrites = Array.isArray(vercel.rewrites) ? vercel.rewrites : [];
    const catchAllIndex = rewrites.findIndex(
      (r) => String(r?.source ?? "") === SPA_CATCH_ALL,
    );
    if (catchAllIndex === -1) {
      violations.push(
        `POSITIVE CONTROL FAILED: vercel.json has no ${JSON.stringify(SPA_CATCH_ALL)} rewrite. "Above the catch-all" is vacuously true without it, so the ordering half of check 1 could not run.`,
      );
    } else {
      notes.push(
        `check 1 control: SPA catch-all is rewrite #${catchAllIndex} of ${rewrites.length}`,
      );
    }

    if (!existsSync(publicDir)) {
      violations.push(
        `POSITIVE CONTROL FAILED: ${publicDir} does not exist, so check 1 could not run.`,
      );
    } else {
      const publicFiles = readdirSync(publicDir);
      notes.push(`check 1 control: public/ holds ${publicFiles.length} entries`);

      for (const page of STATIC_PAGES) {
        if (!publicFiles.includes(page.file)) {
          violations.push(
            `STATIC PAGE MISSING: public/${page.file} does not exist, so ${page.route} would serve the SPA shell.`,
          );
        }
        for (const source of [page.route, `${page.route}/`]) {
          const idx = rewrites.findIndex(
            (r) => String(r?.source ?? "") === source,
          );
          if (idx === -1) {
            violations.push(
              `STATIC PAGE UNROUTED: vercel.json has no rewrite for ${JSON.stringify(source)}. Without it the SPA catch-all answers ${source} with the app shell and the page reads as working while describing nothing.`,
            );
            continue;
          }
          const dest = String(rewrites[idx]?.destination ?? "");
          if (dest !== `/${page.file}`) {
            violations.push(
              `STATIC PAGE MISROUTED: ${JSON.stringify(source)} rewrites to ${JSON.stringify(dest)}, expected ${JSON.stringify(`/${page.file}`)}.`,
            );
          }
          if (catchAllIndex !== -1 && idx > catchAllIndex) {
            violations.push(
              `STATIC PAGE SHADOWED: the rewrite for ${JSON.stringify(source)} is #${idx}, below the SPA catch-all at #${catchAllIndex}. Vercel takes the first match, so this route serves the app shell.`,
            );
          }
        }
      }
    }
  }

  // ---- privacy.html source, needed by checks 2 to 5 -----------------------
  const privacyPath = join(publicDir, PRIVACY_FILE);
  let privacy = null;
  if (!existsSync(privacyPath)) {
    violations.push(
      `POSITIVE CONTROL FAILED: public/${PRIVACY_FILE} does not exist, so checks 2 to 6 could not run.`,
    );
  } else {
    privacy = normalizeProse(readFileSync(privacyPath, "utf8"));
    if (privacy.length < 200) {
      violations.push(
        `POSITIVE CONTROL FAILED: public/${PRIVACY_FILE} normalised to ${privacy.length} characters of prose. The extractor is blind; refusing to report a pass.`,
      );
    } else {
      notes.push(`checks 2-6 control: ${privacy.length} characters of normalised prose`);
    }
    if (!/How long we keep things/i.test(privacy)) {
      violations.push(
        `RETENTION SECTION MISSING: public/${PRIVACY_FILE} has no "How long we keep things" section. P-108 exists because a product taking live money had no retention section at all.`,
      );
    } else {
      notes.push("checks 2-6 control: the retention section is present");
    }
  }

  // ---- CHECK 2: the durations on the page match the code ------------------
  const derivations = [
    {
      label: "share link",
      file: join(appRoot, "api", "_lib", "pe-share-token.ts"),
      constant: "SHARE_TOKEN_TTL_MS",
      sentence: (days) => `A share link stops resolving ${days} days`,
    },
    {
      label: "signed-in session",
      file: join(appRoot, "api", "_lib", "session-cookie.ts"),
      constant: "SESSION_MAX_AGE_MS",
      sentence: (days) => `A signed-in session lasts ${days} days`,
    },
  ];

  for (const d of derivations) {
    if (!existsSync(d.file)) {
      violations.push(
        `POSITIVE CONTROL FAILED: ${d.file} does not exist, so the ${d.label} duration could not be derived. Refusing to report a pass.`,
      );
      continue;
    }
    const ms = readMsConstant(readFileSync(d.file, "utf8"), d.constant);
    if (ms === null) {
      violations.push(
        `POSITIVE CONTROL FAILED: could not read ${d.constant} out of ${d.file}. The extractor is blind; refusing to report a pass.`,
      );
      continue;
    }
    const days = ms / MS_PER_DAY;
    if (!Number.isInteger(days)) {
      violations.push(
        `DERIVATION UNUSABLE: ${d.constant} is ${ms} ms, which is not a whole number of days (${days}). The page cannot state it as "N days"; change the sentence and this guard together.`,
      );
      continue;
    }
    notes.push(`check 2 derived: ${d.constant} = ${ms} ms = ${days} days`);
    if (privacy && !privacy.includes(d.sentence(days))) {
      violations.push(
        `PRIVACY PAGE DISAGREES WITH THE CODE: ${d.constant} is ${days} days, so public/${PRIVACY_FILE} must contain "${d.sentence(days)}". It does not. Either the code changed and the page was not updated, or the page was reworded away from the sentence this guard reads.`,
      );
    }
  }

  // ---- CHECK 3: the deletion wording matches what api/ actually offers -----
  const apiDir = join(appRoot, "api");
  if (!existsSync(apiDir)) {
    violations.push(
      `POSITIVE CONTROL FAILED: ${apiDir} does not exist, so check 3 could not run.`,
    );
  } else {
    const apiFiles = readdirSync(apiDir).filter((f) => /\.[cm]?ts$/.test(f));
    if (apiFiles.length === 0) {
      violations.push(
        `POSITIVE CONTROL FAILED: api/ holds no TypeScript functions, so finding no account-deletion route proves nothing.`,
      );
    } else {
      notes.push(`check 3 control: ${apiFiles.length} function files in api/`);
      const deleteRoute = apiFiles.find((f) => {
        if (/delete[-_]?account/i.test(f)) return true;
        const src = readFileSync(join(apiDir, f), "utf8");
        return (
          /delete[-_]?account/i.test(src) ||
          /account[/-]delete/i.test(src) ||
          /\bdeleteAccount\b/.test(src)
        );
      });
      if (deleteRoute && privacy && privacy.includes(NO_SELF_SERVE_DELETE_SENTENCE)) {
        violations.push(
          `PRIVACY PAGE UNDERSTATES THE PRODUCT: api/${deleteRoute} looks like a self-serve account-deletion path, but public/${PRIVACY_FILE} still says "${NO_SELF_SERVE_DELETE_SENTENCE}" Update the page.`,
        );
      }
      if (!deleteRoute && privacy) {
        if (!privacy.includes(NO_SELF_SERVE_DELETE_SENTENCE)) {
          violations.push(
            `PRIVACY PAGE OVERSTATES THE PRODUCT: no self-serve account-deletion route exists under api/, so public/${PRIVACY_FILE} must say so plainly with the sentence "${NO_SELF_SERVE_DELETE_SENTENCE}" This is the terms.html defect class: a legal page describing a path the product does not have.`,
          );
        }
        for (const re of SELF_SERVE_DELETE_CLAIMS) {
          const m = privacy.match(re);
          if (m) {
            violations.push(
              `PRIVACY PAGE OVERSTATES THE PRODUCT: it claims a self-serve deletion path ("${m[0]}") while no such route exists under api/.`,
            );
          }
        }
      }
    }
  }

  // ---- CHECK 4: the revoke wording matches what the app actually calls -----
  const srcDir = join(appRoot, "src");
  if (!existsSync(srcDir)) {
    violations.push(
      `POSITIVE CONTROL FAILED: ${srcDir} does not exist, so check 4 could not run.`,
    );
  } else {
    const shareSources = collectFiles(join(srcDir, "share"));
    if (shareSources.length === 0) {
      violations.push(
        `POSITIVE CONTROL FAILED: src/share holds no source files, so finding no revoke call proves nothing.`,
      );
    } else {
      notes.push(`check 4 control: ${shareSources.length} files under src/share`);
      const revokeCaller = shareSources.find((p) => {
        if (/\.test\.[cm]?[jt]sx?$/.test(p)) return false;
        const src = readFileSync(p, "utf8");
        return /pe-share-grant[^"'`]*revoke|\/revoke\b/.test(src);
      });
      if (revokeCaller && privacy && privacy.includes(NO_REVOKE_SENTENCE)) {
        violations.push(
          `PRIVACY PAGE UNDERSTATES THE PRODUCT: ${revokeCaller} calls a share-grant revoke path, but public/${PRIVACY_FILE} still says "${NO_REVOKE_SENTENCE}". Update the page.`,
        );
      }
      if (!revokeCaller && privacy && !privacy.includes(NO_REVOKE_SENTENCE)) {
        violations.push(
          `PRIVACY PAGE OVERSTATES THE PRODUCT: nothing under src/share calls a share-grant revoke path, so public/${PRIVACY_FILE} must carry "${NO_REVOKE_SENTENCE}".`,
        );
      }
    }
  }

  // ---- CHECK 5 (lexical, declared): no unenforced retention promise -------
  if (privacy) {
    for (const p of UNENFORCED_RETENTION_PATTERNS) {
      const m = privacy.match(p.re);
      if (m) {
        violations.push(
          `UNENFORCED RETENTION PROMISE: public/${PRIVACY_FILE} contains ${p.label} ("${m[0]}"). Nothing in this system deletes user data on a schedule: no pg_cron, no trigger, no scheduled workflow, and none of the four in-process sweeps touches a pe_* table. Name the job that enforces it, or say what is true instead.`,
        );
      }
    }
    notes.push(
      `check 5 note: LEXICAL screen over ${UNENFORCED_RETENTION_PATTERNS.length} promise shapes. It is weaker than checks 2-4 by construction and cannot catch a novel phrasing.`,
    );
  }

  // ---- CHECK 6 (lexical, declared): no claim the masters forbid ----------
  if (existsSync(publicDir)) {
    let screened = 0;
    for (const page of STATIC_PAGES) {
      const path = join(publicDir, page.file);
      if (!existsSync(path)) continue;
      const prose = normalizeProse(readFileSync(path, "utf8"));
      if (prose.length < 200) {
        violations.push(
          `POSITIVE CONTROL FAILED: public/${page.file} normalised to ${prose.length} characters, so check 6 could not screen it.`,
        );
        continue;
      }
      screened++;
      for (const p of FORBIDDEN_CLAIM_PATTERNS) {
        const m = prose.match(p.re);
        if (m) {
          violations.push(
            `FORBIDDEN CLAIM: public/${page.file} carries ${p.label} ("${m[0]}"). The Smart Site masters govern what may be said and win any conflict; see _smartsite_masters/01 "What we never say" and 08 "Claims you may never make".`,
          );
        }
      }
    }
    if (screened === 0) {
      violations.push(
        `POSITIVE CONTROL FAILED: check 6 screened no pages at all, so a clean result proves nothing.`,
      );
    } else {
      notes.push(
        `check 6 note: LEXICAL screen over ${FORBIDDEN_CLAIM_PATTERNS.length} forbidden claim shapes across ${screened} pages. Patterns match the affirmative claim and deliberately leave the honest denial alone. Weaker than checks 2-4 by construction.`,
      );
    }
  }

  return { violations, notes };
}

/** Every file under a directory, recursively. Empty array when absent. */
function collectFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectFiles(full));
    else out.push(full);
  }
  return out;
}

const isCli =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isCli) {
  const appRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
  const { violations, notes } = checkPublicPages({ appRoot });
  for (const n of notes) console.log(`  ${n}`);
  if (violations.length > 0) {
    console.error(
      "\nP-108 public-pages guard FAILED:\n" +
        violations.map((v) => `  - ${v}`).join("\n") +
        "\n\nA static page that serves the SPA shell reads as working while describing\n" +
        "nothing, and a privacy claim no code path supports is the terms.html defect\n" +
        "class. See OPS-16 P-108.\n",
    );
    process.exit(1);
  }
  console.log(
    `P-108 public-pages guard passed (6 checks over ${STATIC_PAGES.length} static pages, each with a live positive control).`,
  );
}
