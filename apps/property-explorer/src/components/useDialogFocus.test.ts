import { describe, expect, it } from "vitest";
import { handleDialogKey } from "./useDialogFocus";

describe("handleDialogKey — trap math (P-96 item 3)", () => {
  it("Escape closes", () => {
    expect(handleDialogKey("Escape", false, 0, 4)).toEqual({
      close: true,
      nextIndex: null,
      preventDefault: true,
    });
  });

  it("Tab on the last control cycles to the first (violate: no wrap leaves the dialog)", () => {
    expect(handleDialogKey("Tab", false, 3, 4).nextIndex).toBe(0);
    expect(handleDialogKey("Tab", false, 3, 4).preventDefault).toBe(true);
    expect(handleDialogKey("Tab", false, 1, 4).nextIndex).toBeNull();
  });

  it("Shift+Tab on the first control cycles to the last", () => {
    expect(handleDialogKey("Tab", true, 0, 4).nextIndex).toBe(3);
    expect(handleDialogKey("Tab", true, 2, 4).nextIndex).toBeNull();
  });

  it("other keys do nothing", () => {
    expect(handleDialogKey("Enter", false, 0, 4)).toEqual({
      close: false,
      nextIndex: null,
      preventDefault: false,
    });
  });
});
