import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GoogleSignInButton } from "./GoogleSignInButton";

describe("GoogleSignInButton — official mark, one label, three sizes", () => {
  it("dark default: Sign in with Google, official G colours, md size", () => {
    const html = renderToStaticMarkup(<GoogleSignInButton />);
    expect(html).toContain("Sign in with Google");
    expect(html).not.toContain("Continue with Google");
    expect(html).toContain('data-variant="dark"');
    expect(html).toContain('data-size="md"');
    expect(html).toContain("#EA4335");
    expect(html).toContain("#4285F4");
    expect(html).toContain("#FBBC05");
    expect(html).toContain("#34A853");
    expect(html).toContain("#131314");
  });

  it("light landing variant is white with the same label", () => {
    const html = renderToStaticMarkup(
      <GoogleSignInButton variant="light" size="lg" />,
    );
    expect(html).toContain("Sign in with Google");
    expect(html).toContain('data-variant="light"');
    expect(html).toContain("#FFFFFF");
    expect(html).toContain("#1F1F1F");
  });

  it("pending replaces the mark and the label; href is dropped", () => {
    const html = renderToStaticMarkup(
      <GoogleSignInButton pending testId="continue-google" />,
    );
    expect(html).toContain("Signing in…");
    expect(html).not.toContain("Sign in with Google");
    expect(html).toContain('data-pending="true"');
    expect(html).toContain('data-testid="continue-google"');
    expect(html).not.toContain("href=");
  });

  it("sizes 32 / 36 / 44", () => {
    const sm = renderToStaticMarkup(<GoogleSignInButton size="sm" />);
    const md = renderToStaticMarkup(<GoogleSignInButton size="md" />);
    const lg = renderToStaticMarkup(<GoogleSignInButton size="lg" />);
    expect(sm).toContain("height:32px");
    expect(md).toContain("height:36px");
    expect(lg).toContain("height:44px");
  });
});
