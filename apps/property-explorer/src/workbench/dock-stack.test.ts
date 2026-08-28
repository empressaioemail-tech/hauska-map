import { describe, expect, it } from "vitest";
import {
  closeOneDock,
  expandDock,
  EMPTY_STACK,
  pruneStack,
  syncStack,
  tapDock,
  type DockStack,
} from "./dock-stack";

// These replace the two guards that enforced "ONE tool open at a time". The
// operator retired that ruling on 2026-08-27 after using the single-dock v2
// chrome; the guards were not deleted quietly, they were swapped for the
// assertions the new behaviour needs. Chief among them: NOTHING IS CLOSED ON
// THE USER'S BEHALF, which is the property the old single-dock rule violated
// by design and the only reason stacking is worth having.

const stack = (open: string[], expanded: string | null): DockStack => ({
  open,
  expanded,
});

describe("tapDock — the rail bubble", () => {
  it("opens a closed tool on top of the stack and expands it", () => {
    expect(tapDock(EMPTY_STACK, "brief")).toEqual(stack(["brief"], "brief"));
    expect(tapDock(stack(["brief"], "brief"), "chat")).toEqual(
      stack(["brief", "chat"], "chat"),
    );
  });

  it("FOLDS rather than closes: opening a second tool keeps the first open", () => {
    const after = tapDock(stack(["brief"], "brief"), "chat");
    expect(after.open).toContain("brief");
    expect(after.expanded).toBe("chat");
  });

  it("expands an already-open folded tool without reordering the stack", () => {
    const after = tapDock(stack(["brief", "chat", "reports"], "reports"), "brief");
    expect(after.open).toEqual(["brief", "chat", "reports"]);
    expect(after.expanded).toBe("brief");
  });

  it("a second tap on the EXPANDED tool closes that one tool", () => {
    const after = tapDock(stack(["brief", "chat"], "chat"), "chat");
    expect(after.open).toEqual(["brief"]);
    expect(after.expanded).toBe("brief");
  });

  it("closing the last tool empties the column", () => {
    expect(tapDock(stack(["brief"], "brief"), "brief")).toEqual(EMPTY_STACK);
  });
});

describe("expandDock — clicking a folded header", () => {
  it("expands it and folds whatever was expanded, closing nothing", () => {
    const after = expandDock(stack(["brief", "chat"], "chat"), "brief");
    expect(after.open).toEqual(["brief", "chat"]);
    expect(after.expanded).toBe("brief");
  });

  it("is inert for a tool that is not open", () => {
    const before = stack(["brief"], "brief");
    expect(expandDock(before, "chat")).toBe(before);
  });
});

describe("closeOneDock — the close control", () => {
  it("removes exactly one tool and hands expansion to the newest remaining", () => {
    const after = closeOneDock(stack(["brief", "chat", "reports"], "chat"), "chat");
    expect(after.open).toEqual(["brief", "reports"]);
    expect(after.expanded).toBe("reports");
  });

  it("closing a FOLDED tool leaves the expanded one alone", () => {
    const after = closeOneDock(stack(["brief", "chat"], "chat"), "brief");
    expect(after.open).toEqual(["chat"]);
    expect(after.expanded).toBe("chat");
  });

  it("never leaves a non-empty column with everything folded", () => {
    const after = closeOneDock(stack(["brief", "chat"], "chat"), "chat");
    expect(after.open.length).toBeGreaterThan(0);
    expect(after.expanded).not.toBeNull();
  });
});

describe("syncStack — the app shell still owns one openToolId", () => {
  it("the shell opening a tool expands it WITHOUT closing the others", () => {
    const after = syncStack(stack(["brief"], "brief"), "chat");
    expect(after.open).toEqual(["brief", "chat"]);
    expect(after.expanded).toBe("chat");
  });

  it("the shell re-asserting the expanded tool is a no-op (no render loop)", () => {
    const before = stack(["brief", "chat"], "chat");
    expect(syncStack(before, "chat")).toBe(before);
  });

  it("the shell setting null still empties the column", () => {
    expect(syncStack(stack(["brief", "chat"], "chat"), null)).toEqual(EMPTY_STACK);
  });
});

describe("pruneStack — a tool leaving the registry mid-session", () => {
  it("drops the unknown tool and re-expands from what is left", () => {
    const after = pruneStack(
      stack(["brief", "gone"], "gone"),
      new Set(["brief", "chat"]),
    );
    expect(after.open).toEqual(["brief"]);
    expect(after.expanded).toBe("brief");
  });

  it("is identity when everything is still registered (no render loop)", () => {
    const before = stack(["brief", "chat"], "chat");
    expect(pruneStack(before, new Set(["brief", "chat"]))).toBe(before);
  });
});

describe("the invariant the old single-dock rule could not hold", () => {
  it("no operation except an explicit close ever reduces what is open", () => {
    let s: DockStack = EMPTY_STACK;
    for (const id of ["brief", "chat", "reports", "properties"]) {
      const before = s.open.length;
      s = tapDock(s, id);
      expect(s.open.length).toBe(before + 1);
    }
    // Four open, one expanded, three folded — and every one of them still
    // reachable in a single click.
    expect(s.open).toEqual(["brief", "chat", "reports", "properties"]);
    expect(s.expanded).toBe("properties");
    for (const id of s.open) {
      expect(expandDock(s, id).expanded).toBe(id);
      expect(expandDock(s, id).open).toEqual(s.open);
    }
  });
});
