// Resolve a download URL into an iframe-safe PDF src.
// Export APIs send Content-Disposition: attachment. Chrome will not paint
// that in an iframe (navy empty viewer). Fetch the bytes with the session
// cookie, require a %PDF magic, then hand the iframe a blob: URL.

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF

export function bytesArePdf(bytes: Uint8Array): boolean {
  if (bytes.length < PDF_MAGIC.length) return false;
  return PDF_MAGIC.every((b, i) => bytes[i] === b);
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
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const res = await fetchImpl(trimmed, { credentials: "include" });
  if (!res.ok) {
    throw new Error(`pdf ${res.status}`);
  }
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  if (!bytesArePdf(bytes)) {
    throw new Error("not a pdf");
  }
  const blob = new Blob([buf], { type: "application/pdf" });
  const create = opts?.createObjectURL ?? ((b: Blob) => URL.createObjectURL(b));
  return { src: create(blob), revoke: true };
}
