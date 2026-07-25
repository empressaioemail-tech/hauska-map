import { useCallback, useEffect, useMemo, useState } from "react";
import {
  requestSitePlanExport,
  SITE_PLAN_FORMAT_OPTIONS,
  type SitePlanExportBffResponse,
  type SitePlanExportFormat,
} from "../lib/sitePlanExportClient";
import { googleSignInUrl } from "../lib/auth";

const MUTED = "#8b97a5";
const ACCENT = "#7dd3fc";
const WARN = "#c98b3a";

const HONESTY_LINE =
  "Derived from public GIS records. Not a boundary survey. Not for legal record.";

function filenameFor(parcelNodeId: string, format: string): string {
  const stem = parcelNodeId.replace(":", "_");
  if (format === "dxf-site-plan") return `${stem}_site_plan.dxf`;
  if (format === "ifc-site-plan") return `${stem}_site_plan.ifc`;
  if (format === "pdf-site-plan") return `${stem}_site_plan.pdf`;
  return `${stem}.bin`;
}

function blobHrefFromBase64(base64: string, contentType: string): string | null {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: contentType || "application/octet-stream" }));
  } catch {
    return null;
  }
}

export function SitePlanExportSection({
  parcelNodeId,
  address,
  countyName,
  onPaymentRequired,
}: {
  parcelNodeId: string;
  address?: string | null;
  countyName?: string | null;
  onPaymentRequired: () => void;
}) {
  const [format, setFormat] = useState<SitePlanExportFormat>("pdf-site-plan");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<SitePlanExportBffResponse | null>(null);

  const handleExport = useCallback(async () => {
    setBusy(true);
    setNotice("Building site plan…");
    setResult(null);
    const resp = await requestSitePlanExport(parcelNodeId, format, {
      address,
      countyName,
    });
    setBusy(false);

    if (!resp.ok) {
      if (resp.status === 401) {
        setNotice("Sign in to export the site plan for this parcel.");
        return;
      }
      if (resp.status === 402) {
        setNotice(null);
        onPaymentRequired();
        return;
      }
      if (resp.status === 422) {
        // Anti-fabrication stays (422); only the customer copy is soft.
        setNotice("Setbacks not available for this parcel yet.");
        return;
      }
      // 502/503: real upstream/config errors — never open the Stripe paywall.
      setNotice(resp.message ?? `Export failed (${resp.status || "network"}).`);
      return;
    }

    setResult(resp.data);
    setNotice("Site plan ready — download below.");
  }, [address, countyName, format, onPaymentRequired, parcelNodeId]);

  const inline = result?.inlineDownload;
  const inlineMatches =
    !!inline &&
    inline.format === format &&
    typeof inline.base64 === "string" &&
    inline.base64.length > 0;

  const blobHref = useMemo(() => {
    if (!inlineMatches || !inline) return null;
    return blobHrefFromBase64(inline.base64, inline.contentType);
  }, [inline, inlineMatches]);

  useEffect(() => {
    return () => {
      if (blobHref) URL.revokeObjectURL(blobHref);
    };
  }, [blobHref]);

  // Prefer MCP-inlined bytes (already gate-proxied). Fall back to BFF GET
  // which stamps full gate-front headers for engine-api.
  const selectedDownload =
    blobHref ??
    (result?.selectedFormat === format
      ? (result.downloads?.[format] ?? result.downloadUrl ?? null)
      : (result?.downloads?.[format] ?? null));
  const selectedMeta = result?.atom.artifacts?.[format];
  const downloadName = filenameFor(parcelNodeId, format);

  return (
    <div
      data-testid="site-plan-export-section"
      style={{
        marginTop: 10,
        paddingTop: 10,
        borderTop: "0.5px solid rgba(154,166,178,0.22)",
      }}
    >
      <div style={{ fontSize: 10, color: MUTED, marginBottom: 6 }}>
        Site-plan export · public-paid
      </div>

      <label style={{ display: "block", fontSize: 10.5, color: MUTED, marginBottom: 4 }}>
        Format
      </label>
      <select
        data-testid="site-plan-format-picker"
        value={format}
        disabled={busy}
        onChange={(e) => setFormat(e.target.value as SitePlanExportFormat)}
        style={{
          width: "100%",
          marginBottom: 8,
          padding: "6px 8px",
          borderRadius: 6,
          border: "0.5px solid rgba(154,166,178,0.35)",
          background: "rgba(6,9,13,0.6)",
          color: "#e6edf3",
          fontSize: 12,
        }}
      >
        {SITE_PLAN_FORMAT_OPTIONS.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>

      <button
        type="button"
        data-testid="site-plan-export-run"
        disabled={busy}
        onClick={() => void handleExport()}
        style={{
          width: "100%",
          padding: "7px 10px",
          borderRadius: 7,
          border: "0.5px solid rgba(125,211,252,0.35)",
          background: busy ? "transparent" : "rgba(125,211,252,0.12)",
          color: ACCENT,
          fontWeight: 600,
          fontSize: 12,
          cursor: busy ? "default" : "pointer",
          opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? "Building…" : "Export site plan"}
      </button>

      {notice && (
        <div
          data-testid="site-plan-export-notice"
          style={{ marginTop: 8, fontSize: 10.5, color: MUTED, lineHeight: 1.45 }}
        >
          {notice}
          {notice.includes("Sign in") && (
            <>
              {" "}
              <a
                href={googleSignInUrl()}
                style={{ color: ACCENT }}
                data-testid="site-plan-export-sign-in"
              >
                Continue with Google
              </a>
            </>
          )}
        </div>
      )}

      {result && (
        <div data-testid="site-plan-export-result" style={{ marginTop: 8 }}>
          <div
            data-testid="site-plan-source-citation"
            style={{ fontSize: 10.5, color: "#c6d0dc", lineHeight: 1.45 }}
          >
            Source: {result.atom.sourceCitation ?? "Parcel GIS + setback-rule + USGS 3DEP"}
            {result.atom.fetchedAt ? ` · ${result.atom.fetchedAt.slice(0, 10)}` : ""}
          </div>
          <div
            data-testid="site-plan-confidence"
            style={{ fontSize: 10.5, color: MUTED, marginTop: 4, lineHeight: 1.45 }}
          >
            Confidence{" "}
            {typeof result.atom.confidence?.value === "number"
              ? result.atom.confidence.value.toFixed(2)
              : "—"}
            {result.atom.confidence?.kind ? ` (${result.atom.confidence.kind})` : ""}
            {result.atom.confidence?.provenance
              ? ` · ${result.atom.confidence.provenance}`
              : ""}
          </div>

          {selectedDownload ? (
            <a
              href={selectedDownload}
              download={downloadName}
              data-testid="site-plan-download-link"
              style={{
                display: "inline-block",
                marginTop: 8,
                fontSize: 12,
                fontWeight: 600,
                color: ACCENT,
              }}
            >
              Download {format}
              {selectedMeta?.byteCount
                ? ` (${Math.round(selectedMeta.byteCount / 1024)} KB)`
                : inlineMatches && inline?.byteCount
                  ? ` (${Math.round(inline.byteCount / 1024)} KB)`
                  : ""}
            </a>
          ) : result && result.selectedFormat !== format ? (
            <div style={{ marginTop: 8, fontSize: 10.5, color: WARN }}>
              Click Export site plan again for {format}.
            </div>
          ) : (
            <div style={{ marginTop: 8, fontSize: 10.5, color: WARN }}>
              Selected format unavailable in this export.
            </div>
          )}

          {result.setbackDegenerate && (
            <div
              data-testid="site-plan-setback-degenerate"
              style={{ marginTop: 6, fontSize: 10, color: WARN, lineHeight: 1.4 }}
            >
              Setback offset degenerate — {result.setbackDegenerateReason ?? "lot geometry could not support the offset."}
            </div>
          )}

          {result.streetHonestAbsence && (
            <div
              data-testid="site-plan-street-absence"
              style={{ marginTop: 6, fontSize: 10, color: MUTED, lineHeight: 1.4 }}
            >
              STREET layer: no road-anchor data on file for this parcel yet.
            </div>
          )}

          {result.floodZoneHonestUnavailable && (
            <div
              data-testid="site-plan-flood-unavailable"
              style={{ marginTop: 6, fontSize: 10, color: MUTED, lineHeight: 1.4 }}
            >
              Flood zone: unavailable this refresh (FEMA lookup did not resolve).
            </div>
          )}

          <div
            data-testid="site-plan-honesty-line"
            style={{ marginTop: 8, fontSize: 10, color: MUTED, lineHeight: 1.4, fontStyle: "italic" }}
          >
            {HONESTY_LINE}
          </div>

          {(format === "dxf-site-plan" || format === "ifc-site-plan") && (
            <div
              data-testid="site-plan-revit-hint"
              style={{ marginTop: 6, fontSize: 10, color: MUTED, lineHeight: 1.4 }}
            >
              Revit: Link CAD (not Import) into a floor/site plan. Units meters.
              After link, Zoom to Fit — geometry is local meters near the origin.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
