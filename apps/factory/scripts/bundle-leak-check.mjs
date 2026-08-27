import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../dist/assets", import.meta.url));

if (!existsSync(dir)) {
  console.error(`bundle-leak-check: missing ${dir}; run npm run build first`);
  process.exit(2);
}

const files = readdirSync(dir).filter((f) => f.endsWith(".js") || f.endsWith(".css"));
assert.ok(files.length > 0, "built assets exist");

const hex32 = /["'`][0-9a-fA-F]{32}["'`]/;
let scanned = 0;
for (const file of files) {
  const text = readFileSync(join(dir, file), "utf8");
  scanned += 1;
  assert.doesNotMatch(text, /Bearer/i, `${file} contains Bearer`);
  assert.doesNotMatch(text, /factory-control/i, `${file} contains factory-control`);
  assert.doesNotMatch(text, /VITE_FACTORY/, `${file} contains VITE_FACTORY`);
  assert.doesNotMatch(text, /FACTORY_CONTROL_API_KEY/, `${file} contains the key name`);
  assert.doesNotMatch(text, hex32, `${file} contains a 32-character hex literal`);
}

console.log(JSON.stringify({ ok: true, files: scanned, dir }));
