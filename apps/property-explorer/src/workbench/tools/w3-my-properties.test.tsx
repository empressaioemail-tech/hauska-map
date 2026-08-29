import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// Wave 3 My properties — WDLL 22–27 render + seam tests.
// Each case names the violation that would make it fail.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { SavedPropertyRow } from "../../lib/savedPropertiesClient";
import { nextOpenChatThread } from "../../lib/chat-display";
import {
  DossierChatThreads,
  PropertyDossierDetail,
  PropertySharePicker,
} from "./PropertyDossierDetail";
import { PropertiesList } from "./PropertiesTool";

const noop = () => {};

const row: SavedPropertyRow = {
  parcelNodeId: "48021:2",
  label: "104 Main St, Bastrop, TX",
  updatedAt: "2026-08-27T00:00:00Z",
  snapshot: {
    notes: "Walk the lot before offering.",
    status: "researching",
    shareReportSelection: { xray: false, flood: true },
    chatThreads: [
      {
        id: "c1",
        title: "**Morning** walk",
        savedAt: "2026-08-26T00:00:00Z",
        turnCount: 2,
        turns: [
          { role: "user", content: "What is the flood zone?" },
          {
            role: "assistant",
            content:
              "**Zone X** — outside SFHA.\n\nNext steps:\n- Order a survey",
          },
        ],
      },
      {
        id: "c2",
        title: "Afternoon setbacks",
        savedAt: "2026-08-27T00:00:00Z",
        turnCount: 1,
        turns: [{ role: "user", content: "Front setback?" }],
      },
    ],
  },
};

function renderDetail(open?: SavedPropertyRow): string {
  return renderToStaticMarkup(
    <PropertyDossierDetail
      row={open ?? row}
      busy={false}
      notice={null}
      onBack={noop}
      onSaveDrawings={noop}
      onShowDrawings={noop}
      onSaveNotes={noop}
      onSetStatus={noop}
      onMintShare={noop}
    />,
  );
}

describe("W3.1 notes persist; include/exclude on share picker", () => {
  it("detail shows stored notes and an include-notes checkbox (violate: drop notes or the picker)", () => {
    const html = renderDetail();
    expect(html).toContain('data-testid="dossier-notes-input"');
    expect(html).toContain("Walk the lot before offering.");
    expect(html).toContain('data-testid="dossier-share-picker"');
    expect(html).toContain('data-testid="dossier-share-include-notes"');
    expect(html).toContain("Include notes");
  });
});

describe("W3.3 on-property share personas with default message", () => {
  it("persona dropdown lists title/agent/builder/architect/other and a default message", () => {
    const html = renderToStaticMarkup(
      <PropertySharePicker
        notesPresent
        reportSelection={{ xray: false, flood: true }}
        busy={false}
        shareUrl={null}
        onMintShare={noop}
      />,
    );
    expect(html).toContain('data-testid="dossier-share-persona"');
    expect(html).toContain('data-testid="dossier-share-message"');
    expect(html).toContain("client review");
    for (const persona of ["title", "agent", "builder", "architect", "other"]) {
      expect(html).toContain(`value="${persona}"`);
    }
    expect(html).toContain("does not send email");
    expect(html).not.toMatch(/gmail/i);
    // Neutral-ground sweep 2026-08-27: the ground matches the brand chip now.
    //
    // STONE PORT (P-95). This asserted the raw hexes #0B0E13 and #E9EEF5
    // appeared in the rendered markup. They only ever did so because PE.ink
    // and PE.t2 were written as `var(--ss-ink, #0B0E13)` — the FALLBACK
    // form, which the NO FALLBACKS ruling at the head of styles/pe-chrome.ts
    // has since banned outright. The test's own note called them "token
    // fallbacks", so it was knowingly asserting on the smuggled literal.
    //
    // Under the ruling a surface can never emit the hex: the hex lives in
    // pe-tokens.css and nowhere else. Restoring the fallback to make this
    // pass would invert the ruling. So the assertion now holds the RULING:
    // the persona ground and text resolve through BARE tokens, and neither
    // literal may reach the output.
    expect(html).toContain("var(--ss-ink)");
    expect(html).toContain("var(--ss-t2)");
    expect(html).not.toContain("#0B0E13");
    expect(html).not.toContain("#E9EEF5");
    expect(html).toContain("color-scheme:dark");
    expect(html).not.toContain("<select");
  });

  it("minted link offers Copy link (violate: URL text only)", () => {
    const html = renderToStaticMarkup(
      <PropertySharePicker
        notesPresent
        reportSelection={{ xray: false, flood: true }}
        busy={false}
        shareUrl="https://smartsite.cloud/s/dae16d61-0f8d-4338-9983-83b0e8123bcb"
        onMintShare={noop}
      />,
    );
    expect(html).toContain('data-testid="dossier-share-url"');
    expect(html).toContain('data-testid="dossier-share-copy"');
    expect(html).toContain("Copy link");
    expect(html).toContain("New link");
  });
});

