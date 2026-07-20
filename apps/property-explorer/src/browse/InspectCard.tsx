// apps/property-explorer/src/browse/InspectCard.tsx
//
// INSPECT-IN-PLACE card. Drawn on the map when the user clicks a parcel. Shows
// base facts (from the live-GIS parcel click) plus zoning + setbacks + the
// buildable envelope, fetched via the PORTED buildable-envelope client and
// folded into the PORTED parcel-node store as the `inspected` node.
//
// NO brief, NO AI on click. The "Research this" button is a STUB seam (the
// ask/report path is behind auth — Track D + the AI track). Honesty
// (commitment #1): the envelope is always approximate / not survey grade, so
// the card renders that treatment whenever envelope facets are present.

import { useEffect, useState } from "react";
import type { ParcelCardData } from "./liveGis";
import { fetchBuildableEnvelope } from "../lib/buildable-envelope.js";
import { CORTEX_PROXY_BASE } from "../lib/config";

const CARD_BG = "rgba(13,17,23,0.94)";
const MUTED = "#8b97a5";
const ACCENT = "#7dd3fc";

interface EnvelopeState {
  status: "idle" | "loading" | "ok" | "empty" | "error";
  setbacks?: {
    front_ft: number | null;
    side_ft: number | null;
    rear_ft: number | null;
    district: string | null;
  } | null;
  summary?: Record<string, unknown> | null;
  disclosure?: string | null;
  reason?: string | null;
  district?: string | null;
}

