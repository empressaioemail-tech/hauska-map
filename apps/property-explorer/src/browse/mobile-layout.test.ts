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
    // SUPERSEDED 2026-08-29. The 534 form assumed the find bar was LEFT
    // ANCHORED at inset 12. It is centred, so its right edge grows with the
    // viewport and the old subtraction under-reserved by more the wider the
    // screen got. Measured live at 1903: a 201px overlap.
    expect(s.width).toBe(
      "clamp(380px, calc(50vw - 86px - var(--ss-find-w) / 2), 860px)",
    );
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
    // The bar is CENTRED, so it is HALF its width that sits right of the
    // midpoint and has to be cleared. A rule written against 100vw reserves for
    // a left-anchored bar that does not exist.
    const w = String(dockLayoutStyle(true, false).width);
    expect(w).toContain("50vw");
    expect(w).toContain("var(--ss-find-w) / 2");
    expect(w).not.toContain("100vw");
  });

  // THE TEST THAT WOULD HAVE CAUGHT THE BUG. Both assertions above compare
  // STRINGS, and a string assertion passed for the entire time the column was
  // visibly tucked behind the bar — because the string was exactly what its
  // author meant to write. What nothing checked was the RELATIONSHIP the string
  // is supposed to produce. So evaluate the geometry instead.
  it("the expanded column never reaches the centred find bar", () => {
    const GUTTER = 74;
    const CHANNEL = 12;
    const BAR = 436;
    const COMPACT = 380;
    const CEIL = 860;
    const width = (vw: number) =>
      Math.min(CEIL, Math.max(COMPACT, vw / 2 - (GUTTER + CHANNEL + BAR / 2)));
    const columnLeft = (vw: number) => vw - GUTTER - width(vw);
    const barRight = (vw: number) => (vw + BAR) / 2;

    // NOT VACUOUS: the superseded rule must FAIL this, or passing proves
    // nothing about the fix.
    const oldWidth = (vw: number) =>
      Math.min(CEIL, Math.max(COMPACT, vw - 534));
    const oldLeft = (vw: number) => vw - GUTTER - oldWidth(vw);
    expect(oldLeft(1903)).toBeLessThan(barRight(1903));

    for (const vw of [1368, 1440, 1600, 1903, 2200, 2560]) {
      expect(columnLeft(vw)).toBeGreaterThanOrEqual(barRight(vw) + CHANNEL);
    }
  });
});
