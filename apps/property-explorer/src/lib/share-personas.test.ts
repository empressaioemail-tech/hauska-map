import { describe, expect, it } from "vitest";
import {
  SHARE_PERSONAS,
  defaultShareMessage,
  isSharePersona,
  sanitizeSharePersona,
} from "./share-personas";
import { notesExcludeNeedsGrantId } from "./share-package";

describe("W3.3 share personas", () => {
  it("names title, agent, builder, architect, other and refuses unknown", () => {
    expect([...SHARE_PERSONAS]).toEqual([
      "title",
      "agent",
      "builder",
      "architect",
      "other",
    ]);
    expect(isSharePersona("lender")).toBe(false);
    expect(sanitizeSharePersona("agent")).toBe("agent");
    expect(sanitizeSharePersona("investor")).toBeNull();
  });

  it("each persona has a default message the picker can overwrite", () => {
    for (const persona of SHARE_PERSONAS) {
      const msg = defaultShareMessage(persona);
      expect(msg.length).toBeGreaterThan(0);
      expect(msg).toMatch(/Smart Site reports/i);
      expect(msg).not.toMatch(/Upgrade|Go Pro|Unlock full access|Free trial|Buy report/i);
    }
  });
});

describe("W3.1 exclude-notes bind", () => {
  it("refuses to hand a notes-excluded link without a grant id (violate: allow)", () => {
    expect(notesExcludeNeedsGrantId(false, null)).toBe(true);
    expect(notesExcludeNeedsGrantId(false, "")).toBe(true);
    expect(notesExcludeNeedsGrantId(false, "2c1a9d4e-7b11-4f0a-9c3d-0a1b2c3d4e5f")).toBe(
      false,
    );
    expect(notesExcludeNeedsGrantId(true, null)).toBe(false);
  });
});
