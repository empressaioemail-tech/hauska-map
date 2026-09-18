/**
 * P-341 (OPS-24, ruling 16) — both impervious figures, the stricter governing.
 *
 * The positive control is the measured live case: 48453:367134 served the
 * zoning rule's 45 beside the watershed fact's 30 for WATER SUPPLY SUBURBAN.
 * The negative controls are the two shapes that must stay byte-identical: a
 * payload with only one figure, and a payload whose two figures agree.
 */
import { describe, expect, it } from "vitest";

import {
  disclosureWithImperviousGoverning,
  reconcileImperviousFigures,
} from "./impervious-governing-figure.js";

describe("reconcileImperviousFigures — the measured live case (48453:367134)", () => {
  const rec = reconcileImperviousFigures({
    zoningMaxImperviousPct: 45,
    zoningCitationUrl: "https://example.invalid/austin-ldc-25-5",
    zoningSourceDate: "2026-04-14",
    watershedPercent: 30,
    watershedType: "WATER SUPPLY SUBURBAN",
    watershedCitationUrl: "https://example.invalid/tceq-watershed",
    watershedSourceVintage: "2024-07-01",
  });

  it("serves the stricter figure, never the higher one", () => {
    expect(rec.governing).toBe(30);
  });

  it("cites BOTH figures, each with its own source", () => {
    expect(rec.sources).toHaveLength(2);
    expect(rec.sources.map((s) => s.source)).toEqual([
      "zoning-setback-rule",
      "max-impervious-cover-fact",
    ]);
    expect(rec.sources[0].percent).toBe(45);
    expect(rec.sources[0].citationUrl).toBe("https://example.invalid/austin-ldc-25-5");
    expect(rec.sources[1].percent).toBe(30);
    expect(rec.sources[1].watershedType).toBe("WATER SUPPLY SUBURBAN");
  });

  it("names both figures, both sources and which one governs in one sentence", () => {
    expect(rec.disclosure).toBeTruthy();
    expect(rec.disclosure).toContain("30%");
    expect(rec.disclosure).toContain("45%");
    expect(rec.disclosure).toContain("the watershed fact");
    expect(rec.disclosure).toContain("the zoning setback rule");
    expect(rec.disclosure).toMatch(/stricter one governs/i);
  });

  it("falsifier: it is not the average and not the higher figure", () => {
    expect(rec.governing).not.toBe(45);
    expect(rec.governing).not.toBe(37.5);
  });
});

describe("reconcileImperviousFigures — governing direction is read from the values, not the rails", () => {
  it("the zoning figure governs when IT is the stricter one", () => {
    const rec = reconcileImperviousFigures({
      zoningMaxImperviousPct: 20,
      watershedPercent: 55,
      watershedType: "EDWARDS RECHARGE",
    });
    expect(rec.governing).toBe(20);
    expect(rec.disclosure).toContain("20%");
    expect(rec.disclosure).toContain("55%");
    expect(rec.disclosure).toContain("EDWARDS RECHARGE");
  });
});

describe("reconcileImperviousFigures — the byte-identity controls", () => {
  it("one figure only: it governs, it is cited, and NO sentence is composed", () => {
    const rec = reconcileImperviousFigures({ zoningMaxImperviousPct: 45 });
    expect(rec.governing).toBe(45);
    expect(rec.sources).toHaveLength(1);
    expect(rec.disclosure).toBeNull();
  });

  it("no figure at all: nothing is invented", () => {
    const rec = reconcileImperviousFigures({});
    expect(rec.governing).toBeNull();
    expect(rec.sources).toEqual([]);
    expect(rec.disclosure).toBeNull();
  });

  it("two figures that AGREE: both cited, still no sentence", () => {
    const rec = reconcileImperviousFigures({
      zoningMaxImperviousPct: 30,
      watershedPercent: 30,
      watershedType: "WATER SUPPLY SUBURBAN",
    });
    expect(rec.governing).toBe(30);
    expect(rec.sources).toHaveLength(2);
    expect(rec.disclosure).toBeNull();
  });

  it("a refused fact (no percent) is not a second figure", () => {
    const rec = reconcileImperviousFigures({
      zoningMaxImperviousPct: 45,
      watershedPercent: null,
    });
    expect(rec.governing).toBe(45);
    expect(rec.sources).toHaveLength(1);
    expect(rec.disclosure).toBeNull();
  });

  it("a zero is not a figure: 0 is not served as an impervious limit", () => {
    const rec = reconcileImperviousFigures({
      zoningMaxImperviousPct: 45,
      watershedPercent: 0,
    });
    expect(rec.governing).toBe(45);
    expect(rec.sources).toHaveLength(1);
  });
});

describe("disclosureWithImperviousGoverning", () => {
  it("appends to an existing disclosure rather than replacing it", () => {
    const rec = reconcileImperviousFigures({
      zoningMaxImperviousPct: 45,
      watershedPercent: 30,
    });
    const out = disclosureWithImperviousGoverning("Setbacks read elsewhere.", rec);
    expect(out?.startsWith("Setbacks read elsewhere.")).toBe(true);
    expect(out).toContain("stricter one governs");
  });

  it("leaves a disclosure untouched where there is nothing to say", () => {
    const rec = reconcileImperviousFigures({ zoningMaxImperviousPct: 45 });
    expect(disclosureWithImperviousGoverning("Setbacks read elsewhere.", rec)).toBe(
      "Setbacks read elsewhere.",
    );
  });
});
