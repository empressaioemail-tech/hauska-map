import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HELP_WIDGET_ENDPOINT,
  sendHelpWidgetMessage,
} from "./help-widget-client";

describe("P-118: sendHelpWidgetMessage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to the generic anonymous cortex proxy, never a session-bearing route", () => {
    expect(HELP_WIDGET_ENDPOINT).toBe("/api/spine/cortex/api/pe-help/chat");
  });

  it("sends no credentials — must work identically for a never-signed-in browser", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: "Solo is $49/month." }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await sendHelpWidgetMessage("What does Solo cost?", []);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.credentials).toBeUndefined();
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body).toEqual({ message: "What does Solo cost?", history: [] });
  });

  it("returns an honest answer outcome on 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ message: "The X-ray is the deep report." }),
      }),
    );
    const outcome = await sendHelpWidgetMessage("What is the X-ray?", []);
    expect(outcome).toEqual({
      kind: "answer",
      message: "The X-ray is the deep report.",
    });
  });

  it("returns an honest error outcome on a non-2xx response — never a fabricated answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "upstream_error", message: "Could not reach the assistant." }),
      }),
    );
    const outcome = await sendHelpWidgetMessage("anything", []);
    expect(outcome.kind).toBe("error");
    expect(outcome.message).toBe("Could not reach the assistant.");
  });

  it("returns an honest error outcome when fetch itself throws (offline/network)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const outcome = await sendHelpWidgetMessage("anything", []);
    expect(outcome.kind).toBe("error");
  });

  it("returns an honest error outcome when the body has no usable message field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );
    const outcome = await sendHelpWidgetMessage("anything", []);
    expect(outcome.kind).toBe("error");
  });
});
