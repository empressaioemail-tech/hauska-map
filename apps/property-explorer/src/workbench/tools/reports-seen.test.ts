import { describe, expect, it } from "vitest";
import {
  isUnseen,
  markOneSeen,
  reportKey,
  resolveSeen,
  unseenCount,
} from "./reports-seen";

const row = (parcelNodeId: string, kind: string, savedAt: string) => ({
  parcelNodeId,
  kind,
  savedAt,
});

const A = row("48021:35433", "xray", "2026-08-28T10:00:00Z");
const B = row("48021:27943", "flood-drainage", "2026-08-28T11:00:00Z");

describe("reportKey — identity survives the same kind on two parcels", () => {
  it("distinguishes parcel, kind, and time", () => {
    expect(reportKey(A)).not.toBe(reportKey(B));
    expect(reportKey(row("48021:1", "xray", "T"))).not.toBe(
      reportKey(row("48021:2", "xray", "T")),
    );
    // Same parcel, same kind, re-run later: a NEW report, not the old one.
    expect(reportKey(row("p", "xray", "T1"))).not.toBe(
      reportKey(row("p", "xray", "T2")),
    );
  });
});

describe("resolveSeen — absent is not unseen", () => {
  it("SEEDS on first run, so an existing library does not all light up", () => {
    // The operator has 25 filed reports the day this ships. None of them are
    // news. Announcing them would assert a fact we never recorded.
    const seen = resolveSeen([A, B], null);
    expect(unseenCount([A, B], seen)).toBe(0);
  });

  it("an EMPTY tracked set is preserved — that is 'seen nothing', not 'untracked'", () => {
    // The distinction the whole module exists for. Empty must NOT re-seed.
    const seen = resolveSeen([A, B], new Set<string>());
    expect(unseenCount([A, B], seen)).toBe(2);
  });

  it("keeps what was tracked and lights only what arrived after", () => {
    const seen = resolveSeen([A, B], new Set([reportKey(A)]));
    expect(isUnseen(A, seen)).toBe(false);
    expect(isUnseen(B, seen)).toBe(true);
    expect(unseenCount([A, B], seen)).toBe(1);
  });

  it("does not mutate the stored set it was handed", () => {
    const stored = new Set([reportKey(A)]);
    const seen = resolveSeen([A, B], stored);
    seen.add(reportKey(B));
    expect(stored.has(reportKey(B))).toBe(false);
  });
});

describe("unseenCount — the ambient number", () => {
  it("is zero on an empty library, never a guess", () => {
    expect(unseenCount([], resolveSeen([], null))).toBe(0);
    expect(unseenCount([], new Set())).toBe(0);
  });
});

describe("markOneSeen — viewing or downloading ONE report clears only that report", () => {
  it("clears the row that was acted on", () => {
    const seen = markOneSeen(A, new Set<string>());
    expect(isUnseen(A, seen)).toBe(false);
  });

  it("does NOT clear any other still-unread report", () => {
    // The correction this exists for: opening the Reports tool, or acting
    // on one report, must never announce a DIFFERENT report as looked-at.
    const seen = markOneSeen(A, new Set<string>());
    expect(isUnseen(B, seen)).toBe(true);
    expect(unseenCount([A, B], seen)).toBe(1);
  });

  it("stacks — marking each report seen in turn clears the dot only once all are done", () => {
    let seen = markOneSeen(A, new Set<string>());
    expect(unseenCount([A, B], seen)).toBe(1);
    seen = markOneSeen(B, seen);
    expect(unseenCount([A, B], seen)).toBe(0);
  });

  it("a report filed AFTER it was marked seen lights the dot again", () => {
    // The whole point: the dot means "something new", not "something
    // exists". If it could not come back on it would be as useless as one
    // that could not go off.
    const afterViewing = markOneSeen(A, new Set<string>());
    const C = row("48021:1", "feasibility", "2026-08-29T09:00:00Z");
    expect(unseenCount([A, C], afterViewing)).toBe(1);
  });

  it("does not mutate the set it was handed", () => {
    const before = new Set<string>();
    markOneSeen(A, before);
    expect(before.size).toBe(0);
  });
});
