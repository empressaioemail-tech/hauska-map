// apps/property-explorer/src/workbench/tools/chat-attach.ts
//
// W3 ATTACH — attach a file (survey PDF, plat, title doc, image) as CITED
// PROPERTY CONTEXT for the CURRENT thread. The attachment is the operator's
// OWN document about THEIR property: it is TENANT-PRIVATE (never pooled into
// the shared/public layer — sovereignty rule) and it is passed to the model
// as context so answers can reason "per the attached survey…".
//
// v1 transport (NO backend/storage change): the file lives CLIENT-SIDE in the
// thread's session state. Its EXTRACTED TEXT is injected into the outgoing
// `message` as a clearly delimited context block, which the research/chat
// backend passes to the LLM verbatim (User question: <message>). The
// attachment is a distinct CITED SOURCE (a non-atom "unverified" ref) so the
// UI shows WHAT the answer leaned on — the attached doc is the user's own
// evidence, not a recorded municipal-code atom.
//
// HONESTY (anti-fabrication): we only pass text we could actually read. Plain
// text / markdown / csv / json read natively. PDFs get a best-effort
// text-stream extraction (works on born-digital PDFs; scanned/image PDFs yield
// little — honestly noted, contents NOT fabricated). Images cannot be read
// client-side (no OCR / vision wired in v1) — they attach as a NAMED reference
// only, with an explicit "contents not read" note. The model is told plainly
// when a document's contents could not be extracted, so it never invents them.

// ---------------------------------------------------------------------------
// Model.
// ---------------------------------------------------------------------------

export type ChatAttachmentKind = "pdf" | "image" | "text";

export interface ChatAttachment {
  id: string;
  name: string;
  kind: ChatAttachmentKind;
  mimeType: string;
  sizeBytes: number;
  /** Client-extracted text passed to the model; null when unreadable. */
  extractedText: string | null;
  /** Honest note shown in-thread + told to the model (e.g. image not read). */
  note: string | null;
  addedAt: string;
}

// ---------------------------------------------------------------------------
// Limits — keep the thread lean and the injected context bounded.
// ---------------------------------------------------------------------------

/** Per-file byte cap (10 MB) — larger files are rejected honestly. */
export const ATTACH_MAX_BYTES = 10 * 1024 * 1024;
/** Max attachments per thread. */
export const ATTACH_MAX_PER_THREAD = 5;
/** Extracted text cap per attachment injected into the prompt. */
export const ATTACH_TEXT_MAX_CHARS = 12_000;

// Accepted mime buckets.
const TEXTUAL_MIME = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
]);

export function classifyAttachment(mimeType: string, name: string): ChatAttachmentKind | null {
  const mt = (mimeType || "").toLowerCase();
  const lower = name.toLowerCase();
  if (mt === "application/pdf" || lower.endsWith(".pdf")) return "pdf";
  if (mt.startsWith("image/")) return "image";
  if (
    TEXTUAL_MIME.has(mt) ||
    /\.(txt|md|markdown|csv|json)$/.test(lower)
  ) {
    return "text";
  }
  return null;
}

