// PE workbench chassis (WB1) — cluster + shared-dock render tests.
//
// Static render via react-dom/server (node env, same pattern as
// PropertyBriefPanel.test.tsx — effects do not run, so fetch-free states are
// what render). Pins the design law mechanics:
//   - the cluster is the only always-on element (no dock when nothing open);
//   - ONE dock, ONE tool at a time (single-tenancy, incl. the pure toggle rule);
//   - honest "coming" state for registered-not-live tools;
//   - honest "select a property first" state for property-scoped tools;
//   - the brief renders IN the dock from the per-property chassis store
//     (embedded: Export PDF intact, dock owns the ×), and switching the
//     active property re-scopes it.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Workbench, nextOpenToolId, nextOpenToolIds, dockLayoutStyle, DEFAULT_DOCK_SIDE } from "./Workbench";
import { WORKBENCH_TOOLS } from "./registry";
import { createWorkbenchToolStateStore } from "./tool-state-store";
import type { WorkbenchHostActions, WorkbenchToolDef } from "./types";
import { ZONED_BRIEF } from "../browse/__fixtures__/research-brief.fixture";

const host: WorkbenchHostActions = { openPaywall: () => {} };
const noop = () => {};

function render(opts: {
  openToolId?: string | null;
  activeParcelNodeId?: string | null;
  store?: ReturnType<typeof createWorkbenchToolStateStore>;
}): string {
  return renderToStaticMarkup(
    <Workbench
      tools={WORKBENCH_TOOLS}
      openToolId={opts.openToolId ?? null}
      onOpenToolChange={noop}
      activeParcelNodeId={opts.activeParcelNodeId ?? null}
      host={host}
      store={opts.store ?? createWorkbenchToolStateStore({ storage: null })}
    />,
  );
}

describe("dock single-tenancy — the pure toggle rule", () => {
  it("tapping another bubble REPLACES the open tool", () => {
    expect(nextOpenToolId("brief", "chat")).toBe("chat");
    expect(nextOpenToolId(null, "brief")).toBe("brief");
  });
  it("tapping the ACTIVE bubble closes the dock", () => {
    expect(nextOpenToolId("brief", "brief")).toBeNull();
  });
});

describe("left-stack multi-open — map utilities only, never workbench tools", () => {
  it("tapping another LEFT utility ADDS it; tapping an open one removes it", () => {
    expect(nextOpenToolIds(["tools"], "layers")).toEqual(["tools", "layers"]);
    expect(nextOpenToolIds(["tools", "layers"], "tools")).toEqual(["layers"]);
    expect(nextOpenToolIds([], "tools")).toEqual(["tools"]);
  });
});

describe("bubble cluster", () => {
  it("renders seven rail bubbles including brief and no dock while closed", () => {
    const html = render({});
    expect(html).toContain('data-testid="workbench-cluster"');
    for (const id of [
      "brief",
      "chat",
      "reports",
      "properties",
      "share",
      "use-in-ai",
      "compare",
    ]) {
      expect(html).toContain(`data-testid="workbench-bubble-${id}"`);
    }
    expect(html).not.toContain('data-testid="workbench-bubble-flood"');
    expect(html).not.toContain('data-testid="workbench-dock"');
  });

  it("registry: brief is live on the rail with the other six tools", () => {
    expect(WORKBENCH_TOOLS.map((t) => t.id)).toEqual([
      "brief",
      "chat",
      "reports",
      "properties",
      "share",
      "use-in-ai",
      "compare",
    ]);
    expect(WORKBENCH_TOOLS.find((t) => t.id === "brief")?.inCluster).not.toBe(
      false,
    );
    expect(
      WORKBENCH_TOOLS.filter((t) => t.inCluster !== false).map((t) => t.id),
    ).toEqual([
      "brief",
      "chat",
      "reports",
      "properties",
      "share",
      "use-in-ai",
      "compare",
    ]);
    expect(
      WORKBENCH_TOOLS.find((t) => t.id === "reports")?.label,
    ).toBe("Reports & exports");
  });

  it("marks the open tool's bubble active (aria-pressed)", () => {
    const html = render({ openToolId: "chat", activeParcelNodeId: "p1" });
    expect(html).toMatch(
      /data-testid="workbench-bubble-chat"[^>]*aria-pressed="true"/,
    );
    expect(html).toMatch(
      /data-testid="workbench-bubble-reports"[^>]*aria-pressed="false"/,
    );
  });
});

