// @vitest-environment jsdom
//
// Component tests for AppErrorBoundary.
//
// UNLIKE the rest of this app's component tests (InspectCard.test.tsx,
// HelpWidget.test.tsx, ...), which render via react-dom/server's
// renderToStaticMarkup in the default node environment (this repo carries no
// jsdom / @testing-library/react dependency elsewhere — see those files'
// own headers), THIS file opts into jsdom for itself only via the pragma
// above. That is deliberate, not a drift from convention: React's server
// renderers (both the legacy renderToStaticMarkup/renderToString AND the
// Fiber-based renderToPipeableStream/renderToReadableStream) do NOT run
// error-boundary recovery at all — a throw during SSR propagates straight
// out of the render call every time, confirmed empirically against this
// exact react-dom version before writing this file. React's own docs say
// the same: "The server renderer does not support error boundaries." A
// static-markup test therefore cannot prove this component's one job — it
// would either have to assert on the pre-recovery crash (proving nothing
// about the boundary) or fake the caught state by hand (proving the fallback
// JSX renders, not that React's real reconciler ever reaches it). Proving
// the actual catch requires the real client reconciler, which requires a
// DOM — hence jsdom, scoped to this file with the pragma so no other test
// in the suite is affected.

import { describe, expect, it, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AppErrorBoundary } from "./AppErrorBoundary";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function Boom(): never {
  throw new Error("kaboom-in-render");
}

function Fine() {
  return <div data-testid="child-ok">fine</div>;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
  vi.restoreAllMocks();
});

function mount(children: React.ReactNode): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(<AppErrorBoundary>{children}</AppErrorBoundary>);
  });
  return container;
}

describe("AppErrorBoundary", () => {
  it("renders children through unchanged when nothing throws", () => {
    const el = mount(<Fine />);
    expect(el.querySelector('[data-testid="child-ok"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="app-error-boundary-fallback"]')).toBeNull();
  });

  it("catches a real render-time throw from a descendant via React's own reconciler and shows the honest fallback instead of an empty tree", () => {
    // React logs the caught error to the console during the recovery
    // render; that is expected noise for this test, not a failure signal.
    vi.spyOn(console, "error").mockImplementation(() => {});
    const el = mount(<Boom />);
    expect(el.querySelector('[data-testid="app-error-boundary-fallback"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="app-error-boundary-reload"]')).not.toBeNull();
    expect(el.textContent?.toLowerCase()).toContain("something went wrong");
    // The whole point: #root is NOT empty. A white screen means container's
    // rendered subtree is empty; this asserts real, visible fallback markup.
    expect(el.innerHTML.trim().length).toBeGreaterThan(0);
  });

  it("surfaces the thrown error's message in the fallback detail line", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const el = mount(<Boom />);
    const detail = el.querySelector('[data-testid="app-error-boundary-detail"]');
    expect(detail?.textContent).toContain("kaboom-in-render");
  });

  it("reload button calls window.location.reload", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reloadSpy = vi.fn();
    const originalLocation = window.location;
    // jsdom's window.location.reload throws "not implemented" — replace the
    // whole object so the click handler's real window.location.reload() call
    // is observable instead of throwing past the test.
    // @ts-expect-error -- test-only reassignment of a read-only global
    delete window.location;
    // @ts-expect-error -- partial Location stub, reload is all this needs
    window.location = { ...originalLocation, reload: reloadSpy };

    const el = mount(<Boom />);
    const button = el.querySelector<HTMLButtonElement>(
      '[data-testid="app-error-boundary-reload"]',
    );
    expect(button).not.toBeNull();
    act(() => {
      button!.click();
    });
    expect(reloadSpy).toHaveBeenCalledTimes(1);

    // restore
    // @ts-expect-error -- restoring the stubbed global
    window.location = originalLocation;
  });
});
