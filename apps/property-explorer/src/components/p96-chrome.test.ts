// P-96 file-shaped checks. No jsdom: read the write path.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PE } from "../styles/pe-chrome";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("P-96 chrome write-path pins", () => {
  it("Dock uses ss-enter; pe-dock-in is neither declared nor used", () => {
    const dock = src("components/Dock.tsx");
    const tokens = src("styles/pe-tokens.css");
    expect(dock).toContain("ss-enter");
    expect(dock).not.toContain("pe-dock-in");
    expect(tokens).not.toContain("pe-dock-in");
    expect(src("browse/ExplorerMap.tsx")).not.toContain("pe-dock-in");
  });

  it("geometry reads --ss-* tokens, not leftover pixel numbers", () => {
    expect(PE.hControl).toBe("var(--ss-h-control)");
    expect(PE.hDense).toBe("var(--ss-h-dense)");
    expect(PE.hField).toBe("var(--ss-h-field)");
    expect(PE.dockW).toBe("var(--ss-dock-w)");
    expect(PE.rModal).toBe("var(--ss-r-modal)");
  });

  it("native selects and checkboxes carry ss-focusable", () => {
    expect(src("workbench/tools/ShareTool.tsx")).toMatch(
      /type="checkbox"[\s\S]*className="ss-focusable"/,
    );
    expect(src("workbench/tools/CompareTool.tsx")).toContain(
      'className="ss-focusable"',
    );
    expect(src("browse/TerrainExportSection.tsx")).toContain(
      'className="ss-focusable"',
    );
    expect(src("browse/SitePlanExportSection.tsx")).toContain(
      'className="ss-focusable"',
    );
    expect(src("workbench/tools/PropertyDossierDetail.tsx")).toContain(
      'className="ss-focusable"',
    );
  });

  it("TransientChips.tsx is gone (orphan, zero imports)", () => {
    expect(() => src("browse/TransientChips.tsx")).toThrow();
  });

  it("favicon tile is Stone void, not v2 #0b0e13 or action blue", () => {
    const icons = [
      readFileSync(join(ROOT, "..", "public/icons/icon-192.svg"), "utf8"),
      readFileSync(join(ROOT, "..", "public/icons/icon-512.svg"), "utf8"),
      readFileSync(join(ROOT, "..", "public/icon-192.svg"), "utf8"),
    ];
    for (const svg of icons) {
      expect(svg).toMatch(/<rect[^>]*fill="#2A2A2B"/);
      expect(svg).not.toMatch(/fill="#0[Bb]0[Ee]13"/);
      expect(svg).not.toMatch(/fill="#3[Bb]82[Ff]6"/);
    }
    const index = readFileSync(join(ROOT, "..", "index.html"), "utf8");
    expect(index).toContain('content="#2A2A2B"');
    expect(index).not.toContain("#0b0e13");
  });
});
