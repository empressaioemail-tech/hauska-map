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

  it("ONE dock-owned scroll region wraps every tool's content (momentum scroll)", () => {
    const html = render({ openToolId: "brief", activeParcelNodeId: "p1" });
    expect(html.match(/data-testid="dock-scroll"/g)).toHaveLength(1);
    expect(html).toContain('class="pe-dock-scroll"');
    const scroll = html.match(/data-testid="dock-scroll"[^>]*style="([^"]*)"/);
    expect(scroll).not.toBeNull();
    expect(scroll![1]).toContain("overflow-y:auto");
    expect(scroll![1]).toContain("-webkit-overflow-scrolling:touch");
    // min-height:0 moved one level out, onto the fold wrapper that owns the
    // collapsing height; the scroll region now fills it at height:100%.
    expect(scroll![1]).toContain("height:100%");
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
    // Kit 04: the rail became a capsule at right:18 (46 wide with its
    // padding), so the dock moved 54 -> 66 to keep the same 8px channel.
    expect(s.right).toBe(66);
    // Widened 340 -> 380 on operator ruling 2026-08-27.
    expect(s.width).toBe("min(380px, calc(100vw - 90px))");
    // The compact dock takes its elevation from the dock element (--ss-sh-dock),
    // not from the layout rule; only the EXPANDED box overrides it here.
    expect(s.boxShadow).toBeUndefined();
  });

  it("dockLayoutStyle — EXPANDED is a large floating box, offset from the right (map stays visible), never full-screen", () => {
    const s = dockLayoutStyle(true);
    expect(s.width).toBe("min(860px, 78vw)");
    expect(s.maxHeight).toBe("90vh");
    // Offset from the right edge so the main map shows AROUND the box.
    expect(s.right).toBe("max(4vw, 54px)");
    expect(s.top).toBe("5vh");
    // Not full-screen: width and height are capped below the viewport.
    expect(String(s.width)).not.toContain("100vw");
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


describe("the dock STACK renders — chrome v2, operator ruling 2026-08-27", () => {

  const renderStack = (openIds: string[], expanded: string) =>

    renderToStaticMarkup(

      <Workbench

        tools={WORKBENCH_TOOLS}

        openToolId={expanded}

        onOpenToolChange={noop}

        initialOpenIds={openIds}

        activeParcelNodeId="p1"

        host={host}

        store={createWorkbenchToolStateStore({ storage: null })}

      />,

    );



  it("renders ONE dock per open tool, in one column", () => {

    const html = renderStack(["brief", "chat", "reports"], "reports");

    expect(html.match(/data-testid="workbench-dock"/g)).toHaveLength(3);

    expect(html).toContain('data-testid="workbench-dock-column"');

    expect(html).toContain('data-count="3"');

    expect(html).toContain('data-tool="brief"');

    expect(html).toContain('data-tool="chat"');

    expect(html).toContain('data-tool="reports"');

  });



  it("exactly one dock is expanded; every other is FOLDED, not closed", () => {

    const html = renderStack(["brief", "chat", "reports"], "chat");

    // Three open, two folded — so exactly one carries no data-folded flag.

    expect(html.match(/data-folded="1"/g)).toHaveLength(2);

    const chat = html.slice(html.indexOf('data-tool="chat"'));

    expect(chat.startsWith('data-tool="chat" data-dock-side="right" data-folded')).toBe(false);

  });



  it("a folded dock collapses its BODY to zero height, keeping its header", () => {

    const html = renderStack(["brief", "chat"], "chat");

    // Two headers (both docks keep one) and two scroll regions, but the

    // folded body is max-height:0 — the header is what survives a fold.

    expect(html.match(/data-testid="dock-header"/g)).toHaveLength(2);

    expect(html).toMatch(/max-height:0/);

  });



  it("a folded header is a keyboard-reachable button; the expanded one is not", () => {

    const html = renderStack(["brief", "chat"], "chat");

    expect(html).toMatch(/data-testid="dock-header"[^>]*role="button"/);

    expect(html.match(/data-testid="dock-header"[^>]*role="button"/g)).toHaveLength(1);

    expect(html).toMatch(/aria-expanded="false"/);

  });



  it("every dock keeps its OWN close control — closing one is not closing all", () => {

    const html = renderStack(["brief", "chat", "reports"], "reports");

    expect(html.match(/data-testid="dock-close"/g)).toHaveLength(3);

  });



  it("a single open tool shows no fold affordance (no chevron on a stack of one)", () => {

    const html = renderStack(["brief"], "brief");

    expect(html.match(/data-testid="workbench-dock"/g)).toHaveLength(1);

    expect(html).not.toContain('data-folded="1"');

  });

});

