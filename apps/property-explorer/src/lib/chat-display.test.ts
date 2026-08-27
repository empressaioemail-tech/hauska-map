import { describe, expect, it } from "vitest";
import { cleanChatDisplay, nextOpenChatThread } from "./chat-display";

describe("W3.5 cleanChatDisplay", () => {
  it("strips markdown asterisks and em dashes (violate: leave raw markdown)", () => {
    const raw =
      "**Flood zone X** — the lot is outside the special flood hazard area.";
    expect(cleanChatDisplay(raw)).toBe(
      "Flood zone X, the lot is outside the special flood hazard area.",
    );
    expect(cleanChatDisplay(raw)).not.toContain("**");
    expect(cleanChatDisplay(raw)).not.toContain("\u2014");
  });

  it("drops a trailing Next steps dump (violate: keep the dump)", () => {
    const raw =
      "Zoning is P-2.\n\nNext steps:\n- Call the city\n- Order a survey";
    expect(cleanChatDisplay(raw)).toBe("Zoning is P-2.");
    expect(cleanChatDisplay(raw)).not.toMatch(/next steps/i);
  });

  it("does not invent replacement copy when the body is only a dump", () => {
    expect(cleanChatDisplay("Next steps:\n- Buy the lot")).toBe("");
  });
});

describe("W3.5 one-open accordion", () => {
  it("opens the clicked thread and collapses the open one (violate: keep both)", () => {
    expect(nextOpenChatThread(null, "a")).toBe("a");
    expect(nextOpenChatThread("a", "b")).toBe("b");
    expect(nextOpenChatThread("b", "b")).toBeNull();
  });
});
