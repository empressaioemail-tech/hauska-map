import { describe, expect, it } from "vitest";
import { isReadyForPickup, readyCount } from "./useRecordsUnread";
import type { RecordsInboxRow } from "./recordsRequestClient";

// The rail's gold dot has to mean something real. These pin the rule that
// feeds it, because the failure mode of an unread indicator is that it lights
// on a guess and then nobody trusts any dot in the product again.

const row = (over: Partial<RecordsInboxRow> = {}): RecordsInboxRow => ({
  jobId: "j1",
  parcelNodeId: "48021:34137",
  phase: "index" as RecordsInboxRow["phase"],
  jobStatus: "succeeded",
  errorCode: null,
  indexHitsCount: 3,
  finishReason: null,
  updatedAt: "2026-08-27T00:00:00.000Z",
  ...over,
});

describe("isReadyForPickup — what earns the dot", () => {
  it("a finished, clean run is ready", () => {
    expect(isReadyForPickup(row())).toBe(true);
  });

  it("a run still queued or running is NOT ready", () => {
    expect(isReadyForPickup(row({ jobStatus: "queued" }))).toBe(false);
    expect(isReadyForPickup(row({ jobStatus: "running" }))).toBe(false);
  });

  it("a finished run that ERRORED is not news — a failure must not light the dot", () => {
    expect(isReadyForPickup(row({ jobStatus: "failed", errorCode: "E_TIMEOUT" }))).toBe(
      false,
    );
  });

  it("does not match a success LITERAL — an unknown spelling still counts as finished", () => {
    // jobStatus is an upstream string. Guessing which word means success
    // ("done" / "complete" / "succeeded") would be a defaulted binding, so the
    // rule is derived from not-active + no-error instead.
    for (const spelling of ["succeeded", "done", "complete", "finished", "ok"]) {
      expect(isReadyForPickup(row({ jobStatus: spelling }))).toBe(true);
    }
  });
});

describe("readyCount", () => {
  it("counts only the rows that earned it", () => {
    expect(
      readyCount([
        row({ jobId: "a" }),
        row({ jobId: "b", jobStatus: "running" }),
        row({ jobId: "c", jobStatus: "failed", errorCode: "E" }),
        row({ jobId: "d" }),
      ]),
    ).toBe(2);
  });

  it("an empty inbox is zero, which renders NO dot", () => {
    expect(readyCount([])).toBe(0);
  });

  it("is not vacuous: a list of only-active rows counts zero, not its length", () => {
    expect(readyCount([row({ jobStatus: "running" }), row({ jobStatus: "queued" })])).toBe(
      0,
    );
  });
});
