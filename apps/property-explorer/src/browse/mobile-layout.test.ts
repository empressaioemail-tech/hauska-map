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
    // UI QA Batch 7 (operator, 2026-09-08): the column no longer stops short
    // of the find bar. Roughly two-thirds of the viewport, floored at the
    // compact width, ceilinged at 1280 for ultra-wide monitors.
    expect(s.width).toBe("clamp(380px, 66vw, 1280px)");
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
  // SMALLER — the opposite of its label. The floor is the guard; this pins
  // that it is present rather than trusting the expression reads right.
  it("floors the expanded width at the compact width", () => {
    const expanded = String(dockLayoutStyle(true, false).width);
    const compact = String(dockLayoutStyle(false, false).width);
    expect(compact).toContain("380px");
    expect(expanded.startsWith("clamp(380px,")).toBe(true);
  });

  it("uses clamp, NOT nested max(min()) — the nested form did not render", () => {
    // The nested version shipped once (a different formula) and silently fell
    // back to width:auto and shrink-to-fit. Pinned so that failure mode cannot
    // come back regardless of which formula clamp() wraps.
    const w = String(dockLayoutStyle(true, false).width);
    expect(w.startsWith("clamp(")).toBe(true);
    expect(w).not.toContain("max(");
    expect(w).not.toContain("min(");
  });

  it("ceilings at 1280 on ultra-wide monitors", () => {
    // UI QA Batch 7: raised from the old 860 ceiling, which fell to under
    // half the viewport at 1920 — too far from "roughly two-thirds" on an
    // ordinary desktop monitor to satisfy the ask. 1280 clears 66vw at 1920
    // (1920 * 0.66 = 1267.2), the single most common desktop resolution.
    expect(String(dockLayoutStyle(true, false).width)).toContain("1280px)");
  });
});

describe("expanded is roughly two-thirds of the viewport (UI QA Batch 7, operator 2026-09-08)", () => {
  // Reverses the 2026-08-28/29 ruling: expanded panels (AI Chat, Compare,
  // etc.) may now extend past the search bar. This is the geometry test that
  // replaces the old "the expanded column never reaches the centred find bar"
  // test — that outcome is exactly what this batch asked to stop guaranteeing.
  const width = (vw: number) => Math.min(1280, Math.max(380, vw * 0.66));

  it("tracks 66vw across the common desktop range, not vacuously clamped at either end", () => {
    for (const vw of [1024, 1280, 1440, 1600, 1920]) {
      const w = width(vw);
      // NOT VACUOUS: prove this sits strictly between the two clamp bounds
      // for at least the bulk of the range, or a formula that always returns
      // the floor or the ceiling would still pass a looser assertion.
      expect(w).toBeGreaterThan(380);
      expect(w).toBeCloseTo(vw * 0.66, 0);
    }
  });

  it("stays within roughly two-thirds even where the 1280 ceiling caps it on very wide screens", () => {
    for (const vw of [2200, 2560, 3440]) {
      const w = width(vw);
      expect(w).toBe(1280);
      // "Up to roughly two-thirds" — never MORE than 66vw, never above the
      // ceiling.
      expect(w).toBeLessThanOrEqual(vw * 0.66);
    }
  });

  it("never narrower than the compact width even on a small desktop window", () => {
    for (const vw of [800, 900, 1000]) {
      expect(width(vw)).toBeGreaterThanOrEqual(380);
    }
  });

  it("the formula in the source matches this test's model, not a hand-verified guess", () => {
    const w = String(dockLayoutStyle(true, false).width);
    expect(w).toBe("clamp(380px, 66vw, 1280px)");
  });

  it("no longer reserves anything for the find bar — the overlap is now accepted, not routed around", () => {
    const w = String(dockLayoutStyle(true, false).width);
    expect(w).not.toContain("--ss-find-w");
    expect(w).not.toContain("50vw - 86px");
  });
});
