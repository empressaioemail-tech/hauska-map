import { describe, expect, it } from "vitest";
import { STRIPE_APPEARANCE } from "./stripeAppearance";

describe("STRIPE_APPEARANCE — WDLL item 6 exact values", () => {
  it("locks the Appearance API object to this app's own pe-tokens.css values", () => {
    expect(STRIPE_APPEARANCE.theme).toBe("night");
    // --ss-blue
    expect(STRIPE_APPEARANCE.variables.colorPrimary).toBe("#86ADDF");
    // --ss-void — same background Input.tsx uses for its own fields
    expect(STRIPE_APPEARANCE.variables.colorBackground).toBe("#2A2A2B");
    // --ss-t1
    expect(STRIPE_APPEARANCE.variables.colorText).toBe("#FBFBFC");
    // --ss-t6
    expect(STRIPE_APPEARANCE.variables.colorTextSecondary).toBe("#999B9F");
    // --ss-r-touch
    expect(STRIPE_APPEARANCE.variables.borderRadius).toBe("10px");
    // --ss-ui — "Inter" was never loaded anywhere in this app (no <link>,
    // no @font-face), so Stripe was silently falling back off-brand.
    expect(STRIPE_APPEARANCE.variables.fontFamily).not.toContain("Inter");
    expect(STRIPE_APPEARANCE.variables.fontFamily).toContain("system-ui");
  });

  it("does not mention Oxygen or a Google G recolor", () => {
    const raw = JSON.stringify(STRIPE_APPEARANCE);
    expect(raw).not.toMatch(/Oxygen/i);
    expect(raw).not.toMatch(/EA4335|Google/);
  });
});
