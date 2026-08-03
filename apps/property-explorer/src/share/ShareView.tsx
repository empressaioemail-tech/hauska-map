// src/share/ShareView.tsx — the READ-ONLY share-link content (Workbench W4).
//
// SHARE FUNNEL (operator directive): /share#<token> no longer renders this
// file's standalone <ShareView /> page INSTEAD of the app — the share landing
// loads the FULL map app (src/share/ShareFunnelApp.tsx), flies to the shared
// property, and docks the read-only analysis in the workbench. THIS file stays
// the single source of the share content pieces both surfaces reuse:
//   - fetchShareBrief / fetchShareDossier — the token-gated /api/pe-share-view
//     data plane (the ONLY data plane a share viewer has),
//   - ShareAnalysisContent — verdict card + full cited brief + the sharer's
//     dossier + the Export downloads (site-plan PDF / terrain GLB),
//   - ShareDossierSection / DownloadButton — the individual pieces.
// Expired or tampered links get the honest "this share link has expired" /
// "invalid" state — never a blank page, never a silent fallback.

import { useEffect, useState } from "react";
import { PropertyBriefPanel } from "../browse/PropertyBriefPanel";
import type { ResearchBriefPayload } from "../browse/brief-view-model";
import { deriveShareVerdict, VERDICT_FALLBACK } from "./share-verdict";
import {
  drawingsSummaryLine,
  drawingsToSketch,
} from "./share-dossier-sketch";
import { shareTokenFromLocation } from "./share-landing";

// Kept as a ShareView export — the historical home of the token parser.
export { shareTokenFromLocation };

const MUTED = "#9aa6b2";
const AMBER = "#fcd34d";
const TEXT = "#e5e7eb";
const ACCENT = "#7dd3fc";
const CARD_BG = "rgba(13,17,23,0.94)";

export interface ShareBriefResponse {
  property: {
    parcelNodeId: string;
    situsAddress: string | null;
    countyName: string | null;
  };
  report: ResearchBriefPayload;
  share: { expiresAt: string | null };
}

export type SharePhase =
  | { kind: "loading" }
  | { kind: "ready"; data: ShareBriefResponse }
  | { kind: "expired" }
  | { kind: "invalid" }
  | { kind: "notice"; text: string };

/** The share-safe dossier the BFF projects (what=dossier, cortex #362). */
export interface ShareDossierData {
  address: string | null;
  savedAt: string | null;
  drawings: {
    type: "FeatureCollection";
    features: Array<{
      type: "Feature";
      geometry: { type: string; coordinates: unknown };
      properties: Record<string, unknown>;
    }>;
  } | null;
  chatSummary: {
    summary: string;
    savedAt: string;
    disclaimer: string | null;
  } | null;
  notes: string | null;
}

/**
 * FEATURE-DETECTED dossier fetch: any non-200 (v1 token without owner scope,
 * cortex route not deployed yet, nothing saved to share) returns null and the
 * page renders exactly as it did before the dossier shipped — never an error.
 */
export async function fetchShareDossier(token: string): Promise<ShareDossierData | null> {
  try {
    const res = await fetch(
      `/api/pe-share-view?token=${encodeURIComponent(token)}&what=dossier`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as {
      dossier?: ShareDossierData;
    } | null;
    return body?.dossier ?? null;
  } catch {
    return null;
  }
}

export async function fetchShareBrief(token: string): Promise<SharePhase> {
  try {
    const res = await fetch(
      `/api/pe-share-view?token=${encodeURIComponent(token)}&what=brief`,
      { headers: { Accept: "application/json" } },
    );
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    } & Partial<ShareBriefResponse>;
    if (res.status === 403 && body.error === "share_link_expired") {
      return { kind: "expired" };
    }
    if (res.status === 403) return { kind: "invalid" };
    if (!res.ok) {
      return {
        kind: "notice",
        text: body.message ?? `Could not load this share (${res.status}).`,
      };
    }
    if (!body.report || !body.property) {
      return { kind: "notice", text: "Share response was not readable." };
    }
    return { kind: "ready", data: body as ShareBriefResponse };
  } catch {
    return { kind: "notice", text: "Could not reach the sharing service." };
  }
}