function attachId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (typeof g.crypto?.randomUUID === "function") return g.crypto.randomUUID();
  return `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Best-effort PDF text extraction (no dependency). Born-digital PDFs carry
// their text in content streams as strings inside BT…ET blocks: `(literal)`
// and `<hexstring>` operands to Tj / TJ. This pulls those out of the RAW,
// UNCOMPRESSED bytes. FlateDecode-compressed streams (most modern PDFs
// partially) yield nothing here — that is the honest limit, reported as such;
// contents are never guessed. Exported for direct unit testing.
// ---------------------------------------------------------------------------

export function extractPdfTextFromBytes(bytes: Uint8Array): string {
  // Latin1 view so byte offsets line up with the ASCII PDF operators.
  let raw = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    raw += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + CHUNK)) as number[],
    );
  }

  const out: string[] = [];
  // Literal strings: ( ... ) with \) escapes. Only inside plausible text runs.
  const litRe = /\(((?:\\.|[^\\()])*)\)\s*Tj|\[((?:\\.|[^\]])*)\]\s*TJ/g;
  let m: RegExpExecArray | null;
  while ((m = litRe.exec(raw)) !== null) {
    const lit = m[1];
    const arr = m[2];
    if (lit != null) {
      out.push(decodePdfLiteral(lit));
    } else if (arr != null) {
      // TJ array: pull each ( ... ) literal, ignore the kerning numbers.
      const inner = arr.match(/\((?:\\.|[^\\()])*\)/g) ?? [];
      out.push(inner.map((s) => decodePdfLiteral(s.slice(1, -1))).join(""));
    }
  }

  const text = out
    .join(" ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
  return text;
}

function decodePdfLiteral(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\")
    .replace(/\\(\d{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
}

// ---------------------------------------------------------------------------
// Ingest a browser File into a ChatAttachment (async — reads bytes / text).
// Rejected files (too big / unsupported) return an honest error string.
// `now`, `readText`, `readBytes` are injectable for tests (no real File dep).
// ---------------------------------------------------------------------------

export type IngestAttachmentResult =
  | { ok: true; attachment: ChatAttachment }
  | { ok: false; error: string };

export interface AttachFileLike {
  name: string;
  type: string;
  size: number;
  text: () => Promise<string>;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

export async function ingestAttachment(
  file: AttachFileLike,
  deps: { now?: () => string } = {},
): Promise<IngestAttachmentResult> {
  const now = deps.now ?? (() => new Date().toISOString());
  const kind = classifyAttachment(file.type, file.name);
  if (!kind) {
    return {
      ok: false,
      error: `Unsupported file type — attach a PDF, image, or text file.`,
    };
  }
  if (file.size > ATTACH_MAX_BYTES) {
    return {
      ok: false,
      error: `File is too large (max ${Math.floor(ATTACH_MAX_BYTES / (1024 * 1024))} MB).`,
    };
  }

  let extractedText: string | null = null;
  let note: string | null = null;

  try {
    if (kind === "text") {
      const t = (await file.text()).trim();
      extractedText = t ? t.slice(0, ATTACH_TEXT_MAX_CHARS) : null;
      if (!extractedText) note = "Attached file was empty.";
    } else if (kind === "pdf") {
      const buf = await file.arrayBuffer();
      const t = extractPdfTextFromBytes(new Uint8Array(buf));
      if (t) {
        extractedText = t.slice(0, ATTACH_TEXT_MAX_CHARS);
      } else {
        note =
          "PDF text could not be read in-browser (likely a scanned or image-only PDF) — attached as a reference; its contents were not extracted.";
      }
    } else {
      // image — no client-side OCR / vision in v1.
      note =
        "Image attached as a reference — its contents are not read automatically yet; describe what to look for in your question.";
    }
  } catch {
    note = "Could not read this file — attached as a reference only.";
  }

  return {
    ok: true,
    attachment: {
      id: attachId(),
      name: file.name,
      kind,
      mimeType: file.type,
      sizeBytes: file.size,
      extractedText,
      note,
      addedAt: now(),
    },
  };
}

// ---------------------------------------------------------------------------
// Prompt composition — inject readable attachment context into the outgoing
// message. The block is clearly delimited and labeled as the USER'S OWN
// attached document (not municipal code), with the honest "contents not read"
// note for anything unreadable so the model never fabricates. The user's
// actual question rides UNDER the context block.
// ---------------------------------------------------------------------------

export function composeMessageWithAttachments(
  message: string,
  attachments: ChatAttachment[],
): string {
  if (attachments.length === 0) return message;

  const blocks: string[] = [];
  for (const a of attachments) {
    const header = `--- ATTACHED DOCUMENT: ${a.name} (${a.kind}${
      a.mimeType ? `, ${a.mimeType}` : ""
    }) ---`;
    if (a.extractedText) {
      blocks.push(`${header}\n${a.extractedText}`);
    } else {
      blocks.push(
        `${header}\n(Contents not machine-readable client-side${
          a.note ? ` — ${a.note}` : ""
        }. Do not invent its contents; ask the user for specifics if needed.)`,
      );
    }
  }

  return [
    "The user attached the following document(s) about THIS property as their own private context. Treat them as user-provided evidence (not municipal code): when you rely on an attachment, say so plainly (e.g. \"per the attached survey…\"). Never fabricate contents you were not given.",
    "",
    blocks.join("\n\n"),
    "",
    `User question: ${message}`,
  ].join("\n");
}

/** True when any attachment carries text the model can actually use. */
export function hasReadableContext(attachments: ChatAttachment[]): boolean {
  return attachments.some((a) => !!a.extractedText);
}

// ---------------------------------------------------------------------------
// Human-facing helpers.
// ---------------------------------------------------------------------------

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
