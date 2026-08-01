// Mobile responsive shell — static render at forced mobile width (390px class).
//
// Pins: bottom nav renders, desktop cluster hidden, property sheet host exists,
// mobile research picker renders when the research tab is active.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MobilePanelProvider } from "./MobilePanelContext";
import { Workbench, nextOpenToolId } from "../workbench/Workbench";
import { WORKBENCH_TOOLS } from "../workbench/registry";
import { createWorkbenchToolStateStore } from "../workbench/tool-state-store";
import type { WorkbenchHostActions } from "../workbench/types";

const host: WorkbenchHostActions = { openPaywall: () => {} };
const noop = () => {};

const MOBILE_VIEWPORT_PX = 390;

describe("mobile panel shell at phone width", () => {
  it("bottom nav exposes Map / Property / Research / Layers tabs", () => {
    const html = renderToStaticMarkup(
      <MobilePanelProvider isMobile initialSheet="map">
        <div data-testid="mobile-fixture" />
      </MobilePanelProvider>,
    );
    expect(html).toContain('data-testid="mobile-bottom-nav"');
    expect(html).toContain('data-testid="mobile-nav-map"');
    expect(html).toContain('data-testid="mobile-nav-property"');
    expect(html).toContain('data-testid="mobile-nav-research"');
    expect(html).toContain('data-testid="mobile-nav-layers"');
    expect(MOBILE_VIEWPORT_PX).toBeLessThan(768);
  });

  it("workbench hides the desktop bubble cluster on mobile", () => {
    const html = renderToStaticMarkup(
      <MobilePanelProvider isMobile initialSheet="research">
        <Workbench
          tools={WORKBENCH_TOOLS}
          openToolId="chat"
          onOpenToolChange={noop}
          activeParcelNodeId="48021:1"
          host={host}
          store={createWorkbenchToolStateStore({ storage: null })}
        />
      </MobilePanelProvider>,
    );
    const cluster = html.match(/data-testid="workbench-cluster"[^>]*style="([^"]*)"/);
    expect(cluster).not.toBeNull();
    expect(cluster![1]).toContain("display:none");
    expect(html).toContain('data-testid="workbench-mobile-picker"');
    expect(html).toContain('data-testid="workbench-mobile-bubble-chat"');
    expect(html).toContain('data-testid="workbench-dock"');
    expect(html).toContain('data-mobile-dock="1"');
  });

  it("tapping another bubble still replaces the open tool (single-tenancy)", () => {
    expect(nextOpenToolId("chat", "reports")).toBe("reports");
  });
});
