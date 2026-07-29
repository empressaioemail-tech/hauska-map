// Workbench WB6 — dossier detail view + master-list polish render tests.
//
// Static render via react-dom/server (node env, same pattern as
// workbench-w4.test.tsx — effects do not run). Pins:
//   - MASTER LIST label fallback chain: label → dossier address → parcel id;
//     an empty-comma label (", ,") NEVER renders (the operator-screenshot bug);
//   - savedAt renders consistently (updatedAt, else dossier savedAt);
//   - the DETAIL view renders in the SAME dock: header (label / address /
//     parcel id / saved date), BACK button, notes textarea with the honest
//     4k counter, drawings save/show actions, the AI summary LABELED as
//     "AI summary · saved <date>" with the standing disclaimer, the capped
//     saved thread, and export attachments with working download links
//     (bytes never in the snapshot — path links only);
//   - dossier chips on master rows (notes / drawings / chat / exports).

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Workbench } from "./Workbench";
import { WORKBENCH_TOOLS } from "./registry";
import { createWorkbenchToolStateStore } from "./tool-state-store";
import type { WorkbenchHostActions } from "./types";
import { PropertiesList } from "./tools/PropertiesTool";
import { PropertyDossierDetail } from "./tools/PropertyDossierDetail";
import type { SavedPropertyRow } from "../lib/savedPropertiesClient";

const noop = () => {};

function renderList(items: SavedPropertyRow[]): string {
  return renderToStaticMarkup(
    <PropertiesList
      phase={{ kind: "ready", items }}
      activeParcelNodeId={null}
      busy={false}
      onSaveCurrent={noop}
      onOpen={noop}
      onRemove={noop}
    />,
  );
}

function renderDetail(row: SavedPropertyRow, notice: string | null = null): string {
  return renderToStaticMarkup(
    <PropertyDossierDetail
      row={row}
      busy={false}
      notice={notice}
      onBack={noop}
      onSaveDrawings={noop}
      onShowDrawings={noop}
      onSaveNotes={noop}
    />,
  );
}

describe("master list — label fallback + consistent savedAt (polish bug)", () => {
  it('an empty-comma label (", ,") falls back to dossier address, else parcel id', () => {
    const html = renderList([
      { parcelNodeId: "48021:11", label: ", ,", updatedAt: null, snapshot: { address: "200 Pine St" } },
      { parcelNodeId: "48021:12", label: ", ,", updatedAt: null, snapshot: null },
    ]);
    expect(html).not.toContain(", ,");
    expect(html).toContain("200 Pine St");
    expect(html).toContain("48021:12");
  });

  it("savedAt renders from updatedAt, else from the dossier savedAt", () => {
    const html = renderList([
      { parcelNodeId: "48021:1", label: "A", updatedAt: "2026-07-28T10:00:00Z", snapshot: null },
      {
        parcelNodeId: "48021:2",
        label: "B",
        updatedAt: null,
        snapshot: { savedAt: "2026-07-20T09:00:00Z" },
      },
    ]);
    expect(html).toContain("saved 2026-07-28");
    expect(html).toContain("saved 2026-07-20");
  });

  it("rows advertise their dossier contents (notes / drawings / chat / exports)", () => {
    const html = renderList([
      {
        parcelNodeId: "48021:3",
        label: "Full dossier",
        updatedAt: "2026-07-29T00:00:00Z",
        snapshot: {
          notes: "hello",
          drawings: {
            type: "FeatureCollection",
            features: [
              { type: "Feature", geometry: { type: "Point", coordinates: [1, 2] }, properties: {} },
            ],
          },
          chatSummary: { summary: "s", savedAt: "2026-07-29T00:00:00Z", turnCount: 2 },
          exports: [
            { kind: "terrain", format: "glb", savedAt: "2026-07-29T00:00:00Z", downloadPath: "/dl" },
          ],
        },
      },
    ]);
    expect(html).toContain("notes");
    expect(html).toContain("drawings");
    expect(html).toContain("chat");
    expect(html).toContain("exports");
  });
});

