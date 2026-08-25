import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CHECKOUT_ORIGIN_KEY,
  clearCheckoutOrigin,
  kickQueuedJobIfOrigin,
  persistCheckoutOrigin,
  readCheckoutOrigin,
  type CheckoutOriginStore,
} from "./checkoutOrigin";
import { reconcilePostCheckout } from "./usePostCheckoutRefresh";

function memStore(seed: Record<string, string> = {}): CheckoutOriginStore & {
  bag: Map<string, string>;
} {
  const bag = new Map(Object.entries(seed));
  return {
    bag,
    getItem: (k) => bag.get(k) ?? null,
    setItem: (k, v) => void bag.set(k, v),
    removeItem: (k) => void bag.delete(k),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("checkoutOrigin persist-and-kick (WDLL item 9)", () => {
  it("round-trips a report origin", () => {
    const store = memStore();
    persistCheckoutOrigin(
      { kind: "report", label: "Site plan sheet", parcelNodeId: "48021:1" },
      store,
    );
    expect(readCheckoutOrigin(store)).toEqual({
      kind: "report",
      label: "Site plan sheet",
      parcelNodeId: "48021:1",
    });
    clearCheckoutOrigin(store);
    expect(readCheckoutOrigin(store)).toBeNull();
  });

  it("VIOLATE: no origin does not kick a job", () => {
    const kick = vi.fn();
    const result = kickQueuedJobIfOrigin({ origin: null, kick });
    expect(result.kicked).toBe(false);
    expect(kick).not.toHaveBeenCalled();
  });

  it("NOT-VACUOUS: a persisted origin does kick (proves the no-origin test could fail)", () => {
    const kick = vi.fn();
    const origin = { kind: "export" as const, label: "Terrain GLB" };
    const result = kickQueuedJobIfOrigin({ origin, kick });
    expect(result.kicked).toBe(true);
    expect(kick).toHaveBeenCalledTimes(1);
    expect(kick).toHaveBeenCalledWith(origin);
  });

  it("missing store key is treated as no origin — kick stays silent", () => {
    const store = memStore();
    expect(store.getItem(CHECKOUT_ORIGIN_KEY)).toBeNull();
    const kick = vi.fn();
    expect(kickQueuedJobIfOrigin({ store, kick }).kicked).toBe(false);
    expect(kick).not.toHaveBeenCalled();
  });
});

describe("reconcilePostCheckout — no origin, still not kicked", () => {
  it("confirmed without a persisted origin never calls kickQueuedJob", async () => {
    const kick = vi.fn();
    const result = await reconcilePostCheckout({
      search: "?checkout=success",
      kickQueuedJob: kick,
      strip: vi.fn(),
    });
    expect(result).toBe("confirmed");
    expect(kick).not.toHaveBeenCalled();
  });
});
