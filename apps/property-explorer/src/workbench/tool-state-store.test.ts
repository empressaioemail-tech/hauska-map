// PE workbench chassis (WB1) — per-property tool-state store tests.
//
// Pins the persistence design: {parcelNodeId → {toolId → state}}, in-memory
// first with best-effort storage backing, capped to the latest N properties,
// storage-less and quota-refusing environments degrade to memory-only.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createWorkbenchToolStateStore,
  type StorageLike,
} from "./tool-state-store";

function fakeStorage(): StorageLike & { dump(): Map<string, string> } {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => {
      m.set(k, v);
    },
    removeItem: (k) => {
      m.delete(k);
    },
    dump: () => m,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("workbench tool-state store", () => {
  it("scopes state per property AND per tool", () => {
    const store = createWorkbenchToolStateStore({ storage: null });
    store.set("48021:100", "brief", { a: 1 });
    store.set("48021:100", "chat", { b: 2 });
    store.set("48021:200", "brief", { c: 3 });

    expect(store.get("48021:100", "brief")).toEqual({ a: 1 });
    expect(store.get("48021:100", "chat")).toEqual({ b: 2 });
    expect(store.get("48021:200", "brief")).toEqual({ c: 3 });
    // Property switch re-scopes: the other property's tool slot is untouched.
    expect(store.get("48021:200", "chat")).toBeNull();
    expect(store.get(null, "brief")).toBeNull();
  });

  it("state survives close/reopen (a second store over the same storage)", () => {
    const storage = fakeStorage();
    const first = createWorkbenchToolStateStore({ storage });
    first.set("48021:100", "brief", { brief: { runId: "r1" } });

    const second = createWorkbenchToolStateStore({ storage });
    expect(second.get("48021:100", "brief")).toEqual({
      brief: { runId: "r1" },
    });
  });

  it("null clears a tool slot (and drops an emptied property)", () => {
    const store = createWorkbenchToolStateStore({ storage: null });
    store.set("p1", "brief", { x: 1 });
    store.set("p1", "brief", null);
    expect(store.get("p1", "brief")).toBeNull();
    expect(store.propertyIds()).toEqual([]);
  });

  it("caps to the latest N properties, evicting oldest-write first", () => {
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now++);
    const store = createWorkbenchToolStateStore({
      storage: null,
      maxProperties: 3,
    });
    store.set("p1", "brief", 1);
    store.set("p2", "brief", 2);
    store.set("p3", "brief", 3);
    store.set("p1", "brief", 11); // refresh p1 → p2 is now oldest
    store.set("p4", "brief", 4); // over cap → evict p2

    expect(store.get("p2", "brief")).toBeNull();
    expect(store.get("p1", "brief")).toBe(11);
    expect(store.get("p3", "brief")).toBe(3);
    expect(store.get("p4", "brief")).toBe(4);
    expect(store.propertyIds()).toEqual(["p4", "p1", "p3"]);
  });

  it("degrades to memory-only when storage refuses writes (quota)", () => {
    const storage = fakeStorage();
    const refusing: StorageLike = {
      ...storage,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    const store = createWorkbenchToolStateStore({ storage: refusing });
    expect(() => store.set("p1", "brief", { big: true })).not.toThrow();
    expect(store.get("p1", "brief")).toEqual({ big: true });
  });

  it("keeps non-serializable state in memory without breaking persistence", () => {
    const storage = fakeStorage();
    const store = createWorkbenchToolStateStore({ storage });
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => store.set("p1", "weird", cyclic)).not.toThrow();
    expect(store.get("p1", "weird")).toBe(cyclic); // session-usable
    store.set("p1", "brief", { fine: true });

    const reloaded = createWorkbenchToolStateStore({ storage });
    expect(reloaded.get("p1", "brief")).toEqual({ fine: true });
    expect(reloaded.get("p1", "weird")).toBeNull(); // honestly not persisted
  });

  it("survives a corrupt storage payload (starts clean, never throws)", () => {
    const storage = fakeStorage();
    storage.setItem("pe:workbench:tool-state:v1", "{not json");
    const store = createWorkbenchToolStateStore({ storage });
    expect(store.get("p1", "brief")).toBeNull();
    store.set("p1", "brief", 1);
    expect(store.get("p1", "brief")).toBe(1);
  });

  it("notifies subscribers on writes (useSyncExternalStore seam)", () => {
    const store = createWorkbenchToolStateStore({ storage: null });
    let fired = 0;
    const off = store.subscribe(() => {
      fired += 1;
    });
    store.set("p1", "brief", 1);
    expect(fired).toBe(1);
    off();
    store.set("p1", "brief", 2);
    expect(fired).toBe(1);
  });
});
