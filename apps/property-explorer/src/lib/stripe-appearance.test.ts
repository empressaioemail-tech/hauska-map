import { describe, expect, it } from "vitest";
import { STRIPE_APPEARANCE } from "./stripeAppearance";

describe("STRIPE_APPEARANCE — WDLL item 6 exact values", () => {
  it("locks the Appearance API object", () => {
    expect(STRIPE_APPEARANCE.theme).toBe("night");
    expect(STRIPE_APPEARANCE.variables.colorPrimary).toBe("#3B82F6");
    expect(STRIPE_APPEARANCE.variables.colorBackground).toBe("#141921");
    expect(STRIPE_APPEARANCE.variables.colorText).toBe("#F8FAFC");
    expect(STRIPE_APPEARANCE.variables.colorTextSecondary).toBe("#94A3B8");
    expect(STRIPE_APPEARANCE.variables.borderRadius).toBe("6px");
    expect(STRIPE_APPEARANCE.variables.fontFamily).toBe("Inter");
  });

  it("does not mention Oxygen or a Google G recolor", () => {
    const raw = JSON.stringify(STRIPE_APPEARANCE);
    expect(raw).not.toMatch(/Oxygen/i);
    expect(raw).not.toMatch(/EA4335|Google/);
  });
});
