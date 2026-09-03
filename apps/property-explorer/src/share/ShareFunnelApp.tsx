// src/share/ShareFunnelApp.tsx — the SHARE LANDING shell (signup funnel).
//
// /share#<token> and /share?g={grantId} (from a browser GET /s/{id} 302)
// load THIS instead of a standalone page: the FULL regular map app boots,
// the share resolves through the token-gated or grant-id BFF, and the map
// flies to the shared property.

import { useEffect, useMemo, useState } from "react";
import { ExplorerMap } from "../browse/ExplorerMap";
import { fetchSession } from "../lib/auth";
import { claimAnonymousStateOnSignIn } from "../lib/claimClient";
import {
  claimShareAttribution,
  recordPeGtmEvent,
} from "../lib/gtmClient";
import type { ShareLanding } from "./share-landing";
import { ShareLandingOverlay } from "./ShareLandingOverlay";
import type { ShareFunnelBinding } from "./SharedDossierDock";
import { fetchShareGrant } from "./share-grant-client";
import { shareNotesFromDossier } from "./share-flight";
import {
  defaultReceivedShareStore,
  recordReceivedShare,
} from "./share-received";
import { PE } from "../styles/pe-chrome";
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
  const grantId = landing.grantId;
  const [phase, setPhase] = useState<SharePhase>(() =>
    token || grantId ? { kind: "loading" } : { kind: "invalid" },
  );
  const [dossier, setDossier] = useState<ShareDossierData | null>(null);
  const [parcelNodeId, setParcelNodeId] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState({
    xray: false,
    sitePlan: false,
    terrain: false,
  });
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    void recordPeGtmEvent({
      eventType: "pe_browse_started",
      payload: { shareLanding: true, restoredAfterSignIn: landing.restored },
    });
    // P-100 item 2: the RECIPIENT's load, on the Smart Site share plane,
    // carrying the grant row id. This is a distinct event from the browse
    // above, which is why the payload flag `shareLanding` on a browse event
    // was not enough: a browse with a flag cannot be counted as a share view
    // without also counting every other browse, and it carried no grant.
    //
    // ONLY THE GRANT-ID PLANE IS COUNTED. A `/share#<token>` landing has no
    // grant row and therefore nothing durable to attribute to, so it is not
    // reported as a share view rather than being reported against a null.
    // The two other known exclusions travel with the number in the readout:
    // an agent fetching /s/{id}?format=json never runs this code, and a
    // viewer who blocks the consent call is refused server-side.
    if (landing.grantId) {
      void recordPeGtmEvent({
        eventType: "share_viewed",
        payload: {
          grantId: landing.grantId,
          restoredAfterSignIn: landing.restored,
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!token && !grantId) return;
    let cancelled = false;
    if (grantId) {
      void fetchShareGrant(grantId).then((next) => {
        if (cancelled) return;
        setPhase(next.phase);
        setDossier(next.dossier);
        setParcelNodeId(next.parcelNodeId);
        setArtifacts(next.artifacts);
      });
      return () => {
        cancelled = true;
      };
    }
    void fetchShareBrief(token!).then((next) => {
      if (!cancelled) setPhase(next);
    });
    void fetchShareDossier(token!).then((next) => {
      if (!cancelled) setDossier(next);
    });
    return () => {
      cancelled = true;
    };
  }, [token, grantId]);

  useEffect(() => {
    if (phase.kind !== "ready") return;
    const id = phase.data.property.parcelNodeId;
    recordReceivedShare(
      {
        id: grantId ?? token ?? id,
        grantId,
        parcelNodeId: id,
        address: phase.data.property.situsAddress,
        notes: shareNotesFromDossier(dossier),
        expiresAt: phase.data.share.expiresAt,
        artifacts,
        receivedAt: new Date().toISOString(),
      },
      defaultReceivedShareStore(),
    );
  }, [phase, dossier, grantId, token, artifacts]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fromCallback =
      new URLSearchParams(window.location.search).get("signed_in") === "1";
    if (fromCallback) {
      setSignedIn(true);
      stripSignedInParam();
      // W2.3 — same claim the normal app runs. Share landings used to skip it.
      void claimAnonymousStateOnSignIn();
      // P-100 item 3: the anonymous-to-account hop is the ONLY moment the
      // grant id and a signed-in account are both in hand, which is exactly
      // the trap the card names -- an auth flip that orphans anonymous state
      // drops every share attribution silently. The grant id survives the
      // OIDC redirect in sessionStorage (share-landing.ts) and is restored
      // into `landing.grantId` before this runs.
      //
      // This browser sends the grant id and nothing else. The BFF resolves
      // WHO signed up from the session it just established; cortex resolves
      // WHO shared from the grant row. A body naming either is a 400.
      // Called unconditionally on every sign-in return: first-touch is held
      // by the recipient primary key, so a repeat is a no-op that returns the
      // original attribution rather than something this client must remember.
      if (landing.grantId) {
        void claimShareAttribution({
          grantId: landing.grantId,
          surface: "share-landing",
        });
      }
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
    () => ({
      token,
      grantId,
      phase,
      dossier,
      parcelNodeId:
        parcelNodeId ??
        (phase.kind === "ready" ? phase.data.property.parcelNodeId : null),
    }),
    [token, grantId, phase, dossier, parcelNodeId],
  );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: PE.ink,
        overflow: "hidden",
      }}
    >
      <ExplorerMap share={share} />
      <ShareLandingOverlay phase={phase} signedIn={signedIn} />
    </div>
  );
}
