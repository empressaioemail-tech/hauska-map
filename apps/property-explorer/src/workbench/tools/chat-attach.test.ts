// W3 ATTACH — attach-as-cited-context. Pins:
//   - classify PDF / image / text; reject unsupported + oversized;
//   - text files read natively; born-digital PDF text extracts; image + scanned
//     PDF attach honestly "not read" (contents NEVER fabricated);
//   - the outgoing message injects readable attachment context as a labeled
//     user-evidence block (not municipal code), the clean question underneath;
//   - tenant-private: nothing here writes to any shared/public sink.

import { describe, expect, it } from "vitest";
import {
  ATTACH_MAX_BYTES,
  classifyAttachment,
  composeMessageWithAttachments,
  extractPdfTextFromBytes,
  hasReadableContext,
  ingestAttachment,
  type AttachFileLike,
  type ChatAttachment,
} from "./chat-attach";

const NOW = "2026-08-01T00:00:00.000Z";

function fakeFile(opts: {
  name: string;
  type: string;
  size?: number;
  text?: string;
  bytes?: Uint8Array;
}): AttachFileLike {
  return {
    name: opts.name,
    type: opts.type,
    size: opts.size ?? (opts.bytes?.byteLength ?? opts.text?.length ?? 0),
    text: async () => opts.text ?? "",
    arrayBuffer: async () =>
      (opts.bytes ?? new Uint8Array()).buffer as ArrayBuffer,
  };
}

describe("classifyAttachment", () => {
  it("classifies by mime and by extension", () => {
    expect(classifyAttachment("application/pdf", "survey.pdf")).toBe("pdf");
    expect(classifyAttachment("", "PLAT.PDF")).toBe("pdf");
    expect(classifyAttachment("image/png", "site.png")).toBe("image");
    expect(classifyAttachment("image/jpeg", "x.jpg")).toBe("image");
    expect(classifyAttachment("text/plain", "notes.txt")).toBe("text");
    expect(classifyAttachment("", "data.csv")).toBe("text");
    expect(classifyAttachment("application/json", "x.json")).toBe("text");
  });
  it("returns null for unsupported types", () => {
    expect(classifyAttachment("application/zip", "x.zip")).toBeNull();
    expect(classifyAttachment("application/octet-stream", "x.bin")).toBeNull();
  });
});

describe("extractPdfTextFromBytes", () => {
  it("pulls literal-string text runs out of a minimal content stream", () => {
    const pdf = "BT /F1 12 Tf (Rear setback line is 20 ft) Tj ET";
    const bytes = new Uint8Array([...pdf].map((c) => c.charCodeAt(0)));
    expect(extractPdfTextFromBytes(bytes)).toContain("Rear setback line is 20 ft");
  });
  it("handles TJ arrays with kerning numbers", () => {
    const pdf = "[(Lot )-10(4)10( Block A)] TJ";
    const bytes = new Uint8Array([...pdf].map((c) => c.charCodeAt(0)));
    const out = extractPdfTextFromBytes(bytes);
    expect(out).toContain("Lot");
    expect(out).toContain("Block A");
  });
  it("yields empty string for bytes with no extractable text (scanned PDF)", () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x11, 0x22]);
    expect(extractPdfTextFromBytes(bytes)).toBe("");
  });
});

describe("ingestAttachment", () => {
  it("reads a text file's contents as extracted context", async () => {
    const r = await ingestAttachment(
      fakeFile({ name: "notes.txt", type: "text/plain", text: "front setback 25 ft" }),
      { now: () => NOW },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.attachment.kind).toBe("text");
      expect(r.attachment.extractedText).toBe("front setback 25 ft");
      expect(r.attachment.note).toBeNull();
    }
  });

  it("extracts born-digital PDF text", async () => {
    const pdf = "BT (per the survey the rear setback is 20 ft) Tj ET";
    const bytes = new Uint8Array([...pdf].map((c) => c.charCodeAt(0)));
    const r = await ingestAttachment(
      fakeFile({ name: "survey.pdf", type: "application/pdf", bytes }),
      { now: () => NOW },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.attachment.extractedText).toContain("rear setback is 20 ft");
    }
  });

  it("scanned PDF (no text) attaches with an honest 'not read' note, no fabrication", async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00, 0x01]);
    const r = await ingestAttachment(
      fakeFile({ name: "scan.pdf", type: "application/pdf", bytes }),
      { now: () => NOW },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.attachment.extractedText).toBeNull();
      expect(r.attachment.note).toMatch(/could not be read|not extracted/i);
    }
  });

  it("image attaches as a reference (contents not read in v1)", async () => {
    const r = await ingestAttachment(
      fakeFile({ name: "site.jpg", type: "image/jpeg", size: 500 }),
      { now: () => NOW },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.attachment.kind).toBe("image");
      expect(r.attachment.extractedText).toBeNull();
      expect(r.attachment.note).toMatch(/not read/i);
    }
  });

  it("rejects unsupported types", async () => {
    const r = await ingestAttachment(fakeFile({ name: "a.zip", type: "application/zip" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/unsupported/i);
  });

  it("rejects oversized files", async () => {
    const r = await ingestAttachment(
      fakeFile({ name: "big.pdf", type: "application/pdf", size: ATTACH_MAX_BYTES + 1 }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/too large/i);
  });
});

describe("composeMessageWithAttachments", () => {
  const readable: ChatAttachment = {
    id: "1",
    name: "survey.pdf",
    kind: "pdf",
    mimeType: "application/pdf",
    sizeBytes: 100,
    extractedText: "Rear setback line is 20 ft per this survey.",
    note: null,
    addedAt: NOW,
  };
  const unread: ChatAttachment = {
    id: "2",
    name: "site.jpg",
    kind: "image",
    mimeType: "image/jpeg",
    sizeBytes: 100,
    extractedText: null,
    note: "Image attached as a reference — its contents are not read automatically yet.",
    addedAt: NOW,
  };

  it("no attachments → the message is unchanged", () => {
    expect(composeMessageWithAttachments("How tall can I build?", [])).toBe(
      "How tall can I build?",
    );
  });

  it("injects readable text as labeled user-evidence, with the question underneath", () => {
    const out = composeMessageWithAttachments("What is the rear setback?", [readable]);
    expect(out).toContain("ATTACHED DOCUMENT: survey.pdf");
    expect(out).toContain("Rear setback line is 20 ft");
    expect(out).toContain("not municipal code");
    expect(out).toContain("User question: What is the rear setback?");
  });

  it("marks unreadable attachments explicitly so the model never fabricates", () => {
    const out = composeMessageWithAttachments("Anything on the plat?", [unread]);
    expect(out).toContain("ATTACHED DOCUMENT: site.jpg");
    expect(out).toContain("not machine-readable");
    expect(out).toContain("Do not invent its contents");
  });
});

describe("hasReadableContext", () => {
  it("true only when some attachment carries extracted text", () => {
    expect(hasReadableContext([])).toBe(false);
    expect(
      hasReadableContext([
        { id: "x", name: "a.png", kind: "image", mimeType: "image/png", sizeBytes: 1, extractedText: null, note: null, addedAt: NOW },
      ]),
    ).toBe(false);
    expect(
      hasReadableContext([
        { id: "y", name: "a.txt", kind: "text", mimeType: "text/plain", sizeBytes: 1, extractedText: "hi", note: null, addedAt: NOW },
      ]),
    ).toBe(true);
  });
});
