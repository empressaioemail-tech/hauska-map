#!/usr/bin/env node
/**
 * Extension → web handoff smoke (WDLL 30).
 * Run: node scripts/extension-handoff-smoke.mjs [baseUrl]
 *
 * BLOCKED for live extension capture until hauska-brief-extension wires
 * account handoff; this script verifies the URL contract the web app accepts.
 */

const base =
  process.argv[2]?.replace(/\/$/, "") ||
  "https://property-explorer-m38nta44a-empressaioemail-techs-projects.vercel.app";

const sampleParcel = "48453:907247";
const url = `${base}/?parcelNodeId=${encodeURIComponent(sampleParcel)}`;

const res = await fetch(url, { redirect: "follow" });
const html = await res.text();

const checks = [
  ["HTTP 200", res.status === 200],
  ["title present", /<title>Empressa/i.test(html)],
  ["manifest linked", /manifest\.webmanifest/i.test(html)],
  ["viewport mobile", /viewport-fit=cover/i.test(html)],
];

let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) failed += 1;
}

console.log(`\nHandoff URL contract: ${url}`);
console.log(
  failed === 0
    ? "Extension smoke: web accepts parcelNodeId query param (extension wiring still blocked)."
    : "Extension smoke: web handoff probe failed.",
);
process.exit(failed === 0 ? 0 : 1);
