/**
 * WB6 — export auto-attach: entry mapping (re-download PATH, never bytes) and
 * the kind+format dedupe (latest wins) applied through the function patch.
 */

import { describe, expect, it, vi } from "vitest";
import {
  attachExportToDossier,
  exportEntryFromResult,
  fileReportOnProperty,
  isAutoSaveReportKind,
} from "./reports-dossier";
import type { PropertyDossier } from "../../lib/propertyDossier";

const now = () => "2026-07-29T12:00:00Z";

describe("exportEntryFromResult", () => {
  it("prefers downloads[selectedFormat], falls back to downloadUrl", () => {
    expect(
      exportEntryFromResult(
        "site-plan",
        {
          selectedFormat: "pdf-site-plan",
          downloadUrl: "/api/pe-site-plan-export?fallback=1",
          downloads: { "pdf-site-plan": "/api/pe-site-plan-export?f=pdf" },
        },
        now,
      ),
    ).toEqual({
      kind: "site-plan",
      format: "pdf-site-plan",
      savedAt: "2026-07-29T12:00:00Z",
      downloadPath: "/api/pe-site-plan-export?f=pdf",
    });
    expect(
      exportEntryFromResult("terrain", { selectedFormat: "glb", downloadUrl: "/dl" }, now)
        .downloadPath,
    ).toBe("/dl");
  });

  it("never stores bytes: a data: URL becomes an honest null path", () => {
    const entry = exportEntryFromResult(
      "terrain",
      { selectedFormat: "glb", downloadUrl: "data:model/gltf-binary;base64,AAAA" },
      now,
    );
    expect(entry.downloadPath).toBeNull();
  });
});

describe("attachExportToDossier — dedupe kind+format, latest wins", () => {
  it("applies the upsert against the CURRENT exports via the function patch", async () => {
    const current: PropertyDossier = {
      exports: [
        { kind: "terrain", format: "glb", savedAt: "2026-07-20T00:00:00Z", downloadPath: "/old" },
        { kind: "site-plan", format: "pdf-site-plan", savedAt: "2026-07-21T00:00:00Z", downloadPath: "/pdf" },
      ],
    };
    const update = vi.fn(
      async (
        _id: string,
        patch: Partial<PropertyDossier> | ((c: PropertyDossier) => Partial<PropertyDossier>),
      ) => {
        const partial = typeof patch === "function" ? patch(current) : patch;
        expect(partial.exports).toEqual([
          { kind: "site-plan", format: "pdf-site-plan", savedAt: "2026-07-21T00:00:00Z", downloadPath: "/pdf" },
          { kind: "terrain", format: "glb", savedAt: "2026-07-29T12:00:00Z", downloadPath: "/new" },
        ]);
        return { kind: "ok" } as const;
      },
    );
    const outcome = await attachExportToDossier(
      "48021:2",
      "terrain",
      { selectedFormat: "glb", downloadUrl: "/new" },
      { update, now },
    );
    expect(outcome).toEqual({ kind: "ok" });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("not-saved passes through (the caller treats it as a silent no-op)", async () => {
    const update = vi.fn(async () => ({ kind: "not-saved" }) as const);
    const outcome = await attachExportToDossier(
      "48021:2",
      "site-plan",
      { selectedFormat: "pdf-site-plan", downloadUrl: "/x" },
      { update, now },
    );
    expect(outcome).toEqual({ kind: "not-saved" });
  });
});

describe("W3.2 first report auto-saves the property", () => {
  it("Flood on an unsaved parcel saves then files (violate: attach-only no-op)", async () => {
    expect(isAutoSaveReportKind("flood-drainage")).toBe(true);
    expect(isAutoSaveReportKind("xray")).toBe(true);
    expect(isAutoSaveReportKind("site-plan")).toBe(false);

    const save = vi.fn(async () => ({ kind: "ok" }) as const);
    const update = vi.fn(async () => ({ kind: "ok" }) as const);
    const outcome = await fileReportOnProperty(
      "48021:2",
      "flood-drainage",
      { selectedFormat: "pdf-flood-drainage", downloadUrl: "/flood" },
      { label: "104 Main St", address: "104 Main St" },
      {
        list: async () => ({ kind: "ready", items: [] }),
        save,
        update,
        now,
      },
    );
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("48021:2", {
      label: "104 Main St",
      address: "104 Main St",
    });
    expect(update).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ kind: "ok" });
  });

  it("already-saved Flood attaches only (violate: save again blindly)", async () => {
    const save = vi.fn(async () => ({ kind: "ok" }) as const);
    const update = vi.fn(async () => ({ kind: "ok" }) as const);
    await fileReportOnProperty(
      "48021:2",
      "flood-drainage",
      { selectedFormat: "pdf-flood-drainage", downloadUrl: "/flood" },
      { label: "104 Main St" },
      {
        list: async () => ({
          kind: "ready",
          items: [
            {
              parcelNodeId: "48021:2",
              label: "104 Main St",
              updatedAt: null,
              snapshot: { notes: "kept" },
            },
          ],
        }),
        save,
        update,
        now,
      },
    );
    expect(save).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("site-plan on an unsaved parcel does not auto-save (exports are not reports)", async () => {
    const save = vi.fn(async () => ({ kind: "ok" }) as const);
    const update = vi.fn(async () => ({ kind: "not-saved" }) as const);
    const outcome = await fileReportOnProperty(
      "48021:2",
      "site-plan",
      { selectedFormat: "pdf-site-plan", downloadUrl: "/sp" },
      {},
      {
        list: async () => ({ kind: "ready", items: [] }),
        save,
        update,
        now,
      },
    );
    expect(save).not.toHaveBeenCalled();
    expect(outcome).toEqual({ kind: "not-saved" });
  });
});
