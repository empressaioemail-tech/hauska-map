// Unit tests for formatSetbackDisplay's governed_by resolution (Elgin
// setback-table ratification, 2026-08-04 directive 1: "conditional cells
// route users to the governing answer"). Pure function tests — no DOM, no
// network.

import { describe, it, expect } from "vitest";
import {
  formatSetbackDisplay,
  buildToLineDisclosure,
  type GovernedByAxis,
} from "./setback-not-specified";

describe("formatSetbackDisplay — no governedBy (pre-existing behavior unchanged)", () => {
  it("renders plain scalar setbacks with no governedBy argument at all", () => {
    const line = formatSetbackDisplay({ front_ft: 25, side_ft: 10, rear_ft: 20 });
    expect(line).toBe("F 25′ · S 10′ · R 20′");
  });

  it("not_specified axis with NO governedBy falls back to the pre-existing wording", () => {
    const line = formatSetbackDisplay(
      {
        front_ft: 0,
        side_ft: 0,
        rear_ft: 20,
        not_specified: { front: true, side: true },
      },
      null,
    );
    expect(line).toBe("F not specified · S not specified · R 20′ (build-to-line governs)");
  });

  it("all-primary not_specified with no governedBy -> the existing catch-all line", () => {
    const line = formatSetbackDisplay({
      front_ft: 0,
      side_ft: 0,
      rear_ft: 0,
      not_specified: { front: true, side: true, rear: true },
    });
    expect(line).toBe("No scalar setback specified — build-to-line governs");
  });
});

describe("formatSetbackDisplay — governedBy resolves a not_specified axis with a citation", () => {
  it("a mechanical condition (value_ft present) renders the resolved value + condition + section cite", () => {
    const governedBy = {
      front: {
        value_ft: 25,
        condition: "if adjoining a dwelling district",
        section_number: "4.02.003",
      } as GovernedByAxis,
    };
    const line = formatSetbackDisplay(
      {
        front_ft: 0,
        side_ft: 10,
        rear_ft: 20,
        not_specified: { front: true },
      },
      governedBy,
    );
    expect(line).toContain("F 25 ft if adjoining a dwelling district (§4.02.003)");
    expect(line).toContain("S 10′");
    expect(line).toContain("R 20′");
  });

  it("a routing-only reference (district, no value_ft) cites the governing district and section", () => {
    const governedBy = {
      side: {
        district: "C-1",
        section_number: "4.03.010",
      } as GovernedByAxis,
    };
    const line = formatSetbackDisplay(
      {
        front_ft: 25,
        side_ft: 0,
        rear_ft: 20,
        not_specified: { side: true },
      },
      governedBy,
    );
    expect(line).toContain("S C-1 governs (§4.03.010)");
  });

  it("a governedBy reference with NO section_number is not renderable and falls back to 'not specified'", () => {
    const governedBy = {
      front: {
        value_ft: 25,
        condition: "if adjoining a dwelling district",
        // no section_number — must not be rendered as a citable answer
      } as GovernedByAxis,
    };
    const line = formatSetbackDisplay(
      {
        front_ft: 0,
        side_ft: 10,
        rear_ft: 20,
        not_specified: { front: true },
      },
      governedBy,
    );
    expect(line).toContain("F not specified");
    expect(line).not.toContain("25 ft");
  });

  it("a conditions[] array (e.g. I-district 25/30 ft split) renders each condition, all cited", () => {
    const governedBy = {
      front: {
        conditions: [
          { value_ft: 25, condition: "adjoining a dwelling district", section_number: "6.01.002" },
          { value_ft: 30, condition: "otherwise", section_number: "6.01.002" },
        ],
      } as GovernedByAxis,
    };
    const line = formatSetbackDisplay(
      {
        front_ft: 0,
        side_ft: 10,
        rear_ft: 20,
        not_specified: { front: true },
      },
      governedBy,
    );
    expect(line).toContain("25 ft adjoining a dwelling district (§6.01.002)");
    expect(line).toContain("30 ft otherwise (§6.01.002)");
  });

  it("all-primary not_specified WITH governedBy on all three axes resolves instead of the bare catch-all", () => {
    const governedBy = {
      front: { value_ft: 25, section_number: "4.02.003" } as GovernedByAxis,
      side: { district: "C-1", section_number: "4.03.010" } as GovernedByAxis,
      rear: { value_ft: 15, section_number: "4.02.004" } as GovernedByAxis,
    };
    const line = formatSetbackDisplay(
      {
        front_ft: 0,
        side_ft: 0,
        rear_ft: 0,
        not_specified: { front: true, side: true, rear: true },
      },
      governedBy,
    );
    expect(line).not.toBe("No scalar setback specified — build-to-line governs");
    expect(line).toContain("F 25 ft (§4.02.003)");
    expect(line).toContain("S C-1 governs (§4.03.010)");
    expect(line).toContain("R 15 ft (§4.02.004)");
  });

  it("partial resolution: one axis governed, another silently unresolved -> catch-all still appended for the unresolved one", () => {
    const governedBy = {
      front: { value_ft: 25, section_number: "4.02.003" } as GovernedByAxis,
      // side has no governedBy entry at all
    };
    const line = formatSetbackDisplay(
      {
        front_ft: 0,
        side_ft: 0,
        rear_ft: 20,
        not_specified: { front: true, side: true },
      },
      governedBy,
    );
    expect(line).toContain("F 25 ft (§4.02.003)");
    expect(line).toContain("S not specified");
    expect(line).toContain("(build-to-line governs)");
  });

  it("GRACEFUL ABSENCE: governedBy undefined (not passed) behaves identically to governedBy null", () => {
    const setbacks = {
      front_ft: 0,
      side_ft: 10,
      rear_ft: 20,
      not_specified: { front: true },
    };
    expect(formatSetbackDisplay(setbacks)).toBe(formatSetbackDisplay(setbacks, null));
  });
});

describe("buildToLineDisclosure — unchanged by this feature", () => {
  it("still returns the all-primary disclosure", () => {
    expect(buildToLineDisclosure({ front: true, side: true, rear: true })).toMatch(
      /No scalar setback specified/,
    );
  });
});