describe("W3.4 add/exclude reports replaces Export X-ray on the property row", () => {
  it("list row carries NO share checkboxes and no Export X-ray", () => {
    const html = renderToStaticMarkup(
      <PropertiesList
        phase={{ kind: "ready", items: [row] }}
        activeParcelNodeId={null}
        busy={false}
        onSaveCurrent={noop}
        onOpen={noop}
        onRemove={noop}
      />,
    );
    expect(html).toContain('data-testid="properties-row"');
    // SUPERSEDED 2026-08-28. This pinned the X-ray / Flood checkboxes ON the
    // list row. They were share configuration shown in a browse list with no
    // share control near them, and the operator had them removed. The row
    // must now NOT carry them; the choice lives in the share flow and on the
    // per-property detail screen.
    expect(html).not.toContain('data-testid="properties-row-reports"');
    expect(html).not.toContain('data-testid="properties-row-report-xray"');
    expect(html).not.toContain('data-testid="properties-row-report-flood"');
    expect(html).not.toContain("Export X-ray");
    expect(html).not.toContain('data-testid="dossier-export-pdf-button"');
  });
});

describe("W3.5 chats collapsed by date, markdown cleaned, one open", () => {
  it("two chats render dated and collapsed; only one body when one is open", () => {
    const collapsed = renderToStaticMarkup(
      <DossierChatThreads threads={row.snapshot!.chatThreads!} />,
    );
    expect(collapsed).toContain('data-testid="dossier-chat-threads"');
    expect(collapsed.match(/data-testid="dossier-chat-thread-item"/g)?.length).toBe(2);
    expect(collapsed).toContain("2026-08-26");
    expect(collapsed).toContain("2026-08-27");
    expect(collapsed).not.toContain('data-testid="dossier-chat-thread-body"');
    expect(collapsed).toContain("Morning walk");
    expect(collapsed).not.toContain("**Morning**");

    const oneOpen = renderToStaticMarkup(
      <DossierChatThreads
        threads={row.snapshot!.chatThreads!}
        openThreadId="c1"
        onToggleThread={noop}
      />,
    );
    expect(oneOpen.match(/data-testid="dossier-chat-thread-body"/g)?.length).toBe(1);
    expect(oneOpen).toContain("Zone X");
    expect(oneOpen).not.toContain("**Zone X**");
    expect(oneOpen).not.toContain("\u2014");
    expect(oneOpen).not.toMatch(/Next steps/i);
    expect(nextOpenChatThread("c1", "c2")).toBe("c2");
  });
});

describe("W3.6 status stays; pass does not auto-delete", () => {
  it("detail still has researching / offer / passed chips", () => {
    const html = renderDetail();
    expect(html).toContain('data-testid="dossier-status-researching"');
    expect(html).toContain('data-testid="dossier-status-offer"');
    expect(html).toContain('data-testid="dossier-status-passed"');
  });
});

describe("filed PDF on the property has View, not download-only", () => {
  it("Flood export row offers View and Download", () => {
    const html = renderDetail({
      ...row,
      snapshot: {
        ...row.snapshot,
        exports: [
          {
            kind: "flood-drainage",
            format: "pdf-flood-drainage",
            savedAt: "2026-08-27T12:00:00Z",
            downloadPath:
              "/api/pe-site-plan-export?report=flood-drainage&action=download",
          },
        ],
      },
    });
    expect(html).toContain('data-testid="dossier-export-view"');
    expect(html).toContain("View");
    expect(html).toContain('data-testid="dossier-export-download"');
    expect(html).toContain("Download");
  });
});

describe("no share checkboxes on the browse list", () => {
  // They were never view toggles. Each wrote shareReportSelection, deciding
  // what a SHARE LINK for that property would carry — share configuration
  // rendered on every row of a browse list, with no share control anywhere
  // near it, so nothing connected the control to its effect. Operator
  // 2026-08-28: remove them.
  //
  // Pinned as an ABSENCE so they cannot drift back. The setting still exists:
  // it is chosen at mint time, and the per-property detail screen still shows
  // it next to what it affects.
  it("renders no X-ray or Flood checkbox in the list rows", () => {
    const src = readFileSync(
      resolve(__dirname, "PropertiesTool.tsx"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    // Scope: the LIST no longer renders the control. onToggleShareReport
    // still appears in this file because the per-property DETAIL view keeps
    // it, so banning the identifier outright would be broader than the claim.
    expect(src).not.toContain("<PropertyRowReports");
  });
});
