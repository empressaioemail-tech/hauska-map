// Workbench WB7d — status selector + list chip + status filter render tests.
//
// Static render via react-dom/server (node env, same pattern as
// workbench-wb6.test.tsx — effects do not run). Pins:
//   - the DETAIL view renders the compact three-chip single-select status
//     selector with aria-pressed reflecting the saved status;
//   - master-list rows carry a small status chip when a status is set (and
//     none when unset);
//   - the status filter row appears ONLY once the list has >5 entries, and
//     filtering hides non-matching rows (with an honest empty line);
//   - filterRowsByStatus is the pure seam ("all" passes everything).

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PropertiesList,
  filterRowsByStatus,
  STATUS_FILTER_MIN_ENTRIES,
  type StatusFilter,
} from "./tools/PropertiesTool";
import {
  DossierStatusSelector,
  PropertyDossierDetail,
} from "./tools/PropertyDossierDetail";
import type { SavedPropertyRow } from "../lib/savedPropertiesClient";
import type { DossierStatus } from "../lib/propertyDossier";

const noop = () => {};

function row(
  parcelNodeId: string,
  status: DossierStatus | null = null,
): SavedPropertyRow {
  return {
    parcelNodeId,
    label: `Property ${parcelNodeId}`,
    updatedAt: "2026-07-29T00:00:00Z",
    snapshot: status ? { status } : { notes: "n" },
  };
}

function renderList(
  items: SavedPropertyRow[],
  statusFilter: StatusFilter = "all",
): string {
  return renderToStaticMarkup(
    <PropertiesList
      phase={{ kind: "ready", items }}
      activeParcelNodeId={null}
      busy={false}
      statusFilter={statusFilter}
      onStatusFilterChange={noop}
      onSaveCurrent={noop}
      onOpen={noop}
      onRemove={noop}
    />,
  );
}

describe("dossier detail — status selector (WB7d)", () => {
  it("renders three chips with the saved status pressed", () => {
    const html = renderToStaticMarkup(
      <DossierStatusSelector status="offer" busy={false} onSetStatus={noop} />,
    );
    for (const s of ["researching", "offer", "passed"]) {
      expect(html).toContain(`data-testid="dossier-status-${s}"`);
    }
    expect(html).toMatch(
      /data-testid="dossier-status-offer"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*data-testid="dossier-status-offer"/,
    );
    expect(html).toMatch(
      /data-testid="dossier-status-passed"[^>]*aria-pressed="false"|aria-pressed="false"[^>]*data-testid="dossier-status-passed"/,
    );
  });

  it("the detail view includes the Status section", () => {
    const html = renderToStaticMarkup(
      <PropertyDossierDetail
        row={{
          parcelNodeId: "48021:2",
          label: "104 Main St",
          updatedAt: "2026-07-29T00:00:00Z",
          snapshot: { status: "researching", notes: "x" },
        }}
        busy={false}
        notice={null}
        onBack={noop}
        onSaveDrawings={noop}
        onShowDrawings={noop}
        onSaveNotes={noop}
        onSetStatus={noop}
      />,
    );
    expect(html).toContain("Status");
    expect(html).toContain('data-testid="dossier-status"');
    expect(html).toMatch(
      /data-testid="dossier-status-researching"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*data-testid="dossier-status-researching"/,
    );
  });
});

describe("master list — status on rows, as a rail and a word", () => {
  // SUPERSEDED 2026-08-28. Status was an inline PILL after the title, which
  // shoved the title by its own width so no two rows started their meta line
  // in the same place. It is now a 2px rail on the row plus the word at the
  // end of the meta line, which costs no horizontal room and keeps the
  // marker column aligned. Same derivation, same colour, same coverage.
  it("rows with a status render the word; unset rows render none", () => {
    const html = renderList([row("48021:1", "offer"), row("48021:2", null)]);
    const words = html.match(/data-testid="properties-status-word"/g) ?? [];
    expect(words).toHaveLength(1);
    expect(html).toContain("Offer");
  });

  it("the inline pill is gone", () => {
    const html = renderList([row("48021:1", "offer")]);
    expect(html).not.toContain('data-testid="properties-status-chip"');
  });

  it("every row carries the four marker slots, on or off", () => {
    // Off is DRAWN, not omitted — an absent slot collapses the column and
    // brings back the misalignment the column exists to remove.
    const html = renderList([row("48021:1", "offer"), row("48021:2", null)]);
    const marks = html.match(/data-testid="properties-row-marks"/g) ?? [];
    expect(marks).toHaveLength(2);
    for (const k of ["N", "D", "C", "E"]) {
      expect(html).toContain(`data-mark="${k}"`);
    }
  });
});

describe("master list — status filter (only past 5 entries)", () => {
  const smallList = [row("48021:1", "offer"), row("48021:2", "passed")];
  const bigList = [
    row("48021:1", "researching"),
    row("48021:2", "offer"),
    row("48021:3", "offer"),
    row("48021:4", "passed"),
    row("48021:5", null),
    row("48021:6", null),
  ];

  it("no filter row on a small list (≤5 entries stays clean)", () => {
    expect(bigList.length).toBeGreaterThanOrEqual(STATUS_FILTER_MIN_ENTRIES);
    const html = renderList(smallList);
    expect(html).not.toContain('data-testid="properties-status-filter"');
  });

  it("filter row appears once the list has >5 entries (All + three states)", () => {
    const html = renderList(bigList);
    expect(html).toContain('data-testid="properties-status-filter"');
    for (const f of ["all", "researching", "offer", "passed"]) {
      expect(html).toContain(`data-testid="properties-filter-${f}"`);
    }
  });

  it("an active filter renders only matching rows", () => {
    const html = renderList(bigList, "offer");
    const rows = html.match(/data-testid="properties-row"/g) ?? [];
    expect(rows).toHaveLength(2);
    expect(html).toContain("48021:2");
    expect(html).toContain("48021:3");
    expect(html).not.toContain("48021:4");
  });

  it("a filter with no matches renders the honest empty line, not a blank dock", () => {
    const noResearching = bigList.map((r) =>
      r.snapshot?.status === "researching"
        ? { ...r, snapshot: { ...r.snapshot, status: "offer" as const } }
        : r,
    );
    const html = renderList(noResearching, "researching");
    expect(html).toContain('data-testid="properties-filter-empty"');
    expect(html).toContain("No saved properties with this status.");
  });

  it("filterRowsByStatus: 'all' passes through; a status filters by match", () => {
    expect(filterRowsByStatus(bigList, "all")).toHaveLength(6);
    expect(filterRowsByStatus(bigList, "offer").map((r) => r.parcelNodeId)).toEqual([
      "48021:2",
      "48021:3",
    ]);
    expect(filterRowsByStatus(bigList, "researching")).toHaveLength(1);
  });
});
