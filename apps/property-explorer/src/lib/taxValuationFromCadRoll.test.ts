// OPS-16 A-103 item 5 / A-104: county tax-assessed CAD roll valuation,
// read from baseFacts.cadRoll. The backend serves this rail in one of
// three shapes depending on legacy bake / live overlay / entitlement gate —
// see the module doc on `cadRollFieldState` in fact-sheet-resolver.ts —
// so these tests pin all three, plus the composed row.

import { describe, expect, it } from "vitest";
import {
  cadRollFieldState,
  taxValuationFromCadRoll,
} from "./fact-sheet-resolver";
import type { BakedFacetPayload } from "./baked-facets";

function payloadWithCadRoll(cadRoll: unknown): BakedFacetPayload {
  return {
    baseFacts: { cadRoll } as BakedFacetPayload["baseFacts"],
  };
}

describe("cadRollFieldState", () => {
  it("null/missing is absent", () => {
    expect(cadRollFieldState(null)).toEqual({ kind: "absent", v: null });
    expect(cadRollFieldState(undefined)).toEqual({ kind: "absent", v: null });
  });

  it("the offline-baked shape ({v, source, vintage, valueBasis}, no state key) is present when v>0", () => {
    expect(
      cadRollFieldState({
        v: 397260,
        source: "cad_property",
        vintage: "2025",
        valueBasis: "county-assessed",
      }),
    ).toEqual({ kind: "present", v: 397260 });
  });

  it("the offline-baked shape is zero when v===0 — never collapsed to absent", () => {
    expect(
      cadRollFieldState({ v: 0, source: "cad_property", vintage: "2025" }),
    ).toEqual({ kind: "zero", v: 0 });
  });

  it("the live-overlay wire shape ({state: 'present'|'zero', v, ...}) is read via .state", () => {
    expect(
      cadRollFieldState({ state: "present", v: 45000, source: "cad_property" }),
    ).toEqual({ kind: "present", v: 45000 });
    expect(
      cadRollFieldState({ state: "zero", v: 0, source: "cad_property" }),
    ).toEqual({ kind: "zero", v: 0 });
  });

  it("the live-overlay wire's own absence ({state: 'absent', ...}) is absent, never a fabricated 0", () => {
    expect(
      cadRollFieldState({ state: "absent", source: "cad_property", basis: "x" }),
    ).toEqual({ kind: "absent", v: null });
  });

  it("the studio-gated refusal is its own kind — never conflated with absent", () => {
    expect(
      cadRollFieldState({
        state: "refused",
        code: "studio-gated",
        reason: "county tax-assessed valuation is Studio or Team only.",
      }),
    ).toEqual({ kind: "refused", v: null });
  });
});

describe("taxValuationFromCadRoll", () => {
  it("no cadRoll object at all is an uncovered absence (never invented)", () => {
    const fact = taxValuationFromCadRoll({ baseFacts: {} });
    expect(fact.state).toBe("absent-uncovered");
  });

  it("a studio-gated refusal on any field is unresolved, not absent", () => {
    const fact = taxValuationFromCadRoll(
      payloadWithCadRoll({
        marketValue: { state: "refused", code: "studio-gated", reason: "x" },
        assessedValue: { state: "refused", code: "studio-gated", reason: "x" },
        landValue: { state: "refused", code: "studio-gated", reason: "x" },
        improvementValue: { state: "refused", code: "studio-gated", reason: "x" },
      }),
    );
    expect(fact).toEqual({
      state: "unresolved",
      reason: "cad-roll-valuation studio-gated",
      retryable: false,
    });
  });

  it("granted with real values composes a display string from exactly what the CAD roll reported, no invented total", () => {
    const fact = taxValuationFromCadRoll(
      payloadWithCadRoll({
        marketValue: { v: 397260, source: "cad_property", vintage: "2025", valueBasis: "county-assessed" },
        assessedValue: { v: 397260, source: "cad_property", vintage: "2025", valueBasis: "county-assessed" },
        landValue: { v: 80000, source: "cad_property", vintage: "2025", valueBasis: "county-assessed" },
        improvementValue: { v: 317260, source: "cad_property", vintage: "2025", valueBasis: "county-assessed" },
      }),
    );
    expect(fact.state).toBe("present");
    if (fact.state !== "present") throw new Error("unreachable");
    expect(fact.value.marketValue).toBe(397260);
    expect(fact.value.landValue).toBe(80000);
    expect(fact.value.improvementValue).toBe(317260);
    expect(fact.value.assessedValue).toBe(397260);
    expect(fact.value.display).toBe(
      "Market $397,260 · Land $80,000 · Improvement $317,260 · Assessed $397,260",
    );
    // Never a computed total — the source never gave us one cleanly.
    expect(fact.value.display).not.toMatch(/total/i);
  });

  it("a genuine $0 improvement value (vacant lot) renders as $0, never dropped", () => {
    const fact = taxValuationFromCadRoll(
      payloadWithCadRoll({
        marketValue: { v: 45000, source: "cad_property", vintage: "2025" },
        assessedValue: { v: 45000, source: "cad_property", vintage: "2025" },
        landValue: { v: 45000, source: "cad_property", vintage: "2025" },
        improvementValue: { v: 0, source: "cad_property", vintage: "2025" },
      }),
    );
    expect(fact.state).toBe("present");
    if (fact.state !== "present") throw new Error("unreachable");
    expect(fact.value.improvementValue).toBe(0);
    expect(fact.value.display).toContain("Improvement $0");
  });

  it("granted with every field absent is a covered absence, not unknown/unresolved", () => {
    const fact = taxValuationFromCadRoll(
      payloadWithCadRoll({
        marketValue: null,
        assessedValue: null,
        landValue: null,
        improvementValue: null,
      }),
    );
    expect(fact.state).toBe("absent-covered");
  });

  it("mixed shapes (offline-baked market value + live-overlay-absent land value) compose only what is present", () => {
    const fact = taxValuationFromCadRoll(
      payloadWithCadRoll({
        marketValue: { v: 100000, source: "cad_property", vintage: "2025", valueBasis: "county-assessed" },
        assessedValue: { state: "absent", source: "cad_property", basis: "x" },
        landValue: null,
        improvementValue: { state: "zero", v: 0, source: "cad_property" },
      }),
    );
    expect(fact.state).toBe("present");
    if (fact.state !== "present") throw new Error("unreachable");
    expect(fact.value.marketValue).toBe(100000);
    expect(fact.value.assessedValue).toBeNull();
    expect(fact.value.landValue).toBeNull();
    expect(fact.value.improvementValue).toBe(0);
    expect(fact.value.display).toBe("Market $100,000 · Improvement $0");
  });
});
