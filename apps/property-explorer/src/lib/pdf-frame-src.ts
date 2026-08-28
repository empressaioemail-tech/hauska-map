// Fetch report bytes and require a %PDF magic. Export APIs send
// Content-Disposition: attachment, so the native Chrome plugin cannot
// be pointed at the download URL. The in-app viewer paints from these
// bytes (pdf.js). resolvePdfFrameSrc stays for tests that still speak
// blob URLs; the viewer must not mount an embed or iframe.

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF

export function bytesArePdf(bytes: Uint8Array): boolean {
  if (bytes.length < PDF_MAGIC.length) return false;
  return PDF_MAGIC.every((b, i) => bytes[i] === b);
}

export async function fetchPdfBytes(
  href: string,
  opts?: { fetchImpl?: typeof fetch },
): Promise<Uint8Array> {
  const trimmed = href.trim();
  if (!trimmed) {
    throw new Error("pdf href missing");
  }
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const res = await fetchImpl(trimmed, { credentials: "include" });
  if (!res.ok) {
    throw new Error(`pdf ${res.status}`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!bytesArePdf(bytes)) {
    throw new Error("not a pdf");
  }
  return bytes;
}

export async function resolvePdfFrameSrc(
  href: string,
  opts?: {
    fetchImpl?: typeof fetch;
    createObjectURL?: (blob: Blob) => string;
  },
): Promise<{ src: string; revoke: boolean }> {
  const trimmed = href.trim();
  if (!trimmed) {
    throw new Error("pdf href missing");
  }
  if (trimmed.startsWith("blob:") || trimmed.startsWith("data:")) {
    return { src: trimmed, revoke: false };
  }
  const bytes = await fetchPdfBytes(trimmed, opts);
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const blob = new Blob([copy], { type: "application/pdf" });
  const create = opts?.createObjectURL ?? ((b: Blob) => URL.createObjectURL(b));
  return { src: create(blob), revoke: true };
}
