import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SignUpCard } from "./SignUpCard";

// P-247 redesign. SignUpCard fetches auth status in a useEffect and only
// then renders the provider buttons / email form — useEffect never fires
// under renderToStaticMarkup (confirmed project-wide precedent: Checkout/
// PricingModal's own tests use this exact technique for the identical
// reason). Two layers here, matching that precedent:
//   1. A static render of the DEFAULT (pre-auth-status) tree, which is
//      exactly state 1's card content — real assertions on real output.
//   2. Source-read assertions for the auth wiring (unchanged from the
//      component this replaces) and for the new view-state wiring, which a
//      static render of the default state cannot exercise without jsdom.

const SOURCE = readFileSync(resolve(__dirname, "SignUpCard.tsx"), "utf8");

describe("SignUpCard — state 1 default render (no auth status yet)", () => {
  const html = renderToStaticMarkup(<SignUpCard onDismiss={() => {}} />);

  it("shows the redesigned copy verbatim", () => {
    expect(html).toContain("Parcel intelligence for Central Texas");
    expect(html).toContain("What can you actually build on it?");
    expect(html).toContain(
      "Zoning, setbacks, buildable envelope and flood for any parcel in the Austin metro, cited to the ordinance section it came from.",
    );
    expect(html).toContain("When the record does not say, we say so. We do not invent a setback.");
    expect(html).toContain("See a real parcel report");
    expect(html).toContain("Browse the map yourself");
  });

  it("renders the three-up instrument row with the real names and descriptions", () => {
    expect(html).toContain("X-ray");
    expect(html).toContain("What you can build, and where the envelope is");
    expect(html).toContain("Flood &amp; Drainage");
    expect(html).toContain("What the water does, with the FEMA panel it came from");
    expect(html).toContain("Terrain");
    expect(html).toContain("How the ground falls across the lot");
  });

  it("renders the Claude channel block", () => {
    expect(html).toContain("Or ask from inside Claude.");
    expect(html).toContain("Connect Smart Site to Claude and ask about a parcel in plain language. Every tier, including free.");
    expect(html).toContain('data-testid="claude-mark"');
  });

  it("renders the three real sample-parcel links, verbatim label text", () => {
    expect(html).toContain("No address in mind?");
    expect(html).toContain("An Austin infill lot");
    expect(html).toContain("A Bastrop tract");
    expect(html).toContain("A Hays corridor lot");
  });

  it("does not show the account block before auth status has loaded (unchanged effect gating)", () => {
    expect(html).not.toContain('data-testid="continue-google"');
    expect(html).not.toContain('data-testid="email-signin-form"');
  });

  it("never renders state 2 or state 3 chrome before a view change", () => {
    expect(html).not.toContain('data-testid="sample-report-panel"');
    expect(html).not.toContain('data-testid="claude-channel-preview"');
  });
});

describe("SignUpCard — banned language and typography (operator constraints, all states)", () => {
  const files = [
    SOURCE,
    readFileSync(resolve(__dirname, "SampleReportPanel.tsx"), "utf8"),
    readFileSync(resolve(__dirname, "ClaudeChannelPreview.tsx"), "utf8"),
  ];

  it("never says feasibility, 3D, or a comparison report", () => {
    for (const src of files) {
      expect(src.toLowerCase()).not.toContain("feasibility");
      expect(src).not.toMatch(/\b3D\b/);
      expect(src.toLowerCase()).not.toContain("comparison report");
    }
  });

  it("never asserts a property value, estimate, comp, or sale price, or a time/money-saved figure", () => {
    for (const src of files) {
      const lower = src.toLowerCase();
      expect(lower).not.toMatch(/\bsale price\b/);
      expect(lower).not.toMatch(/\btime saved\b/);
      expect(lower).not.toMatch(/\bmoney saved\b/);
    }
  });

  it("coverage language stays 'the Austin metro', never Texas-wide, statewide, or nationwide", () => {
    for (const src of files) {
      const lower = src.toLowerCase();
      expect(lower).not.toContain("statewide");
      expect(lower).not.toContain("nationwide");
      expect(lower).not.toContain("texas wide");
      expect(lower).not.toContain("texas-wide");
    }
  });

  it("no em dashes or en dashes in any visible copy string", () => {
    for (const src of files) {
      // Scan only string/JSX text content, not the file's own prose comments,
      // which this repo's CLAUDE.md convention also keeps dash-free but is
      // not the thing this check is guarding.
      const stripped = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
      expect(stripped).not.toMatch(/[–—]/);
    }
  });
});

describe("SignUpCard — view-state wiring (source-read; useEffect-gated interaction untestable without jsdom)", () => {
  it("opens the report view on the default sample parcel when the primary CTA or an instrument card is clicked", () => {
    expect(SOURCE).toContain('onOpenReport(DEFAULT_SAMPLE_PARCEL_KEY, "xray")');
    expect(SOURCE).toMatch(/onOpen=\{\(\) => onOpenReport\(DEFAULT_SAMPLE_PARCEL_KEY, instrument\.tab\)\}/);
  });

  it("each sample link opens the report view on its OWN parcel key, not the default", () => {
    expect(SOURCE).toMatch(/onOpenReport\(sample\.key, "xray"\)/);
  });

  it("the Claude block opens state 3", () => {
    expect(SOURCE).toContain('onClick={onOpenClaude}');
    expect(SOURCE).toContain('setView("claude")');
  });

  it("Escape steps back to the card from report/claude before dismissing the whole cold open", () => {
    expect(SOURCE).toMatch(/if \(view !== "card"\) \{\s*setView\("card"\);/);
  });

  it("'Look up your own parcel' dismisses the cold open (reveals the real find bar); 'Sign in to save and share this' returns to the account block", () => {
    expect(SOURCE).toContain("onLookUpOwn={dismissBrowse}");
    expect(SOURCE).toMatch(/onSignIn=\{\(\) => setView\("card"\)\}/);
  });
});

describe("SignUpCard — email magic-link option is wired correctly (source, unchanged from the component this replaces)", () => {
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
    expect(SOURCE).not.toMatch(/type="password"/);
    expect(SOURCE).not.toMatch(/\bpassword\s*[:=]/i);
    expect(SOURCE).toContain("No password, ever");
  });

  it("a send failure sets the error stage and shows the honest server message, never a fake sent state unconditionally", () => {
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

describe("SignUpCard — the gold CTA is the documented, allow-listed exception (not a silent bypass)", () => {
  it("fills the primary CTA with the gold token, confined to this file's allow-listed usage", () => {
    expect(SOURCE).toContain("background: PE.gold, color: PE.void");
  });

  it("is registered in the chrome-kit gate's GOLD_ALLOWED list, not routed around it", () => {
    const gate = readFileSync(
      resolve(__dirname, "../../scripts/pe-chrome-kit-gate.mjs"),
      "utf8",
    );
    expect(gate).toMatch(/GOLD_ALLOWED = \[[\s\S]*?"src\/coldopen\/SignUpCard\.tsx"[\s\S]*?\]/);
    expect(gate).toMatch(/GOLD_ALLOWED = \[[\s\S]*?"src\/coldopen\/SampleReportPanel\.tsx"[\s\S]*?\]/);
  });
});
