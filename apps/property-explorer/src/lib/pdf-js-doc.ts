// Lazy pdf.js load. The native Chrome PDF plugin is the defect: it paints
// a white or sad-document sheet inside our portal. We rasterize pages
// ourselves. Worker is a same-origin Vite asset, not a CDN.

import type { PDFDocumentProxy } from "pdfjs-dist";

let workerReady = false;

export async function openPdfDocument(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  const pdfjs = await import("pdfjs-dist");
  if (!workerReady) {
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    workerReady = true;
  }
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return pdfjs.getDocument({ data: copy }).promise;
}

export async function renderPdfPage(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  scale: number,
): Promise<void> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  canvas.style.width = `${viewport.width}px`;
  canvas.style.maxWidth = "100%";
  canvas.style.height = "auto";
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("canvas 2d missing");
  }
  await page.render({ canvasContext: ctx, viewport }).promise;
}