type DownloadState = { kind: "idle" | "busy" } | { kind: "notice"; text: string };

export function DownloadButton({
  label,
  href,
  filenameHint,
}: {
  label: string;
  href: string;
  filenameHint: string;
}) {
  const [state, setState] = useState<DownloadState>({ kind: "idle" });

  const run = async () => {
    setState({ kind: "busy" });
    try {
      const res = await fetch(href);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setState({
          kind: "notice",
          text:
            res.status === 404
              ? `Not available on this link — ${filenameHint} was not exported for this property.`
              : (body.message ?? `Download failed (${res.status}).`),
        });
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") ?? "";
      const nameMatch = /filename="([^"]+)"/.exec(cd);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nameMatch?.[1] ?? filenameHint;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setState({ kind: "idle" });
    } catch {
      setState({ kind: "notice", text: "Could not reach the sharing service." });
    }
  };

  return (
    <div style={{ marginTop: 6 }}>
      <button
        type="button"
        onClick={() => void run()}
        disabled={state.kind === "busy"}
        style={{
          padding: "7px 12px",
          fontSize: 12,
          fontWeight: 600,
          color: ACCENT,
          background: "transparent",
          border: "0.5px solid rgba(125,211,252,0.4)",
          borderRadius: 6,
          cursor: state.kind === "busy" ? "default" : "pointer",
        }}
      >
        {state.kind === "busy" ? "Downloading…" : label}
      </button>
      {state.kind === "notice" && (
        <p style={{ margin: "4px 0 0", fontSize: 10.5, color: MUTED }}>{state.text}</p>
      )}
    </div>
  );
}

/**
 * The sharer's dossier — saved drawings (schematic static-SVG sketch, honest
 * "not to scale"), the AI chat summary (ALWAYS labeled AI, with disclaimer),
 * and notes. Renders nothing when the share carries no dossier. Exported for
 * render tests.
 */
export function ShareDossierSection({ dossier }: { dossier: ShareDossierData }) {
  const sketch = drawingsToSketch(dossier.drawings);
  const summaryLine = drawingsSummaryLine(dossier.drawings);
  return (
    <section
      data-testid="share-dossier"
      style={{
        padding: "12px 14px",
        borderRadius: 8,
        background: CARD_BG,
        border: "1px solid rgba(154,166,178,0.3)",
        marginBottom: 14,
      }}
    >
      <div style={{ fontSize: 10.5, color: MUTED, marginBottom: 6 }}>
        From the sharer&apos;s workspace
        {dossier.savedAt ? ` · saved ${dossier.savedAt.slice(0, 10)}` : ""}
      </div>

      {dossier.drawings && (
        <div data-testid="share-dossier-drawings" style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 4 }}>
            Map drawings{summaryLine ? ` · ${summaryLine}` : ""}
          </div>
          {sketch ? (
            <>
              <svg
                data-testid="share-dossier-sketch"
                viewBox={sketch.viewBox}
                role="img"
                aria-label="Schematic sketch of the sharer's saved map drawings"
                style={{
                  width: 180,
                  height: 180,
                  display: "block",
                  background: "rgba(154,166,178,0.06)",
                  border: "1px solid rgba(154,166,178,0.25)",
                  borderRadius: 6,
                }}
              >
                {sketch.paths.map((p, i) => (
                  <path
                    key={i}
                    d={p.d}
                    fill={p.closed ? "rgba(125,211,252,0.15)" : "none"}
                    stroke={ACCENT}
                    strokeWidth={1.2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ))}
                {sketch.points.map((pt, i) => (
                  <circle key={i} cx={pt.x} cy={pt.y} r={2} fill={AMBER} />
                ))}
              </svg>
              <div style={{ marginTop: 4, fontSize: 9.5, color: MUTED }}>
                Schematic sketch of the sharer&apos;s annotations — not to
                scale, no basemap.
              </div>
            </>
          ) : (
            <div style={{ fontSize: 10.5, color: MUTED }}>
              The sharer saved annotations that cannot be sketched here.
            </div>
          )}
        </div>
      )}

      {dossier.chatSummary && (
        <div data-testid="share-dossier-chat" style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: AMBER, fontWeight: 600 }}>
            AI research summary · saved {dossier.chatSummary.savedAt.slice(0, 10)}
          </div>
          <p
            style={{
              margin: "3px 0 0",
              fontSize: 11.5,
              whiteSpace: "pre-wrap",
            }}
          >
            {dossier.chatSummary.summary}
          </p>
          <p
            data-testid="share-dossier-chat-disclaimer"
            style={{ margin: "3px 0 0", fontSize: 9.5, color: MUTED }}
          >
            {dossier.chatSummary.disclaimer ??
              "AI-generated summary of a research chat — verify against the cited sources before relying on it."}
          </p>
        </div>
      )}

      {dossier.notes && (
        <div data-testid="share-dossier-notes">
          <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 2 }}>
            Notes from the sharer
          </div>
          <p style={{ margin: 0, fontSize: 11.5, whiteSpace: "pre-wrap" }}>
            {dossier.notes}
          </p>
        </div>
      )}
    </section>
  );
}

function CenterCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0b0e13",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          maxWidth: 460,
          padding: 24,
          borderRadius: 10,
          background: CARD_BG,
          border: "1px solid rgba(154,166,178,0.35)",
          color: TEXT,
          font: "13px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * The read-only share ANALYSIS block — verdict card, full cited brief (same
 * renderer as the app), the sharer's dossier when the link carries one, and
 * the Export downloads (site-plan PDF / terrain GLB). THE reused content:
 * the standalone page and the workbench dock host both render exactly this.
 * `variant="dock"` compacts the header for the workbench dock's width.
 */
export function ShareAnalysisContent({
  token,
  data,
  dossier,
  variant = "page",
}: {
  token: string;
  data: ShareBriefResponse;
  dossier: ShareDossierData | null;
  variant?: "page" | "dock";
}) {
  const { property, report, share } = data;
  const title = property.situsAddress ?? `Parcel ${property.parcelNodeId}`;
  const verdict = deriveShareVerdict(report);
  const downloadBase = `/api/pe-share-view?token=${encodeURIComponent(token)}`;
  const dock = variant === "dock";

  return (
    <div data-testid="share-analysis-content">
      {/* Property header */}
      <header style={{ marginBottom: dock ? 10 : 14 }}>
        {!dock && (
          <div style={{ fontSize: 10.5, color: MUTED, letterSpacing: 0.4 }}>
            SHARED PROPERTY ANALYSIS · READ-ONLY
          </div>
        )}
        {dock ? (
          <strong style={{ display: "block", fontSize: 13.5, lineHeight: 1.3 }}>
            {title}
          </strong>
        ) : (
          <h1 style={{ margin: "4px 0 2px", fontSize: 19, lineHeight: 1.3 }}>{title}</h1>
        )}
        <div style={{ fontSize: 11, color: MUTED }}>
          {property.parcelNodeId}
          {property.countyName ? ` · ${property.countyName} County` : ""}
          {share.expiresAt ? ` · link expires ${share.expiresAt.slice(0, 10)}` : ""}
        </div>
      </header>

      {/* VERDICT */}
      <section
        data-testid="share-verdict"
        style={{
          padding: "12px 14px",
          borderRadius: 8,
          background: CARD_BG,
          border: "1px solid rgba(125,211,252,0.3)",
          marginBottom: 14,
        }}
      >
        <div style={{ fontSize: 10.5, color: MUTED, marginBottom: 4 }}>Verdict</div>
        {verdict.length > 0 ? (
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{verdict.join(" · ")}</div>
        ) : (
          <div style={{ fontSize: 12, color: "var(--semantic-absence)" }}>{VERDICT_FALLBACK}</div>
        )}
        <div style={{ marginTop: 6, fontSize: 10, color: MUTED }}>
          Public-record-derived · approximate, not survey grade · every fact
          below carries its citation.
        </div>
      </section>

      {/* Full cited brief — same renderer as the app, embedded mode. */}
      <section
        style={{
          padding: "12px 14px",
          borderRadius: 8,
          background: CARD_BG,
          border: "1px solid rgba(154,166,178,0.3)",
          marginBottom: 14,
        }}
      >
        <PropertyBriefPanel embedded brief={report} onClose={() => {}} />
      </section>

      {/* The sharer's dossier — AFTER the brief, BEFORE the downloads.
          Renders only when the link carries one (v2 token + saved content);
          otherwise this block is byte-for-byte the pre-dossier layout. */}
      {dossier && <ShareDossierSection dossier={dossier} />}

      {/* Downloads */}
      <section
        data-testid="share-downloads"
        style={{
          padding: "12px 14px",
          borderRadius: 8,
          background: CARD_BG,
          border: "1px solid rgba(154,166,178,0.3)",
        }}
      >
        <div style={{ fontSize: 10.5, color: MUTED, marginBottom: 2 }}>Documents</div>
        <DownloadButton
          label="Download site plan (PDF)"
          href={`${downloadBase}&what=siteplan`}
          filenameHint="the site plan"
        />
        <DownloadButton
          label="Download terrain model (GLB)"
          href={`${downloadBase}&what=terrain&format=glb`}
          filenameHint="the terrain model"
        />
      </section>
    </div>
  );
}

