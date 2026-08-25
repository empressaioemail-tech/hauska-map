import { describe, expect, it } from "vitest";
import { createLookupIntent } from "./lookup-intent";

describe("createLookupIntent", () => {
  it("bump then older started is not current; latest is current", () => {
    const intent = createLookupIntent();
    expect(intent.current()).toBe(0);

    const first = intent.bump();
    expect(first).toBe(1);
    expect(intent.current()).toBe(1);
    expect(intent.isCurrent(first)).toBe(true);

    const second = intent.bump();
    expect(second).toBe(2);
    expect(intent.isCurrent(first)).toBe(false);
    expect(intent.isCurrent(second)).toBe(true);
    expect(intent.current()).toBe(second);
  });

  it("not-vacuous: isCurrent is false for a generation that was never started", () => {
    const intent = createLookupIntent();
    expect(intent.isCurrent(1)).toBe(false);
    const started = intent.bump();
    expect(intent.isCurrent(started)).toBe(true);
    expect(intent.isCurrent(started + 1)).toBe(false);
  });

  it("map-click bump makes an in-flight Find lose", () => {
    const intent = createLookupIntent();
    const findStarted = intent.bump();
    intent.bump();
    expect(intent.isCurrent(findStarted)).toBe(false);
  });
});
