import assert from "node:assert/strict";
import test from "node:test";
import { SCREENS, VIEW_PREF_KEY } from "./screens.mjs";

test("console exposes the eleven named screens", () => {
  assert.equal(SCREENS.length, 11);
  assert.deepEqual(
    [...SCREENS],
    [
      "States",
      "County manifest",
      "City manifest",
      "Runs",
      "Queues",
      "Defects",
      "Holds",
      "Gates",
      "Lanes",
      "Walk",
      "Cost",
    ],
  );
});

test("the only persistence key is the view preference", () => {
  assert.equal(VIEW_PREF_KEY, "factory.view.screen");
});
