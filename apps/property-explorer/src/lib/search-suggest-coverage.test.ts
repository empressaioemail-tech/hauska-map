// P-353 — the suggest state machine carries the coverage notice to the dropdown.
//
// The component half is asserted in `browse/SearchBar-coverage.test.tsx`; this
// file asserts the state machine that feeds it, which is the only place a fetch
// result becomes customer-visible state (CP1's R3).
//
// Runs in BOTH directions: `search-suggest.ts` exists at 163fde32, where
// `startFetch` had no channel for a reason — the fetch result WAS the row
// array, so the object this harness resolves is stored as `items` and no notice
// can exist. Against the reverted tree the notice assertions fail on
// `undefined`, which is the absence of the channel.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSuggestController,
  type SuggestSnapshot,
} from "./search-suggest";
import type { Suggestion } from "./search-kinds";

const NOTICE =
  "We don't cover Milam County, TX yet, so that address is outside the area we can search.";

function sugg(label: string): Suggestion {
  return {
    kind: "address",
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
  last: () => SuggestSnapshot;
  settle: (outcome: unknown) => Promise<void>;
  fail: (err: Error) => Promise<void>;
}

function harness(): Harness {
  const snaps: SuggestSnapshot[] = [];
  let settleFn: ((v: unknown) => void) | null = null;
  let rejectFn: ((e: Error) => void) | null = null;
  const controller = createSuggestController({
    // The post-change contract: an outcome object, not a bare array.
    fetchSuggestions: () =>
      new Promise((res, rej) => {
        settleFn = res as (v: unknown) => void;
        rejectFn = rej;
      }) as Promise<Suggestion[]>,
    onChange: (s) => snaps.push(s),
    loadRecents: () => [],
    saveRecents: () => {},
  });
  return {
    controller,
    snaps,
    last: () => snaps[snaps.length - 1],
    settle: async (outcome) => {
      settleFn?.(outcome);
      await vi.advanceTimersByTimeAsync(0);
    },
    fail: async (err) => {
      rejectFn?.(err);
      await vi.advanceTimersByTimeAsync(0);
    },
  };
}

async function type(controller: ReturnType<typeof createSuggestController>, q: string) {
  controller.input(q);
  await vi.advanceTimersByTimeAsync(300);
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("P-353 — the notice travels from the fetcher to the snapshot", () => {
  it("an out-of-coverage outcome puts the sentence in the snapshot and suppresses the generic empty", async () => {
    const h = harness();
    await type(h.controller, "99999 Zzyzx Rd, Cameron, TX");
    await h.settle({ suggestions: [], coverageNotice: NOTICE });
    const snap = h.last();
    expect(snap.coverageNotice).toBe(NOTICE);
    // The generic "keep typing" empty state must NOT be the reading.
    expect(snap.empty).toBe(false);
    expect(snap.items).toEqual([]);
    expect(snap.loading).toBe(false);
  });

  it("a bare array (the old shape) still works and carries no notice", async () => {
    const h = harness();
    await type(h.controller, "1010 Pecan");
    await h.settle([sugg("1010 Pecan St")]);
    const snap = h.last();
    expect(snap.coverageNotice).toBeNull();
    expect(snap.items).toHaveLength(1);
    expect(snap.empty).toBe(false);
  });

  it("a genuinely empty answer with no notice is STILL the honest empty state", async () => {
    const h = harness();
    await type(h.controller, "zzzzzz");
    await h.settle({ suggestions: [], coverageNotice: null });
    const snap = h.last();
    expect(snap.empty).toBe(true);
    expect(snap.coverageNotice).toBeNull();
  });

  it("typing again clears a stale notice before the new answer arrives", async () => {
    const h = harness();
    await type(h.controller, "99999 Zzyzx Rd, Cameron, TX");
    await h.settle({ suggestions: [], coverageNotice: NOTICE });
    expect(h.last().coverageNotice).toBe(NOTICE);
    await type(h.controller, "1010 Pecan");
    // The stale sentence is gone the moment a new fetch starts.
    expect(h.last().coverageNotice).toBeNull();
  });

  it("a failed fetch is 'unavailable', never a coverage notice", async () => {
    const h = harness();
    await type(h.controller, "1010 Pecan");
    await h.fail(new Error("boom"));
    const snap = h.last();
    expect(snap.unavailable).toBe(true);
    expect(snap.coverageNotice).toBeNull();
    expect(snap.empty).toBe(false);
  });

  it("closing the dropdown clears the notice with the rest of the state", async () => {
    const h = harness();
    await type(h.controller, "99999 Zzyzx Rd, Cameron, TX");
    await h.settle({ suggestions: [], coverageNotice: NOTICE });
    h.controller.close();
    expect(h.last().coverageNotice).toBeNull();
  });
});
