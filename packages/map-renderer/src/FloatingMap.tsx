/**
 * FloatingMap — React wrapper over the proven E6 vanilla map renderer + FSM.
 *
 * Rendering path: MAIN-THREAD canvas. MapLibre GL JS v5 requires a DOM
 * `container: HTMLElement` and has no supported OffscreenCanvas / in-worker Map
 * path (see close report). So this component mounts the vanilla
 * `createMapRenderer` factory into a ref'd <div> — exactly the proven E6 path —
 * and wraps it with the `createFloatingWindow` FSM. No worker, no
 * transferControlToOffscreen, no page-CSP dependency beyond MapLibre's own
 * internal tile worker (which every MapLibre app already loads).
 */

import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import { createMapRenderer } from "./map-renderer.js";
import { createFloatingWindow } from "./window-manager/floating-window.js";
import { DEFAULT_VISIBLE_LAYERS } from "./layer-registry.js";
import type {
  Center,
  LayerKey,
  OverlaySpec,
  ParcelHighlightState,
  ParcelSelection,
  ParcelTilesConfig,
  ViewState,
  ViewportState,
  WindowState,
} from "./postMessage";

export interface FloatingMapProps {
  /** Map center. Defaults to Bastrop, TX. */
  center?: Center;
  /** Address label bound to the renderer context. */
  address?: string;
  /** Use fixture data (default true — the E6 demo corpus). */
  useFixture?: boolean;
  /** Set of visible layer keys. Defaults to DEFAULT_VISIBLE_LAYERS. */
  visibleLayers?: Set<LayerKey> | LayerKey[];
  /**
   * Live SpatialProvider overlays to draw (flood zones, topography, drainage,
   * rent-heat, parcel meshes, choropleths). Each OverlaySpec carries a GeoJSON
   * payload; the renderer diffs this set against what is drawn and adds/updates/
   * removes MapLibre sources+layers idempotently. Pass `[]` or omit to clear.
   */
  overlays?: OverlaySpec[];
  /**
   * PMTiles browse-parcel tile layer (R1). When present, adds a MapLibre vector
   * source backed by a PMTiles archive of the Central-TX parcel corpus with a
   * land-use choropleth, rendered at all zooms, keyed on `parcel_node_id` via
   * promoteId for feature-state highlight. Omit for exactly today's behavior.
   */
  parcelTiles?: ParcelTilesConfig | null;
  /** Parcel to fly to. */
  parcel?: ParcelSelection | null;
  /** Fired when the operator clicks a parcel/zoning feature. */
  onParcelSelect?: (selection: ParcelSelection) => void;
  /**
   * Fired when the operator clicks a PMTiles browse parcel. Emits the stable
   * `parcel_node_id` and the raw feature so the consumer can resolve the node
   * and drive `setParcelState` for the subject/inspected highlight.
   */
  onParcelClick?: (parcelNodeId: string, feature: unknown) => void;
  /**
   * Fired after map load and after every (debounced) moveend/zoomend with the
   * current bbox + zoom — the hook for viewport-scoped live GIS fetching.
   */
  onViewportChange?: (viewport: ViewportState) => void;
  /** Fired on FSM state change. */
  onWindowStateChange?: (state: WindowState, prev: WindowState) => void;
  /** Render as a floating draggable window (default) or a plain filled div. */
  floating?: boolean;
  /** Title shown in the floating window title bar. */
  title?: string;
  /** Container style overrides. */
  style?: React.CSSProperties;
  className?: string;
}

export interface FloatingMapHandle {
  getViewState: () => ViewState;
  setViewState: (vs: Partial<ViewState>) => void;
  getMap: () => unknown;
  /**
   * Set the subject/inspected feature-state on a PMTiles browse parcel by its
   * stable `parcel_node_id`. Clears the prior subject/inspected so exactly one
   * of each is lit. No-op unless `parcelTiles` was passed.
   */
  setParcelState: (parcelNodeId: string, state: ParcelHighlightState) => void;
  /** Resolve the parcel_node_id (+ county_fips + feature) at a screen point. */
  queryParcelAt: (
    point: { x: number; y: number } | [number, number],
  ) => { parcelNodeId?: string; countyFips?: string; feature: unknown } | null;
  /** FSM control (only meaningful when floating). */
  window: {
    float: () => void;
    snap: (edge?: "left" | "right") => void;
    minimize: () => void;
    maximize: () => void;
    close: () => void;
    open: () => void;
    getState: () => WindowState;
  } | null;
}