/**
 * The STANDALONE read-only page — no longer routed (the share landing loads
 * the full app; see ShareFunnelApp), kept alive as the render host of the
 * shared content pieces and as a direct-render fallback surface.
 */
export function ShareView() {
  const [phase, setPhase] = useState<SharePhase>({ kind: "loading" });
  // Dossier is feature-detected and OPTIONAL: null keeps the pre-dossier page.
  const [dossier, setDossier] = useState<ShareDossierData | null>(null);
  const [token] = useState<string | null>(() =>
    typeof window === "undefined" ? null : shareTokenFromLocation(window.location),
  );

  useEffect(() => {
    if (!token) {
      setPhase({ kind: "invalid" });
      return;
    }
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

  if (phase.kind === "loading") {
    return (
      <CenterCard>
        <p data-testid="share-view-loading" style={{ margin: 0, color: MUTED }}>
          Loading shared property analysis…
        </p>
      </CenterCard>
    );
  }
  if (phase.kind === "expired" || phase.kind === "invalid") {
    return (
      <CenterCard>
        <strong style={{ fontSize: 15 }}>
          {phase.kind === "expired"
            ? "This share link has expired."
            : "This share link is invalid or has expired."}
        </strong>
        <p style={{ margin: "10px 0 0", color: MUTED, fontSize: 12 }}>
          Ask the person who shared it with you for a fresh link.
        </p>
      </CenterCard>
    );
  }
  if (phase.kind === "notice") {
    return (
      <CenterCard>
        <p data-testid="share-view-notice" style={{ margin: 0, color: AMBER }}>
          {phase.text}
        </p>
      </CenterCard>
    );
  }

  return (
    <div
      data-testid="share-view"
      style={{
        minHeight: "100vh",
        background: "#0b0e13",
        color: TEXT,
        font: "13px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        display: "flex",
        justifyContent: "center",
        padding: "28px 16px 60px",
      }}
    >
      <div style={{ width: "min(560px, 100%)" }}>
        <ShareAnalysisContent
          token={token ?? ""}
          data={phase.data}
          dossier={dossier}
          variant="page"
        />
      </div>
    </div>
  );
}
