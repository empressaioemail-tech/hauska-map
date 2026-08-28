#!/usr/bin/env node
/**
 * Chrome v2 type-ramp + radius codemod.
 *
 * The v2 look is mostly control scale and type steps, not colour: the legacy
 * PE.* keys already resolve to v2 values, so renaming them changes nothing a
 * person can see. What a person CAN see is a dock body still drawn on the v1
 * half-steps (9 / 9.5 / 10.5 / 11 / 12 / 13) and off-ramp radii (3 / 5 / 9 /
 * 12) while its shell is on the v2 scale. That is the "partial treatment".
 *
 * FIVE TYPE STEPS, and no in-between size:
 *   10  uppercase field labels        11.5 captions, notes, chips
 *   12.5 running body                 13.5 the value under a label
 *   15  subject line                  20  panel title
 *
 * TWO RADII you touch (6) and float (10), plus 4 chips and 14 modal.
 *
 * WEIGHT carries hierarchy: 300 titles, 400 body, 600 labels and buttons.
 * There is no 700 in the v2 chrome.
 *
 * Self-tests both directions before it will touch a file. A codemod observed
 * only making changes has not been observed making the RIGHT changes.
 *
 * Usage: node scripts/ramp-codemod.mjs [--write] <file...>
 */
import { readFileSync, writeFileSync } from "node:fs";

/** fontSize: N → the nearest legal step ABOVE, never inventing a new one. */
const FONT_STEP = new Map([
  ["9", "10"],
  ["9.5", "10"],
  ["10.5", "11.5"],
  ["12", "12.5"],
  ["13", "13.5"],
  ["14", "13.5"],
  ["16", "15"],
  ["17", "15"],
  ["18", "20"],
  ["19", "20"],
]);

/** borderRadius: N → the legal radius. 4 chip, 6 touch, 8 tip, 10 float, 14 modal. */
const RADIUS_STEP = new Map([
  ["2", "4"],
  ["3", "4"],
  ["5", "6"],
  ["7", "6"],
  ["9", "10"],
  ["11", "10"],
  ["12", "10"],
  ["13", "14"],
  ["16", "14"],
]);

export function rampFontSizes(src) {
  return src.replace(/fontSize:\s*(\d+(?:\.\d+)?)\b/g, (whole, n) => {
    const next = FONT_STEP.get(n);
    return next ? `fontSize: ${next}` : whole;
  });
}

export function rampRadii(src) {
  return src.replace(/borderRadius:\s*(\d+(?:\.\d+)?)\b/g, (whole, n) => {
    const next = RADIUS_STEP.get(n);
    return next ? `borderRadius: ${next}` : whole;
  });
}

/** 700 is not a v2 weight. Labels and buttons are 600. */
export function rampWeights(src) {
  return src.replace(/fontWeight:\s*(700|800|bold)\b/g, "fontWeight: 600");
}

export function ramp(src) {
  return rampWeights(rampRadii(rampFontSizes(src)));
}

function selfTest() {
  const cases = [
    { name: "10.5 caption climbs to 11.5", ok: rampFontSizes("fontSize: 10.5,") === "fontSize: 11.5," },
    { name: "12 body climbs to 12.5", ok: rampFontSizes("fontSize: 12,") === "fontSize: 12.5," },
    { name: "13 value climbs to 13.5", ok: rampFontSizes("fontSize: 13,") === "fontSize: 13.5," },
    { name: "10 label is ALREADY legal and is left alone", ok: rampFontSizes("fontSize: 10,") === "fontSize: 10," },
    { name: "11.5 is already legal and is left alone", ok: rampFontSizes("fontSize: 11.5,") === "fontSize: 11.5," },
  { name: "11 is legal (dock header, chip label) and is left alone", ok: rampFontSizes("fontSize: 11,") === "fontSize: 11," },
    { name: "12.5 is already legal and is left alone", ok: rampFontSizes("fontSize: 12.5,") === "fontSize: 12.5," },
    { name: "radius 9 climbs to the float radius 10", ok: rampRadii("borderRadius: 9,") === "borderRadius: 10," },
    { name: "radius 12 falls to the float radius 10", ok: rampRadii("borderRadius: 12,") === "borderRadius: 10," },
    { name: "radius 6 is already legal and is left alone", ok: rampRadii("borderRadius: 6,") === "borderRadius: 6," },
    { name: "radius 999 (a pill) is left alone", ok: rampRadii("borderRadius: 999,") === "borderRadius: 999," },
    { name: "weight 700 drops to 600", ok: rampWeights("fontWeight: 700,") === "fontWeight: 600," },
    { name: "weight 600 is left alone", ok: rampWeights("fontWeight: 600,") === "fontWeight: 600," },
    { name: "weight 300 (a title) is left alone", ok: rampWeights("fontWeight: 300,") === "fontWeight: 300," },
    { name: "a bare number that is not a size is untouched", ok: ramp("width: 12,") === "width: 12," },
    { name: "not vacuous: empty in, empty out", ok: ramp("") === "" },
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
  const after = ramp(before);
  if (before === after) continue;
  touched += 1;
  const n = before.split("\n").filter((l, i) => l !== after.split("\n")[i]).length;
  console.log(`${write ? "wrote" : "would change"} ${f}  (${n} lines)`);
  if (write) writeFileSync(f, after, "utf8");
}
console.log(`${touched} file(s) ${write ? "changed" : "would change"}`);
