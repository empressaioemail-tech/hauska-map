// src/share/ShareFunnelApp.tsx — the SHARE LANDING shell (signup funnel).
//
// /share#<token> loads THIS instead of the old standalone read-only page: the
// FULL regular map app boots (ExplorerMap — anonymous browse, tools locked per
// the existing entitlement matrix), the share token resolves through the SAME
// token-gated /api/pe-share-view BFF the standalone page used, and:
//   - ready → ExplorerMap flies/docks to the shared property (it reuses the
//     workbench reopen chain — runParcelLookup — internally) and the read-only
//     analysis opens in the workbench dock (SharedDossierDock),
//   - expired/invalid (or no token at all) → the map app still loads with the
//     honest notice — never a dead-end page,
//   - signed out → the persistent non-blocking sign-up prompt (the standard
//     googleSignInUrl entry point); signed in → no prompt, standard user.
//
// The share grant exposes ONLY the shared dossier content (token-gated BFF);
// everything else on the page is exactly the anonymous app.

import { useEffect, useMemo, useState } from "react";
import { ExplorerMap } from "../browse/ExplorerMap";
import { fetchSession } from "../lib/auth";
import { recordPeGtmEvent } from "../lib/gtmClient";
import type { ShareLanding } from "./share-landing";
import { ShareLandingOverlay } from "./ShareLandingOverlay";
import type { ShareFunnelBinding } from "./SharedDossierDock";
import {
  fetchShareBrief,
  fetchShareDossier,
  type ShareDossierData,
  type SharePhase,
} from "./ShareView";

function stripSignedInParam(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("signed_in")) return;
  url.searchParams.delete("signed_in");
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, "", next || "/");
}

export function ShareFunnelApp({ landing }: { landing: ShareLanding }) {
  const token = landing.token;
  // No token at all (bare /share) → straight to the honest invalid state.
  const [phase, setPhase] = useState<SharePhase>(() =>
    token ? { kind: "loading" } : { kind: "invalid" },
  );
  const [dossier, setDossier] = useState<ShareDossierData | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    void recordPeGtmEvent({
      eventType: "pe_browse_started",
      payload: { shareLanding: true, restoredAfterSignIn: landing.restored },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resolve the share token through the token-gated BFF (same calls as the
  // old standalone page — fetchShareBrief / feature-detected fetchShareDossier).
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void fetchShareBrief(token).then((next) => {
      if (!cancelled) setPhase(next);
    });
    void fetchShareDossier(token).then((next) => {
      if (!cancelled) setDossier(next);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Session probe: an OIDC round-trip lands with ?signed_in=1 (strip it, as
  // the normal app shell does); otherwise an existing pe_session cookie counts.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const fromCallback =
      new URLSearchParams(window.location.search).get("signed_in") === "1";
    if (fromCallback) {
      setSignedIn(true);
      stripSignedInParam();
      return;
    }
    let cancelled = false;
    void fetchSession().then((session) => {
      if (!cancelled && session.authenticated) setSignedIn(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const share = useMemo<ShareFunnelBinding>(
    () => ({ token, phase, dossier }),
    [token, phase, dossier],
  );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#0b0e13",
        overflow: "hidden",
      }}
    >
      {/* The FULL live map app — share mode only adds the docked shared
          analysis + the flight to the shared property. No cold-open here:
          the share sign-up prompt below is this landing's funnel surface. */}
      <ExplorerMap share={share} />
      <ShareLandingOverlay phase={phase} signedIn={signedIn} />
    </div>
  );
}
