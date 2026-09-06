import { describe, expect, it } from "vitest";
import {
  appendOutcomeTurn,
  appendUserTurn,
  historyForRequest,
  MAX_HELP_WIDGET_HISTORY_TURNS,
  type HelpWidgetDisplayTurn,
} from "./help-widget-logic";

describe("P-118: appendUserTurn / appendOutcomeTurn", () => {
  it("appends a user turn immutably", () => {
    const before: HelpWidgetDisplayTurn[] = [];
    const after = appendUserTurn(before, "hi");
    expect(before).toHaveLength(0);
    expect(after).toEqual([{ role: "user", content: "hi" }]);
  });

  it("appends a real answer WITHOUT the failed flag", () => {
    const after = appendOutcomeTurn([], {
      kind: "answer",
      message: "Solo is $49/month.",
    });
    expect(after).toEqual([
      { role: "assistant", content: "Solo is $49/month." },
    ]);
    expect(after[0].failed).toBeUndefined();
  });

  it("appends an error outcome WITH the failed flag — never disguised as a real answer", () => {
    const after = appendOutcomeTurn([], {
      kind: "error",
      message: "Could not reach the assistant.",
    });
    expect(after).toEqual([
      {
        role: "assistant",
        content: "Could not reach the assistant.",
        failed: true,
      },
    ]);
  });
});

describe("P-118: historyForRequest", () => {
  it("maps display turns to clean (role, content) pairs", () => {
    const turns: HelpWidgetDisplayTurn[] = [
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
    ];
    expect(historyForRequest(turns)).toEqual([
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
    ]);
  });

  it("excludes failed turns — a fabricated-answer placeholder never rides back into the model's context", () => {
    const turns: HelpWidgetDisplayTurn[] = [
      { role: "user", content: "a" },
      { role: "assistant", content: "Could not reach the assistant.", failed: true },
      { role: "user", content: "b" },
    ];
    const history = historyForRequest(turns);
    expect(history).toHaveLength(2);
    expect(history.some((t) => t.content.includes("Could not reach"))).toBe(false);
  });

  it("windows to the last 8 turns, oldest dropped first", () => {
    const turns: HelpWidgetDisplayTurn[] = Array.from({ length: 12 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `turn ${i}`,
    }));
    const history = historyForRequest(turns);
    expect(history).toHaveLength(MAX_HELP_WIDGET_HISTORY_TURNS);
    expect(history[0].content).toBe("turn 4");
    expect(history[history.length - 1].content).toBe("turn 11");
  });
});
