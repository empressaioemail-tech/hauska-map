// SHARE FUNNEL tests — share links land in the FULL app as a signup funnel.
//
// Pins (operator directive):
//   1. /share#<token> resolves to APP-LANDING mode, not the old standalone
//      read-only page (URL shape unchanged; bare /share still lands the app).
//   2. The shared dossier renders READ-ONLY in the workbench dock, reusing
//      the ShareView content pieces (banner + verdict + brief + downloads).
//   3. Expired/invalid tokens land the app with the honest notice — never a
//      dead-end page.
//   4. The sign-up prompt (standard googleSignInUrl entry point) is present
//      signed-out and absent signed-in.
// Static renders via react-dom/server (node vitest env — no effects run),
// plus source pins on App/ExplorerMap wiring (the map itself cannot mount in
// node), the same idiom as map-toolset-geolocate.test.tsx.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  isSharePath,
  resolveShareLanding,
  SHARE_FUNNEL_STASH_KEY,
  shareTokenFromLocation,
  type ShareStash,
} from "./share-landing";
import {
  SHARED_ANALYSIS_TOOL_ID,
  SharedDossierDock,
  sharedAnalysisToolDef,
  type ShareFunnelBinding,
} from "./SharedDossierDock";
import { ShareLandingOverlay } from "./ShareLandingOverlay";
import type { ShareBriefResponse, SharePhase } from "./ShareView";
import type { WorkbenchToolContext } from "../workbench/types";
import { ZONED_BRIEF } from "../browse/__fixtures__/research-brief.fixture";

function memStash(seed: Record<string, string> = {}): ShareStash & {
  bag: Map<string, string>;
} {
  const bag = new Map(Object.entries(seed));
  return {
    bag,
    getItem: (k) => bag.get(k) ?? null,
    setItem: (k, v) => void bag.set(k, v),
    removeItem: (k) => void bag.delete(k),
  };
}

const READY_DATA: ShareBriefResponse = {
  property: {
    parcelNodeId: "48021:34177",
    situsAddress: "1127 N Pine St",
    countyName: "Bastrop",
  },
  report: ZONED_BRIEF,
  share: { expiresAt: "2026-08-15T00:00:00.000Z" },
};

const READY_PHASE: SharePhase = { kind: "ready", data: READY_DATA };

const READY_BINDING: ShareFunnelBinding = {
  token: "tok-abc",
  phase: READY_PHASE,
  dossier: null,
};

const TOOL_CTX: WorkbenchToolContext = {
  activeParcelNodeId: null,
  closeDock: () => {},
  host: { openPaywall: () => {} },
};

// ---------------------------------------------------------------------------
// 1. Token → app-landing mode (not the standalone page)
// ---------------------------------------------------------------------------

