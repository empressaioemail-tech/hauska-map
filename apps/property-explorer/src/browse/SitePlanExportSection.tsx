import { useCallback, useEffect, useMemo, useState } from "react";
import {
  requestSitePlanExport,
  SITE_PLAN_FORMAT_OPTIONS,
  type SitePlanExportBffResponse,
  type SitePlanExportFormat,
} from "../lib/sitePlanExportClient";
import { GoogleSignInButton } from "../components/GoogleSignInButton";
import { Button } from "../components/Button";
import { PE } from "../styles/pe-chrome";
import {
  DownloadFileButton,
  downloadFormatLabel,
  formatByteCount,
} from "../components/DownloadFileButton";

const MUTED = PE.muted;
const WARN = PE.warning;

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

/**
 * W2: the JSON-serializable snapshot of this section's user-visible outcome —
 * the Reports workbench tool persists it per property (useDockToolState) so
 * the last export result + download link survive dock close/reopen. Exactly
 * what the UI shows: transient busy states are never persisted.
 */
export interface SitePlanExportSectionState {
  format: SitePlanExportFormat;
  notice: string | null;
  result: SitePlanExportBffResponse | null;
}

export function SitePlanExportSection({
  parcelNodeId,
  address,
  countyName,
  onPaymentRequired,
  initialState,
  onStateChange,
  embed,
  lockedFormat,
}: {
  parcelNodeId: string;
  address?: string | null;
  countyName?: string | null;
  onPaymentRequired: () => void;
  /** Seed from a persisted snapshot (W2 Reports tool). Read at mount only —
   *  remount (key on the property) when the active property changes. */
  initialState?: SitePlanExportSectionState | null;
  /** Fires with the full snapshot on every terminal outcome + format change. */
  onStateChange?: (next: SitePlanExportSectionState) => void;
  /** Option D: drop the section title / top rule — the picker card owns them. */
  embed?: boolean;
  /** Option D: the picker already chose the format. Hide the in-section select. */
  lockedFormat?: SitePlanExportFormat;
}) {
  const [format, setFormat] = useState<SitePlanExportFormat>(
    lockedFormat ?? initialState?.format ?? "pdf-site-plan",
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(
    initialState?.notice ?? null,
  );
  const [result, setResult] = useState<SitePlanExportBffResponse | null>(
    initialState?.result ?? null,
  );

  // Persist the honest terminal state: what the section shows is what survives.
  const settle = useCallback(
    (next: SitePlanExportSectionState) => {
      setFormat(next.format);
      setNotice(next.notice);
      setResult(next.result);
      onStateChange?.(next);
    },
    [onStateChange],
  );

  const handleExport = useCallback(async () => {
    setBusy(true);
    setNotice("Building site plan…");
    setResult(null);
    // P-39: address and county come off the SUBJECT'S sealed fact sheet inside
    // the client, so a panel can no longer hand an export a stale header.
    const resp = await requestSitePlanExport(parcelNodeId, format);
    setBusy(false);

    if (!resp.ok) {
      if (resp.status === 401) {
        settle({
          format,
          notice: "Sign in to export the site plan for this parcel.",
          result: null,
        });
        return;
      }
      if (resp.status === 402) {
        settle({ format, notice: null, result: null });
        onPaymentRequired();
        return;
      }
      if (resp.status === 422) {
        // Anti-fabrication stays (422); only the customer copy is soft.
        settle({
          format,
          notice: "Setbacks not available for this parcel yet.",
          result: null,
        });
        return;
      }
      // 502/503: real upstream/config errors — never open the Stripe paywall.
      settle({
        format,
        notice: resp.message ?? `Export failed (${resp.status || "network"}).`,
        result: null,
      });
      return;
    }

    settle({
      format,
      notice: "Site plan ready — download above.",
      result: resp.data,
    });
  }, [address, countyName, format, onPaymentRequired, parcelNodeId, settle]);

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
  const sizeLabel = formatByteCount(
    selectedMeta?.byteCount ?? (inlineMatches ? inline?.byteCount : null),
  );
  const hasFile = !!selectedDownload;

  return (
    <div
      data-testid="site-plan-export-section"
      style={
        embed
          ? undefined
          : {
              marginTop: 10,
              paddingTop: 10,
              borderTop: "0.5px solid var(--ss-line-14)",
            }
      }
    >
      {embed ? null : (
        <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 6 }}>
          Site-plan export · paid
        </div>
      )}

      {lockedFormat ? null : (
        <>
          <label style={{ display: "block", fontSize: 12.5, color: MUTED, marginBottom: 4 }}>
            Format
          </label>
          <select
            className="ss-focusable"
            data-testid="site-plan-format-picker"
            value={format}
            disabled={busy}
            onChange={(e) =>
              settle({
                format: e.target.value as SitePlanExportFormat,
                notice,
                result,
              })
            }
            style={{
              width: "100%",
              marginBottom: 8,
              padding: "6px 8px",
              borderRadius: 10,
              border: "0.5px solid var(--ss-line-28)",
              background: "rgba(6,9,13,0.6)",
              color: PE.t2,
              fontSize: 14.5,
            }}
          >
            {SITE_PLAN_FORMAT_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </>
      )}

      {hasFile ? (
        <DownloadFileButton
          href={selectedDownload}
          download={downloadName}
          label={`Download ${downloadFormatLabel(format)}`}
          sizeLabel={sizeLabel}
          testId="site-plan-download-link"
        />
      ) : busy ? (
        <DownloadFileButton
          label={`Download ${downloadFormatLabel(format)}`}
          state="generating"
          testId="site-plan-download-link"
        />
      ) : null}

      {notice && (
        <div
          data-testid="site-plan-export-notice"
          style={{ marginTop: 8, fontSize: 12.5, color: MUTED, lineHeight: 1.45 }}
        >
          {notice}
          {notice.includes("Sign in") && (
            <>
              {" "}
              <GoogleSignInButton
                size="md"
                testId="site-plan-export-sign-in"
              />
            </>
          )}
        </div>
      )}

      {hasFile ? null : (
        <Button
          variant="primary"
          fullWidth
          type="button"
          data-testid="site-plan-export-run"
          disabled={busy}
          onClick={() => void handleExport()}
          style={{ marginTop: notice || busy ? 8 : 0 }}
        >
          {busy ? "Building…" : "Export site plan"}
        </Button>
      )}

      {result && (
        <div data-testid="site-plan-export-result" style={{ marginTop: 8 }}>
          <div
            data-testid="site-plan-source-citation"
            style={{ fontSize: 12.5, color: PE.t3, lineHeight: 1.45 }}
          >
            Source: {result.atom.sourceCitation ?? "Parcel GIS + setback-rule + USGS 3DEP"}
            {result.atom.fetchedAt ? ` · ${result.atom.fetchedAt.slice(0, 10)}` : ""}
          </div>
          <div
            data-testid="site-plan-confidence"
            style={{ fontSize: 12.5, color: MUTED, marginTop: 4, lineHeight: 1.45 }}
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

          {!selectedDownload && result.selectedFormat !== format ? (
            <div style={{ marginTop: 8, fontSize: 12.5, color: WARN }}>
              Click Re-run again for {format}.
            </div>
          ) : !selectedDownload ? (
            <div style={{ marginTop: 8, fontSize: 12.5, color: WARN }}>
              Selected format unavailable in this export.
            </div>
          ) : null}

          {result.setbackHonestAbsence && (
            <div
              data-testid="site-plan-setback-absence"
              style={{ marginTop: 6, fontSize: 11.5, color: MUTED, lineHeight: 1.4 }}
            >
              Setback layer: {result.setbackHonestAbsenceReason ??
                "no setback rule on file for this parcel — setbacks not specified here and not verified."}
            </div>
          )}

          {result.setbackDegenerate && (
            <div
              data-testid="site-plan-setback-degenerate"
              style={{ marginTop: 6, fontSize: 11.5, color: WARN, lineHeight: 1.4 }}
            >
              Setback offset degenerate — {result.setbackDegenerateReason ?? "lot geometry could not support the offset."}
            </div>
          )}

          {result.streetHonestAbsence && (
            <div
              data-testid="site-plan-street-absence"
              style={{ marginTop: 6, fontSize: 11.5, color: MUTED, lineHeight: 1.4 }}
            >
              STREET layer: no road-node attaches to this parcel yet.
            </div>
          )}

          {result.floodZoneHonestUnavailable && (
            <div
              data-testid="site-plan-flood-unavailable"
              style={{ marginTop: 6, fontSize: 11.5, color: MUTED, lineHeight: 1.4 }}
            >
              Flood zone: unavailable this refresh (FEMA lookup did not resolve).
            </div>
          )}

          <div
            data-testid="site-plan-honesty-line"
            style={{ marginTop: 8, fontSize: 11.5, color: MUTED, lineHeight: 1.4, fontStyle: "italic" }}
          >
            {HONESTY_LINE}
          </div>

          {(format === "dxf-site-plan" || format === "ifc-site-plan") && (
            <div
              data-testid="site-plan-revit-hint"
              style={{ marginTop: 6, fontSize: 11.5, color: MUTED, lineHeight: 1.4 }}
            >
              Revit: Link CAD (not Import) into a floor/site plan. Units meters.
              After link, Zoom to Fit — geometry is local meters near the origin.
            </div>
          )}
        </div>
      )}

      {hasFile ? (
        <Button
          variant="secondary"
          fullWidth
          type="button"
          data-testid="site-plan-export-run"
          disabled={busy}
          onClick={() => void handleExport()}
          style={{ marginTop: 8 }}
        >
          {busy ? "Building…" : "Re-run"}
        </Button>
      ) : null}
    </div>
  );
}
