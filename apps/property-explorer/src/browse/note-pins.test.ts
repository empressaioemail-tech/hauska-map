import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  NOTE_PIN_COLORS,
  noteColorAt,
  noteHoverText,
} from "../../../../packages/map-renderer/src/chrome/note-pins";

describe("map-pin notes — up to 10 colors, hover shows text", () => {
  it("exposes 10 distinct colors and wraps after the tenth", () => {
    expect(NOTE_PIN_COLORS).toHaveLength(10);
    expect(new Set(NOTE_PIN_COLORS).size).toBe(10);
    expect(noteColorAt(0)).toBe(NOTE_PIN_COLORS[0]);
    expect(noteColorAt(9)).toBe(NOTE_PIN_COLORS[9]);
    expect(noteColorAt(10)).toBe(NOTE_PIN_COLORS[0]);
    expect(noteColorAt(2)).not.toBe(noteColorAt(0));
    expect(noteColorAt(2)).not.toBe(noteColorAt(1));
  });

  it("hover text is the note body; empty notes have none", () => {
    expect(noteHoverText("Watch the drainage")).toBe("Watch the drainage");
    expect(noteHoverText("  ")).toBeNull();
    expect(noteHoverText("")).toBeNull();
    expect(noteHoverText(null)).toBeNull();
  });

  it("hover popup CSS is dark card + light text (violate: omit color)", () => {
    const css = readFileSync(
      resolve(__dirname, "../../../../packages/map-renderer/src/styles.css"),
      "utf8",
    );
    expect(css).toContain(".map-note-hover .maplibregl-popup-content");
    expect(css).toContain("background: #0d1117");
    expect(css).toContain("color: #e5e7eb");
  });

  it("controller paints per-pin color and wires map hover", () => {
    const src = readFileSync(
      resolve(
        __dirname,
        "../../../../packages/map-renderer/src/chrome/mapToolsController.ts",
      ),
      "utf8",
    );
    expect(src).toContain('["coalesce", ["get", "color"]');
    expect(src).toContain('map.on("mouseenter", NOTE_ID, onNoteEnter)');
    expect(src).toContain("noteHoverText");
    expect(src).toContain("noteColorAt(state.notes.length)");
  });
});
