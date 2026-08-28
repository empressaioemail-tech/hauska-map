#!/usr/bin/env node
/**
 * Neutral-ground codemod — every surface matches the logo.
 *
 * Operator, 2026-08-27: "make all the other backgrounds on everything except
 * the map match the logo and get away from the blue background."
 *
 * THE LOGO CHIP is `rgba(11,14,19,.78)` — the `--ss-ink` family, blue only
 * +8 over red. Almost every other surface in the app was drawn on a BLUER
 * ground that arrived from three different eras and never got reconciled:
 *
 *   rgba(10,14,26,*)  the kit-04 capsules      blue +16 over red
 *   rgba(13,17,23,*)  the v1 --surface-* ink   blue +10, and lighter
 *   #0d1117           the same value as a hex
 *   rgba(20,25,33,*)  a v1 raised panel
 *   rgba(15,23,42,*)  tailwind slate-900       blue +27 — the worst offender
 *
 * Side by side with the chip they read as a different, colder material. All of
 * them collapse onto the ink family here, preserving each surface's own alpha
 * so nothing changes its translucency — only its hue.
 *
 * THE MAP IS EXEMPT and is not scanned: map geometry has its own palette
 * (--ss-sky is map-only) and the basemap is imagery, not chrome.
 *
 * Self-tests both directions before it will touch a file.
 *
 * Usage: node scripts/neutral-ground-codemod.mjs [--write] <file...>
 */
import { readFileSync, writeFileSync } from "node:fs";

/** Every blue-cast ground, mapped onto the ink family at the SAME alpha. */
export function neutralizeGrounds(src) {
  return (
    src
      // the capsules, and the v1 surface ink, both -> --ss-ink (11,14,19)
      .replace(/rgba\(10,\s*14,\s*26\s*,/g, "rgba(11,14,19,")
      .replace(/rgba\(13,\s*17,\s*23\s*,/g, "rgba(11,14,19,")
      // a v1 raised panel -> --ss-raised (18,22,29)
      .replace(/rgba\(20,\s*25,\s*33\s*,/g, "rgba(18,22,29,")
      // tailwind slate-900, the bluest thing in the app
      .replace(/rgba\(15,\s*23,\s*42\s*,/g, "rgba(18,22,29,")
      // the same v1 ink written as a hex
      .replace(/#0d1117\b/gi, "#0B0E13")
      .replace(/#0A0E15\b/gi, "#0B0E13")
      .replace(/#141928\b/gi, "#12161D")
      .replace(/#11151c\b/gi, "#0B0E13")
  );
}

function selfTest() {
  const cases = [
    {
      name: "capsule ground loses its blue cast, keeps its alpha",
      ok: neutralizeGrounds("rgba(10,14,26,.92)") === "rgba(11,14,19,.92)",
    },
    {
      name: "v1 surface ink collapses onto the logo ink",
      ok: neutralizeGrounds("rgba(13,17,23,0.94)") === "rgba(11,14,19,0.94)",
    },
    {
      name: "spaced rgba is handled too",
      ok: neutralizeGrounds("rgba(13, 17, 23, 0.9)") === "rgba(11,14,19, 0.9)",
    },
    {
      name: "slate-900 is neutralized",
      ok: neutralizeGrounds("rgba(15,23,42,0.35)") === "rgba(18,22,29,0.35)",
    },
    {
      name: "the hex spelling of the same ink is caught",
      ok: neutralizeGrounds("#0d1117") === "#0B0E13",
    },
    {
      name: "case-insensitive on the hex",
      ok: neutralizeGrounds("#0D1117") === "#0B0E13",
    },
    {
      name: "the logo ground is ALREADY right and is left alone",
      ok: neutralizeGrounds("rgba(11,14,19,.78)") === "rgba(11,14,19,.78)",
    },
    {
      name: "map sky is untouched — the map keeps its own palette",
      ok: neutralizeGrounds("#7DD3FC") === "#7DD3FC",
    },
    {
      name: "action blue is untouched — this is a GROUND sweep, not a hue sweep",
      ok: neutralizeGrounds("rgba(59,130,246,.12)") === "rgba(59,130,246,.12)",
    },
    { name: "not vacuous: empty in, empty out", ok: neutralizeGrounds("") === "" },
  ];
  const bad = cases.filter((c) => !c.ok);
  if (bad.length) {
    console.error("SELF-TEST FAIL");
    for (const c of bad) console.error(`  ${c.name}`);
    process.exit(1);
  }
  console.log(`SELF-TEST ${cases.length}/${cases.length} ok`);
}

const args = process.argv.slice(2);
const write = args.includes("--write");
const files = args.filter((a) => a !== "--write");

selfTest();
let touched = 0;
for (const f of files) {
  const before = readFileSync(f, "utf8");
  const after = neutralizeGrounds(before);
  if (before === after) continue;
  touched += 1;
  const b = before.split("\n");
  const a = after.split("\n");
  const n = b.filter((l, i) => l !== a[i]).length;
  console.log(`${write ? "wrote" : "would change"} ${f}  (${n} lines)`);
  if (write) writeFileSync(f, after, "utf8");
}
console.log(`${touched} file(s) ${write ? "changed" : "would change"}`);
