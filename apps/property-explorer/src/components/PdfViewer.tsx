// In-app PDF viewer (W2.5). Preferred over a raw download, especially on
// a narrow viewport. W2.4: the live-view link sits at the TOP of the
// viewer chrome. Fail closed: no href → nothing to view.

import { liveViewHref } from "../lib/live-view";

export function PdfViewer({
  href,
  title,
  parcelNodeId,
  grantId,
  onClose,
}: {
  href: string;
  title: string;
  parcelNodeId?: string | null;
  grantId?: string | null;
  onClose: () => void;
}) {
  const live = liveViewHref({ parcelNodeId, grantId });
  return (
    <div
      data-testid="pdf-viewer"
      role="dialog"
      aria-label={title}
      style={{
        position: "fixed",
        inset: 8,
        zIndex: 80,
        display: "flex",
        flexDirection: "column",
        background: "var(--surface-card, #0d1117)",
        border: "1px solid var(--surface-border, #243247)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <div
        data-testid="pdf-viewer-live-view"
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid var(--surface-border, #243247)",
          fontSize: 12,
          color: "var(--text-body, #e5e7eb)",
        }}
      >
        {live ? (
          <a
            href={live}
            data-testid="pdf-live-view-link"
            style={{ color: "var(--brand-blue, #3B82F6)" }}
          >
            Open live view of this property
          </a>
        ) : (
          <span data-testid="pdf-live-view-missing">Live view unavailable</span>
        )}
        <button
          type="button"
          data-testid="pdf-viewer-close"
          onClick={onClose}
          style={{
            float: "right",
            background: "transparent",
            border: 0,
            color: "var(--surface-muted, #94A3B8)",
            cursor: "pointer",
          }}
        >
          Close
        </button>
      </div>
      <iframe
        data-testid="pdf-viewer-frame"
        title={title}
        src={href}
        style={{ flex: 1, width: "100%", border: 0, minHeight: 280 }}
      />
      <a
        href={href}
        download
        data-testid="pdf-viewer-download"
        style={{
          padding: "8px 12px",
          fontSize: 12,
          color: "var(--brand-blue, #3B82F6)",
        }}
      >
        Download PDF
      </a>
    </div>
  );
}
