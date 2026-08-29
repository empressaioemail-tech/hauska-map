import { describe, expect, it } from "vitest";
import {
  searchBarWrapStyle,
  PE_MOBILE_BREAKPOINT_PX,
  dockLayoutStyle,
  resolveMobileSheetConflict,
  workbenchClusterStyle,
} from "./mobile-layout";
import { isMobileViewportWidth } from "./useMobileViewport";

describe("PE mobile breakpoint", () => {
  it("uses 768px — 390px phone widths are mobile", () => {
    expect(PE_MOBILE_BREAKPOINT_PX).toBe(768);
    expect(isMobileViewportWidth(390)).toBe(true);
    expect(isMobileViewportWidth(767)).toBe(true);
    expect(isMobileViewportWidth(768)).toBe(false);
    expect(isMobileViewportWidth(1280)).toBe(false);
  });
});

describe("single-sheet conflict resolution", () => {
  it("incoming sheet replaces the current sheet except map reset", () => {
    expect(resolveMobileSheetConflict("property", "research")).toBe("research");
    expect(resolveMobileSheetConflict("layers", "property")).toBe("property");
    expect(resolveMobileSheetConflict("research", "map")).toBe("map");
  });
});

describe("dockLayoutStyle — desktop preserved", () => {
  it("compact desktop dock hugs top-right", () => {
    const s = dockLayoutStyle(false, false);
    expect(s.top).toBe(12);
    // The rail capsule is 48 wide at right:18, occupying 18 through 66, so
    // 18 + 48 + 8 = 74 is what actually leaves an 8px channel. It was 66,
    // which put the dock FLUSH against the rail.
    expect(s.right).toBe(74);
    // chrome v2: ONE dock width for every tool (340), down from 400.
    // Widened 340 -> 380 on operator ruling 2026-08-27.
    expect(s.width).toBe("min(380px, calc(100vw - 98px))");
  });

  it("EXPANDED widens the COLUMN, keeping the compact anchor", () => {
    const s = dockLayoutStyle(true, false);
    // SUPERSEDED 2026-08-28: the column now stops before the find bar, which
    // shares this top band and is not allowed to move. 534 = 12 bar inset +
    // 436 bar + 12 channel + 74 right gutter.
    expect(s.width).toBe("clamp(380px, calc(100vw - 534px), 860px)");
    expect(String(s.maxHeight)).toBe("calc(100vh - 28px)");
  });
});

describe("dockLayoutStyle — mobile bottom sheet", () => {
  it("compact mobile dock is fixed above nav + tool picker", () => {
    const s = dockLayoutStyle(false, true);
    expect(s.position).toBe("fixed");
    expect(s.bottom).toBe(52 + 46);
    expect(s.width).toBe("100%");
  });

  it("expanded mobile report fills between search chrome and bottom nav", () => {
    const s = dockLayoutStyle(true, true);
    expect(s.top).toBe(64);
    expect(s.bottom).toBe(52);
    expect(s.width).toBe("100%");
  });
});

describe("workbench cluster hidden on mobile", () => {
  it("desktop cluster stays visible", () => {
    expect(workbenchClusterStyle(false).display).not.toBe("none");
  });

  it("mobile cluster is hidden (bottom nav + picker own tools)", () => {
    expect(workbenchClusterStyle(true).display).toBe("none");
  });
});

describe("the find bar is fixed and does not move", () => {
  // A version that shrank the bar around the expanded workbench column
  // shipped on 2026-08-28 and was pulled the same day — the operator did not
  // want it relocating as docks open and close. This pins the bar as a fixed
  // centred box so that behaviour does not come back by accident.
  //
  // The overlap it addressed is real and remains open: an expanded column can
  // sit over the bar. That is a known, accepted state, not an oversight.

  it("desktop is a fixed centred box, not anchored to the dock", () => {
    const style = searchBarWrapStyle(false);
    expect(style.width).toBe("min(436px, calc(100vw - 24px))");
    expect(String(style.right ?? "")).not.toContain("--ss-dock-reserve");
  });

  it("mobile fills the viewport, unchanged", () => {
    expect(searchBarWrapStyle(true).width).toBe("calc(100vw - 16px)");
  });
});

describe("expanded never comes out narrower than compact", () => {
  // A naive "viewport minus the bar" subtraction drops below the 380 compact
  // width on a small window, so the expand control would make the column
  // SMALLER — the opposite of its label. The max() floor is the guard; this
  // pins that it is present rather than trusting the expression reads right.
  it("floors the expanded width at the compact width", () => {
    const expanded = String(dockLayoutStyle(true, false).width);
    const compact = String(dockLayoutStyle(false, false).width);
    expect(compact).toContain("380px");
    expect(expanded.startsWith("clamp(380px,")).toBe(true);
  });

  it("uses clamp, NOT nested max(min()) — the nested form did not render", () => {
    // The nested version shipped and silently fell back to width:auto and
    // shrink-to-fit, landing near 855 so it looked like the old 860 and read
    // as a failed deploy. Pinned so it cannot come back.
    const w = String(dockLayoutStyle(true, false).width);
    expect(w.startsWith("clamp(")).toBe(true);
    expect(w).not.toContain("max(");
    expect(w).not.toContain("min(");
  });

  it("keeps the 860 ceiling it always had", () => {
    expect(String(dockLayoutStyle(true, false).width)).toContain("860px)");
  });

  it("reserves the bar PLUS both gutters, not just the bar", () => {
    // 534, not 436: a subtraction that forgets the gutters puts the column
    // flush against the bar and re-creates the overlap.
    expect(String(dockLayoutStyle(true, false).width)).toContain("100vw - 534px");
  });
});
