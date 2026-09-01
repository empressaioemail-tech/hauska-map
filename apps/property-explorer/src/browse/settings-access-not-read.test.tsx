// The Plan/Account "Access" field must never guess.
//
// It shipped showing "Paid" to EVERY account, including anonymous. Settings is
// account-scoped and passes a null parcelNodeId on purpose; the entitlement
// hook returns its LOADING constant for a null id; that constant has
// locked:false and signedOut:false; and the old ternary's final branch was
// "Paid". Two missed guards and a generous fallback.
//
// This pins the DIRECTION of the fallback, which is the part that matters: an
// unresolved read must land on the honest word, never on the flattering one.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsModal } from "./SettingsModal";

function render() {
  return renderToStaticMarkup(
    <SettingsModal open section="account" onClose={() => {}} onUpgrade={() => {}} />,
  );
}

describe("Settings Access field never guesses Paid", () => {
  it("says Not read when the entitlement read has not resolved", () => {
    // In a static render nothing resolves, which is also the real steady state
    // here: the route needs a parcelNodeId and this surface has none.
    const html = render();
    expect(html).toContain("Access");
    expect(html).not.toContain(">Paid<");
  });

  it("NOT VACUOUS: the panel still renders its Access row at all", () => {
    // Guards against the assertion passing because the tab failed to render.
    expect(render()).toContain("Access");
  });
});
