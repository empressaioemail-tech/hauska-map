// In-app report viewer (W2.5). Chrome's PDF plugin never painted here
// (navy empty, sad-document, then a white void). We rasterize %PDF
// bytes with pdf.js and put the pages in Smart Site chrome v2.
// W2.4 live-view stays at the top. Fail closed: no href, or not %PDF,
// is an honest miss plus Download.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { liveViewHref } from "../lib/live-view";
import { fetchPdfBytes } from "../lib/pdf-frame-src";
import { openPdfDocument, renderPdfPage } from "../lib/pdf-js-doc";
import { PE, TYPE } from "../styles/pe-chrome";
import { Button } from "./Button";
import { Modal } from "./Modal";

const SCALES = [0.75, 1, 1.25, 1.5] as const;

export function PdfViewer({
  href,
  title,
  parcelNodeId,
  grantId,
  downloadLabel = "Download PDF",
  onClose,
}: {
  href: string;
  title: string;
  parcelNodeId?: string | null;
  grantId?: string | null;
  downloadLabel?: string;
  onClose: () => void;
}) {
  const live = liveViewHref({ parcelNodeId, grantId });
  const [error, setError] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [page, setPage] = useState(1);
  const [scaleIdx, setScaleIdx] = useState(1);
  const pdfHold = useRef<PDFDocumentProxy | null>(null);
  const canvases = useRef<Array<HTMLCanvasElement | null>>([]);
  const wellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setPageCount(0);
    setPage(1);
    pdfHold.current?.destroy();
    pdfHold.current = null;
    void fetchPdfBytes(href)
      .then((bytes) => openPdfDocument(bytes))
      .then((pdf) => {
        if (cancelled) {
          pdf.destroy();
          return;
        }
        pdfHold.current = pdf;
        setPageCount(pdf.numPages);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "pdf failed");
      });
    return () => {
      cancelled = true;
      pdfHold.current?.destroy();
      pdfHold.current = null;
    };
  }, [href]);

  useEffect(() => {
    const pdf = pdfHold.current;
    if (!pdf || pageCount === 0) return;
    let cancelled = false;
    void (async () => {
      for (let n = 1; n <= pageCount; n += 1) {
        const canvas = canvases.current[n - 1];
        if (!canvas || cancelled) continue;
        await renderPdfPage(pdf, n, canvas, SCALES[scaleIdx] ?? 1);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [href, pageCount, scaleIdx]);

  useEffect(() => {
    const node = wellRef.current?.querySelector(`[data-page="${page}"]`);
    if (node instanceof HTMLElement) {
      node.scrollIntoView({ block: "start" });
    }
  }, [page]);

  const scale = SCALES[scaleIdx] ?? 1;
  const dialog = (
    <div
      data-testid="pdf-viewer"
      style={{ position: "fixed", inset: 0, zIndex: 400 }}
    >
      <Modal
        label={title}
        onClose={onClose}
        width={680}
        style={{
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          maxHeight: "min(82vh, 760px)",
        }}
      >
        <div
          data-pe="modal-header"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            height: 40,
            padding: "0 10px 0 16px",
            borderBottom: `1px solid ${PE.line06}`,
          }}
        >
          <span style={{ flex: 1, ...TYPE.head, color: PE.t3, fontFamily: PE.ui }}>
            {title}
          </span>
          <button
            type="button"
            data-testid="pdf-viewer-close"
            aria-label="Close"
            onClick={onClose}
            className="pe-btn"
            style={{
              width: 24,
              height: 24,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: PE.rTouch,
              background: "transparent",
              border: "none",
              color: PE.t5,
              cursor: "pointer",
              padding: 0,
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width={13}
              height={13}
              aria-hidden
              fill="none"
              stroke="currentColor"
              strokeWidth={1.7}
              strokeLinecap="round"
            >
              <path d="M18 6 6 18 M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div
          data-testid="pdf-viewer-live-view"
          style={{
            padding: "8px 16px",
            borderBottom: `1px solid ${PE.line06}`,
          }}
        >
          {live ? (
            <a
              href={live}
              data-testid="pdf-live-view-link"
              style={{
                ...TYPE.meta,
                color: PE.blue,
                textDecoration: "none",
                fontFamily: PE.ui,
              }}
            >
              Open live view of this property
            </a>
          ) : (
            <span data-testid="pdf-live-view-missing" style={{ ...TYPE.meta, color: PE.t5 }}>
              Live view unavailable
            </span>
          )}
        </div>

        <div
          ref={wellRef}
          data-testid="pdf-viewer-frame"
          className="pe-scroll"
          style={{
            flex: 1,
            minHeight: 280,
            overflow: "auto",
            background: PE.void,
            padding: "16px 12px 20px",
          }}
        >
          {error ? (
            <div
              data-testid="pdf-viewer-error"
              style={{
                ...TYPE.body,
                color: PE.t3,
                textAlign: "center",
                padding: 32,
                fontFamily: PE.ui,
              }}
            >
              Could not open this PDF in the viewer. Use Download PDF.
            </div>
          ) : pageCount === 0 ? (
            <div
              data-testid="pdf-viewer-loading"
              style={{
                ...TYPE.body,
                color: PE.t5,
                textAlign: "center",
                padding: 48,
                fontFamily: PE.ui,
              }}
            >
              Opening report…
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
              }}
            >
              {Array.from({ length: pageCount }, (_, i) => (
                <canvas
                  key={`${href}-${i}-${scale}`}
                  ref={(el) => {
                    canvases.current[i] = el;
                  }}
                  data-testid={i === 0 ? "pdf-viewer-page" : undefined}
                  data-page={i + 1}
                  style={{
                    display: "block",
                    background: PE.t1,
                    borderRadius: PE.rChip,
                  }}
                />
              ))}
            </div>
          )}
        </div>

        <div
          data-testid="pdf-viewer-toolbar"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            borderTop: `1px solid ${PE.line06}`,
          }}
        >
          <span style={{ ...TYPE.meta, color: PE.t5, fontFamily: PE.ui, flex: 1 }}>
            {pageCount > 0 ? `Page ${page} of ${pageCount}` : title}
          </span>
          <Button
            type="button"
            variant="subtle"
            dense
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </Button>
          <Button
            type="button"
            variant="subtle"
            dense
            disabled={page >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          >
            Next
          </Button>
          <Button
            type="button"
            variant="ghost"
            dense
            disabled={scaleIdx <= 0}
            onClick={() => setScaleIdx((i) => Math.max(0, i - 1))}
          >
            -
          </Button>
          <span style={{ ...TYPE.meta, color: PE.t4, fontFamily: PE.mono, minWidth: 36 }}>
            {Math.round(scale * 100)}%
          </span>
          <Button
            type="button"
            variant="ghost"
            dense
            disabled={scaleIdx >= SCALES.length - 1}
            onClick={() => setScaleIdx((i) => Math.min(SCALES.length - 1, i + 1))}
          >
            +
          </Button>
          <a
            href={href}
            download
            data-testid="pdf-viewer-download"
            className="pe-btn"
            style={{
              boxSizing: "border-box",
              display: "inline-flex",
              alignItems: "center",
              height: PE.hDense,
              padding: "0 10px",
              borderRadius: PE.rTouch,
              fontFamily: PE.ui,
              fontWeight: 600,
              fontSize: 11.5,
              color: PE.t1,
              background: "rgba(255,255,255,.03)",
              border: `1px solid ${PE.line28}`,
              textDecoration: "none",
            }}
          >
            {downloadLabel}
          </a>
        </div>
      </Modal>
    </div>
  );

  if (typeof document === "undefined") return dialog;
  return createPortal(dialog, document.body);
}