export function InspectCard({
  card,
  isSubject = false,
  onClose,
  onEnvelope,
  onMakeSubject,
  onResearch,
}: {
  card: ParcelCardData;
  // True when this inspected parcel is ALSO the current subject.
  isSubject?: boolean;
  onClose: () => void;
  // Fires when the envelope resolves so the parent can fold setbacks/envelope
  // into the ported node store (the subject/inspected source of truth).
  onEnvelope?: (result: unknown) => void;
  // The DISTINCT, explicit make-subject action. Re-points the LIVE map to this
  // parcel via the persistent-map API (rebindProperty + resolveSubjectAndFit) —
  // no remount. Separate from inspect (which is passive/in-place) and from the
  // stubbed ask/report path.
  onMakeSubject: () => void;
  // STUB seam (Track D / AI): "Research this" — no-op until auth + ask/report.
  onResearch: () => void;
}) {
  const [env, setEnv] = useState<EnvelopeState>({ status: "idle" });

  // Fetch the buildable envelope for the clicked parcel via the ported client.
  // Address-primary; falls back to the click's coords. Same-origin proxy, no key.
  useEffect(() => {
    let cancelled = false;
    const sel = {
      address: card.situsAddress,
      lat: card.lat,
      lng: card.lng,
    };
    setEnv({ status: "loading" });
    fetchBuildableEnvelope(sel, CORTEX_PROXY_BASE)
      .then((result: any) => {
        if (cancelled) return;
        onEnvelope?.(result);
        if (result?.ok) {
          setEnv({
            status: "ok",
            setbacks: result.setbacks,
            summary: result.summary,
            disclosure: result.disclosure,
            district: result.setbacks?.district ?? null,
          });
        } else if (result?.status === "no-buildable-area") {
          setEnv({
            status: "empty",
            setbacks: result.setbacks,
            reason: result.reason,
            district: result.setbacks?.district ?? null,
          });
        } else {
          setEnv({ status: "error", reason: result?.reason });
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setEnv({ status: "error", reason: (e as Error)?.message });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.apn, card.situsAddress, card.lat, card.lng]);

  const s = env.setbacks;
  const setbackLine =
    s && (s.front_ft != null || s.side_ft != null || s.rear_ft != null)
      ? `F ${fmtFt(s.front_ft)} · S ${fmtFt(s.side_ft)} · R ${fmtFt(s.rear_ft)}`
      : null;
  const buildablePct =
    env.summary && typeof env.summary.buildableAreaPct === "number"
      ? `${Math.round(env.summary.buildableAreaPct as number)}%`
      : null;

  return (
    <div
      data-testid="inspect-card"
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        zIndex: 12,
        width: 288,
        maxWidth: "calc(100% - 60px)",
        padding: "13px 15px",
        borderRadius: 10,
        background: CARD_BG,
        border: "0.5px solid rgba(125,211,252,0.28)",
        color: "#e6edf3",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        fontSize: 12,
        lineHeight: 1.5,
        boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 8,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 13 }}>
          {card.situsAddress || (card.apn ? `Parcel ${card.apn}` : "Parcel")}
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            color: MUTED,
            cursor: "pointer",
            fontSize: 15,
            lineHeight: 1,
            padding: 0,
          }}
        >
          ×
        </button>
      </div>

      <dl
        style={{
          margin: "9px 0 0",
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: "3px 10px",
        }}
      >
        <Row label="APN" value={card.apn} testid="inspect-apn" />
        <Row label="Owner" value={card.owner} />
        <Row label="Land use" value={card.landUseDescription} />
        <Row label="County" value={card.county} />
        <Row
          label="Zoning"
          value={env.district ?? (env.status === "loading" ? "…" : null)}
        />
        <Row label="Setbacks" value={setbackLine ?? (env.status === "loading" ? "…" : null)} />
        <Row label="Buildable" value={buildablePct} />
      </dl>

      {/* Honest coverage/disclosure states. */}
      {env.status === "loading" && (
        <div style={{ marginTop: 8, fontSize: 10.5, color: MUTED }}>
          Reading zoning &amp; setbacks…
        </div>
      )}
      {env.status === "empty" && (
        <div style={{ marginTop: 8, fontSize: 10.5, color: "#fcd34d" }}>
          {env.reason || "No buildable area — setbacks consume the lot."}
        </div>
      )}
      {env.status === "error" && (
        <div style={{ marginTop: 8, fontSize: 10.5, color: MUTED }}>
          Zoning &amp; setbacks unavailable for this parcel yet.
        </div>
      )}
      {(env.status === "ok" || env.status === "empty") && (
        <div style={{ marginTop: 8, fontSize: 10, color: MUTED }}>
          Approximate — not survey grade. Verify with the city.
        </div>
      )}
      {card.provider && (
        <div style={{ marginTop: 4, fontSize: 10, color: MUTED }}>
          Source: {card.provider}
          {card.retrievedAt ? ` · ${card.retrievedAt.slice(0, 10)}` : ""}
        </div>
      )}

      {/* DISTINCT explicit action: make this inspected parcel the SUBJECT. Drives
          the persistent-map re-point (rebindProperty + resolveSubjectAndFit) on
          the LIVE map — never a remount. Separate from the stubbed ask/report. */}
      <button
        type="button"
        data-testid="make-subject"
        onClick={onMakeSubject}
        disabled={isSubject}
        aria-pressed={isSubject}
        style={{
          width: "100%",
          marginTop: 11,
          padding: "8px 12px",
          fontSize: 12.5,
          fontWeight: 600,
          color: isSubject ? MUTED : "#0d1117",
          background: isSubject ? "transparent" : ACCENT,
          border: isSubject
            ? "0.5px solid rgba(125,211,252,0.35)"
            : "none",
          borderRadius: 7,
          cursor: isSubject ? "default" : "pointer",
        }}
      >
        {isSubject ? "Subject property" : "Make subject"}
      </button>

      {/* STUB seam (Track D / AI): the ask/report path is behind auth. */}
      <button
        type="button"
        data-testid="research-this"
        onClick={onResearch}
        style={{
          width: "100%",
          marginTop: 8,
          padding: "8px 12px",
          fontSize: 12.5,
          fontWeight: 600,
          color: ACCENT,
          background: "transparent",
          border: "0.5px solid rgba(125,211,252,0.35)",
          borderRadius: 7,
          cursor: "pointer",
        }}
      >
        Research this →
      </button>
    </div>
  );
}

function Row({
  label,
  value,
  testid,
}: {
  label: string;
  value: string | null | undefined;
  testid?: string;
}) {
  if (!value) return null;
  return (
    <>
      <dt style={{ color: MUTED }}>{label}</dt>
      <dd style={{ margin: 0 }} data-testid={testid}>
        {value}
      </dd>
    </>
  );
}

function fmtFt(n: number | null | undefined): string {
  return typeof n === "number" ? `${n}′` : "—";
}
