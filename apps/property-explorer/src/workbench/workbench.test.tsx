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
import { Workbench, nextOpenToolId } from "./Workbench";
import { WORKBENCH_TOOLS } from "./registry";
import { createWorkbenchToolStateStore } from "./tool-state-store";
import type { WorkbenchHostActions } from "./types";
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

describe("bubble cluster", () => {
  it("renders all five v1 bubbles and no dock while closed", () => {
    const html = render({});
    expect(html).toContain('data-testid="workbench-cluster"');
    for (const id of ["brief", "chat", "reports", "properties", "share"]) {
      expect(html).toContain(`data-testid="workbench-bubble-${id}"`);
    }
    expect(html).not.toContain('data-testid="workbench-dock"');
  });

  it("registry: ALL FIVE tools live as of W4 (brief/chat/reports/properties/share)", () => {
    expect(WORKBENCH_TOOLS.map((t) => t.id)).toEqual([
      "brief",
      "chat",
      "reports",
      "properties",
      "share",
    ]);
    expect(
      WORKBENCH_TOOLS.filter((t) => t.status === "live").map((t) => t.id),
    ).toEqual(["brief", "chat", "reports", "properties", "share"]);
    expect(
      WORKBENCH_TOOLS.find((t) => t.id === "reports")?.label,
    ).toBe("Reports & exports");
  });

  it("marks the open tool's bubble active (aria-pressed)", () => {
    const html = render({ openToolId: "brief", activeParcelNodeId: "p1" });
    expect(html).toMatch(
      /data-testid="workbench-bubble-brief"[^>]*aria-pressed="true"/,
    );
    expect(html).toMatch(
      /data-testid="workbench-bubble-chat"[^>]*aria-pressed="false"/,
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
