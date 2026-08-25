import type { CSSProperties } from "react";

// 4a — a finished file is a button, never a text link.
// Glyph left, verb + format, size monospace right when a real byteCount exists.
// Never two filled primaries in one card: this control is always outlined.

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
  gap: 11,
  width: "100%",
  minHeight: 44,
  boxSizing: "border-box",
  padding: "0 15px",
  borderRadius: 6,
  border: "1px solid rgba(59,130,246,0.55)",
  background: "rgba(59,130,246,0.10)",
  color: "var(--text-body, #E9EEF5)",
  textDecoration: "none",
  fontFamily: "inherit",
  fontSize: 13.5,
  fontWeight: 600,
  cursor: "pointer",
};

function ArrowGlyph({ color }: { color: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 4v11" />
      <path d="M7 11l5 5 5-5" />
      <path d="M4 20h16" />
    </svg>
  );
}

export function DownloadFileButton({
  href,
  download,
  label,
  sizeLabel,
  state = "ready",
  testId,
}: {
  href?: string | null;
  download?: string;
  label: string;
  sizeLabel?: string | null;
  state?: DownloadFileState;
  testId: string;
}) {
  const generating = state === "generating";
  const failed = state === "failed";
  const ready = state === "ready" && !!href;
  const border = failed
    ? "1px solid rgba(245,158,11,0.45)"
    : generating
      ? "1px solid rgba(154,166,178,0.3)"
      : "1px solid rgba(59,130,246,0.55)";
  const background = failed
    ? "rgba(245,158,11,0.07)"
    : generating
      ? "rgba(20,25,33,0.9)"
      : "rgba(59,130,246,0.10)";
  const glyph = failed
    ? "var(--semantic-warning, #F59E0B)"
    : "var(--brand-blue, #3B82F6)";

  const inner = (
    <>
      <ArrowGlyph color={glyph} />
      <span style={{ flex: 1, textAlign: "left" }}>
        {generating ? "Generating sheet" : failed ? "Export failed" : label}
      </span>
      {sizeLabel ? (
        <span
          style={{
            fontFamily: "ui-monospace, Menlo, monospace",
            fontSize: 11.5,
            fontWeight: 500,
            color: "var(--surface-muted, #7C8BA0)",
          }}
        >
          {sizeLabel}
        </span>
      ) : null}
    </>
  );

  const style = { ...SHELL, border, background, cursor: ready ? "pointer" : "default" };

  if (ready && href) {
    return (
      <a href={href} download={download} data-testid={testId} style={style}>
        {inner}
      </a>
    );
  }

  return (
    <div data-testid={testId} data-state={state} style={style} aria-disabled="true">
      {inner}
    </div>
  );
}
