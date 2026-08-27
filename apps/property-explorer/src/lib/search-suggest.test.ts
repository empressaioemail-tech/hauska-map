// Suggest state-machine tests — debounce, stale-request cancellation,
// parcel-id fast path, keyboard navigation, recents, honest unavailable state.
// Pure logic (createSuggestController), fake timers, no DOM.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSuggestController,
  SUGGEST_DEBOUNCE_MS,
  type SuggestSnapshot,
} from "./search-suggest";
import type { Suggestion } from "./search-kinds";

function sugg(label: string, kind: Suggestion["kind"] = "address"): Suggestion {
  return {
    kind,
    label,
    sublabel: null,
    lat: 30.1,
    lng: -97.3,
    extent: null,
    parcelNodeId: null,
    lookupQuery: label,
  };
}

interface Harness {
  controller: ReturnType<typeof createSuggestController>;
  snaps: SuggestSnapshot[];
  calls: Array<{ query: string; signal: AbortSignal }>;
  /** Settle the i-th fetch call (per-call, so a STALE first call can resolve late). */
  resolveCall: (index: number, results: Suggestion[]) => void;
  rejectCall: (index: number, err: Error) => void;
}

function harness(opts?: { recents?: Suggestion[] }): Harness {
  const snaps: SuggestSnapshot[] = [];
  const calls: Array<{ query: string; signal: AbortSignal }> = [];
  const settles: Array<{ res: (r: Suggestion[]) => void; rej: (e: Error) => void }> =
    [];
  const controller = createSuggestController({
    fetchSuggestions: (query, signal) => {
      calls.push({ query, signal });
      return new Promise<Suggestion[]>((res, rej) => {
        settles.push({ res, rej });
      });
    },
    onChange: (s) => snaps.push(s),
    loadRecents: () => opts?.recents ?? [],
    saveRecents: () => {},
  });
  return {
    controller,
    snaps,
    calls,
    resolveCall: (i, r) => settles[i]?.res(r),
    rejectCall: (i, e) => settles[i]?.rej(e),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("debounce", () => {
  it("debounce is ~250ms — 10–15s is a fail, and there is no row-dropping fast path", () => {
    expect(SUGGEST_DEBOUNCE_MS).toBe(250);
    expect(SUGGEST_DEBOUNCE_MS).toBeLessThan(1000);
  });

  it("fires ONE fetch ~250ms after the last keystroke, not per keystroke", async () => {
    const h = harness();
    h.controller.input("ma");
    h.controller.input("mai");
    h.controller.input("main");
    expect(h.calls.length).toBe(0);
    vi.advanceTimersByTime(SUGGEST_DEBOUNCE_MS - 1);
    expect(h.calls.length).toBe(0);
    vi.advanceTimersByTime(1);
    expect(h.calls.length).toBe(1);
    expect(h.calls[0].query).toBe("main");
    // loading shown while waiting.
    expect(h.controller.getSnapshot().loading).toBe(true);
    h.resolveCall(0, [sugg("Main Street", "street")]);
    await vi.runAllTimersAsync();
  });

  it("shows results and highlights the first row when the fetch lands", async () => {
    const h = harness();
    h.controller.input("main st");
    vi.advanceTimersByTime(SUGGEST_DEBOUNCE_MS);
    h.resolveCall(0, [sugg("Main St A"), sugg("Main St B")]);
    await vi.runAllTimersAsync();
    const s = h.controller.getSnapshot();
    expect(s.loading).toBe(false);
    expect(s.items.map((i) => i.label)).toEqual(["Main St A", "Main St B"]);
    expect(s.highlighted).toBe(0);
    expect(s.empty).toBe(false);
  });
});

describe("stale-request cancellation", () => {
  it("aborts the in-flight request when the query changes", () => {
    const h = harness();
    h.controller.input("bastrop");
    vi.advanceTimersByTime(SUGGEST_DEBOUNCE_MS);
    expect(h.calls.length).toBe(1);
    const firstSignal = h.calls[0].signal;
    expect(firstSignal.aborted).toBe(false);
    h.controller.input("bastrop t");
    expect(firstSignal.aborted).toBe(true);
  });

  it("drops a LATE result for a superseded query (no flicker-back)", async () => {
    const h = harness();
    h.controller.input("austin");
    vi.advanceTimersByTime(SUGGEST_DEBOUNCE_MS);
    h.controller.input("austin tx");
    vi.advanceTimersByTime(SUGGEST_DEBOUNCE_MS);
    // First (stale) response arrives after the second fetch started.
    h.resolveCall(0, [sugg("STALE")]);
    await vi.runAllTimersAsync();
    expect(
      h.controller.getSnapshot().items.map((i) => i.label),
    ).not.toContain("STALE");
  });

  it("close() cancels the pending debounce entirely", () => {
    const h = harness();
    h.controller.input("elgin");
    h.controller.close();
    vi.advanceTimersByTime(SUGGEST_DEBOUNCE_MS * 4);
    expect(h.calls.length).toBe(0);
    expect(h.controller.getSnapshot().open).toBe(false);
  });
});

describe("parcel-id fast path", () => {
  it("renders the direct-open suggestion immediately with NO geocoder call", () => {
    const h = harness();
    h.controller.input("48021:34177");
    vi.advanceTimersByTime(SUGGEST_DEBOUNCE_MS * 4);
    expect(h.calls.length).toBe(0);
    const s = h.controller.getSnapshot();
    expect(s.items.length).toBe(1);
    expect(s.items[0].kind).toBe("parcel");
    expect(s.items[0].label).toBe("Open parcel 48021:34177");
    expect(s.items[0].parcelNodeId).toBe("48021:34177");
    expect(s.highlighted).toBe(0);
  });
});

describe("keyboard navigation", () => {
  async function withItems(): Promise<Harness> {
    const h = harness();
    h.controller.input("main");
    vi.advanceTimersByTime(SUGGEST_DEBOUNCE_MS);
    h.resolveCall(0, [sugg("A"), sugg("B"), sugg("C")]);
    await vi.runAllTimersAsync();
    return h;
  }

  it("ArrowDown/Up move and WRAP across rows", async () => {
    const h = await withItems();
    expect(h.controller.getSnapshot().highlighted).toBe(0);
    h.controller.moveHighlight(1);
    expect(h.controller.getSnapshot().highlighted).toBe(1);
    h.controller.moveHighlight(1);
    h.controller.moveHighlight(1); // wraps past the end
    expect(h.controller.getSnapshot().highlighted).toBe(0);
    h.controller.moveHighlight(-1); // wraps back to the last
    expect(h.controller.getSnapshot().highlighted).toBe(2);
  });

  it("select() returns the highlighted row and closes the dropdown", async () => {
    const h = await withItems();
    h.controller.moveHighlight(1);
    const chosen = h.controller.select();
    expect(chosen?.label).toBe("B");
    const s = h.controller.getSnapshot();
    expect(s.open).toBe(false);
    expect(s.recents[0]?.label).toBe("B"); // recorded as a recent
  });

  it("select(i) picks an explicit row (mouse click)", async () => {
    const h = await withItems();
    expect(h.controller.select(2)?.label).toBe("C");
  });
});

describe("recents", () => {
  it("shows recents when focused with an EMPTY box; caps at 6; clearable", () => {
    const seed = [sugg("R1"), sugg("R2")];
    const h = harness({ recents: seed });
    h.controller.focus();
    let s = h.controller.getSnapshot();
    expect(s.open).toBe(true);
    expect(s.showingRecents).toBe(true);
    expect(s.recents.map((r) => r.label)).toEqual(["R1", "R2"]);
    for (let i = 0; i < 8; i++) {
      h.controller.recordSelection(sugg(`N${i}`));
    }
    s = h.controller.getSnapshot();
    expect(s.recents.length).toBe(6); // max ~6
    expect(s.recents[0].label).toBe("N7"); // newest first
    h.controller.clearRecents();
    expect(h.controller.getSnapshot().recents).toEqual([]);
  });

  it("does NOT open on focus when there are no recents and the box is empty", () => {
    const h = harness();
    h.controller.focus();
    expect(h.controller.getSnapshot().open).toBe(false);
  });
});

describe("honest states", () => {
  it("geocoder failure -> unavailable state, never a silent fake empty", async () => {
    const h = harness();
    h.controller.input("somewhere");
    vi.advanceTimersByTime(SUGGEST_DEBOUNCE_MS);
    h.rejectCall(0, new Error("geocode 502"));
    await vi.runAllTimersAsync();
    const s = h.controller.getSnapshot();
    expect(s.unavailable).toBe(true);
    expect(s.empty).toBe(false);
    expect(s.loading).toBe(false);
  });

  it("zero results -> honest EMPTY state (distinct from unavailable)", async () => {
    const h = harness();
    h.controller.input("zzzzzz qqqq");
    vi.advanceTimersByTime(SUGGEST_DEBOUNCE_MS);
    h.resolveCall(0, []);
    await vi.runAllTimersAsync();
    const s = h.controller.getSnapshot();
    expect(s.empty).toBe(true);
    expect(s.unavailable).toBe(false);
  });
});

describe("syncToSubjectCommit", () => {
  it("closes the dropdown, clears suggestion rows, and aborts in-flight fetch", async () => {
    const h = harness();
    h.controller.input("simsbrook");
    vi.advanceTimersByTime(SUGGEST_DEBOUNCE_MS);
    expect(h.calls.length).toBe(1);
    const signal = h.calls[0].signal;
    h.controller.syncToSubjectCommit();
    expect(signal.aborted).toBe(true);
    const s = h.controller.getSnapshot();
    expect(s.open).toBe(false);
    expect(s.items).toEqual([]);
    expect(s.loading).toBe(false);
    h.resolveCall(0, [sugg("17001 Simsbrook Dr")]);
    await vi.runAllTimersAsync();
    expect(h.controller.getSnapshot().items).toEqual([]);
  });
});