describe("the ONE shared dock", () => {
  it("renders exactly one dock with exactly the open tool's content", () => {
    const html = render({ openToolId: "chat", activeParcelNodeId: "p1" });
    expect(html.match(/data-testid="workbench-dock"/g)).toHaveLength(1);
    expect(html).toContain('data-tool="chat"');
    // No other tool's content leaks in beside it.
    expect(html).not.toContain('data-testid="research-brief"');
  });

  it("registered-but-coming tools render the honest coming state", () => {
    // All five registry tools are live as of W4 — pin the chassis behavior
    // with a synthetic coming entry (the state future waves' bubbles get).
    const comingTool = {
      id: "future-tool",
      label: "Future tool",
      icon: <span />,
      status: "coming" as const,
      propertyScoped: true,
    };
    const html = renderToStaticMarkup(
      <Workbench
        tools={[...WORKBENCH_TOOLS, comingTool]}
        openToolId="future-tool"
        onOpenToolChange={noop}
        activeParcelNodeId="p1"
        host={host}
        store={createWorkbenchToolStateStore({ storage: null })}
      />,
    );
    expect(html).toContain('data-testid="dock-coming"');
    expect(html).toContain("not wired up yet");
    expect(html).toContain("Future tool");
  });

  it("property-scoped tool with NO active property → honest select-first state", () => {
    const html = render({ openToolId: "brief", activeParcelNodeId: null });
    expect(html).toContain('data-testid="dock-no-property"');
    expect(html).toContain("Select a property first");
    expect(html).not.toContain('data-testid="research-brief"');
  });

  it("dock header carries the close control", () => {
    const html = render({ openToolId: "brief", activeParcelNodeId: "p1" });
    expect(html).toContain('data-testid="dock-close"');
  });
});

describe("dock height model — scrolls instead of clipping below the viewport", () => {
  it("the COLUMN is viewport-bounded: maxHeight = 100vh minus top offset minus 16px", () => {
    const html = render({ openToolId: "brief", activeParcelNodeId: "p1" });
    // Chrome v2 stacking moved the viewport bound from the single dock onto
    // the column that holds the stack — the rule is unchanged (top:12 + 16px
    // bottom margin), it just has to bound N docks instead of one now.
    const col = html.match(
      /data-testid="workbench-dock-column"[^>]*style="([^"]*)"/,
    );
    expect(col).not.toBeNull();
    expect(col![1]).toContain("max-height:calc(100vh - 28px)");
    expect(col![1]).toContain("flex-direction:column");
    // Each dock is still a flex column so its pinned header and its foldable
    // body share the budget.
    const dock = html.match(/data-testid="workbench-dock"[^>]*style="([^"]*)"/);
    expect(dock).not.toBeNull();
    expect(dock![1]).toContain("flex-direction:column");
    expect(dock![1]).toContain("overflow:hidden");
  });

  it("ONE scroller for the whole column — the stack is a continuous wheel", () => {
    // Operator, 2026-08-28: opening several docks should scroll as one
    // surface. It did not, because the column scrolled AND each dock body
    // carried its own overflow-y:auto. Two nested scrollers means the inner
    // one swallows the wheel and the outer never continues. The column is now
    // the only scroller in the compact path, and this pins that: a dock body
    // that starts scrolling itself again re-breaks the gesture.
    const html = render({ openToolId: "brief", activeParcelNodeId: "p1" });
    const col = html.match(
      /data-testid="workbench-dock-column"[^>]*style="([^"]*)"/,
    );
    expect(col).not.toBeNull();
    expect(col![1]).toContain("overflow-y:auto");
    expect(html).toMatch(/data-testid="workbench-dock-column"[^>]*class="pe-scroll"/);

    expect(html.match(/data-testid="dock-scroll"/g)).toHaveLength(1);
    const scroll = html.match(/data-testid="dock-scroll"[^>]*style="([^"]*)"/);
    expect(scroll).not.toBeNull();
    // The BODY must not scroll itself in the column.
    expect(scroll![1]).toContain("overflow-y:visible");
    expect(scroll![1]).not.toContain("overflow-y:auto");
    // The tool's content renders INSIDE the scroll region: the dock body
    // (here the honest no-brief fetch-entry state) comes after dock-scroll.
    expect(html.indexOf('data-testid="dock-scroll"')).toBeLessThan(
      html.indexOf("Checking access"),
    );
  });

  it("the header (title + ×) is pinned chrome OUTSIDE the scroll region", () => {
    const html = render({ openToolId: "chat", activeParcelNodeId: "p1" });
    const headerAt = html.indexOf('data-testid="dock-header"');
    const closeAt = html.indexOf('data-testid="dock-close"');
    const scrollAt = html.indexOf('data-testid="dock-scroll"');
    expect(headerAt).toBeGreaterThan(-1);
    // Header (and its close control) precede the scroll container entirely.
    expect(headerAt).toBeLessThan(scrollAt);
    expect(closeAt).toBeLessThan(scrollAt);
  });
});

