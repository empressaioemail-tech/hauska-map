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
    expect(s.width).toBe("min(860px, calc(100vw - 98px))");
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

describe("the find bar rescales around the expanded dock", () => {
  // THE BUG. The bar was centred on the whole viewport at a fixed 436px. The
  // workbench column expands to 860px on the right, so on a 1180px window it
  // covers x=246..1106 while the centred bar sits at 372..808 — completely
  // underneath it. Operator 2026-08-28.
  //
  // The fix spans the bar's wrap across the space LEFT OF the column, using a
  // reserve the Workbench publishes as --ss-dock-reserve. These pin that the
  // wrap actually reads it, because a centred fixed box passes any test that
  // only checks the bar renders.

  it("desktop wrap reserves the dock width instead of centring on the viewport", () => {
    const style = searchBarWrapStyle(false);
    expect(String(style.right)).toContain("--ss-dock-reserve");
    // A translate cannot centre inside a shrinking box, so it must be gone.
    expect(style.transform).toBe("none");
  });

  it("desktop wrap is anchored on BOTH edges, not by a width", () => {
    const style = searchBarWrapStyle(false);
    expect(style.left).toBe(12);
    expect(style.right).toBeDefined();
    // A fixed width would re-introduce the overlap regardless of the reserve.
    expect(style.width).toBeUndefined();
  });

  it("mobile is unchanged — it has no side column to avoid", () => {
    const style = searchBarWrapStyle(true);
    expect(style.width).toBe("calc(100vw - 16px)");
    expect(String(style.right ?? "")).not.toContain("--ss-dock-reserve");
  });
});
