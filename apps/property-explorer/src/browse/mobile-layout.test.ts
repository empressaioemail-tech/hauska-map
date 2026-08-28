import { describe, expect, it } from "vitest";
import {
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
    // Kit 04: the rail became a capsule at right:18 (46 wide with its
    // padding), so the dock moved 54 -> 66 to keep the same 8px channel.
    expect(s.right).toBe(66);
    // chrome v2: ONE dock width for every tool (340), down from 400.
    // Widened 340 -> 380 on operator ruling 2026-08-27.
    expect(s.width).toBe("min(380px, calc(100vw - 90px))");
  });

  it("expanded desktop dock is a large floating box, not full-screen", () => {
    const s = dockLayoutStyle(true, false);
    expect(s.width).toBe("min(860px, 78vw)");
    expect(String(s.maxHeight)).toBe("90vh");
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