describe("brief in the dock — per-property persistent via the chassis store", () => {
  it("renders the STORED brief for the active property without refetch UI", () => {
    const store = createWorkbenchToolStateStore({ storage: null });
    store.set("48021:123", "brief", {
      brief: ZONED_BRIEF,
      fetchedAt: "2026-07-29T00:00:00.000Z",
    });
    const html = render({
      openToolId: "brief",
      activeParcelNodeId: "48021:123",
      store,
    });
    // Embedded brief content, same facts + citations as ever.
    expect(html).toContain('data-testid="research-brief"');
    expect(html).toContain('data-embedded="true"');
    expect(html).toContain("tx-bastrop-parcel-000123");
    expect(html).toContain('data-testid="brief-citations"');
    // Export PDF intact; the DOCK owns the × (no double close control).
    expect(html).toContain('data-testid="brief-export-pdf"');
    expect(html).not.toContain('data-testid="brief-close"');
    expect(html).toContain('data-testid="dock-close"');
    // Not showing the fetch state — the stored brief IS the content.
    expect(html).not.toContain("Checking access");
  });

  it("switching the active property RE-SCOPES the brief (no bleed-through)", () => {
    const store = createWorkbenchToolStateStore({ storage: null });
    store.set("48021:123", "brief", {
      brief: ZONED_BRIEF,
      fetchedAt: "2026-07-29T00:00:00.000Z",
    });
    const html = render({
      openToolId: "brief",
      activeParcelNodeId: "48491:999",
      store,
    });
    // The OTHER property's brief must not appear; the tool falls back to its
    // fetch-entry state ("Checking access…" — the effect fetch runs on mount
    // in the browser; static render shows the entry state).
    expect(html).not.toContain("tx-bastrop-parcel-000123");
    expect(html).toContain("Checking access");
  });

  it("close/reopen keeps the brief: the store, not the mount, owns it", () => {
    const store = createWorkbenchToolStateStore({ storage: null });
    store.set("48021:123", "brief", {
      brief: ZONED_BRIEF,
      fetchedAt: "2026-07-29T00:00:00.000Z",
    });
    // Closed dock (tool unmounted) …
    const closed = render({
      openToolId: null,
      activeParcelNodeId: "48021:123",
      store,
    });
    expect(closed).not.toContain('data-testid="workbench-dock"');
    // … then reopened: the SAME stored brief renders again, no refetch state.
    const reopened = render({
      openToolId: "brief",
      activeParcelNodeId: "48021:123",
      store,
    });
    expect(reopened).toContain("tx-bastrop-parcel-000123");
    expect(reopened).not.toContain("Checking access");
  });
});

