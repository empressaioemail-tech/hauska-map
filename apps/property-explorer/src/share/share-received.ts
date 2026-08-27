// Received-share inbox for the Reports bubble "Shared with me" tab (W2.6).
// Written when a share landing resolves. Local-only; never invents reports.

export const SHARE_RECEIVED_STORAGE_KEY = "pe:share:received-v1";

export interface ReceivedShareRow {
  id: string;
  grantId: string | null;
  parcelNodeId: string;
  address: string | null;
  notes: string | null;
  expiresAt: string | null;
  artifacts: {
    xray: boolean;
    sitePlan: boolean;
    terrain: boolean;
  };
  receivedAt: string;
}

export interface ReceivedShareStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function defaultReceivedShareStore(): ReceivedShareStore | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function parseReceivedShares(raw: string | null): ReceivedShareRow[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const rows: ReceivedShareRow[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const parcelNodeId =
        typeof rec.parcelNodeId === "string" ? rec.parcelNodeId.trim() : "";
      const id = typeof rec.id === "string" ? rec.id.trim() : "";
      if (!parcelNodeId || !id) continue;
      const artifacts = rec.artifacts as Record<string, unknown> | undefined;
      rows.push({
        id,
        grantId: typeof rec.grantId === "string" ? rec.grantId : null,
        parcelNodeId,
        address: typeof rec.address === "string" ? rec.address : null,
        notes: typeof rec.notes === "string" && rec.notes.trim() ? rec.notes : null,
        expiresAt: typeof rec.expiresAt === "string" ? rec.expiresAt : null,
        artifacts: {
          xray: artifacts?.xray === true,
          sitePlan: artifacts?.sitePlan === true,
          terrain: artifacts?.terrain === true,
        },
        receivedAt:
          typeof rec.receivedAt === "string"
            ? rec.receivedAt
            : "1970-01-01T00:00:00.000Z",
      });
    }
    return rows;
  } catch {
    return [];
  }
}

export function readReceivedShares(
  store: ReceivedShareStore | null,
): ReceivedShareRow[] {
  if (!store) return [];
  try {
    return parseReceivedShares(store.getItem(SHARE_RECEIVED_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function recordReceivedShare(
  row: ReceivedShareRow,
  store: ReceivedShareStore | null,
): ReceivedShareRow[] {
  if (!store) return [];
  if (!row.parcelNodeId.trim() || !row.id.trim()) return readReceivedShares(store);
  const existing = readReceivedShares(store).filter((r) => r.id !== row.id);
  const next = [row, ...existing].slice(0, 50);
  try {
    store.setItem(SHARE_RECEIVED_STORAGE_KEY, JSON.stringify(next));
  } catch {
    return existing;
  }
  return next;
}
