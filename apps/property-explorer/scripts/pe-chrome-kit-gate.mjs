#!/usr/bin/env node
/**
 * Smart Site chrome-kit gate.
 *
 * Required dock/lander/paywall surfaces must import Button.
 * Those same files must not paint the retired map-cyan #7dd3fc as a color
 * (comments naming the old hue are allowed).
 *
 * Self-tests both directions before the live scan. A check that only
 * ever sees a pass has not been observed working.
 *
 * Snapshot: run from apps/property-explorer. Commit is whatever HEAD is.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const REQUIRED_BUTTON = [
  "src/workbench/tools/LockedToolPanel.tsx",
  "src/workbench/tools/ShareTool.tsx",
  "src/workbench/tools/UseInYourAiTool.tsx",
  "src/workbench/tools/PropertiesTool.tsx",
  "src/workbench/tools/ChatTool.tsx",
  "src/workbench/tools/CompareTool.tsx",
  "src/workbench/tools/FloodTool.tsx",
  "src/workbench/tools/ReportsTool.tsx",
  "src/workbench/tools/PropertyDossierDetail.tsx",
  "src/workbench/tools/RecordsRequestSection.tsx",
  "src/workbench/tools/RecordsAcknowledgementPanel.tsx",
  "src/coldopen/SignUpCard.tsx",
  "src/browse/PropertyBriefPanel.tsx",
  "src/browse/PricingModal.tsx",
  "src/browse/SitePlanExportSection.tsx",
  "src/browse/TerrainExportSection.tsx",
];

const REQUIRED_PE = [
  "src/workbench/tools/BriefTool.tsx",
  "src/workbench/tools/CompareTool.tsx",
  "src/workbench/tools/FloodTool.tsx",
  "src/workbench/tools/ReportsTool.tsx",
  "src/workbench/tools/PropertyDossierDetail.tsx",
  "src/workbench/tools/RecordsRequestSection.tsx",
  "src/workbench/tools/RecordsAcknowledgementPanel.tsx",
  "src/workbench/tools/RecordsRunStatusStrip.tsx",
  "src/workbench/tools/reports-catalog.ts",
  "src/workbench/Workbench.tsx",
  "src/browse/SitePlanExportSection.tsx",
  "src/browse/TerrainExportSection.tsx",
];

const REQUIRED = [...new Set([...REQUIRED_BUTTON, ...REQUIRED_PE])];

const KIT = [
  "src/styles/pe-chrome.ts",
  "src/styles/pe-tokens.css",
  "src/components/Button.tsx",
  "src/components/Card.tsx",
  "src/components/Input.tsx",
  "src/components/StatusChip.tsx",
  "src/components/Modal.tsx",
];

export function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

export function hasButtonImport(src) {
  return /from\s+["'][^"']*\/components\/Button["']/.test(src);
}

export function hasPeImport(src) {
  return /from\s+["'][^"']*\/styles\/pe-chrome["']/.test(src);
}

export function hasRawCyanColor(src) {
  return /#7dd3fc/i.test(stripComments(src));
}

function selfTest() {
  const cases = [
    {
      name: "Button import present",
      ok: hasButtonImport(
        `import { Button } from "../../components/Button";\nexport const x = Button;\n`,
      ),
    },
    {
      name: "Button import absent fails",
      ok: !hasButtonImport(`export const x = "no button";\n`),
    },
    {
      name: "comment cyan is allowed",
      ok: !hasRawCyanColor(
        `import { Button } from "../../components/Button";\nconst ACCENT = "var(--brand-blue)"; // was cyan #7dd3fc\n`,
      ),
    },
    {
      name: "raw cyan as a color fails",
      ok: hasRawCyanColor(
        `import { Button } from "../../components/Button";\nconst C = "#7dd3fc";\n`,
      ),
    },
    {
      name: "PE import present",
      ok: hasPeImport(`import { PE } from "../../styles/pe-chrome";\n`),
    },
    {
      name: "PE import absent fails",
      ok: !hasPeImport(`export const x = "no pe";\n`),
    },
    {
      name: "not vacuous: empty has neither",
      ok: !hasButtonImport("") && !hasRawCyanColor("") && !hasPeImport(""),
    },
  ];
  const failed = cases.filter((c) => !c.ok);
  if (failed.length) {
    console.error("SELF-TEST FAIL");
    for (const c of failed) console.error(`  ${c.name}`);
    process.exit(1);
  }
  console.log(`SELF-TEST ${cases.length}/${cases.length} ok`);
}

function readRel(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function main() {
  selfTest();

  const failures = [];

  for (const rel of KIT) {
    try {
      readRel(rel);
    } catch {
      failures.push(`missing kit file ${rel}`);
    }
  }

  for (const rel of REQUIRED) {
    let src;
    try {
      src = readRel(rel);
    } catch {
      failures.push(`missing required surface ${rel}`);
      continue;
    }
    if (REQUIRED_BUTTON.includes(rel) && !hasButtonImport(src)) {
      failures.push(`${rel} does not import Button`);
    }
    if (REQUIRED_PE.includes(rel) && !hasPeImport(src)) {
      failures.push(`${rel} does not import PE`);
    }
    if (hasRawCyanColor(src)) {
      failures.push(`${rel} paints raw #7dd3fc (map-cyan is overlay-only)`);
    }
  }

  if (failures.length) {
    console.error("CHROME-KIT GATE FAIL");
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`CHROME-KIT GATE ${REQUIRED.length} surfaces + ${KIT.length} kit files ok`);
}

main();
