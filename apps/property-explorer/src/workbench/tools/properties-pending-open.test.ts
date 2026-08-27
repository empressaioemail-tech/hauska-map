// W5.2 pending-open request — consume-once, refuse empty.

import { afterEach, describe, expect, it } from "vitest";
import {
  initialPropertiesView,
  peekOpenSavedPropertyRequest,
  requestOpenSavedProperty,
  resetOpenSavedPropertyRequest,
  takeOpenSavedPropertyRequest,
} from "./properties-pending-open";

afterEach(() => {
  resetOpenSavedPropertyRequest();
});

describe("properties pending-open request", () => {
  it("refuses an empty id (fail closed — never a fabricated parcel)", () => {
    requestOpenSavedProperty("   ");
    expect(peekOpenSavedPropertyRequest()).toBeNull();
    expect(initialPropertiesView()).toEqual({ kind: "list" });
  });

  it("take consumes once; a second take is empty", () => {
    requestOpenSavedProperty("48055:987");
    expect(takeOpenSavedPropertyRequest()).toBe("48055:987");
    expect(takeOpenSavedPropertyRequest()).toBeNull();
  });

  it("initialPropertiesView opens detail then returns to list", () => {
    requestOpenSavedProperty("48021:123");
    expect(initialPropertiesView()).toEqual({
      kind: "detail",
      parcelNodeId: "48021:123",
    });
    expect(initialPropertiesView()).toEqual({ kind: "list" });
  });
});