describe("dossier detail — the WB6 view inside the same dock", () => {
  const fullRow: SavedPropertyRow = {
    parcelNodeId: "48021:2",
    label: "104 Main St, Bastrop, TX",
    updatedAt: "2026-07-29T00:00:00Z",
    snapshot: {
      savedAt: "2026-07-20T00:00:00Z",
      address: "104 Main St, Bastrop, TX",
      notes: "Check the drainage easement.",
      drawings: {
        type: "FeatureCollection",
        features: [
          { type: "Feature", geometry: { type: "Point", coordinates: [1, 2] }, properties: { tool: "marker" } },
          { type: "Feature", geometry: { type: "LineString", coordinates: [[1, 2], [3, 4]] }, properties: { tool: "measure" } },
        ],
      },
      chatSummary: {
        summary: "• Zoned R-1\n• Flood zone X",
        savedAt: "2026-07-28T00:00:00Z",
        turnCount: 6,
        disclaimer: "Not legal advice.",
      },
      chatThread: [
        { role: "user", content: "Can I build an ADU?" },
        { role: "assistant", content: "Under R-1 standards, likely yes…" },
      ],
      exports: [
        { kind: "site-plan", format: "pdf-site-plan", savedAt: "2026-07-27T00:00:00Z", downloadPath: "/api/pe-site-plan-export?f=pdf" },
        { kind: "terrain", format: "glb", savedAt: "2026-07-26T00:00:00Z", downloadPath: null },
      ],
    },
  };

  it("renders header (label, parcel id, saved date) + the BACK button", () => {
    const html = renderDetail(fullRow);
    expect(html).toContain('data-testid="dossier-detail"');
    expect(html).toContain('data-testid="dossier-back"');
    expect(html).toContain("All saved properties");
    expect(html).toContain("104 Main St, Bastrop, TX");
    expect(html).toContain("48021:2");
    expect(html).toContain("saved 2026-07-29");
  });

  it("notes textarea carries the stored notes + the honest 4k counter", () => {
    const html = renderDetail(fullRow);
    expect(html).toContain('data-testid="dossier-notes-input"');
    expect(html).toContain("Check the drainage easement.");
    expect(html).toContain('data-testid="dossier-notes-counter"');
    expect(html).toContain("/ 4,000");
  });

  it("drawings section: count + save/show actions", () => {
    const html = renderDetail(fullRow);
    expect(html).toContain("2 saved shapes");
    expect(html).toContain('data-testid="dossier-save-drawings"');
    expect(html).toContain('data-testid="dossier-show-drawings"');
    // No drawings → no show button, honest empty copy.
    const bare = renderDetail({ ...fullRow, snapshot: { notes: "x" } });
    expect(bare).toContain("No drawings saved");
    expect(bare).not.toContain('data-testid="dossier-show-drawings"');
  });

  it('chat summary is LABELED "AI summary · saved <date>" with the disclaimer', () => {
    const html = renderDetail(fullRow);
    expect(html).toContain("AI summary · saved 2026-07-28");
    expect(html).toContain("Not legal advice.");
    expect(html).toContain("Zoned R-1");
    // The saved thread renders with its turn count.
    expect(html).toContain('data-testid="dossier-chat-thread"');
    expect(html).toContain("6 turns");
    expect(html).toContain("Can I build an ADU?");
  });

  it("exports list: working download link for path entries, honest note otherwise", () => {
    const html = renderDetail(fullRow);
    expect(html).toContain('data-testid="dossier-export-row"');
    expect(html).toContain('href="/api/pe-site-plan-export?f=pdf"');
    expect(html).toContain("Site plan · pdf-site-plan");
    expect(html).toContain("Terrain · glb");
    expect(html).toContain("re-run in Reports to download");
    // Bytes never render as data: URLs.
    expect(html).not.toContain('href="data:');
  });

  it("renders the transient dossier notice line when present", () => {
    const html = renderDetail(fullRow, "Saved 2 shapes to this property.");
    expect(html).toContain('data-testid="dossier-notice"');
    expect(html).toContain("Saved 2 shapes to this property.");
  });
});

describe("chat tool — the Save-to-property action (WB6)", () => {
  const host: WorkbenchHostActions = {
    openPaywall: noop,
    getActivePropertyAddress: () => "104 Main St, Bastrop, TX",
  };

  function renderChat(withThread: boolean): string {
    const store = createWorkbenchToolStateStore({ storage: null });
    if (withThread) {
      store.set("48021:2", "chat", {
        turns: [
          { role: "user", content: "Can I build an ADU?" },
          { role: "assistant", content: "Likely yes…" },
        ],
      });
    }
    return renderToStaticMarkup(
      <Workbench
        tools={WORKBENCH_TOOLS}
        openToolId="chat"
        onOpenToolChange={noop}
        activeParcelNodeId="48021:2"
        host={host}
        store={store}
      />,
    );
  }

  it("shows the Save-to-property button once a thread exists — not before", () => {
    expect(renderChat(true)).toContain('data-testid="chat-save-to-property"');
    expect(renderChat(false)).not.toContain('data-testid="chat-save-to-property"');
  });
});