describe("expand-to-floating-box (Fix A)", () => {
  it("dockLayoutStyle — COMPACT default hugs the top-right at the v2 340px width", () => {
    const s = dockLayoutStyle(false);
    expect(s.top).toBe(12);
    // The rail capsule is 48 wide at right:18, occupying 18 through 66, so
    // 18 + 48 + 8 = 74 is what actually leaves an 8px channel. It was 66,
    // which put the dock FLUSH against the rail.
    expect(s.right).toBe(74);
    // Widened 340 -> 380 on operator ruling 2026-08-27.
    expect(s.width).toBe("min(380px, calc(100vw - 98px))");
    // The compact dock takes its elevation from the dock element (--ss-sh-dock),
    // not from the layout rule; only the EXPANDED box overrides it here.
    expect(s.boxShadow).toBeUndefined();
  });

  it("dockLayoutStyle — EXPANDED widens the COLUMN, it does not float one dock", () => {
    const s = dockLayoutStyle(true);
    expect(s.width).toBe("min(860px, calc(100vw - 98px))");
    // WIDE IS THE COLUMN'S, not one dock's. It keeps the compact anchor
    // (top:12, right:74) and the same height budget; only width changes, so
    // every open dock grows together and none can overlap another. It used to
    // lift ONE dock out into a fixed box at its own offset, which is exactly
    // how docks ended up on top of each other.
    expect(s.maxHeight).toBe("calc(100vh - 28px)");
    expect(s.right).toBe(74);
    expect(s.top).toBe(12);
    // Not full-screen: both are capped below the viewport, and the width
    // leaves the rail and its channel visible (98 = right:74 + 24 gutter).
    expect(String(s.width)).toContain("calc(100vw - 98px)");
    expect(String(s.maxHeight)).not.toBe("100vh");
  });

  it("an OPEN report tool shows the expand control in the pinned header (default expandable)", () => {
    const html = render({ openToolId: "reports", activeParcelNodeId: "p1" });
    expect(html).toContain('data-testid="dock-expand"');
    // Opens compact by default (SSR initial state) — the expand affordance is
    // present but not yet toggled.
    expect(html).toContain('data-testid="workbench-dock"');
    expect(html).not.toContain('data-expanded="1"');
  });

  it("dockSide default is right", () => {
    expect(DEFAULT_DOCK_SIDE).toBe("right");
    const html = render({ openToolId: "chat", activeParcelNodeId: "p1" });
    expect(html).toContain('data-dock-side="right"');
    expect(html).not.toContain('data-testid="workbench-left-stack"');
    // The right anchor moved onto the column with the stack; no dock in it
    // may anchor itself left. Both halves still checked.
    const col = html.match(
      /data-testid="workbench-dock-column"[^>]*style="([^"]*)"/,
    );
    expect(col).not.toBeNull();
    expect(col![1]).toContain("right:");
    expect(col![1]).not.toContain("left:");
    const dock = html.match(/data-testid="workbench-dock"[^>]*style="([^"]*)"/);
    expect(dock).not.toBeNull();
    expect(dock![1]).not.toContain("left:");
  });

  it("passing openToolIds brief+chat still renders ONE right dock (would fail if multi-open right rail returned)", () => {
    const html = renderToStaticMarkup(
      <Workbench
        tools={WORKBENCH_TOOLS}
        openToolId="brief"
        onOpenToolChange={noop}
        openToolIds={["brief", "chat"]}
        onOpenToolIdsChange={noop}
        dockSide="left"
        activeParcelNodeId="p1"
        host={host}
        store={createWorkbenchToolStateStore({ storage: null })}
      />,
    );
    expect(html.match(/data-testid="workbench-dock"/g)).toHaveLength(1);
    expect(html).toContain('data-tool="brief"');
    expect(html).not.toContain('data-tool="chat"');
    expect(html).not.toContain('data-testid="workbench-left-stack"');
    expect(html).toContain('data-dock-side="right"');
    expect(nextOpenToolId("brief", "chat")).toBe("chat");
    expect(nextOpenToolId("brief", "chat")).not.toEqual(
      nextOpenToolIds(["brief"], "chat"),
    );
  });

  it("inspect facts render inside the right brief dock, not a left overlay", () => {
    const html = renderToStaticMarkup(
      <Workbench
        tools={WORKBENCH_TOOLS}
        openToolId="brief"
        onOpenToolChange={noop}
        inspectSlot={<div data-testid="inspect-card">facts</div>}
        activeParcelNodeId="p1"
        host={host}
        store={createWorkbenchToolStateStore({ storage: null })}
      />,
    );
    expect(html).toContain('data-testid="inspect-card"');
    expect(html).toContain('data-dock-side="right"');
    expect(html).not.toContain('data-testid="workbench-left-stack"');
    const dockAt = html.indexOf('data-testid="workbench-dock"');
    const inspectAt = html.indexOf('data-testid="inspect-card"');
    expect(dockAt).toBeGreaterThan(-1);
    expect(inspectAt).toBeGreaterThan(dockAt);
  });

  it("a tool that opts OUT (expandable:false) shows NO expand control", () => {
    const nonExpandable: WorkbenchToolDef = {
      id: "mini",
      label: "Mini",
      icon: null,
      status: "live",
      propertyScoped: false,
      expandable: false,
      render: () => "compact content",
    };
    const html = renderToStaticMarkup(
      <Workbench
        tools={[...WORKBENCH_TOOLS, nonExpandable]}
        openToolId="mini"
        onOpenToolChange={noop}
        activeParcelNodeId="p1"
        host={host}
        store={createWorkbenchToolStateStore({ storage: null })}
      />,
    );
    expect(html).toContain('data-tool="mini"');
    expect(html).not.toContain('data-testid="dock-expand"');
    // The close control is always present.
    expect(html).toContain('data-testid="dock-close"');
  });
});


