/**
 * V2 — Floating window manager.
 * FSM: floating | snapped | minimized | maximized | closed
 * Preserves map view state across every transition.
 */

const STATES = ["floating", "snapped", "minimized", "maximized", "closed"];

/**
 * @param {object} opts
 * @param {HTMLElement} opts.host
 * @param {HTMLElement} opts.titleBar
 * @param {HTMLElement} opts.content
 * @param {(state: string, prev: string) => void} [opts.onStateChange]
 * @param {() => object} [opts.captureViewState]
 * @param {(vs: object) => void} [opts.restoreViewState]
 */
export function createFloatingWindow(opts) {
  const { host, titleBar, content } = opts;
  let state = "floating";
  let geometry = {
    floating: { x: 80, y: 60, w: 640, h: 480 },
    snapped: { edge: "right", w: 420 },
    minimized: { h: 36 },
    maximized: null,
  };
  let savedViewState = null;
  let drag = null;

  function applyGeometry() {
    host.dataset.state = state;
    host.classList.remove("fw--floating", "fw--snapped", "fw--minimized", "fw--maximized", "fw--closed");
    host.classList.add(`fw--${state}`);

    if (state === "closed") {
      host.style.display = "none";
      return;
    }
    host.style.display = "";

    if (state === "floating") {
      const g = geometry.floating;
      host.style.left = `${g.x}px`;
      host.style.top = `${g.y}px`;
      host.style.width = `${g.w}px`;
      host.style.height = `${g.h}px`;
      host.style.right = "auto";
      host.style.bottom = "auto";
    } else if (state === "snapped") {
      const g = geometry.snapped;
      host.style.top = "48px";
      host.style.bottom = "12px";
      host.style.width = `${g.w}px`;
      host.style.height = "auto";
      if (g.edge === "right") {
        host.style.right = "12px";
        host.style.left = "auto";
      } else {
        host.style.left = "12px";
        host.style.right = "auto";
      }
    } else if (state === "minimized") {
      host.style.height = `${geometry.minimized.h}px`;
      host.style.width = geometry.floating.w ? `${geometry.floating.w}px` : "320px";
      content.style.display = "none";
      return;
    } else if (state === "maximized") {
      host.style.left = "12px";
      host.style.top = "48px";
      host.style.right = "12px";
      host.style.bottom = "12px";
      host.style.width = "auto";
      host.style.height = "auto";
    }
    content.style.display = "";
    requestAnimationFrame(() => opts.onResize?.());
  }

  function transition(next) {
    if (!STATES.includes(next) || next === state) return;
    savedViewState = opts.captureViewState?.() || savedViewState;
    const prev = state;
    state = next;
    applyGeometry();
    if (savedViewState) opts.restoreViewState?.(savedViewState);
    opts.onStateChange?.(state, prev);
  }

  titleBar.addEventListener("mousedown", (e) => {
    if (state !== "floating" || e.target.closest("button")) return;
    drag = {
      x0: e.clientX,
      y0: e.clientY,
      ox: geometry.floating.x,
      oy: geometry.floating.y,
    };
    e.preventDefault();
  });

  window.addEventListener("mousemove", (e) => {
    if (!drag) return;
    geometry.floating.x = drag.ox + (e.clientX - drag.x0);
    geometry.floating.y = drag.oy + (e.clientY - drag.y0);
    applyGeometry();
  });

  window.addEventListener("mouseup", () => {
    if (!drag) return;
    drag = null;
    const rect = host.getBoundingClientRect();
    const snapThreshold = 24;
    if (window.innerWidth - rect.right < snapThreshold) {
      geometry.snapped = { edge: "right", w: Math.max(360, rect.width) };
      transition("snapped");
    } else if (rect.left < snapThreshold) {
      geometry.snapped = { edge: "left", w: Math.max(360, rect.width) };
      transition("snapped");
    }
  });

  const resizeHandle = document.createElement("div");
  resizeHandle.className = "fw-resize-handle";
  host.appendChild(resizeHandle);
  let resizing = null;
  resizeHandle.addEventListener("mousedown", (e) => {
    if (state !== "floating") return;
    resizing = {
      x0: e.clientX,
      y0: e.clientY,
      w: geometry.floating.w,
      h: geometry.floating.h,
    };
    e.preventDefault();
    e.stopPropagation();
  });
  window.addEventListener("mousemove", (e) => {
    if (!resizing) return;
    geometry.floating.w = Math.max(280, resizing.w + (e.clientX - resizing.x0));
    geometry.floating.h = Math.max(200, resizing.h + (e.clientY - resizing.y0));
    applyGeometry();
  });
  window.addEventListener("mouseup", () => {
    resizing = null;
  });

  host.addEventListener("mouseenter", () => host.classList.add("fw--hover"));
  host.addEventListener("mouseleave", () => host.classList.remove("fw--hover"));

  return {
    getState: () => state,
    transition,
    snap(edge = "right") {
      geometry.snapped.edge = edge;
      transition("snapped");
    },
    float() {
      transition("floating");
    },
    minimize() {
      transition("minimized");
    },
    maximize() {
      transition("maximized");
    },
    close() {
      transition("closed");
    },
    open() {
      transition(state === "closed" ? "floating" : state);
    },
  };
}

export { STATES as WINDOW_STATES };
