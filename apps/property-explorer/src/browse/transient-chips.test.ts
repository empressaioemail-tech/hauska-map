// Unit tests: transient notification-chip lifecycle (map UX cluster item 2).
// Pure engine — no DOM. Run: `pnpm --filter property-explorer test`

import { describe, it, expect } from "vitest";
import {
  advanceToasts,
  chipDisplayMs,
  reconcileToasts,
  visibleToasts,
  TOAST_FADE_MS,
  TOAST_MIN_MS,
  TOAST_MAX_MS,
  type ChipSpec,
  type Toast,
} from "./transient-chips";

const T0 = 1_000_000;

const chip = (key: string, text: string, sev: ChipSpec["sev"] = "info"): ChipSpec => ({
  key,
  sev,
  text,
});

describe("chipDisplayMs — readable duration scales with text, clamped 4–8 s", () => {
  it("short chip gets the 4 s floor", () => {
    expect(chipDisplayMs("Zoom in")).toBe(TOAST_MIN_MS);
  });
  it("long chip caps at 8 s", () => {
    expect(chipDisplayMs("x".repeat(400))).toBe(TOAST_MAX_MS);
  });
  it("medium chip lands strictly between the bounds", () => {
    const ms = chipDisplayMs(
      "Contours — 1 ft LiDAR (bastrop-county:Contour1Ft2017)",
    );
    expect(ms).toBeGreaterThan(TOAST_MIN_MS);
    expect(ms).toBeLessThan(TOAST_MAX_MS);
  });
});

describe("reconcileToasts", () => {
  it("a new chip becomes a showing toast with a readable expiry", () => {
    const next = reconcileToasts([], [chip("topo-ok", "Contours — 3DEP")], T0);
    expect(next).toHaveLength(1);
    expect(next[0].phase).toBe("showing");
    expect(next[0].expiresAt).toBe(T0 + chipDisplayMs("Contours — 3DEP"));
  });

  it("same key + same text keeps the existing toast (timer NOT restarted)", () => {
    const first = reconcileToasts([], [chip("a", "hello")], T0);
    const again = reconcileToasts(first, [chip("a", "hello")], T0 + 2_000);
    expect(again[0]).toBe(first[0]);
  });

  it("same key with CHANGED text is a new event — fresh toast, timer restart", () => {
    const first = reconcileToasts([], [chip("hydro-ok", "Flow lines — 3 D8 channels")], T0);
    const again = reconcileToasts(
      first,
      [chip("hydro-ok", "Flow lines — 7 D8 channels")],
      T0 + 2_000,
    );
    expect(again[0].phase).toBe("showing");
    expect(again[0].text).toBe("Flow lines — 7 D8 channels");
    expect(again[0].expiresAt).toBeGreaterThan(T0 + 2_000);
  });

  it("a chip removed from the source fades out early instead of lingering", () => {
    const first = reconcileToasts([], [chip("loading", "Loading live layers…")], T0);
    const next = reconcileToasts(first, [], T0 + 500);
    expect(next).toHaveLength(1);
    expect(next[0].phase).toBe("leaving");
    expect(next[0].leaveAt).toBe(T0 + 500);
  });

  it("an auto-dismissed toast does NOT resurrect while the source still reports the same state", () => {
    let toasts = reconcileToasts([], [chip("zoom", "Zoom in for parcels")], T0);
    // Auto-expire, then finish the fade → dismissed tombstone.
    const expiry = toasts[0].expiresAt;
    toasts = advanceToasts(toasts, expiry + 1);
    toasts = advanceToasts(toasts, expiry + 1 + TOAST_FADE_MS + 1);
    expect(toasts[0].phase).toBe("dismissed");
    // Source still reports the identical chip on the next renders.
    const again = reconcileToasts(toasts, [chip("zoom", "Zoom in for parcels")], T0 + 20_000);
    expect(again).toHaveLength(1);
    expect(again[0].phase).toBe("dismissed"); // tombstone holds — no re-toast
    expect(visibleToasts(again)).toHaveLength(0);
  });

  it("tombstone drops once the source stops reporting the key, so a future event toasts again", () => {
    const tombstone: Toast[] = [
      {
        key: "zoom",
        sev: "info",
        text: "Zoom in for parcels",
        phase: "dismissed",
        expiresAt: T0,
        leaveAt: T0,
      },
    ];
    const cleared = reconcileToasts(tombstone, [], T0 + 1_000);
    expect(cleared).toHaveLength(0);
    const reappeared = reconcileToasts(cleared, [chip("zoom", "Zoom in for parcels")], T0 + 5_000);
    expect(reappeared[0].phase).toBe("showing");
  });

  it("never stacks two entries for one key", () => {
    const first = reconcileToasts([], [chip("k", "one")], T0);
    const next = reconcileToasts(first, [chip("k", "two")], T0 + 100);
    expect(next.filter((t) => t.key === "k")).toHaveLength(1);
  });
});

describe("advanceToasts", () => {
  it("showing → leaving at expiry, leaving → dismissed after the fade", () => {
    let toasts = reconcileToasts([], [chip("a", "hello")], T0);
    const expiry = toasts[0].expiresAt;
    toasts = advanceToasts(toasts, expiry - 1);
    expect(toasts[0].phase).toBe("showing");
    toasts = advanceToasts(toasts, expiry);
    expect(toasts[0].phase).toBe("leaving");
    toasts = advanceToasts(toasts, expiry + TOAST_FADE_MS - 1);
    expect(toasts[0].phase).toBe("leaving");
    toasts = advanceToasts(toasts, expiry + TOAST_FADE_MS);
    expect(toasts[0].phase).toBe("dismissed");
  });

  it("returns the same array identity when nothing changed (render-stable)", () => {
    const toasts = reconcileToasts([], [chip("a", "hello")], T0);
    expect(advanceToasts(toasts, T0 + 1)).toBe(toasts);
  });
});
