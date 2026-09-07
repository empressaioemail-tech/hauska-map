// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearPendingShareAttribution,
  readPendingShareAttribution,
  stashPendingShareAttribution,
} from "./share-attribution-retry";

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  window.localStorage.clear();
});

describe("share-attribution-retry", () => {
  it("round-trips a stashed claim", () => {
    stashPendingShareAttribution({ grantId: "g1", surface: "share-landing" });
    expect(readPendingShareAttribution()).toEqual({
      grantId: "g1",
      surface: "share-landing",
    });
  });

  it("returns null when nothing is stashed", () => {
    expect(readPendingShareAttribution()).toBeNull();
  });

  it("clears the stash", () => {
    stashPendingShareAttribution({ grantId: "g1", surface: "share-landing" });
    clearPendingShareAttribution();
    expect(readPendingShareAttribution()).toBeNull();
  });

  it("survives across independent reads (durability across a reload, not just one call)", () => {
    stashPendingShareAttribution({ grantId: "g2", surface: "share-landing" });
    // A fresh read call simulates a later app boot reading storage cold.
    expect(readPendingShareAttribution()).toEqual({
      grantId: "g2",
      surface: "share-landing",
    });
    expect(readPendingShareAttribution()).toEqual({
      grantId: "g2",
      surface: "share-landing",
    });
  });

  it("ignores malformed stored JSON rather than throwing (falsifier)", () => {
    window.localStorage.setItem("pe_pending_share_attribution", "{not json");
    expect(readPendingShareAttribution()).toBeNull();
  });

  it("ignores a stored value missing required fields (falsifier)", () => {
    window.localStorage.setItem(
      "pe_pending_share_attribution",
      JSON.stringify({ grantId: "" }),
    );
    expect(readPendingShareAttribution()).toBeNull();
  });

  it("a newer stash overwrites an older unclaimed one", () => {
    stashPendingShareAttribution({ grantId: "old", surface: "share-landing" });
    stashPendingShareAttribution({ grantId: "new", surface: "share-landing" });
    expect(readPendingShareAttribution()).toEqual({
      grantId: "new",
      surface: "share-landing",
    });
  });
});
