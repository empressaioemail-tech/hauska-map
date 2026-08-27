#!/usr/bin/env node
/**
 * P-85 WDLL item 16 — refuse title-plant copy in Records Request UI strings.
 * Violation fixture: apps/property-explorer/src/workbench/tools/__fixtures__/records-copy-violation.txt
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const SCAN_ROOTS = [
  join(ROOT, "src/workbench/tools"),
  join(ROOT, "src/lib"),
];

const FORBIDDEN = [
  /\bclear title\b/i,
  /\bchain of title\b/i,
];

const ALLOWLIST = [
  /records-copy-violation\.txt$/,
  /recordsRequestClient\.test\.ts$/,
];

function collectFiles(path, out = []) {
  try {
    const st = statSync(path);
    if (st.isFile()) {
      if (/\.(tsx?|md)$/.test(path)) out.push(path);
      return out;
    }
  } catch {
    return out;
  }
  for (const name of readdirSync(path)) {
    collectFiles(join(path, name), out);
  }
  return out;
}

const files = new Set();
for (const dir of SCAN_ROOTS) {
  for (const file of collectFiles(dir)) files.add(file);
}

const violations = [];
for (const file of files) {
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  if (ALLOWLIST.some((re) => re.test(rel))) continue;
  const text = readFileSync(file, "utf8");
  for (const re of FORBIDDEN) {
    if (re.test(text)) {
      violations.push(`${rel}: matched ${re}`);
    }
  }
}

if (violations.length > 0) {
  console.error("Records copy guard failed:\n" + violations.join("\n"));
  process.exit(1);
}

console.log(`Records copy guard passed (${files.size} files scanned).`);