function toVisibleSet(v: FloatingMapProps["visibleLayers"]): Set<LayerKey> {
  if (!v) return new Set(DEFAULT_VISIBLE_LAYERS);
  return v instanceof Set ? new Set(v) : new Set(v);
}

export const FloatingMap = forwardRef<FloatingMapHandle, FloatingMapProps>(
  function FloatingMap(props, ref) {
    const {
      center,
      address,
      useFixture = true,
      visibleLayers,
      overlays,
      parcelTiles,
      parcel,
      onParcelSelect,
      onParcelClick,
      onViewportChange,
      onWindowStateChange,
      floating = true,
      title = "Floating map",
      style,
      className,
    } = props;

    const hostRef = useRef<HTMLDivElement>(null);
    const titleBarRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const slotRef = useRef<HTMLDivElement>(null);

    // Stable refs to the vanilla instances.
    const rendererRef = useRef<ReturnType<typeof createMapRenderer> | null>(null);
    const windowRef = useRef<ReturnType<typeof createFloatingWindow> | null>(null);
    const controlCleanupRef = useRef<(() => void) | null>(null);

    // Keep latest callbacks without re-mounting the map.
    const onParcelSelectRef = useRef(onParcelSelect);
    onParcelSelectRef.current = onParcelSelect;
    const onParcelClickRef = useRef(onParcelClick);
    onParcelClickRef.current = onParcelClick;
    const onViewportChangeRef = useRef(onViewportChange);
    onViewportChangeRef.current = onViewportChange;
    const onWindowStateChangeRef = useRef(onWindowStateChange);
    onWindowStateChangeRef.current = onWindowStateChange;

    // Mount the map exactly once.
    useEffect(() => {
      const slot = slotRef.current;
      if (!slot) return;

      const renderer = createMapRenderer();
      rendererRef.current = renderer;

      renderer.mount(slot);
      renderer.setLayerVisibility(toVisibleSet(visibleLayers));
      // Seed overlays at mount; the renderer stashes them until the style loads.
      renderer.setOverlays(overlays ?? []);
      renderer.bindContext({
        center: center || { latitude: 30.1109, longitude: -97.3153 },
        address,
        useFixture,
        // Seed the PMTiles browse layer at mount; applied on style load.
        parcelTiles: parcelTiles ?? null,
        onParcelSelect: (sel: ParcelSelection) => onParcelSelectRef.current?.(sel),
        onParcelClick: (id: string, feature: unknown) =>
          onParcelClickRef.current?.(id, feature),
        onViewportChange: (vp: ViewportState) => onViewportChangeRef.current?.(vp),
      });

      // Wire the floating-window FSM only when floating and the DOM is present.
      let win: ReturnType<typeof createFloatingWindow> | null = null;
      if (floating && hostRef.current && titleBarRef.current && contentRef.current) {
        win = createFloatingWindow({
          host: hostRef.current,
          titleBar: titleBarRef.current,
          content: contentRef.current,
          captureViewState: () => renderer.getViewState(),
          restoreViewState: (vs: object) =>
            renderer.setViewState(vs as Partial<ViewState>),
          onResize: () => renderer.resize(),
          onStateChange: (state: string, prev: string) =>
            onWindowStateChangeRef.current?.(
              state as WindowState,
              prev as WindowState,
            ),
        });
        windowRef.current = win;

        // Wire the title-bar control buttons to the FSM.
        const titleBar = titleBarRef.current;
        const onControlClick = (e: MouseEvent) => {
          const btn = (e.target as HTMLElement)?.closest?.("[data-fw]") as
            | HTMLElement
            | null;
          if (!btn || !win) return;
          const action = btn.dataset.fw;
          if (action === "float") win.float();
          else if (action === "snap") win.snap("right");
          else if (action === "min") win.minimize();
          else if (action === "max") win.maximize();
          else if (action === "close") win.close();
          renderer.resize();
        };
        titleBar.addEventListener("click", onControlClick);
        controlCleanupRef.current = () =>
          titleBar.removeEventListener("click", onControlClick);
      }

      return () => {
        controlCleanupRef.current?.();
        controlCleanupRef.current = null;
        renderer.destroy();
        rendererRef.current = null;
        windowRef.current = null;
      };
      // Mount-once: intentionally empty deps. Prop changes flow through the
      // effects below via the imperative renderer contract.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Layer visibility changes.
    useEffect(() => {
      rendererRef.current?.setLayerVisibility(toVisibleSet(visibleLayers));
    }, [visibleLayers]);

    // Live SpatialProvider overlays. Re-runs on identity change of the array;
    // the renderer reconciles idempotently (add/update/remove, no source leak).
    // Empty/undefined clears every drawn overlay.
    useEffect(() => {
      rendererRef.current?.setOverlays(overlays ?? []);
    }, [overlays]);

    // PMTiles browse-parcel config. Re-runs on identity change; the renderer
    // reconciles idempotently (only churns on url/sourceLayer/promoteId change)
    // and re-asserts any pending subject/inspected feature-state.
    useEffect(() => {
      rendererRef.current?.setParcelTiles(parcelTiles ?? null);
    }, [parcelTiles]);

    // Context (center/address) changes.
    useEffect(() => {
      if (!rendererRef.current) return;
      rendererRef.current.bindContext({ center, address, useFixture });
    }, [center, address, useFixture]);

    // Parcel fly-to.
    useEffect(() => {
      const r = rendererRef.current;
      if (!r || !parcel) return;
      const map = r.getMap();
      if (map && typeof parcel.lng === "number" && typeof parcel.lat === "number") {
        map.flyTo({ center: [parcel.lng, parcel.lat], zoom: 16 });
      }
    }, [parcel]);

    useImperativeHandle(
      ref,
      (): FloatingMapHandle => ({
        getViewState: () =>
          rendererRef.current?.getViewState() ?? {
            center: [-97.3153, 30.1109],
            zoom: 15.2,
            pitch: 0,
            bearing: 0,
          },
        setViewState: (vs) => rendererRef.current?.setViewState(vs),
        getMap: () => rendererRef.current?.getMap() ?? null,
        setParcelState: (parcelNodeId, state) =>
          rendererRef.current?.setParcelState(parcelNodeId, state),
        queryParcelAt: (point) =>
          rendererRef.current?.queryParcelAt(point) ?? null,
        window: windowRef.current
          ? {
              float: () => windowRef.current!.float(),
              snap: (edge?: "left" | "right") => windowRef.current!.snap(edge),
              minimize: () => windowRef.current!.minimize(),
              maximize: () => windowRef.current!.maximize(),
              close: () => windowRef.current!.close(),
              open: () => windowRef.current!.open(),
              getState: () => windowRef.current!.getState() as WindowState,
            }
          : null,
      }),
      [],
    );

    // Non-floating: a plain filled container the consumer positions.
    if (!floating) {
      return (
        <div
          className={className}
          style={{ position: "relative", width: "100%", height: "100%", ...style }}
        >
          <div ref={slotRef} style={{ width: "100%", height: "100%" }} />
        </div>
      );
    }

    // Floating: host + title bar + content, driven by the FSM.
    return (
      <div ref={hostRef} className={`hauska-fw ${className ?? ""}`} style={style}>
        <div ref={titleBarRef} className="fw-titlebar hauska-fw-titlebar">
          <span className="fw-title">{title}</span>
          <div className="fw-controls">
            <button type="button" data-fw="float" title="Float">□</button>
            <button type="button" data-fw="snap" title="Snap">▐</button>
            <button type="button" data-fw="min" title="Minimize">_</button>
            <button type="button" data-fw="max" title="Maximize">⛶</button>
            <button type="button" data-fw="close" title="Close">×</button>
          </div>
        </div>
        <div ref={contentRef} className="fw-content hauska-fw-content">
          <div ref={slotRef} style={{ width: "100%", height: "100%" }} />
        </div>
      </div>
    );
  },
);