describe("the dock STACK renders — open means open", () => {
  const renderStack = (openIds: string[], folded: string[] = []) =>
    renderToStaticMarkup(
      <Workbench
        tools={WORKBENCH_TOOLS}
        openToolId={openIds[openIds.length - 1] ?? null}
        onOpenToolChange={noop}
        initialOpenIds={openIds}
        initialFoldedIds={folded}
        activeParcelNodeId="p1"
        host={host}
        store={createWorkbenchToolStateStore({ storage: null })}
      />,
    );

  it("renders ONE dock per open tool, in one column", () => {
    const html = renderStack(["brief", "chat", "reports"]);
    expect(html.match(/data-testid="workbench-dock"/g)).toHaveLength(3);
    expect(html).toContain('data-testid="workbench-dock-column"');
    expect(html).toContain('data-count="3"');
  });

  it("EVERY open dock is expanded — opening one does not fold another", () => {
    // The behaviour the operator asked for twice: open several containers and
    // scroll through them. An accordion here is the defect, and the first cut
    // of this chassis shipped one.
    const html = renderStack(["brief", "chat", "reports"]);
    expect(html).not.toContain('data-folded="1"');
  });

  it("only the dock the user folded is folded", () => {
    const html = renderStack(["brief", "chat", "reports"], ["chat"]);
    expect(html.match(/data-folded="1"/g)).toHaveLength(1);
  });

  it("a folded dock collapses its BODY to zero height, keeping its header", () => {
    const html = renderStack(["brief", "chat"], ["brief"]);
    expect(html.match(/data-testid="dock-header"/g)).toHaveLength(2);
    expect(html).toMatch(/max-height:0/);
  });

  it("every header is a keyboard-reachable fold toggle, folded or not", () => {
    const html = renderStack(["brief", "chat"], ["brief"]);
    expect(html.match(/data-testid="dock-header"[^>]*role="button"/g)).toHaveLength(2);
    expect(html).toMatch(/aria-expanded="true"/);
    expect(html).toMatch(/aria-expanded="false"/);
  });

  it("every dock keeps its OWN close control — closing one is not closing all", () => {
    const html = renderStack(["brief", "chat", "reports"]);
    expect(html.match(/data-testid="dock-close"/g)).toHaveLength(3);
  });

  it("a single open tool is expanded and still foldable", () => {
    const html = renderStack(["brief"]);
    expect(html.match(/data-testid="workbench-dock"/g)).toHaveLength(1);
    expect(html).not.toContain('data-folded="1"');
    expect(html).toMatch(/data-testid="dock-header"[^>]*role="button"/);
  });
});