describe("share landing resolution — /share lands in the app", () => {
  it("parses the token from the fragment (canonical) and ?token= fallback", () => {
    expect(shareTokenFromLocation({ hash: "#tok-1", search: "" })).toBe("tok-1");
    expect(shareTokenFromLocation({ hash: "", search: "?token=tok-2" })).toBe("tok-2");
    expect(shareTokenFromLocation({ hash: "", search: "" })).toBeNull();
  });

  it("/share#<token> resolves to a share landing carrying the token (URL shape unchanged)", () => {
    const stash = memStash();
    const landing = resolveShareLanding(
      { pathname: "/share", hash: "#tok-abc", search: "" },
      stash,
    );
    expect(landing).toEqual({ token: "tok-abc", restored: false });
    // The token is stashed so the OIDC round-trip (/?signed_in=1) can restore.
    expect(stash.bag.get(SHARE_FUNNEL_STASH_KEY)).toBe("tok-abc");
  });

  it("bare /share (no token) still lands the app — token null, never a dead end", () => {
    expect(isSharePath("/share/")).toBe(true);
    const landing = resolveShareLanding(
      { pathname: "/share/", hash: "", search: "" },
      memStash(),
    );
    expect(landing).toEqual({ token: null, restored: false });
  });

  it("post-sign-in load (?signed_in=1) restores and CONSUMES the stashed token", () => {
    const stash = memStash({ [SHARE_FUNNEL_STASH_KEY]: "tok-abc" });
    const landing = resolveShareLanding(
      { pathname: "/", hash: "", search: "?signed_in=1" },
      stash,
    );
    expect(landing).toEqual({ token: "tok-abc", restored: true });
    expect(stash.bag.has(SHARE_FUNNEL_STASH_KEY)).toBe(false);
    // A later plain load is the normal app again.
    expect(
      resolveShareLanding({ pathname: "/", hash: "", search: "?signed_in=1" }, stash),
    ).toBeNull();
  });

  it("a normal load is NOT a share landing", () => {
    expect(
      resolveShareLanding({ pathname: "/", hash: "", search: "" }, memStash()),
    ).toBeNull();
  });

  it("App routes share landings into the FULL app (ShareFunnelApp), never the standalone ShareView page", () => {
    const appSource = readFileSync(resolve(__dirname, "../App.tsx"), "utf8");
    expect(appSource).toContain("ShareFunnelApp");
    expect(appSource).toContain("resolveShareLanding");
    // The old standalone-page branch is gone from the shell.
    expect(appSource).not.toMatch(/<ShareView\s*\/>/);

    const funnelSource = readFileSync(resolve(__dirname, "ShareFunnelApp.tsx"), "utf8");
    // The funnel mounts the REAL map app, with the share binding threaded in.
    expect(funnelSource).toMatch(/<ExplorerMap share=\{share\} \/>/);
  });

  it("ExplorerMap wires the share binding: tool prepended, dock auto-opened, flight via the EXISTING reopen chain", () => {
    const source = readFileSync(
      resolve(__dirname, "../browse/ExplorerMap.tsx"),
      "utf8",
    );
    // The shared-analysis dock tool joins the cluster only in share mode…
    expect(source).toMatch(/sharedAnalysisToolDef\(share\), \.\.\.WORKBENCH_TOOLS/);
    // …opens docked from the start…
    expect(source).toMatch(/share \? \[SHARED_ANALYSIS_TOOL_ID\] : \[\]/);
    // …and the flight REUSES runParcelLookup (the workbench reopen /
    // coordinate-resolution chain) — no second resolver.
    expect(source).toMatch(
      /runParcelLookup\(share\.phase\.data\.property\.parcelNodeId/,
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Dossier docked read-only (reused ShareView content)
// ---------------------------------------------------------------------------

describe("shared dossier docked read-only", () => {
  it("the dock tool def is live, not property-scoped, under the stable id", () => {
    const def = sharedAnalysisToolDef(READY_BINDING);
    expect(def.id).toBe(SHARED_ANALYSIS_TOOL_ID);
    expect(def.status).toBe("live");
    expect(def.propertyScoped).toBe(false);
    expect(def.render).toBeTypeOf("function");
  });

  it("ready phase renders the read-only banner + the REUSED share content (verdict, brief, downloads)", () => {
    const html = renderToStaticMarkup(<SharedDossierDock share={READY_BINDING} />);
    expect(html).toContain('data-testid="share-dock-ready"');
    // Read-only banner with the link expiry.
    expect(html).toContain('data-testid="share-dock-banner"');
    expect(html).toContain("Shared property analysis · read-only");
    expect(html).toContain("link expires 2026-08-15");
    // The reused ShareView content block — verdict card, cited brief, exports.
    expect(html).toContain('data-testid="share-analysis-content"');
    expect(html).toContain('data-testid="share-verdict"');
    expect(html).toContain('data-testid="research-brief"');
    expect(html).toContain('data-testid="brief-citations"');
    expect(html).toContain('data-testid="share-downloads"');
    expect(html).toContain("Download site plan (PDF)");
    expect(html).toContain("Download terrain model (GLB)");
  });

  it("the tool def renders the same dock content through the workbench contract", () => {
    const def = sharedAnalysisToolDef(READY_BINDING);
    const html = renderToStaticMarkup(<>{def.render!(TOOL_CTX)}</>);
    expect(html).toContain('data-testid="share-dock-ready"');
  });

  it("loading phase is an honest loading line", () => {
    const html = renderToStaticMarkup(
      <SharedDossierDock
        share={{ token: "tok", phase: { kind: "loading" }, dossier: null }}
      />,
    );
    expect(html).toContain('data-testid="share-dock-loading"');
    expect(html).toContain("Loading shared property analysis");
  });
});

// ---------------------------------------------------------------------------
// 3. Expired / invalid token → honest notice, never a dead end
// ---------------------------------------------------------------------------

describe("expired / invalid token notice path", () => {
  it("expired phase docks the honest expired wording", () => {
    const html = renderToStaticMarkup(
      <SharedDossierDock
        share={{ token: "tok", phase: { kind: "expired" }, dossier: null }}
      />,
    );
    expect(html).toContain('data-testid="share-dock-invalid"');
    expect(html).toContain("This share link has expired.");
    expect(html).toContain("The map stays open");
  });

  it("invalid phase (bad or missing token) docks the invalid-or-expired wording", () => {
    const html = renderToStaticMarkup(
      <SharedDossierDock
        share={{ token: null, phase: { kind: "invalid" }, dossier: null }}
      />,
    );
    expect(html).toContain("This share link is invalid or has expired.");
  });

  it("the landing overlay carries the notice too — even for a signed-in viewer", () => {
    const signedOut = renderToStaticMarkup(
      <ShareLandingOverlay phase={{ kind: "expired" }} signedIn={false} />,
    );
    expect(signedOut).toContain('data-testid="share-landing-notice"');
    expect(signedOut).toContain("This share link has expired.");

    const signedIn = renderToStaticMarkup(
      <ShareLandingOverlay phase={{ kind: "invalid" }} signedIn={true} />,
    );
    expect(signedIn).toContain('data-testid="share-landing-notice"');
    expect(signedIn).toContain("This share link is invalid or has expired.");
    // …but no sign-up prompt once signed in.
    expect(signedIn).not.toContain('data-testid="share-signup-prompt"');
  });
});

// ---------------------------------------------------------------------------
// 4. Sign-up prompt — present signed-out, absent signed-in
// ---------------------------------------------------------------------------

describe("sign-up prompt", () => {
  it("signed out: persistent prompt with the operator copy + the STANDARD sign-in entry point", () => {
    const html = renderToStaticMarkup(
      <ShareLandingOverlay phase={READY_PHASE} signedIn={false} />,
    );
    expect(html).toContain('data-testid="share-signup-prompt"');
    expect(html).toContain("Shared with you");
    expect(html).toContain("sign up free to explore this and any property");
    // The SAME entry point ChatTool / LockedToolPanel use (googleSignInUrl).
    expect(html).toContain('href="/api/auth/google/start"');
  });

  it("signed in with a valid link: the overlay renders nothing at all", () => {
    const html = renderToStaticMarkup(
      <ShareLandingOverlay phase={READY_PHASE} signedIn={true} />,
    );
    expect(html).toBe("");
  });
});
