// apps/property-explorer/src/workbench/tool-state-store.ts
//
// PE WORKBENCH CHASSIS — the per-property tool-state store (WB1).
//
// One store keyed {parcelNodeId → {toolId → state}}. Tools never talk to this
// module directly — they call `useDockToolState(toolId)` (WorkbenchContext),
// which scopes reads/writes to the ACTIVE property. The store is:
//   - in-memory first (the live source of truth for the session), and
//   - localStorage-backed (best-effort) so a property's tool state survives a
//     reload, SIZE-CAPPED to the latest MAX_PROPERTIES (~10) properties by
//     last-write time — oldest evicted first.
//
// Honesty rules baked in:
//   - Values must be plain JSON-serializable data. A value that fails to
//     serialize stays usable IN MEMORY for the session and is simply skipped
//     by persistence (never a throw into the tool).
//   - No storage available (node tests, privacy mode, quota) → the store
//     degrades to memory-only silently. On quota pressure it evicts oldest
//     properties and retries before giving up.

/** Minimal storage seam so tests inject a fake and node runs storage-less. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface PropertyEntry {
  /** Last-write epoch ms — the eviction ordering key. */
  touchedAt: number;
  tools: Record<string, unknown>;
}

interface PersistShape {
  v: 1;
  properties: Record<string, PropertyEntry>;
}

export interface WorkbenchToolStateStore {
  /** The stored state for one tool on one property; null when absent. */
  get(parcelNodeId: string | null, toolId: string): unknown;
  /** Write (or clear, with null) one tool's state on one property. */
  set(parcelNodeId: string, toolId: string, state: unknown): void;
  /** Subscribe to any change (useSyncExternalStore seam). */
  subscribe(listener: () => void): () => void;
  /** Property ids currently held, newest write first (tests / debugging). */
  propertyIds(): string[];
  /** Drop everything (memory + backing storage). */
  clearAll(): void;
}

const STORAGE_KEY = "pe:workbench:tool-state:v1";
const DEFAULT_MAX_PROPERTIES = 10;

function defaultStorage(): StorageLike | null {
  try {
    const ls = (globalThis as { localStorage?: StorageLike }).localStorage;
    return ls ?? null;
  } catch {
    // Some privacy modes throw on the localStorage getter itself.
    return null;
  }
}

export function createWorkbenchToolStateStore(opts?: {
  storage?: StorageLike | null;
  maxProperties?: number;
}): WorkbenchToolStateStore {
  const storage = opts?.storage === undefined ? defaultStorage() : opts.storage;
  const maxProperties = opts?.maxProperties ?? DEFAULT_MAX_PROPERTIES;
  const listeners = new Set<() => void>();

  // ---- Load whatever the backing storage holds (defensive parse). ----
  let properties = new Map<string, PropertyEntry>();
  if (storage) {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PersistShape;
        if (parsed && parsed.v === 1 && parsed.properties) {
          for (const [id, entry] of Object.entries(parsed.properties)) {
            if (entry && typeof entry.touchedAt === "number" && entry.tools) {
              properties.set(id, entry);
            }
          }
        }
      }
    } catch {
      properties = new Map(); // corrupt payload → start clean, memory intact.
    }
  }

  function evictOldest(): boolean {
    let oldestId: string | null = null;
    let oldestAt = Infinity;
    for (const [id, entry] of properties) {
      if (entry.touchedAt < oldestAt) {
        oldestAt = entry.touchedAt;
        oldestId = id;
      }
    }
    if (oldestId === null) return false;
    properties.delete(oldestId);
    return true;
  }

  function persist(): void {
    if (!storage) return;
    // Best-effort with quota back-off: try the newest K properties, shrinking
    // K until the payload fits or K hits zero. Operates on a COPY — a
    // persistence failure never touches the in-memory state.
    const newestFirst = [...properties.entries()].sort(
      (a, b) => b[1].touchedAt - a[1].touchedAt,
    );
    for (let keep = newestFirst.length; keep >= 0; keep--) {
      let payload: string;
      try {
        const shape: PersistShape = { v: 1, properties: {} };
        for (const [id, entry] of newestFirst.slice(0, keep)) {
          const tools: Record<string, unknown> = {};
          for (const [toolId, state] of Object.entries(entry.tools)) {
            try {
              JSON.stringify(state);
              tools[toolId] = state; // serializable → persisted.
            } catch {
              // Non-serializable tool state stays memory-only (skipped here).
            }
          }
          shape.properties[id] = { touchedAt: entry.touchedAt, tools };
        }
        payload = JSON.stringify(shape);
      } catch {
        return; // pathological — keep memory state, skip persistence.
      }
      try {
        storage.setItem(STORAGE_KEY, payload);
        return;
      } catch {
        // Quota refusal — retry with fewer properties; memory stays intact.
      }
    }
  }

  function notify(): void {
    for (const fn of listeners) fn();
  }

  return {
    get(parcelNodeId, toolId) {
      if (!parcelNodeId) return null;
      return properties.get(parcelNodeId)?.tools[toolId] ?? null;
    },

    set(parcelNodeId, toolId, state) {
      if (!parcelNodeId) return;
      let entry = properties.get(parcelNodeId);
      if (!entry) {
        entry = { touchedAt: Date.now(), tools: {} };
        properties.set(parcelNodeId, entry);
      }
      entry.touchedAt = Date.now();
      if (state === null || state === undefined) {
        delete entry.tools[toolId];
        if (Object.keys(entry.tools).length === 0) {
          properties.delete(parcelNodeId);
        }
      } else {
        entry.tools[toolId] = state;
      }
      // Size cap: keep only the latest maxProperties properties.
      while (properties.size > maxProperties) {
        if (!evictOldest()) break;
      }
      persist();
      notify();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    propertyIds() {
      return [...properties.entries()]
        .sort((a, b) => b[1].touchedAt - a[1].touchedAt)
        .map(([id]) => id);
    },

    clearAll() {
      properties.clear();
      try {
        storage?.removeItem(STORAGE_KEY);
      } catch {
        // storage refusal never breaks the in-memory clear.
      }
      notify();
    },
  };
}

/** The app-wide singleton the chassis hook uses. */
export const workbenchToolState = createWorkbenchToolStateStore();
