import { describe, expect, it } from "vitest";
import {
  closeOneDock,
  expandDock,
  EMPTY_STACK,
  isExpandedIn,
  newestOpen,
  pruneStack,
  syncStack,
  tapDock,
  toggleFold,
  type DockStack,
} from "./dock-stack";

// SECOND CUT. The first version auto-folded every other dock when one opened,
// and these tests happily pinned that — they were a faithful description of
// the wrong behaviour. The operator asked twice for MULTIPLE OPEN CONTAINERS
// you scroll through. The governing assertion is now the last describe block:
// nothing folds or closes except by an explicit act on that dock.

const stack = (open: string[], folded: string[] = []): DockStack => ({
  open,
  folded,
});

describe("tapDock — the rail bubble", () => {
  it("opens a tool EXPANDED and leaves every other dock untouched", () => {
    let s = tapDock(EMPTY_STACK, "brief");
    expect(s).toEqual(stack(["brief"]));
    s = tapDock(s, "chat");
    expect(s.open).toEqual(["brief", "chat"]);
    expect(s.folded).toEqual([]);
    expect(isExpandedIn(s, "brief")).toBe(true);
    expect(isExpandedIn(s, "chat")).toBe(true);
  });

  it("does NOT fold a dock the user folded, when a new one opens", () => {
    const before = stack(["brief", "chat"], ["brief"]);
    const after = tapDock(before, "reports");
    expect(after.folded).toEqual(["brief"]);
    expect(isExpandedIn(after, "chat")).toBe(true);
    expect(isExpandedIn(after, "reports")).toBe(true);
  });

  it("a second tap on an open bubble closes that tool", () => {
    const after = tapDock(stack(["brief", "chat"]), "chat");
    expect(after.open).toEqual(["brief"]);
  });

  it("closing the last tool empties the column", () => {
    expect(tapDock(stack(["brief"]), "brief")).toEqual(EMPTY_STACK);
  });
});

describe("toggleFold — the ONLY thing that folds a dock", () => {
  it("folds an expanded dock and unfolds a folded one", () => {
    const open = stack(["brief", "chat"]);
    const folded = toggleFold(open, "brief");
    expect(folded.folded).toEqual(["brief"]);
    expect(isExpandedIn(folded, "brief")).toBe(false);
    expect(isExpandedIn(folded, "chat")).toBe(true);
    expect(toggleFold(folded, "brief")).toEqual(open);
  });

  it("folding one dock never touches another", () => {
    const after = toggleFold(stack(["brief", "chat", "reports"]), "chat");
    expect(isExpandedIn(after, "brief")).toBe(true);
    expect(isExpandedIn(after, "reports")).toBe(true);
    expect(after.open).toEqual(["brief", "chat", "reports"]);
  });

  it("works on a stack of one — folding is a user act, not a count effect", () => {
    expect(toggleFold(stack(["brief"]), "brief").folded).toEqual(["brief"]);
  });

  it("is inert for a tool that is not open", () => {
    const before = stack(["brief"]);
    expect(toggleFold(before, "chat")).toBe(before);
  });
});

describe("closeOneDock — the close control", () => {
  it("removes exactly one tool, from open and folded alike", () => {
    const after = closeOneDock(stack(["brief", "chat"], ["chat"]), "chat");
    expect(after).toEqual(stack(["brief"]));
  });

  it("closing one leaves the others exactly as they were", () => {
    const after = closeOneDock(stack(["brief", "chat", "reports"], ["brief"]), "chat");
    expect(after.open).toEqual(["brief", "reports"]);
    expect(after.folded).toEqual(["brief"]);
  });
});

describe("syncStack — the app shell still owns one openToolId", () => {
  it("the shell opening a tool adds it WITHOUT folding anything", () => {
    const after = syncStack(stack(["brief", "chat"]), "reports");
    expect(after.open).toEqual(["brief", "chat", "reports"]);
    expect(after.folded).toEqual([]);
  });

  it("the shell naming a FOLDED tool unfolds it — it asked for it to be read", () => {
    const after = syncStack(stack(["brief", "chat"], ["brief"]), "brief");
    expect(isExpandedIn(after, "brief")).toBe(true);
  });

  it("re-asserting an already-expanded tool is a no-op (no render loop)", () => {
    const before = stack(["brief", "chat"]);
    expect(syncStack(before, "chat")).toBe(before);
  });

  it("the shell setting null still empties the column", () => {
    expect(syncStack(stack(["brief", "chat"]), null)).toEqual(EMPTY_STACK);
  });
});

describe("newestOpen — what the shell tracks", () => {
  it("is the most recently opened tool", () => {
    expect(newestOpen(stack(["brief", "chat"]))).toBe("chat");
  });
  it("is null on an empty column", () => {
    expect(newestOpen(EMPTY_STACK)).toBeNull();
  });
  it("does not care whether that tool is folded", () => {
    expect(newestOpen(stack(["brief", "chat"], ["chat"]))).toBe("chat");
  });
});

describe("pruneStack — a tool leaving the registry mid-session", () => {
  it("drops the unknown tool from both lists", () => {
    const after = pruneStack(stack(["brief", "gone"], ["gone"]), new Set(["brief"]));
    expect(after).toEqual(stack(["brief"]));
  });
  it("is identity when everything is registered (no render loop)", () => {
    const before = stack(["brief", "chat"]);
    expect(pruneStack(before, new Set(["brief", "chat"]))).toBe(before);
  });
});

describe("THE GOVERNING RULE: open means open", () => {
  it("opening four tools leaves all four EXPANDED", () => {
    let s: DockStack = EMPTY_STACK;
    for (const id of ["brief", "chat", "reports", "properties"]) {
      s = tapDock(s, id);
    }
    expect(s.open).toEqual(["brief", "chat", "reports", "properties"]);
    expect(s.folded).toEqual([]);
    for (const id of s.open) expect(isExpandedIn(s, id)).toBe(true);
  });

  it("nothing folds or closes except an explicit act on THAT dock", () => {
    // The regression this whole file exists to prevent: an accordion that
    // quietly puts away what the user was reading.
    let s: DockStack = tapDock(tapDock(tapDock(EMPTY_STACK, "a"), "b"), "c");
    const expandedBefore = s.open.filter((id) => isExpandedIn(s, id));
    expect(expandedBefore).toHaveLength(3);

    s = tapDock(s, "d");
    expect(s.open.filter((id) => isExpandedIn(s, id))).toHaveLength(4);

    s = syncStack(s, "e");
    expect(s.open.filter((id) => isExpandedIn(s, id))).toHaveLength(5);

    // Only now, and only because the user asked for exactly this one:
    s = toggleFold(s, "b");
    expect(s.open.filter((id) => isExpandedIn(s, id))).toHaveLength(4);
    expect(s.open).toHaveLength(5);
  });

  it("expandDock never folds anything on its way", () => {
    const after = expandDock(stack(["a", "b", "c"], ["a", "b"]), "a");
    expect(after.folded).toEqual(["b"]);
  });
});
