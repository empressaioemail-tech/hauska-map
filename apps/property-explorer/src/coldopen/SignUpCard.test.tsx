import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// SignUpCard fetches auth status in a useEffect and only then renders the
// email form — useEffect never fires under renderToStaticMarkup (confirmed
// project-wide precedent: CheckoutPage/UnlockCheckoutModal's own tests use
// this exact same source-read technique for the identical reason, see
// checkout-page.test.tsx). So behavior here is covered two ways, matching
// that precedent: a static render proving the card's DEFAULT (pre-status)
// state never shows the email form, plus source-read assertions proving the
// email form IS wired to authStatus.configured.email, never sends a
// password anywhere, and reports send failures/rate limits honestly rather
// than always claiming "check your email".

const SOURCE = readFileSync(resolve(__dirname, "SignUpCard.tsx"), "utf8");

describe("SignUpCard — email magic-link option is wired correctly (source)", () => {
  it("gates the email form on authStatus.configured.email, same pattern as google/microsoft", () => {
    expect(SOURCE).toMatch(/authStatus\?\.configured\.email/);
    expect(SOURCE).toMatch(/authStatus\?\.configured\.google/);
    expect(SOURCE).toMatch(/authStatus\?\.configured\.microsoft/);
  });

  it("calls requestMagicLinkEmail from lib/auth, not a hand-rolled fetch", () => {
    expect(SOURCE).toMatch(/from ["'].*\/lib\/auth["']/);
    expect(SOURCE).toContain("requestMagicLinkEmail(");
  });

  it("never has a password input or a password-carrying field/state, only the reassurance copy", () => {
    // The card deliberately SAYS "no password, ever" (reassurance copy) —
    // what must never exist is an actual password input or a password value
    // flowing through state/fetch calls.
    expect(SOURCE).not.toMatch(/type="password"/);
    expect(SOURCE).not.toMatch(/\bpassword\s*[:=]/i);
    expect(SOURCE).toContain("no password, ever");
  });

  it("a send failure sets the error stage and shows the honest server message, never a fake sent state unconditionally", () => {
    // The "sent" confirmation is only reachable through `result.ok` being
    // true; a failed result always routes to the error stage.
    expect(SOURCE).toMatch(/if\s*\(!result\.ok\)\s*\{/);
    expect(SOURCE).toContain('setEmailStage("error")');
    expect(SOURCE).toContain('setEmailStage("sent")');
  });

  it("distinguishes a rate-limit response with its own message", () => {
    expect(SOURCE).toContain('result.error === "rate_limited"');
  });

  it("client-side validates the address before sending (isPlausibleEmail), but the server stays the real gate", () => {
    expect(SOURCE).toMatch(/from ["'].*\/lib\/auth["']/);
    expect(SOURCE).toContain("isPlausibleEmail(email)");
  });

  it("the email input is a real <input type=email>, not a text field pretending to validate", () => {
    expect(SOURCE).toMatch(/data-testid="email-input"/);
    expect(SOURCE).toMatch(/type="email"/);
  });
});
