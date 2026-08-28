#!/usr/bin/env node
/**
 * Regenerate scripts/chrome-kit-baseline.json.
 *
 * The baseline is the BILL for the write path as it stands: every chrome file
 * that still paints a raw hex or opens a native button, with a count. The gate
 * fails when a count goes UP, or when a file with no entry has any violation,
 * so new code cannot add either while the existing debt stays visible.
 *
 * Run this ONLY to lower a count after real conversion work. Never run it to
 * make a failing gate pass — that is the one thing it must not be used for,
 * and it is why the file is committed rather than computed at gate time.
 */
import { writeFileSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { chromeFiles, violationsFor } from "./pe-chrome-kit-gate.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const out = {};
for (const abs of chromeFiles()) {
  const rel = relative(ROOT, abs).split("\\").join("/");
  const v = violationsFor(abs);
  if (v.hex > 0 || v.buttons > 0) out[rel] = { hex: v.hex, buttons: v.buttons };
}

const sorted = Object.fromEntries(
  Object.entries(out).sort(([a], [b]) => a.localeCompare(b)),
);

writeFileSync(
  join(ROOT, "scripts/chrome-kit-baseline.json"),
  JSON.stringify(sorted, null, 2) + "\n",
);

const hex = Object.values(sorted).reduce((a, x) => a + x.hex, 0);
const buttons = Object.values(sorted).reduce((a, x) => a + x.buttons, 0);
console.log(
  `baseline: ${Object.keys(sorted).length} files, ${hex} raw hexes, ${buttons} native buttons`,
);
