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
import { recordPeGtmEvent } from "../lib/gtmClient";
import type { ShareLanding } from "./share-landing";
import { ShareLandingOverlay } from "./ShareLandingOverlay";
import type { ShareFunnelBinding } from "./SharedDossierDock";
import { fetchShareGrant } from "./share-grant-client";
import { shareNotesFromDossier } from "./share-flight";
import {
  defaultReceivedShareStore,
  recordReceivedShare,
} from "./share-received";
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
        background: "#0b0e13",
        overflow: "hidden",
      }}
    >
      <ExplorerMap share={share} />
      <ShareLandingOverlay phase={phase} signedIn={signedIn} />
    </div>
  );
}