describe("the column geometry has ONE owner", () => {
  // Regression, 2026-08-28. The column hardcoded its own top/right/width, so
  // dockLayoutStyle stopped driving the desktop column the moment the stack
  // was introduced: a widening to 380 and a move to right:74 both landed in
  // the rule, PASSED THEIR TESTS, and never reached the screen. Testing the
  // rule alone could not catch that — this compares the RULE against the
  // RENDER, which is two independently derived values that have to agree.
  it("the rendered column carries exactly what dockLayoutStyle says", () => {
    const rule = dockLayoutStyle(false);
    const html = render({ openToolId: "brief", activeParcelNodeId: "p1" });
    const col = html.match(
      /data-testid="workbench-dock-column"[^>]*style="([^"]*)"/,
    );
    expect(col).not.toBeNull();
    const style = col![1];
    expect(style).toContain(`right:${String(rule.right)}px`);
    expect(style).toContain(`top:${String(rule.top)}px`);
    expect(style).toContain(`width:${String(rule.width)}`);
    expect(style).toContain(`max-height:${String(rule.maxHeight)}`);
  });

  it("the dock sits clear of the rail capsule, not flush against it", () => {
    // The capsule is 48 wide (34 bubble + 2x6 padding + 2x1 border) at
    // right:18, so it occupies 18 through 66. Anything at right<=66 touches
    // it. The channel is the same 8px that separates two stacked docks.
    const RAIL_INSET = 18;
    const RAIL_WIDTH = 48;
    const CHANNEL = 8;
    expect(dockLayoutStyle(false).right).toBe(RAIL_INSET + RAIL_WIDTH + CHANNEL);
  });
});

describe("folding the dock the shell is pointing at", () => {
  // THE BUG THIS PINS. syncStack unfolds whatever openToolId names, and it ran
  // on EVERY render. openToolId keeps naming the newest open dock long after
  // the shell asked for it, so folding the newest dock un-folded itself on the
  // next paint. With only ONE dock open that dock is always the newest, so
  // folding appeared to do nothing at all — which is exactly what the operator
  // hit. The shell's id is an EVENT, not a standing order.
  const renderStack = (openIds: string[], folded: string[]) =>
    renderToStaticMarkup(
      <Workbench
        tools={WORKBENCH_TOOLS}
        openToolId={openIds[openIds.length - 1] ?? null}
        onOpenToolChange={noop}
        initialOpenIds={openIds}
        initialFoldedIds={folded}
        activeParcelNodeId="p1"
        host={host}
        store={createWorkbenchToolStateStore({ storage: null })}
      />,
    );

  it("the ONLY open dock stays folded, even though openToolId names it", () => {
    const html = renderStack(["brief"], ["brief"]);
    expect(html.match(/data-folded="1"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-expanded="false"/);
  });

  it("the NEWEST of several stays folded too", () => {
    const html = renderStack(["brief", "chat"], ["chat"]);
    expect(html.match(/data-folded="1"/g)).toHaveLength(1);
    // brief is untouched and still readable.
    expect(html).toMatch(/aria-expanded="true"/);
  });

  it("folding every open dock leaves them all folded", () => {
    const html = renderStack(["brief", "chat", "reports"], ["brief", "chat", "reports"]);
    expect(html.match(/data-folded="1"/g)).toHaveLength(3);
    expect(html).not.toMatch(/aria-expanded="true"/);
    // Each one keeps its header, so all three are one click from coming back.
    expect(html.match(/data-testid="dock-header"/g)).toHaveLength(3);
  });
});
