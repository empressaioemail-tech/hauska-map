import { afterEach, describe, expect, it, vi } from "vitest";
import { isPlausibleEmail, requestMagicLinkEmail } from "./auth";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isPlausibleEmail", () => {
  it("accepts a plausible address", () => {
    expect(isPlausibleEmail("person@example.com")).toBe(true);
  });

  it("rejects missing @, blank, and whitespace-containing input", () => {
    expect(isPlausibleEmail("")).toBe(false);
    expect(isPlausibleEmail("not-an-email")).toBe(false);
    expect(isPlausibleEmail("a b@example.com")).toBe(false);
    expect(isPlausibleEmail("@example.com")).toBe(false);
    expect(isPlausibleEmail("person@")).toBe(false);
  });

  it("rejects an address over 254 characters", () => {
    const long = `${"a".repeat(250)}@x.com`;
    expect(isPlausibleEmail(long)).toBe(false);
  });
});

describe("requestMagicLinkEmail", () => {
  it("POSTs to /api/auth/email/request and returns ok on 200", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, expiresAt: "2026-01-01T00:00:00Z" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const result = await requestMagicLinkEmail("person@example.com");
    expect(result).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/auth/email/request",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ email: "person@example.com" }),
      }),
    );
  });

  it("surfaces a rate-limit response honestly, not as success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "rate_limited",
          message: "Too many sign-in emails requested for this address. Try again shortly.",
          retryAfterSeconds: 300,
        }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      ),
    );
    const result = await requestMagicLinkEmail("person@example.com");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toBe("rate_limited");
    expect(result.retryAfterSeconds).toBe(300);
  });

  it("surfaces a send failure honestly, never a fake success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ error: "send_failed", message: "Could not send the sign-in email. Please try again." }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      ),
    );
    const result = await requestMagicLinkEmail("person@example.com");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toBe("send_failed");
  });

  it("a network error is caught and surfaced, not thrown", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("network down"));
    const result = await requestMagicLinkEmail("person@example.com");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toBe("network_error");
  });
});
