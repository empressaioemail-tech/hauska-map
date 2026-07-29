// Workbench W4 — My Properties + Share tool render tests.
//
// Static render via react-dom/server (node env, same pattern as
// workbench.test.tsx — effects do not run, so fetch-free states are what
// render). Pins:
//   - properties/share bubbles are LIVE (no "coming" state);
//   - properties works with NO active property (workspace list, not scoped);
//   - share is property-scoped (honest select-first state with no property);
//   - the minted share link is PER-PROPERTY persistent via the chassis store
//     (close/reopen keeps it; switching property re-scopes to create state);
//   - the PropertiesList states: rows with reopen/remove, save-current
//     visibility, sign-in, empty.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Workbench } from "./Workbench";
import { WORKBENCH_TOOLS } from "./registry";
import { createWorkbenchToolStateStore } from "./tool-state-store";
import type { WorkbenchHostActions } from "./types";
import { PropertiesList } from "./tools/PropertiesTool";
import type { ShareToolStoredState } from "./tools/ShareTool";

const host: WorkbenchHostActions = {
  openPaywall: () => {},
  openProperty: () => {},
};
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

describe("W4 registry state", () => {
  it("properties and share are live — no dock-coming state", () => {
    const props = render({ openToolId: "properties", activeParcelNodeId: null });
    expect(props).not.toContain('data-testid="dock-coming"');
    const share = render({ openToolId: "share", activeParcelNodeId: "48021:1" });
    expect(share).not.toContain('data-testid="dock-coming"');
  });

  it("properties opens WITHOUT an active property (workspace, not scoped)", () => {
    const html = render({ openToolId: "properties", activeParcelNodeId: null });
    expect(html).not.toContain('data-testid="dock-no-property"');
    // Effects don't run under static render → the honest loading entry state.
    expect(html).toContain('data-testid="properties-loading"');
  });

  it("share with NO active property → honest select-first state", () => {
    const html = render({ openToolId: "share", activeParcelNodeId: null });
    expect(html).toContain('data-testid="dock-no-property"');
    expect(html).not.toContain('data-testid="share-tool"');
  });
});

describe("share link — per-property persistent via the chassis store", () => {
  const stored: ShareToolStoredState = {
    link: {
      url: "https://pe.example/share#payload.sig",
      expiresAt: "2026-08-28T00:00:00.000Z",
    },
    mintedAt: "2026-07-29T00:00:00.000Z",
  };

  it("renders the STORED minted link with copy + regenerate + expiry note", () => {
    const store = createWorkbenchToolStateStore({ storage: null });
    store.set("48021:123", "share", stored);
    const html = render({
      openToolId: "share",
      activeParcelNodeId: "48021:123",
      store,
    });
    expect(html).toContain("https://pe.example/share#payload.sig");
    expect(html).toContain('data-testid="share-copy"');
    expect(html).toContain('data-testid="share-regenerate"');
    expect(html).toContain("Link expires 2026-08-28");
    expect(html).not.toContain('data-testid="share-create"');
  });

  it("switching the active property RE-SCOPES to the create state (no bleed)", () => {
    const store = createWorkbenchToolStateStore({ storage: null });
    store.set("48021:123", "share", stored);
    const html = render({
      openToolId: "share",
      activeParcelNodeId: "48491:999",
      store,
    });
    expect(html).not.toContain("https://pe.example/share#payload.sig");
    expect(html).toContain('data-testid="share-create"');
  });

  it("close/reopen keeps the link: the store, not the mount, owns it", () => {
    const store = createWorkbenchToolStateStore({ storage: null });
    store.set("48021:123", "share", stored);
    const closed = render({
      openToolId: null,
      activeParcelNodeId: "48021:123",
      store,
    });
    expect(closed).not.toContain('data-testid="workbench-dock"');
    const reopened = render({
      openToolId: "share",
      activeParcelNodeId: "48021:123",
      store,
    });
    expect(reopened).toContain("https://pe.example/share#payload.sig");
  });
});

describe("PropertiesList states (presentational)", () => {
  const items = [
    {
      parcelNodeId: "48021:2",
      label: "104 Main St, Bastrop, TX",
      updatedAt: "2026-07-28T00:00:00.000Z",
      snapshot: null,
    },
    { parcelNodeId: "48021:1", label: null, updatedAt: null, snapshot: null },
  ];

  function renderList(opts: {
    phase:
      | { kind: "loading" }
      | { kind: "ready"; items: typeof items }
      | { kind: "sign-in" }
      | { kind: "notice"; text: string };
    activeParcelNodeId?: string | null;
  }): string {
    return renderToStaticMarkup(
      <PropertiesList
        phase={opts.phase}
        activeParcelNodeId={opts.activeParcelNodeId ?? null}
        busy={false}
        onSaveCurrent={noop}
        onOpen={noop}
        onRemove={noop}
      />,
    );
  }

  it("lists rows with label→address (else parcel id), date, reopen + remove", () => {
    const html = renderList({ phase: { kind: "ready", items } });
    expect(html).toContain("104 Main St, Bastrop, TX");
    expect(html).toContain("saved 2026-07-28");
    // Unlabeled row falls back to the parcel id.
    expect(html).toContain("48021:1");
    expect(html.match(/data-testid="properties-reopen"/g)).toHaveLength(2);
    expect(html.match(/data-testid="properties-remove"/g)).toHaveLength(2);
  });

  it("shows save-current ONLY when the active property is not saved", () => {
    const unsaved = renderList({
      phase: { kind: "ready", items },
      activeParcelNodeId: "48491:777",
    });
    expect(unsaved).toContain('data-testid="properties-save-current"');
    const saved = renderList({
      phase: { kind: "ready", items },
      activeParcelNodeId: "48021:2",
    });
    expect(saved).not.toContain('data-testid="properties-save-current"');
    const noActive = renderList({ phase: { kind: "ready", items } });
    expect(noActive).not.toContain('data-testid="properties-save-current"');
  });

  it("401 → honest sign-in state with the OIDC start link", () => {
    const html = renderList({ phase: { kind: "sign-in" } });
    expect(html).toContain('data-testid="properties-sign-in"');
    expect(html).toContain("/api/auth/google/start");
  });

  it("empty workspace → honest empty copy (server is the truth)", () => {
    const html = renderList({ phase: { kind: "ready", items: [] } });
    expect(html).toContain('data-testid="properties-empty"');
    expect(html).toContain("No saved properties yet");
  });
});
