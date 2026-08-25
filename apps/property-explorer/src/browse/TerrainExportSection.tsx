import { useCallback, useEffect, useMemo, useState } from "react";
import {
  requestTerrainExport,
  TERRAIN_FORMAT_OPTIONS,
  type TerrainExportBffResponse,
  type TerrainExportFormat,
} from "../lib/terrainExportClient";
import { GoogleSignInButton } from "../components/GoogleSignInButton";
import { Button } from "../components/Button";

const MUTED = "var(--surface-muted, #94A3B8)";
const ACCENT = "var(--brand-blue, #3B82F6)"; // PRIMARY interactive hue (was cyan #7dd3fc)
const WARN = "var(--semantic-warning, #F59E0B)"; // caution notice (was ochre #c98b3a)

function filenameFor(parcelNodeId: string, format: string): string {
  const stem = parcelNodeId.replace(":", "_");
  if (format === "glb") return `${stem}.glb`;
  if (format === "ifc") return `${stem}.ifc`;
  if (format === "dxf-3dface") return `${stem}_3dface.dxf`;
  if (format === "dxf-contour") return `${stem}_contour.dxf`;
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
 * persisted per property by the Reports workbench tool (useDockToolState) so
 * the last export result + download link survive dock close/reopen.
 */
export interface TerrainExportSectionState {
  format: TerrainExportFormat;
  notice: string | null;
  result: TerrainExportBffResponse | null;
}

export function TerrainExportSection({
  parcelNodeId,
  onPaymentRequired,
  initialState,
  onStateChange,
  embed,
  lockedFormat,
}: {
  parcelNodeId: string;
  onPaymentRequired: () => void;
  /** Seed from a persisted snapshot (W2 Reports tool). Read at mount only —
   *  remount (key on the property) when the active property changes. */
  initialState?: TerrainExportSectionState | null;
  /** Fires with the full snapshot on every terminal outcome + format change. */
  onStateChange?: (next: TerrainExportSectionState) => void;
  /** Option D: drop the section title / top rule — the picker card owns them. */
  embed?: boolean;
  /** Option D: the picker already chose the format. Hide the in-section select. */
  lockedFormat?: TerrainExportFormat;
}) {
  const [format, setFormat] = useState<TerrainExportFormat>(
    lockedFormat ?? initialState?.format ?? "glb",
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(
    initialState?.notice ?? null,
  );
  const [result, setResult] = useState<TerrainExportBffResponse | null>(
    initialState?.result ?? null,
  );

  // Persist the honest terminal state: what the section shows is what survives.
  const settle = useCallback(
    (next: TerrainExportSectionState) => {
      setFormat(next.format);
      setNotice(next.notice);
      setResult(next.result);
      onStateChange?.(next);
    },
    [onStateChange],
  );

  const handleExport = useCallback(async () => {
    setBusy(true);
    setNotice("Exporting terrain…");
    setResult(null);
    const resp = await requestTerrainExport(parcelNodeId, format);
    setBusy(false);

    if (!resp.ok) {
      if (resp.status === 401) {
        settle({
          format,
          notice: "Sign in to export terrain for this parcel.",
          result: null,
        });
        return;
      }
      if (resp.status === 402) {
        settle({ format, notice: null, result: null });
        onPaymentRequired();
        return;
      }
      settle({
        format,
        notice: resp.message ?? `Export failed (${resp.status || "network"}).`,
        result: null,
      });
      return;
    }

    settle({
      format,
      notice: "Terrain export ready — download below.",
      result: resp.data,
    });
  }, [format, onPaymentRequired, parcelNodeId, settle]);

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
  // which now stamps full gate-front headers for engine-api.
  const selectedDownload =
    blobHref ??
    (result?.selectedFormat === format
      ? (result.downloads?.[format] ?? result.downloadUrl ?? null)
      : (result?.downloads?.[format] ?? null));
  const selectedMeta = result?.atom.artifacts?.[format];
  const landxml = result?.atom.artifacts?.["landxml-tin"];
  const downloadName = filenameFor(parcelNodeId, format);

  return (
    <div
      data-testid="terrain-export-section"
      style={
        embed
          ? undefined
          : {
              marginTop: 10,
              paddingTop: 10,
              borderTop: "0.5px solid rgba(154,166,178,0.22)",
            }
      }
    >
      {embed ? null : (
        <div style={{ fontSize: 10, color: MUTED, marginBottom: 6 }}>
          Terrain export · paid
        </div>
      )}

      {lockedFormat ? null : (
        <>
          <label style={{ display: "block", fontSize: 10.5, color: MUTED, marginBottom: 4 }}>
            Format
          </label>
          <select
            data-testid="terrain-format-picker"
            value={format}
            disabled={busy}
            onChange={(e) =>
              settle({
                format: e.target.value as TerrainExportFormat,
                notice,
                result,
              })
            }
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
            {TERRAIN_FORMAT_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
            <option value="landxml-tin" disabled>
              LandXML TIN (deferred)
            </option>
          </select>
        </>
      )}

      <Button
        variant="primary"
        fullWidth
        type="button"
        data-testid="terrain-export-run"
        disabled={busy}
        onClick={() => void handleExport()}
      >
        {busy ? "Exporting…" : "Export terrain"}
      </Button>

      {notice && (
        <div
          data-testid="terrain-export-notice"
          style={{ marginTop: 8, fontSize: 10.5, color: MUTED, lineHeight: 1.45 }}
        >
          {notice}
          {notice.includes("Sign in") && (
            <>
              {" "}
              <GoogleSignInButton
                size="md"
                testId="terrain-export-sign-in"
              />
            </>
          )}
        </div>
      )}

      {result && (
        <div data-testid="terrain-export-result" style={{ marginTop: 8 }}>
          <div
            data-testid="terrain-source-citation"
            style={{ fontSize: 10.5, color: "#c6d0dc", lineHeight: 1.45 }}
          >
            Source: {result.atom.sourceCitation ?? "USGS 3DEP"}
            {result.atom.fetchedAt ? ` · ${result.atom.fetchedAt.slice(0, 10)}` : ""}
          </div>
          <div
            data-testid="terrain-confidence"
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
              data-testid="terrain-download-link"
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
              Click Export terrain again for {format}.
            </div>
          ) : (
            <div style={{ marginTop: 8, fontSize: 10.5, color: WARN }}>
              Selected format unavailable in this export.
            </div>
          )}

          {landxml?.deferred && (
            <div
              data-testid="terrain-landxml-deferred"
              style={{ marginTop: 6, fontSize: 10, color: MUTED, lineHeight: 1.4 }}
            >
              LandXML TIN deferred - {landxml.deferredReason ?? "writer not shipped this phase."}
            </div>
          )}

          {(format === "dxf-contour" || format === "dxf-3dface") && (
            <div
              data-testid="terrain-revit-hint"
              style={{ marginTop: 6, fontSize: 10, color: MUTED, lineHeight: 1.4 }}
            >
              Revit: Link CAD (not Import) into a floor/site plan. Units meters.
              After link, Zoom to Fit - geometry is local meters near the origin.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
