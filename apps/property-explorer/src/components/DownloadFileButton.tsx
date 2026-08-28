import { useState, type CSSProperties } from "react";
import { Button } from "./Button";
import { PdfViewer } from "./PdfViewer";
import { PE, MOTION } from "../styles/pe-chrome";
import { Spinner } from "./Loading";

// A FINISHED FILE IS ALWAYS A BUTTON, NEVER A TEXT LINK.
//
// 36 tall, radius 6, a line-28 edge. Blue download glyph, a 12.5/600 verb in
// t1, and the REAL byte size in mono on the right.
//
//   generating  the spinner replaces the glyph, the label drops to t3, and the
//               right side carries a DURATION ESTIMATE — never a fake size.
//               No estimate available means nothing is printed there; an
//               invented number is worse than an absence.
//   failed      error border and fill, alert glyph, and a blue Retry.
//
// This control is always outlined: it must never be the second filled primary
// on a surface that already has one.

export type DownloadFileState = "ready" | "generating" | "failed";

export function downloadFormatLabel(format: string): string {
  if (format === "pdf-site-plan" || format === "pdf-flood-drainage") return "PDF";
  if (format === "dxf-site-plan" || format === "dxf-contour" || format === "dxf-3dface") {
    return "DXF";
  }
  if (format === "ifc-site-plan") return "IFC";
  if (format === "ifc") return "IFC4";
  if (format === "glb") return "GLB";
  return format;
}

export function formatByteCount(bytes: number | null | undefined): string | null {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) {
    return null;
  }
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return `${mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
  }
  return `${Math.round(bytes / 1024)} KB`;
}

const SHELL: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  width: "100%",
  height: 36,
  boxSizing: "border-box",
  padding: "0 12px",
  borderRadius: PE.rTouch,
  border: `1px solid ${PE.line28}`,
  background: "transparent",
  color: PE.t1,
  textDecoration: "none",
  fontFamily: PE.ui,
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
  transition: `background ${MOTION.state}, border-color ${MOTION.state}`,
};

function ArrowGlyph({ color }: { color: string }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flex: "none" }}
    >
      <path d="M12 4v11" />
      <path d="M7 11l5 5 5-5" />
      <path d="M4 20h16" />
    </svg>
  );
}

function AlertGlyph({ color }: { color: string }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flex: "none" }}
    >
      <path d="M12 3 2 20h20L12 3z M12 10v4 M12 17h.01" />
    </svg>
  );
}

export function DownloadFileButton({
  href,
  download,
  label,
  sizeLabel,
  etaLabel,
  onRetry,
  state = "ready",
  testId,
  parcelNodeId,
  grantId,
}: {
  href?: string | null;
  download?: string;
  label: string;
  sizeLabel?: string | null;
  /** While generating: a real duration estimate, e.g. "about 40s". Omitted
   *  means nothing is drawn there — never a placeholder size. */
  etaLabel?: string | null;
  /** Failed state only. Renders the blue Retry. */
  onRetry?: () => void;
  state?: DownloadFileState;
  testId: string;
  parcelNodeId?: string | null;
  grantId?: string | null;
}) {
  const generating = state === "generating";
  const failed = state === "failed";
  const ready = state === "ready" && !!href;

  const border = failed
    ? `1px solid rgba(239,68,68,.28)`
    : `1px solid ${PE.line28}`;
  const background = failed ? "rgba(239,68,68,.06)" : "transparent";
  const glyphColor = failed ? PE.err : PE.blue;

  // The right-hand slot: a real size when the file is real, a real duration
  // estimate while it is being built, and NOTHING when neither is known.
  const rightSlot = failed ? null : generating ? etaLabel : sizeLabel;

  const inner = (
    <>
      {generating ? <Spinner /> : failed ? (
        <AlertGlyph color={glyphColor} />
      ) : (
        <ArrowGlyph color={glyphColor} />
      )}
      <span
        style={{
          flex: 1,
          textAlign: "left",
          color: generating ? PE.t3 : failed ? PE.t2 : PE.t1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {generating ? "Generating sheet" : failed ? "Export failed" : label}
      </span>
      {rightSlot ? (
        <span
          style={{
            flex: "none",
            fontFamily: PE.mono,
            fontSize: 11,
            fontWeight: 400,
            color: PE.t5,
          }}
        >
          {rightSlot}
        </span>
      ) : null}
      {failed && onRetry ? (
        <Button
          type="button"
          className="pe-btn"
          data-testid={`${testId}-retry`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRetry();
          }}
          style={{
            flex: "none",
            background: "transparent",
            border: "none",
            padding: 0,
            height: "auto",
            color: PE.blue,
            fontFamily: PE.ui,
            fontSize: 11.5,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Retry
        </Button>
      ) : null}
    </>
  );

  const style = { ...SHELL, border, background, cursor: ready ? "pointer" : "default" };
  const [viewerOpen, setViewerOpen] = useState(false);
  const pdfHref = href && /pdf/i.test(`${href} ${download ?? ""} ${label}`);

  if (ready && href) {
    return (
      <div data-testid={`${testId}-wrap`}>
        {pdfHref ? (
          <Button
            type="button"
            className="pe-btn"
            data-testid={`${testId}-view`}
            onClick={() => setViewerOpen(true)}
            style={{ ...style, marginBottom: 6 }}
          >
            <ArrowGlyph color={glyphColor} />
            <span style={{ flex: 1, textAlign: "left", color: PE.t1 }}>View PDF</span>
          </Button>
        ) : null}
        <a
          href={href}
          download={download}
          data-testid={testId}
          className="pe-btn"
          style={style}
        >
          {inner}
        </a>
        {viewerOpen ? (
          <PdfViewer
            href={href}
            title={label}
            parcelNodeId={parcelNodeId}
            grantId={grantId}
            onClose={() => setViewerOpen(false)}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div data-testid={testId} data-state={state} style={style} aria-disabled="true">
      {inner}
    </div>
  );
}
