// src/share/SharedDossierDock.tsx — the workbench DOCK HOST for a shared
// property analysis (share funnel).
//
// A share landing loads the FULL map app; this tool is prepended to the
// workbench cluster (share mode only) and auto-opened, so the shared dossier
// renders read-only INSIDE the one shared dock — the dock chrome already
// scrolls (Workbench.tsx owns the scroll region). Content is the SAME pieces
// the standalone /share page renders (ShareAnalysisContent from ShareView.tsx:
// verdict card, cited brief, sharer's dossier, Export PDF/GLB downloads) —
// reused, never rebuilt. The read-only banner stays pinned at the top of the
// content, carrying the link expiry when known.
//
// Honest states: loading line while the token resolves; expired/invalid get
// the same honest wording as the standalone page (the map app around the dock
// keeps working — never a dead-end); BFF notices pass through verbatim.

import { PE } from "../styles/pe-chrome";
import type { WorkbenchToolDef } from "../workbench/types";
import { WorkbenchIcon } from "../workbench/Workbench";
import {
  ShareAnalysisContent,
  type ShareDossierData,
  type SharePhase,
} from "./ShareView";

const MUTED = PE.t4;
const AMBER = PE.warn;
const ACCENT = PE.blue;

/** The workbench tool id (registry key) for the shared-analysis dock tool. */
export const SHARED_ANALYSIS_TOOL_ID = "shared-analysis";

/** Everything the share funnel binds into the map app for the dock host. */
export interface ShareFunnelBinding {
  token: string | null;
  grantId: string | null;
  phase: SharePhase;
  dossier: ShareDossierData | null;
  /** Parcel id from the grant row when the brief is not yet ready. */
  parcelNodeId: string | null;
}

/** "Shared property analysis · read-only · link expires <date>" — persistent. */
export function ShareReadOnlyBanner({ expiresAt }: { expiresAt: string | null }) {
  return (
    <p
      data-testid="share-dock-banner"
      style={{
        margin: "0 0 10px",
        padding: "6px 9px",
        borderRadius: 6,
        background: "var(--brand-blue-bg-soft, rgba(59,130,246,0.08))",
        border: "1px solid var(--brand-blue-border, rgba(59,130,246,0.4))",
        fontSize: 10.5,
        letterSpacing: 0.3,
        color: ACCENT,
      }}
    >
      Shared property analysis · read-only
      {expiresAt ? ` · link expires ${expiresAt.slice(0, 10)}` : ""}
    </p>
  );
}

/** The dock content, per share phase — always honest, never dead-looking. */
export function SharedDossierDock({ share }: { share: ShareFunnelBinding }) {
  const { token, phase, dossier } = share;

  if (phase.kind === "loading") {
    return (
      <p data-testid="share-dock-loading" style={{ margin: 0, color: MUTED }}>
        Loading shared property analysis…
      </p>
    );
  }
  if (phase.kind === "expired" || phase.kind === "invalid") {
    return (
      <div data-testid="share-dock-invalid">
        <strong style={{ fontSize: 13 }}>
          {phase.kind === "expired"
            ? "This share link has expired."
            : "This share link is invalid or has expired."}
        </strong>
        <p style={{ margin: "8px 0 0", color: MUTED, fontSize: 11.5 }}>
          Ask the person who shared it with you for a fresh link. The map stays
          open — browse any property meanwhile.
        </p>
      </div>
    );
  }
  if (phase.kind === "notice") {
    return (
      <p data-testid="share-dock-notice" style={{ margin: 0, color: AMBER }}>
        {phase.text}
      </p>
    );
  }

  return (
    <div data-testid="share-dock-ready">
      <ShareReadOnlyBanner expiresAt={phase.data.share.expiresAt} />
      <ShareAnalysisContent
        token={token ?? ""}
        grantId={share.grantId}
        data={phase.data}
        dossier={dossier}
        variant="dock"
      />
    </div>
  );
}

// Envelope/gift glyph in the MapToolset icon language — the "shared with you"
// bubble. Distinct from the sharer-side share-nodes glyph.
const SHARED_ICON =
  "M3 6h18v13H3V6Zm0 1 9 6 9-6";

/**
 * The share-mode workbench tool def, prepended to WORKBENCH_TOOLS by the app
 * shell when (and only when) the load is a share landing. NOT propertyScoped:
 * the shared content is token-gated, present before any map/parcel resolution.
 */
export function sharedAnalysisToolDef(share: ShareFunnelBinding): WorkbenchToolDef {
  return {
    id: SHARED_ANALYSIS_TOOL_ID,
    label: "Shared analysis",
    icon: <WorkbenchIcon path={SHARED_ICON} />,
    status: "live",
    propertyScoped: false,
    render: () => <SharedDossierDock share={share} />,
  };
}
