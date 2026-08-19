/**
 * W4 — the mobile sheet can be closed.
 *
 * Operator, verbatim: "In the mobile version when i pull up the menus and make
 * a selection the menu needs to collapse." The root cause was in the API:
 * MobilePanelContext exposed `openSheet` and no close primitive at all, so a
 * sheet could not dismiss itself because the vocabulary could not express it.
 *
 * The DECISION lives in pure functions here so it can be proven able to fire
 * in a node environment (this app's vitest has no jsdom); the DOM adapter in
 * MobilePanelContext only builds the input.
 */

import { describe, expect, it } from "vitest";
import {
  nextSheetOnDismiss,
  nextSheetOnToggle,
  shouldDismissSheetOnClick,
  type SheetClickNode,
} from "./mobile-layout";

const el = (tag: string, extra: Partial<SheetClickNode> = {}): SheetClickNode => ({
  tag,
  ...extra,
});

describe("shouldDismissSheetOnClick — what counts as a selection", () => {
  it("a plain button IS a selection and collapses the sheet", () => {
    expect(shouldDismissSheetOnClick([el("button"), el("div")])).toBe(true);
  });

  it("a click on the label inside a button still collapses it", () => {
    expect(shouldDismissSheetOnClick([el("span"), el("button"), el("div")])).toBe(true);
  });

  it("a link collapses the sheet", () => {
    expect(shouldDismissSheetOnClick([el("a"), el("div")])).toBe(true);
  });

  it("a disclosure (aria-expanded) does NOT collapse it — that would hide what was just opened", () => {
    expect(
      shouldDismissSheetOnClick([el("button", { stateful: true }), el("div")]),
    ).toBe(false);
  });

  it("a toggle button (aria-pressed) does NOT collapse it", () => {
    expect(shouldDismissSheetOnClick([el("button", { stateful: true })])).toBe(false);
  });

  it("form controls change things IN PLACE and never collapse the sheet", () => {
    expect(shouldDismissSheetOnClick([el("input"), el("label"), el("div")])).toBe(false);
    expect(shouldDismissSheetOnClick([el("select"), el("div")])).toBe(false);
    expect(shouldDismissSheetOnClick([el("textarea"), el("div")])).toBe(false);
    // A layer checkbox: collapsing here would make turning two layers on
    // impossible, which is why the rule is not "any click".
    expect(shouldDismissSheetOnClick([el("span"), el("label"), el("div")])).toBe(false);
  });

  it("dead space, text and scroll drags leave the sheet alone", () => {
    expect(shouldDismissSheetOnClick([el("div"), el("div")])).toBe(false);
    expect(shouldDismissSheetOnClick([el("p"), el("section")])).toBe(false);
    expect(shouldDismissSheetOnClick([])).toBe(false);
  });

  it("data-sheet-dismiss forces a collapse even on a non-button", () => {
    expect(shouldDismissSheetOnClick([el("div", { dismiss: true })])).toBe(true);
  });

  it("data-sheet-keep-open ANYWHERE on the path wins — a whole region can opt out", () => {
    expect(
      shouldDismissSheetOnClick([el("button"), el("div", { keepOpen: true }), el("div")]),
    ).toBe(false);
    expect(
      shouldDismissSheetOnClick([
        el("div", { dismiss: true }),
        el("div", { keepOpen: true }),
      ]),
    ).toBe(false);
  });
});

describe("nextSheetOnDismiss — the navigation guard", () => {
  it("collapses the sheet the selection was made in", () => {
    expect(nextSheetOnDismiss("property", "property")).toBe("map");
  });

  it("does NOT collapse when the handler already navigated elsewhere", () => {
    // InspectCard's Research button opens the research sheet. A dismissal that
    // ignored this would set the sheet back to "map" a tick later and the
    // Research navigation would silently fail.
    expect(nextSheetOnDismiss("research", "property")).toBe("research");
    expect(nextSheetOnDismiss("layers", "property")).toBe("layers");
  });

  it("is a no-op once the sheet is already the map", () => {
    expect(nextSheetOnDismiss("map", "property")).toBe("map");
  });
});

describe("nextSheetOnToggle — the second way out", () => {
  it("tapping the tab you are on collapses its sheet", () => {
    expect(nextSheetOnToggle("property", "property")).toBe("map");
    expect(nextSheetOnToggle("layers", "layers")).toBe("map");
  });

  it("tapping a different tab still switches, single-tenancy preserved", () => {
    expect(nextSheetOnToggle("property", "research")).toBe("research");
    expect(nextSheetOnToggle("map", "layers")).toBe("layers");
  });

  it("map stays map", () => {
    expect(nextSheetOnToggle("map", "map")).toBe("map");
  });
});

describe("the close primitive exists on the context at all", () => {
  it("MobilePanelContext exposes closeSheet, toggleSheet and dismissSheetIfUnchanged", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(resolve(__dirname, "MobilePanelContext.tsx"), "utf8");
    // The defect this lane fixed was an ABSENT primitive, so the regression
    // guard is that the interface still names all three.
    expect(source).toMatch(/closeSheet:\s*\(\)\s*=>\s*void/);
    expect(source).toMatch(/toggleSheet:\s*\(id: MobileSheetId\)\s*=>\s*void/);
    expect(source).toMatch(/dismissSheetIfUnchanged:\s*\(from: MobileSheetId\)\s*=>\s*void/);
  });

  it("the no-provider fallback answers every method, so desktop stays inert", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(resolve(__dirname, "MobilePanelContext.tsx"), "utf8");
    const fallback = source.slice(source.indexOf("if (!ctx) {"), source.indexOf("return ctx;"));
    for (const method of [
      "openSheet",
      "closeSheet",
      "toggleSheet",
      "dismissSheetIfUnchanged",
      "setSearchFocused",
    ]) {
      expect(fallback).toContain(method);
    }
  });
});
