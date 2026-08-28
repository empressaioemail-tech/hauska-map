import { describe, expect, it, vi } from "vitest";
import { bytesArePdf, fetchPdfBytes, resolvePdfFrameSrc } from "./pdf-frame-src";

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function pdfAttachmentResponse(): Response {
  return new Response(PDF_BYTES, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition":
        'attachment; filename="48021_1_flood_drainage.pdf"',
    },
  });
}

describe("resolvePdfFrameSrc", () => {
  it("passes blob and data hrefs through", async () => {
    expect(await resolvePdfFrameSrc("blob:https://smartsite.cloud/abc")).toEqual({
      src: "blob:https://smartsite.cloud/abc",
      revoke: false,
    });
    expect(await resolvePdfFrameSrc("data:application/pdf;base64,JVBERi0=")).toEqual({
      src: "data:application/pdf;base64,JVBERi0=",
      revoke: false,
    });
  });

  it("attachment PDF still becomes a blob URL (violate: iframe src = download href)", async () => {
    const createObjectURL = vi.fn(() => "blob:https://smartsite.cloud/view");
    const fetchImpl = vi.fn(async () => pdfAttachmentResponse());
    const out = await resolvePdfFrameSrc(
      "/api/pe-site-plan-export?report=flood-drainage&action=download",
      { fetchImpl, createObjectURL },
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/pe-site-plan-export?report=flood-drainage&action=download",
      { credentials: "include" },
    );
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe("application/pdf");
    expect(out).toEqual({ src: "blob:https://smartsite.cloud/view", revoke: true });
  });

  it("fetchPdfBytes returns the attachment bytes (viewer does not use embed)", async () => {
    const bytes = await fetchPdfBytes(
      "/api/pe-site-plan-export?report=flood-drainage&action=download",
      { fetchImpl: async () => pdfAttachmentResponse() },
    );
    expect(bytesArePdf(bytes)).toBe(true);
  });

  it("VIOLATION: JSON or empty body is not shown as a PDF", async () => {
    await expect(
      resolvePdfFrameSrc("/api/pe-site-plan-export?report=flood-drainage&action=download", {
        fetchImpl: async () => jsonResponse(200, { error: "ok_but_not_pdf" }),
      }),
    ).rejects.toThrow("not a pdf");
    await expect(
      resolvePdfFrameSrc("/x", {
        fetchImpl: async () => jsonResponse(401, { error: "unauthenticated" }),
      }),
    ).rejects.toThrow("pdf 401");
    expect(bytesArePdf(new Uint8Array([0x7b, 0x22]))).toBe(false);
    expect(bytesArePdf(PDF_BYTES)).toBe(true);
  });
});
