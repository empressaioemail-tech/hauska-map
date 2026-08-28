// In-app PDF viewer (W2.5). Preferred over a raw download, especially on
// a narrow viewport. W2.4: the live-view link sits at the TOP of the
// viewer chrome. Fail closed: no href → nothing to view.
//
// Export GETs send Content-Disposition: attachment. Chrome will not paint
// that in an iframe. Fetch the bytes, require %PDF, and show a blob URL.
// Portal to document.body: a transformed ancestor (dock / brief animation)
// makes Chrome's PDF plugin show the sad-document error on a huge gray sheet.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { liveViewHref } from "../lib/live-view";
import { resolvePdfFrameSrc } from "../lib/pdf-frame-src";

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
  const [frameSrc, setFrameSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    setFrameSrc(null);
    setError(null);
    void resolvePdfFrameSrc(href)
      .then((resolved) => {
        if (cancelled) {
          if (resolved.revoke) URL.revokeObjectURL(resolved.src);
          return;
        }
        if (resolved.revoke) revoked = resolved.src;
        setFrameSrc(resolved.src);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "pdf failed");
      });
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [href]);

  const dialog = (
    <div
      data-testid="pdf-viewer"
      role="dialog"
      aria-label={title}
      style={{
        position: "fixed",
        top: 36,
        left: 24,
        right: 24,
        bottom: 36,
        maxWidth: 780,
        maxHeight: 720,
        width: "calc(100vw - 48px)",
        height: "calc(100vh - 72px)",
        margin: "0 auto",
        zIndex: 400,
        display: "flex",
        flexDirection: "column",
        background: "var(--surface-card, #0B0E13)",
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
      {error ? (
        <div
          data-testid="pdf-viewer-error"
          style={{
            flex: 1,
            minHeight: 280,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            color: "var(--text-body, #e5e7eb)",
            fontSize: 13,
            background: "#111827",
          }}
        >
          Could not open this PDF in the viewer. Use Download PDF.
        </div>
      ) : (
        <embed
          data-testid="pdf-viewer-frame"
          title={title}
          src={frameSrc ?? undefined}
          type="application/pdf"
          style={{
            flex: 1,
            width: "100%",
            border: 0,
            minHeight: 320,
            background: "#ffffff",
          }}
        />
      )}
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

  if (typeof document === "undefined") return dialog;
  return createPortal(dialog, document.body);
}
