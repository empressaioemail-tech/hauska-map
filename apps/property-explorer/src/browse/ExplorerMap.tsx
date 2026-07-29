// apps/property-explorer/src/browse/ExplorerMap.tsx
//
// The BROWSE map — the live cold-open surface. Mounts the published
// @hauska/map-renderer FloatingMap (floating={false} = full-bleed) centered on
// Central Texas, wires:
//   - the PMTiles baked parcel browse layer (parcelTiles prop),
//   - the live-GIS overlays (parcels + FEMA) via the ported liveGis logic
//     against the anonymous cortex proxy,
//   - parcel click -> INSPECT-IN-PLACE (InspectCard) with the clicked parcel
//     folded into the PORTED parcel-node store as the `inspected` node, then
//     patched with setbacks/envelope when the envelope resolves. The inspected
//     parcel is lit ON THE LIVE MAP via feature-state (setParcelState inspected)
//     — no remount, no subject change.
//   - "Make subject" is a DISTINCT explicit action (a button on the inspect
//     card). It re-points the LIVE map to that parcel via the persistent-map
//     API (rebindProperty + resolveSubjectAndFit) — the map is NEVER remounted;
//     the camera eases over and the subject glow lights when the tile paints.
//
// NO brief, NO AI on click. Anonymous — no auth needed to browse.
//
// PERSISTENT MAP (@hauska/map-renderer 0.1.5): the map mounts ONCE and stays
// alive for the whole session. Subject/property changes re-point the LIVE
// handle (rebindProperty), they do NOT remount FloatingMap. The `center` prop
// is the mount-time seed only (DEFAULT_CENTER, stable identity) — it never
// re-points on a subject change; the imperative handle owns re-pointing.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FloatingMap } from "@hauska/map-renderer";
import type {
  Center,
  FloatingMapHandle,
  LayerKey,
  OverlaySpec,
  ParcelSelection,
  ViewportState,
} from "@hauska/map-renderer";
import "@hauska/map-renderer/styles.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { DEFAULT_CENTER, PARCEL_TILES } from "../lib/config";
import { cortexClient } from "../lib/cortexClient";
import { parcelNodes } from "../lib/parcel-node-store.js";
import { startPeCheckout } from "../lib/billingClient";
import { recordPeGtmEvent } from "../lib/gtmClient";
import { savePropertyWithDossier } from "../lib/savedPropertiesClient";
import { sanitizeDrawings } from "../lib/propertyDossier";
import { iccCitationStatus } from "../lib/iccCitation";
import { InspectCard } from "./InspectCard";
import { Workbench } from "../workbench/Workbench";
import { WORKBENCH_TOOLS } from "../workbench/registry";
import type { WorkbenchHostActions } from "../workbench/types";
import { MapToolset, type LayerStateBadge } from "./MapToolset";
import type { MapToolsController } from "./mapToolsController";
import { TransientChips } from "./TransientChips";
import type { ChipSpec } from "./transient-chips";
import { SearchBar } from "./SearchBar";
import { PaywallGate } from "./PaywallGate";
import {
  deepLinkLookupQuery,
  resolveParcelLookup,
} from "../lib/parcel-lookup";
import { executeSearchLanding } from "../lib/search-landing";
import type { GeoExtent, Suggestion } from "../lib/search-kinds";
import {
  normalizeEnvelope,
  envelopeInsetOverlay,
  setbackConsumedOverlay,
  insetParcelBySetbacks,
} from "./envelope-overlay";
import {
  roadOverlaysFromAttachingRoads,
  type AttachingRoadWire,
} from "./road-overlay";
import { countyFipsForViewportCenter } from "./county-fips-viewport";
import {
  MIN_PARCEL_ZOOM,
  MIN_TOPO_ZOOM,
  MIN_HYDRO_ZOOM,
  LIVE_PARCELS_KEY,
  layersForZoom,
  fetchGisLayer,
  fetchTopographyLayer,
  fetchHydrologyLayer,
  contourTierLabel,
  hydrologyHonestReason,
  toLiveOverlays,
  toTopoOverlay,
  toHydroOverlay,
  selectionToCard,
  parcelNodeIdFromSelection,
  type GisLayerResponse,
  type LiveLayerKey,
  type LiveLayerState,
  type TopoLayerResponse,
  type TopoLayerState,
  type HydroLayerResponse,
  type HydroLayerState,
  type ParcelCardData,
} from "./liveGis";

/** The registry key whose LAYERS-panel toggle now controls the LIVE contour
 *  overlay. Toggling this row shows/hides the real engine contours. */
const TOPO_TOGGLE_KEY = "topography-contours" as LayerKey;
/** The registry key whose LAYERS-panel toggle controls the LIVE D8 hydrology
 *  flow-channel overlay. Toggling this row shows/hides the real engine flow. */
const HYDRO_TOGGLE_KEY = "hydrology-flow" as LayerKey;
/** PE topography BFF — free browse contour layer (engine topography-1ft slot). */
const PE_TOPOGRAPHY_URL = "/api/pe-topography";
/** PE hydrology BFF — free browse D8 flow layer (engine hydrology-flow slot). */
const PE_HYDROLOGY_URL = "/api/pe-hydrology";

/** Zoom gate for viewport road-node layer (same altitude as parcels). */
const MIN_ROAD_ZOOM = MIN_PARCEL_ZOOM;

async function fetchRoadsNearBbox(
  bbox: { west: number; south: number; east: number; north: number },
  countyFips: string,
  signal?: AbortSignal,
): Promise<AttachingRoadWire[]> {
  const qs = new URLSearchParams({
    countyFips,
    westLng: String(bbox.west),
    southLat: String(bbox.south),
    eastLng: String(bbox.east),
    northLat: String(bbox.north),
    limit: "400",
  });
  const url = `/api/spine/retrieval/road-nodes/near-bbox?${qs.toString()}`;
  const res = await fetch(url, { method: "GET", signal });
  if (!res.ok) return [];
  const json = (await res.json()) as { roads?: AttachingRoadWire[] };
  return Array.isArray(json.roads) ? json.roads : [];
}

interface LayerSlot {
  fetch: LiveLayerState;
  data: GisLayerResponse | null;
}
const IDLE: LayerSlot = { fetch: { status: "idle" }, data: null };

interface TopoSlot {
  fetch: TopoLayerState;
  data: TopoLayerResponse | null;
}
const TOPO_IDLE: TopoSlot = { fetch: { status: "idle" }, data: null };

interface HydroSlot {
  fetch: HydroLayerState;
  data: HydroLayerResponse | null;
}
const HYDRO_IDLE: HydroSlot = { fetch: { status: "idle" }, data: null };

/**
 * Consumer-honest layer filter for the browse panel. Drops:
 *  - AVM/valuation layers (no `rent-heat` on browse — WDLL 27).
 *  - Fixture-only terrain layers that are NOT wired to live engine data on this
 *    surface. PE runs `useFixture={false}`, so the fixture stack never draws — a
 *    toggle for an unwired layer would do nothing (the "panel doesn't work"
 *    report). We surface ONLY toggles that control a REAL layer: live parcels,
 *    live FEMA, live contours (`topography-contours` -> engine topography-1ft),
 *    and live D8 hydrology (`hydrology-flow` -> engine hydrology-flow slot).
 *    `dem-hillshade` stays excluded — no live hillshade endpoint yet (honest).
 */
const CONSUMER_EXCLUDED_LAYERS = new Set<LayerKey>([
  "rent-heat",
  "dem-hillshade",
]);

function filterConsumerLayers(seed: Set<LayerKey>): Set<LayerKey> {
  const next = new Set<LayerKey>();
  for (const key of seed) {
    if (!CONSUMER_EXCLUDED_LAYERS.has(key)) next.add(key);
  }
  return next;
}

/** The inspected parcel we lit on the live map, so we can clear it on change. */
interface InspectedTarget {
  card: ParcelCardData;
  parcelNodeId: string | null;
}

/** Center → the renderer's {latitude, longitude} Center contract, from lat/lng. */
function toCenter(lat: number | null, lng: number | null): Center | undefined {
  if (typeof lat !== "number" || typeof lng !== "number") return undefined;
  return { latitude: lat, longitude: lng };
}

export function ExplorerMap() {
  const mapRef = useRef<FloatingMapHandle>(null);
  const [parcels, setParcels] = useState<LayerSlot>(IDLE);
  const [fema, setFema] = useState<LayerSlot>(IDLE);
  const [topo, setTopo] = useState<TopoSlot>(TOPO_IDLE);
  const topoAbortRef = useRef<AbortController | null>(null);
  const [hydro, setHydro] = useState<HydroSlot>(HYDRO_IDLE);
  const hydroAbortRef = useRef<AbortController | null>(null);
  const [zoom, setZoom] = useState<number | null>(null);
  const [card, setCard] = useState<ParcelCardData | null>(null);
  // The clicked parcel's stable baked-node id, kept alongside `card` so the
  // InspectCard can read its baked facet snapshot (the preferred pure-read
  // source). Null for a live-GIS-only selection with no baked id.
  const [cardNodeId, setCardNodeId] = useState<string | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  // Type-ahead search landing state: transient honest chip (coverage miss) and
  // the brief fading street-extent highlight overlay.
  const [searchChip, setSearchChip] = useState<string | null>(null);
  const [searchOverlays, setSearchOverlays] = useState<OverlaySpec[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const deepLinkDoneRef = useRef(false);

  // The buildable-envelope wedge visual, drawn through the SUPPORTED overlays
  // path (OverlaySpec + reconcileOverlays) on the LIVE map — never a remount.
  // Holds 0..2 specs: the amber inset fill+dashed-edge (status "ok"), or a
  // dashed full-parcel outline for the honest 0%/"entirely setback" case.
  const [envelopeOverlays, setEnvelopeOverlays] = useState<OverlaySpec[]>([]);
  // Track B1-map: viewport road-node network (centerline + ROW), not one
  // attaching road for the inspected parcel.
  const [roadOverlays, setRoadOverlays] = useState<OverlaySpec[]>([]);
  const roadAbortRef = useRef<AbortController | null>(null);
  // The clicked parcel's raw geometry (from the live-GIS overlay feature), kept
  // so the 0% case can outline the whole lot and the client-side inset fallback
  // can inset the parcel ring when the server returned setbacks but no polygon.
  const clickedParcelGeomRef = useRef<unknown | null>(null);

  // The currently-inspected target (card + its baked node id). Tracked in a ref
  // so the click handler can clear the PRIOR inspected feature-state without a
  // dependency churn — the map stays alive; only its feature-state changes.
  const inspectedRef = useRef<InspectedTarget | null>(null);
  // The baked node id of the current SUBJECT, so a new subject clears the prior
  // subject glow. The subject is the ported store's source of truth; this ref
  // only mirrors the id needed to clear the last-lit feature-state.
  const subjectNodeIdRef = useRef<string | null>(null);

  // Layer-visibility toggle set — SEEDED from the substrate (getVisibleLayers)
  // and driven through the substrate via the `visibleLayers` prop. No local
  // shadow paint state: the renderer's toggle set is the source of truth.
  const [visibleLayers, setVisibleLayers] = useState<Set<LayerKey> | null>(null);
  // The full known-layer set for this surface (the mount seed), so a toggled-off
  // layer still renders as an unchecked row and can be re-enabled.
  const [knownLayers, setKnownLayers] = useState<Set<LayerKey> | null>(null);
  // WORKBENCH (WB1): the single open dock tool (null → dock closed) and the
  // SUBJECT's node id as state (mirror of subjectNodeIdRef) so the workbench
  // active-property binding re-renders when the subject changes.
  const [openWorkbenchTool, setOpenWorkbenchTool] = useState<string | null>(null);
  const [subjectNodeId, setSubjectNodeId] = useState<string | null>(null);
  // Render-time mirror of the workbench active property so the stable host
  // callbacks (W3 getActivePropertyAddress) read the CURRENT binding.
  const activeParcelNodeIdRef = useRef<string | null>(null);
  // WB6 dossier: the live MapToolsController (measure/draw/marker) once the
  // MapToolset installs it, plus which property the dossier-drawings overlay
  // currently belongs to (so a property switch clears a stale overlay).
  const toolsControllerRef = useRef<MapToolsController | null>(null);
  const dossierOverlayForRef = useRef<string | null>(null);
  const handleToolsController = useCallback(
    (controller: MapToolsController | null) => {
      toolsControllerRef.current = controller;
      if (!controller) dossierOverlayForRef.current = null;
    },
    [],
  );
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallMessage, setPaywallMessage] = useState<string | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutNote, setCheckoutNote] = useState<string | null>(null);

  // toggle set (a copy — mutating it does not leak into renderer state).
  useEffect(() => {
    if (visibleLayers) return;
    const h = mapRef.current;
    if (!h) return;
    const seed = h.getVisibleLayers();
    if (seed && seed.size) {
      const filtered = filterConsumerLayers(new Set(seed));
      setVisibleLayers(filtered);
      setKnownLayers(filtered);
    }
  });

  // Viewport loader — bbox-scoped live-GIS + road-node network on load +
  // debounced move/zoom.
  const handleViewportChange = useCallback((vp: ViewportState) => {
    setZoom(vp.zoom);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const wanted = layersForZoom(vp.zoom);
    const baseUrl = cortexClient.config.baseUrl;

    const run = (
      layer: LiveLayerKey,
      set: React.Dispatch<React.SetStateAction<LayerSlot>>,
    ) => {
      if (!wanted.includes(layer)) {
        set({ fetch: { status: "zoom-gated" }, data: null });
        return;
      }
      set((s) => ({ ...s, fetch: { status: "loading" } }));
      fetchGisLayer(baseUrl, layer, vp.bbox, ctrl.signal)
        .then((state) => {
          if (ctrl.signal.aborted) return;
          set({ fetch: state, data: state.status === "ok" ? state.response : null });
        })
        .catch((err) => {
          if (ctrl.signal.aborted || (err as Error)?.name === "AbortError") return;
          set({
            fetch: { status: "error", message: `${layer}: ${(err as Error)?.message}` },
            data: null,
          });
        });
    };
    run("parcels", setParcels);
    run("fema", setFema);

    // Live contours (engine map-layers topography slot — 3DEP-derived, NOT the
    // export-only Bastrop 1-ft). Zoom-gated at parcel altitude so the per-view
    // DEM stays small. Its own abort controller so a contour fetch in flight
    // doesn't cancel the parcel/FEMA batch (separate BFF, separate latency).
    topoAbortRef.current?.abort();
    const topoCtrl = new AbortController();
    topoAbortRef.current = topoCtrl;
    if (vp.zoom < MIN_TOPO_ZOOM) {
      setTopo({ fetch: { status: "zoom-gated" }, data: null });
    } else {
      setTopo((s) => ({ ...s, fetch: { status: "loading" } }));
      const center = {
        lat: (vp.bbox.south + vp.bbox.north) / 2,
        lng: (vp.bbox.west + vp.bbox.east) / 2,
      };
      fetchTopographyLayer(PE_TOPOGRAPHY_URL, vp.bbox, center, topoCtrl.signal)
        .then((state) => {
          if (topoCtrl.signal.aborted) return;
          setTopo({ fetch: state, data: state.status === "ok" ? state.response : null });
        })
        .catch((err) => {
          if (topoCtrl.signal.aborted || (err as Error)?.name === "AbortError") return;
          setTopo({
            fetch: { status: "error", message: `topography: ${(err as Error)?.message}` },
            data: null,
          });
        });
    }

    // Live D8 hydrology flow channels (engine hydrology-flow slot). Zoom-gated at
    // parcel altitude so the per-view DEM + D8 compute stays bounded. Own abort
    // controller so a hydrology fetch in flight doesn't cancel the parcel/FEMA/
    // topo batches (separate BFF, separate latency). An ok honest-empty response
    // (no channels) is kept as ok data — the chip surfaces the honest reason.
    hydroAbortRef.current?.abort();
    const hydroCtrl = new AbortController();
    hydroAbortRef.current = hydroCtrl;
    if (vp.zoom < MIN_HYDRO_ZOOM) {
      setHydro({ fetch: { status: "zoom-gated" }, data: null });
    } else {
      setHydro((s) => ({ ...s, fetch: { status: "loading" } }));
      const hcenter = {
        lat: (vp.bbox.south + vp.bbox.north) / 2,
        lng: (vp.bbox.west + vp.bbox.east) / 2,
      };
      fetchHydrologyLayer(PE_HYDROLOGY_URL, vp.bbox, hcenter, hydroCtrl.signal)
        .then((state) => {
          if (hydroCtrl.signal.aborted) return;
          setHydro({ fetch: state, data: state.status === "ok" ? state.response : null });
        })
        .catch((err) => {
          if (hydroCtrl.signal.aborted || (err as Error)?.name === "AbortError") return;
          setHydro({
            fetch: { status: "error", message: `hydrology: ${(err as Error)?.message}` },
            data: null,
          });
        });
    }

    // Road NETWORK in view (Track B1-map reopen) — not per-parcel attaching.
    roadAbortRef.current?.abort();
    const roadCtrl = new AbortController();
    roadAbortRef.current = roadCtrl;
    if (vp.zoom < MIN_ROAD_ZOOM) {
      setRoadOverlays([]);
      return;
    }
    const midLat = (vp.bbox.south + vp.bbox.north) / 2;
    const midLng = (vp.bbox.west + vp.bbox.east) / 2;
    const fips = countyFipsForViewportCenter(midLat, midLng);
    if (!fips) {
      setRoadOverlays([]);
      return;
    }
    void fetchRoadsNearBbox(vp.bbox, fips, roadCtrl.signal)
      .then((roads) => {
        if (roadCtrl.signal.aborted) return;
        setRoadOverlays(roadOverlaysFromAttachingRoads(roads));
      })
      .catch((err) => {
        if (roadCtrl.signal.aborted || (err as Error)?.name === "AbortError") return;
        setRoadOverlays([]);
      });
  }, []);

  // Light a parcel as INSPECTED on the LIVE map (feature-state glow) and fold it
  // into the ported node store as the `inspected` node. Clears the prior
  // inspected glow first so exactly one inspected parcel is lit. NEVER remounts
  // and NEVER changes the subject — inspect is a distinct, in-place action.
  const inspectInPlace = useCallback(
    (
      next: ParcelCardData,
      parcelNodeId: string | null,
      parcelGeometry: unknown = null,
    ) => {
      const handle = mapRef.current;
      // Clear any prior envelope wedge — a new parcel starts with no envelope
      // drawn; handleEnvelope re-draws it when this parcel's envelope resolves.
      // Road NETWORK stays (viewport-owned); do not clear on inspect.
      setEnvelopeOverlays([]);
      clickedParcelGeomRef.current = parcelGeometry;
      // Clear the prior inspected feature-state (if any and still lit).
      const prior = inspectedRef.current;
      if (handle && prior?.parcelNodeId && prior.parcelNodeId !== parcelNodeId) {
        handle.setParcelState(prior.parcelNodeId, {});
      }
      // Light the new inspected parcel on the live map (no-op if no baked id or
      // no PMTiles source, e.g. a live-GIS-only selection).
      if (handle && parcelNodeId) {
        handle.setParcelState(parcelNodeId, {
          inspected: true,
          // Preserve the subject flag if this parcel is also the subject.
          subject: subjectNodeIdRef.current === parcelNodeId,
        });
      }
      inspectedRef.current = { card: next, parcelNodeId };
      setCard(next);
      setCardNodeId(parcelNodeId);
      parcelNodes.setInspected(
        {
          id:
            parcelNodeId ??
            next.apn ??
            (next.lat != null ? `coord:${next.lat}:${next.lng}` : null),
          source: "map-click",
          centroid:
            next.lat != null && next.lng != null
              ? { lat: next.lat, lng: next.lng }
              : null,
          address: next.situsAddress,
          attrs: {
            apn: next.apn,
            owner: next.owner,
            county: next.county,
            parcelNodeId,
          },
        },
        "inspect-parcel",
      );
    },
    [],
  );

  // Reachability: search bar + deep-link (?parcelNodeId= | ?parcel= | ?address=)
  // resolve → inspectInPlace (same path as map click). GTM still recorded.
  // Returns true when the lookup resolved and opened the inspect card; the
  // kind-aware search landing uses that (quiet misses land the map honestly
  // instead of painting the error line).
  const runParcelLookup = useCallback(
    async (
      query: string,
      opts?: { fromDeepLink?: boolean; quiet?: boolean },
    ): Promise<boolean> => {
      const q = query.trim();
      if (!q) return false;
      setLookupBusy(true);
      setLookupError(null);
      try {
        const result = await resolveParcelLookup(q);
        if (!result.ok) {
          if (!opts?.quiet) setLookupError(result.reason);
          return false;
        }
        const { target } = result;
        if (opts?.fromDeepLink) {
          void recordPeGtmEvent({
            eventType: "pe_browse_started",
            payload: {
              extensionHandoff: target.parcelNodeId,
              lookupSource: target.source,
            },
          });
        } else {
          void recordPeGtmEvent({
            eventType: "pe_browse_started",
            payload: {
              lookupQuery: q,
              lookupSource: target.source,
              parcelNodeId: target.parcelNodeId,
            },
          });
        }
        inspectInPlace(target.card, target.parcelNodeId, target.geometry ?? null);
        const handle = mapRef.current;
        const center = toCenter(target.card.lat, target.card.lng);
        if (handle && center) {
          handle.rebindProperty({
            center,
            address: target.card.situsAddress ?? undefined,
            parcelState: {
              parcelNodeId: target.parcelNodeId,
              inspected: true,
            },
          });
          handle.resolveSubjectAndFit({
            parcelNodeId: target.parcelNodeId,
            center,
            fit: true,
          });
        }
        return true;
      } catch (err) {
        if (!opts?.quiet) {
          setLookupError(
            err instanceof Error ? err.message : "Lookup failed — try again.",
          );
        }
        return false;
      } finally {
        setLookupBusy(false);
      }
    },
    [inspectInPlace],
  );

  // ---- Type-ahead search: kind-aware landing (parcel / address / street /
  // place). Camera moves use the RAW maplibre handle (getMap) — flyTo /
  // fitBounds on the LIVE map, never a remount.
  const flyToPoint = useCallback((lat: number, lng: number, zoomTo: number) => {
    const m = mapRef.current?.getMap() as {
      flyTo?: (o: { center: [number, number]; zoom: number }) => void;
    } | null;
    m?.flyTo?.({ center: [lng, lat], zoom: zoomTo });
  }, []);

  const fitExtent = useCallback((extent: GeoExtent) => {
    // Photon extent order: [minLon, maxLat, maxLon, minLat].
    const [minLon, maxLat, maxLon, minLat] = extent;
    const m = mapRef.current?.getMap() as {
      fitBounds?: (
        b: [[number, number], [number, number]],
        o?: { padding?: number; duration?: number; maxZoom?: number },
      ) => void;
    } | null;
    m?.fitBounds?.(
      [
        [minLon, minLat],
        [maxLon, maxLat],
      ],
      { padding: 64, duration: 1200, maxZoom: 17 },
    );
  }, []);

  // Transient honest search chip ("Outside parcel coverage — map view only").
  // Cleared after the toast has faded so a LATER identical miss re-toasts
  // (TransientChips keeps a tombstone while the source still reports the key).
  const searchChipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showSearchChip = useCallback((text: string) => {
    if (searchChipTimerRef.current) clearTimeout(searchChipTimerRef.current);
    setSearchChip(text);
    searchChipTimerRef.current = setTimeout(() => {
      setSearchChip(null);
      searchChipTimerRef.current = null;
    }, 9_000);
  }, []);

  // Brief street-extent highlight: draw at full strength, dim, then remove —
  // a temporary fading outline of the street's extent (the geocoder returns
  // the extent bbox, not the centerline geometry).
  const streetTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const highlightStreet = useCallback((extent: GeoExtent, name: string) => {
    for (const t of streetTimersRef.current) clearTimeout(t);
    streetTimersRef.current = [];
    const [minLon, maxLat, maxLon, minLat] = extent;
    const ring = [
      [minLon, minLat],
      [maxLon, minLat],
      [maxLon, maxLat],
      [minLon, maxLat],
      [minLon, minLat],
    ];
    const spec = (lineOpacity: number, fillOpacity: number): OverlaySpec => ({
      layerKey: "search-street-highlight" as LayerKey,
      layerKind: "search-street-highlight",
      geojson: {
        type: "Feature",
        properties: { name },
        geometry: { type: "Polygon", coordinates: [ring] },
      },
      paint: {
        "line-color": "#7dd3fc",
        "line-width": 2.5,
        "line-opacity": lineOpacity,
        "fill-color": "#7dd3fc",
        "fill-opacity": fillOpacity,
      },
    });
    setSearchOverlays([spec(0.85, 0.07)]);
    streetTimersRef.current.push(
      setTimeout(() => setSearchOverlays([spec(0.3, 0.02)]), 2_600),
      setTimeout(() => setSearchOverlays([]), 4_200),
    );
  }, []);

  useEffect(
    () => () => {
      if (searchChipTimerRef.current) clearTimeout(searchChipTimerRef.current);
      for (const t of streetTimersRef.current) clearTimeout(t);
    },
    [],
  );

  const handleSearchSelect = useCallback(
    (suggestion: Suggestion) => {
      void executeSearchLanding(suggestion, {
        runParcelLookup: (q, opts) => runParcelLookup(q, { quiet: opts?.quiet }),
        flyTo: flyToPoint,
        fitExtent,
        showChip: showSearchChip,
        highlightStreet,
      });
    },
    [runParcelLookup, flyToPoint, fitExtent, showSearchChip, highlightStreet],
  );

  // Viewport bias for the geocoder — current LIVE camera center + zoom.
  const getSearchBias = useCallback(() => {
    const handle = mapRef.current;
    if (!handle) return null;
    try {
      const vs = handle.getViewState();
      const [lng, lat] = vs.center;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng, zoom: vs.zoom };
    } catch {
      return null;
    }
  }, []);

  // Extension / share deep-link: open inspect (not GTM-only).
  useEffect(() => {
    if (typeof window === "undefined" || deepLinkDoneRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const handoff = deepLinkLookupQuery(params);
    if (!handoff) return;
    deepLinkDoneRef.current = true;
    void runParcelLookup(handoff, { fromDeepLink: true });
  }, [runParcelLookup]);

  // Live-GIS overlay parcel click -> inspect-in-place. Fold the clicked parcel
  // into the ported node store as `inspected` and draw the InspectCard.
  const handleParcelSelect = useCallback(
    (sel: ParcelSelection) => {
      if (sel.layerKey === LIVE_PARCELS_KEY) {
        // The live-parcel feature carries the parcel ring — thread it so the 0%
        // case can outline the lot and the inset fallback can inset it.
        const geom =
          (sel.feature as { geometry?: unknown } | undefined)?.geometry ?? null;
        inspectInPlace(
          selectionToCard(sel),
          parcelNodeIdFromSelection(sel),
          geom,
        );
        return;
      }
      // A non-live overlay click carrying only coords — inspect what it carries.
      if (sel.lat == null || sel.lng == null) return;
      const bareCard: ParcelCardData = {
        apn: sel.apn ?? null,
        situsAddress: sel.address ?? null,
        owner: null,
        landUseDescription: null,
        county: null,
        provider: null,
        notSurveyGrade: true,
        retrievedAt: null,
        lat: sel.lat,
        lng: sel.lng,
      };
      inspectInPlace(bareCard, parcelNodeIdFromSelection(sel));
    },
    [inspectInPlace],
  );

  // PMTiles BROWSE-parcel click -> inspect-in-place. This path carries the
  // stable baked `parcel_node_id`, so it can reliably light the inspected glow
  // on the PMTiles source.
  const handleParcelClick = useCallback(
    (parcelNodeId: string, feature: unknown) => {
      const props =
        (feature as { properties?: Record<string, unknown> } | undefined)
          ?.properties ?? {};
      const str = (v: unknown): string | null =>
        typeof v === "string" && v.trim()
          ? v
          : typeof v === "number"
            ? String(v)
            : null;
      const bareCard: ParcelCardData = {
        apn: str(props.apn) ?? str(props.prop_id),
        situsAddress: str(props.situsAddress) ?? str(props.address),
        owner: str(props.owner),
        landUseDescription:
          str(props.landUseDescription) ?? str(props.landUseCode),
        county: str(props.countyName),
        provider: null,
        notSurveyGrade: true,
        retrievedAt: null,
        lat: typeof props.lat === "number" ? (props.lat as number) : null,
        lng: typeof props.lng === "number" ? (props.lng as number) : null,
      };
      // PMTiles feature geometry is clipped-per-tile (not a clean full ring), so
      // it's unreliable for the 0% outline / inset fallback — pass null and let
      // the baked "ok" envelope's own inset polygon (which IS complete) carry the
      // draw. The 0% case on this path shows the honest card wording only.
      const geom =
        (feature as { geometry?: unknown } | undefined)?.geometry ?? null;
      inspectInPlace(bareCard, parcelNodeId, geom);
    },
    [inspectInPlace],
  );

  // MAKE SUBJECT — the distinct, explicit action. Re-point the LIVE map to the
  // currently-inspected parcel via the persistent-map API: rebindProperty
  // (never-unmount camera+glow re-point) + resolveSubjectAndFit (bounded
  // subject-tile paint gate that fits + lights the subject glow once painted).
  // NO remount. The ported store's `subject` becomes the new source of truth.
  const handleMakeSubject = useCallback(() => {
    const handle = mapRef.current;
    const target = inspectedRef.current;
    if (!handle || !target) return;
    const { card: c, parcelNodeId } = target;
    const center = toCenter(c.lat, c.lng);

    // Clear the prior subject glow if it was a different parcel.
    const priorSubject = subjectNodeIdRef.current;
    if (priorSubject && priorSubject !== parcelNodeId) {
      handle.setParcelState(priorSubject, {});
    }

    // Re-point the LIVE map — camera eases over, subject glow lights. Never a
    // remount. parcelState lights the subject immediately if the tile is painted;
    // resolveSubjectAndFit then guards the paint race + fits to the parcel.
    handle.rebindProperty({
      center,
      address: c.situsAddress ?? undefined,
      parcelState: parcelNodeId
        ? { parcelNodeId, subject: true, inspected: true }
        : undefined,
    });
    if (parcelNodeId) {
      handle.resolveSubjectAndFit({ parcelNodeId, center, fit: true });
    }

    subjectNodeIdRef.current = parcelNodeId;
    setSubjectNodeId(parcelNodeId);
    parcelNodes.setSubject(
      {
        id: parcelNodeId ?? c.apn ?? (c.lat != null ? `coord:${c.lat}:${c.lng}` : null),
        source: "make-subject",
        centroid:
          c.lat != null && c.lng != null ? { lat: c.lat, lng: c.lng } : null,
        address: c.situsAddress,
        attrs: {
          apn: c.apn,
          owner: c.owner,
          county: c.county,
          parcelNodeId,
        },
      },
      "make-subject",
    );
  }, []);

  // When the envelope resolves: (1) DRAW the wedge visual on the live map (the
  // product deliverable — "what you can build, drawn"), and (2) patch
  // setbacks/envelope onto the inspected node (the subject/inspected source of
  // truth the ask/report path reads via getSubjectAreaContext when auth lands).
  const handleEnvelope = useCallback((result: any) => {
    // --- (1) DRAW the buildable-envelope wedge through the overlays path. ---
    const norm = normalizeEnvelope(result);
    if (norm.kind === "ok" && norm.insetGeometry) {
      // Real server-computed inset polygon (baked "ok" or live ok) -> amber
      // inset fill + dashed setback edge. The primary wedge visual.
      setEnvelopeOverlays([envelopeInsetOverlay(norm.insetGeometry)]);
    } else if (norm.kind === "empty") {
      // Honest 0%: setbacks consume the lot. No amber fill (that would fabricate
      // buildable area). Outline the whole parcel in the dashed setback style
      // when we have the ring; else draw nothing and let the card wording carry
      // the honesty.
      const outline = setbackConsumedOverlay(clickedParcelGeomRef.current);
      setEnvelopeOverlays(outline ? [outline] : []);
    } else {
      // ok-but-no-server-geometry: try the client-side inset FALLBACK (parcel
      // ring + setbacks). Only fires when the server gave setbacks but no
      // polygon AND we have a real parcel ring; otherwise nothing is drawn.
      const fallbackInset = insetParcelBySetbacks(
        clickedParcelGeomRef.current,
        result?.setbacks ?? null,
      );
      setEnvelopeOverlays(
        fallbackInset ? [envelopeInsetOverlay(fallbackInset)] : [],
      );
    }

    // --- (2) Patch the ported node store (unchanged seam). ---
    const inspected = parcelNodes.getInspected();
    if (!inspected?.id) return;
    parcelNodes.patchNode(
      inspected.id,
      {
        setbacks: result?.setbacks ?? null,
        envelope: result?.summary ?? null,
        resolved: { setbacks: !!result?.setbacks, envelope: result?.ok === true },
      },
      "envelope-resolved",
    );
  }, []);

  const closeInspect = useCallback(() => {
    const handle = mapRef.current;
    const prior = inspectedRef.current;
    // Clear the inspected glow, but keep the subject glow if this parcel is the
    // subject (drop only the `inspected` flag by re-asserting subject-only).
    if (handle && prior?.parcelNodeId) {
      if (subjectNodeIdRef.current === prior.parcelNodeId) {
        handle.setParcelState(prior.parcelNodeId, { subject: true });
      } else {
        handle.setParcelState(prior.parcelNodeId, {});
      }
    }
    inspectedRef.current = null;
    clickedParcelGeomRef.current = null;
    setEnvelopeOverlays([]); // clear the wedge visual when the card closes.
    // Road NETWORK is viewport-owned — keep drawing after card close.
    setCard(null);
    setCardNodeId(null);
    parcelNodes.setInspected(null, "close-inspect");
  }, []);

  const mapOverlays = useMemo<OverlaySpec[]>(
    () => [
      // Live contours FIRST so they draw beneath parcel lines / the wedge. The
      // LAYERS-panel `topography-contours` toggle controls their visibility
      // (visible flag), so unchecking that row now hides a REAL layer.
      ...toTopoOverlay(
        topo.data ? { status: "ok", response: topo.data } : topo.fetch,
        visibleLayers ? visibleLayers.has(TOPO_TOGGLE_KEY) : true,
      ),
      // Live D8 hydrology flow channels beneath the parcel lines / wedge. The
      // LAYERS-panel `hydrology-flow` toggle controls their visibility. An
      // honest-empty response (no channels) draws nothing (never a fake meander).
      ...toHydroOverlay(
        hydro.data ? { status: "ok", response: hydro.data } : hydro.fetch,
        visibleLayers ? visibleLayers.has(HYDRO_TOGGLE_KEY) : true,
      ),
      ...toLiveOverlays(
        parcels.data ? { status: "ok", response: parcels.data } : parcels.fetch,
        fema.data ? { status: "ok", response: fema.data } : fema.fetch,
        // Bind the live parcel/FEMA overlays to their LAYERS-panel toggles so
        // the panel actually controls them (was: always-on regardless of toggle).
        {
          parcels: visibleLayers ? visibleLayers.has("parcel-polygon" as LayerKey) : true,
          fema: visibleLayers ? visibleLayers.has("flood-zone" as LayerKey) : true,
        },
      ),
      // Track B1 road object under the envelope wedge.
      ...roadOverlays,
      // The buildable-envelope wedge, drawn last so it sits above the parcels.
      ...envelopeOverlays,
      // Brief street-search highlight (temporary, self-fading).
      ...searchOverlays,
    ],
    [parcels, fema, topo, hydro, roadOverlays, envelopeOverlays, searchOverlays, visibleLayers],
  );

  // Chips are now TRANSIENT notifications (item 2): each entry appears when its
  // state key/text changes, stays long enough to read, then fades. Persistent
  // honest states (degraded, not-survey-grade, honest-empty) are ALSO written
  // into `layerStates` below so they stay discoverable in the merged toolset's
  // layer rows after the toast fades — honesty is never lost, only the toast.
  const chips: ChipSpec[] = [];
  if (zoom != null && zoom < MIN_PARCEL_ZOOM) {
    chips.push({ key: "zoom", sev: "info", text: "Zoom in for parcels" });
  }
  if (parcels.fetch.status === "loading" || fema.fetch.status === "loading") {
    chips.push({ key: "loading", sev: "info", text: "Loading live layers…" });
  }
  if (parcels.fetch.status === "no-coverage") {
    chips.push({ key: "nc", sev: "warn", text: "No parcel coverage here" });
  }
  if (parcels.fetch.status === "error") {
    chips.push({ key: "err", sev: "error", text: `Parcels failed — ${parcels.fetch.message}` });
  }
  // Honest contour state — only when the topo toggle is on (don't nag when off).
  // The label FOLLOWS the served tier per viewport: 1-ft in Bastrop, 3DEP
  // elsewhere (contourTierLabel reads topo.data.tier). Never a static claim.
  const topoToggledOn = visibleLayers ? visibleLayers.has(TOPO_TOGGLE_KEY) : true;
  if (topoToggledOn) {
    if (topo.fetch.status === "error") {
      chips.push({ key: "topo-err", sev: "warn", text: `Contours degraded — ${topo.fetch.message}` });
    } else if (topo.fetch.status === "no-coverage") {
      chips.push({ key: "topo-nc", sev: "warn", text: "No contour coverage here" });
    } else if (topo.fetch.status === "ok" && topo.data) {
      const dz = topo.data.degraded ? " · degraded" : "";
      chips.push({
        key: "topo-ok",
        sev: "info",
        text: `${contourTierLabel(topo.data)}${dz}`,
      });
    }
  }
  // Honest hydrology state — only when the hydrology toggle is on. Live D8 flow
  // where it computes; honest-empty (with the served reason) where it doesn't.
  const hydroToggledOn = visibleLayers ? visibleLayers.has(HYDRO_TOGGLE_KEY) : true;
  if (hydroToggledOn) {
    if (hydro.fetch.status === "error") {
      chips.push({ key: "hydro-err", sev: "warn", text: `Flow lines degraded — ${hydro.fetch.message}` });
    } else if (hydro.fetch.status === "no-coverage") {
      chips.push({ key: "hydro-nc", sev: "warn", text: "No hydrology coverage here" });
    } else if (hydro.fetch.status === "ok" && hydro.data) {
      const emptyReason = hydrologyHonestReason(hydro.fetch);
      if (emptyReason) {
        // Honest-empty: no channels — surface the real reason, draw nothing.
        chips.push({ key: "hydro-empty", sev: "info", text: `Flow lines — none: ${emptyReason}` });
      } else {
        const dz = hydro.data.degraded ? " · degraded" : "";
        chips.push({
          key: "hydro-ok",
          sev: "info",
          text: `Flow lines — ${hydro.data.channelCount ?? hydro.data.featureCount ?? 0} D8 channels${dz}`,
        });
      }
    }
  }
  const attribution =
    parcels.fetch.status === "ok" && parcels.fetch.response.provider
      ? `${parcels.fetch.response.provider}${
          parcels.fetch.response.notSurveyGrade ? " · not survey grade" : ""
        }`
      : null;
  if (attribution) {
    chips.push({ key: "attribution", sev: "info", text: attribution });
  }
  // Honest search-landing chip (e.g. address outside parcel coverage).
  if (searchChip) {
    chips.push({ key: "search-coverage", sev: "warn", text: searchChip });
  }

  // PERSISTENT per-layer honesty for the merged toolset (item 2 constraint):
  // everything a fading toast said about a layer's ONGOING state lives here as
  // a state dot + tooltip (+ caption for warn/error) on that layer's row.
  const layerStates: Partial<Record<LayerKey, LayerStateBadge>> = {};
  if (parcels.fetch.status === "error") {
    layerStates["parcel-polygon" as LayerKey] = {
      tone: "error",
      note: `Parcels failed — ${parcels.fetch.message}`,
    };
  } else if (parcels.fetch.status === "no-coverage") {
    layerStates["parcel-polygon" as LayerKey] = {
      tone: "warn",
      note: "No parcel coverage here",
    };
  }
  // NO persistent attribution / not-survey-grade badge on the parcel row
  // (operator-ratified 2026-07-29): the layer NAME carries "GIS" and the
  // not-survey-grade disclosure lives on the site-plan export where it
  // matters. Live-health badges (error / no-coverage) above stay.
  if (topoToggledOn) {
    if (topo.fetch.status === "error") {
      layerStates[TOPO_TOGGLE_KEY] = {
        tone: "warn",
        note: `Contours degraded — ${topo.fetch.message}`,
      };
    } else if (topo.fetch.status === "no-coverage") {
      layerStates[TOPO_TOGGLE_KEY] = { tone: "warn", note: "No contour coverage here" };
    } else if (topo.fetch.status === "ok" && topo.data) {
      layerStates[TOPO_TOGGLE_KEY] = {
        tone: topo.data.degraded ? "warn" : "ok",
        note: `${contourTierLabel(topo.data)}${topo.data.degraded ? " · degraded" : ""}`,
      };
    }
  }
  if (hydroToggledOn) {
    if (hydro.fetch.status === "error") {
      layerStates[HYDRO_TOGGLE_KEY] = {
        tone: "warn",
        note: `Flow lines degraded — ${hydro.fetch.message}`,
      };
    } else if (hydro.fetch.status === "no-coverage") {
      layerStates[HYDRO_TOGGLE_KEY] = { tone: "warn", note: "No hydrology coverage here" };
    } else if (hydro.fetch.status === "ok" && hydro.data) {
      const emptyReason = hydrologyHonestReason(hydro.fetch);
      layerStates[HYDRO_TOGGLE_KEY] = emptyReason
        ? { tone: "info", note: `Flow lines — none: ${emptyReason}` }
        : {
            tone: hydro.data.degraded ? "warn" : "ok",
            note: `Flow lines — ${
              hydro.data.channelCount ?? hydro.data.featureCount ?? 0
            } D8 channels${hydro.data.degraded ? " · degraded" : ""}`,
          };
    }
  }

  const isSubject =
    !!card &&
    inspectedRef.current?.parcelNodeId != null &&
    inspectedRef.current.parcelNodeId === subjectNodeIdRef.current;

  // WB1: "Research this →" now OPENS the workbench brief bubble/dock. The
  // fetch itself (same endpoint, same 401/402/503/404 states) moved into the
  // BriefTool (workbench/tools/brief-research.ts) and its result is
  // per-property persistent via the chassis store. With no baked node id the
  // dock renders the honest "select a property first" state.
  const handleResearch = useCallback(() => {
    const nodeId = cardNodeId ?? inspectedRef.current?.parcelNodeId ?? null;
    void recordPeGtmEvent({
      eventType: "pe_research_clicked",
      parcelNodeId: nodeId,
    });
    setOpenWorkbenchTool("brief");
  }, [cardNodeId]);

  // W2: latest inspect-card display facts for the Reports tool's site-plan
  // sheet header (mutable-latest ref so the memoized host stays stable).
  const cardFactsRef = useRef<{ address: string | null; countyName: string | null }>({
    address: null,
    countyName: null,
  });
  cardFactsRef.current = {
    address: card?.situsAddress ?? null,
    countyName: card?.county ?? null,
  };

  // App-shell actions the workbench tools call back into (the 402 paywall;
  // W2 active-parcel display facts; W3 the active property's situs address for
  // chat scoping; W4 reopen — same find/fly+inspect flow as the search bar's
  // parcel fast path, via runParcelLookup on the LIVE map, never a remount).
  // Reads route through refs so the host identity stays stable.
  const workbenchHost = useMemo<WorkbenchHostActions>(
    () => ({
      openPaywall: (message: string) => {
        setCheckoutNote(null);
        setPaywallMessage(message);
        setPaywallOpen(true);
      },
      getActivePropertyAddress: () => {
        // Only the INSPECTED card carries an address; return it iff it IS the
        // workbench's active property (never a stale card's address).
        const active = activeParcelNodeIdRef.current;
        const inspected = inspectedRef.current;
        if (!active || !inspected || inspected.parcelNodeId !== active) {
          return null;
        }
        return inspected.card?.situsAddress ?? null;
      },
      getActiveParcelFacts: () => cardFactsRef.current,
      openProperty: (parcelNodeId: string) => {
        void runParcelLookup(parcelNodeId);
      },
      // WB6 dossier: capture the live draw/measure/marker geometries. Null
      // when the toolset never installed (map still mounting) — honest absence.
      getMapDrawings: () => {
        const controller = toolsControllerRef.current;
        if (!controller) return null;
        const fc = controller.getDrawings();
        return fc.features.length > 0 ? fc : null;
      },
      // WB6 dossier: redraw saved drawings as the read-only overlay; records
      // which property they belong to so the switch-effect below can clear.
      showDossierDrawings: (fc, forParcelNodeId) => {
        const controller = toolsControllerRef.current;
        if (!controller) return;
        dossierOverlayForRef.current = fc ? (forParcelNodeId ?? null) : null;
        controller.setDossierOverlay(fc);
      },
    }),
    [runParcelLookup],
  );

  // ACTIVE PROPERTY for the workbench: the currently-INSPECTED parcel's baked
  // node id, falling back to the SUBJECT's. Every dock tool re-scopes when
  // this changes (chassis store is keyed by it).
  const activeParcelNodeId = cardNodeId ?? subjectNodeId;
  activeParcelNodeIdRef.current = activeParcelNodeId;

  // WB6 dossier: when the ACTIVE property switches away from the property the
  // dossier-drawings overlay was drawn for, clear the overlay — saved drawings
  // never linger over a different parcel. (Reopen draws AFTER recording the
  // target id, so the overlay for the newly-opened property survives.)
  useEffect(() => {
    const drawnFor = dossierOverlayForRef.current;
    if (drawnFor && drawnFor !== activeParcelNodeId) {
      dossierOverlayForRef.current = null;
      toolsControllerRef.current?.setDossierOverlay(null);
    }
  }, [activeParcelNodeId]);

  // W2: the terrain/site-plan paywall handlers moved into the workbench
  // Reports tool (ReportsTool.tsx) with the same copy + pe_paywall_hit event —
  // the exports no longer live on the inspect card.

  // SAVE PROPERTY (W4) — ONE save flow, shared with the My Properties tool:
  // the same savedPropertiesClient PUT (deep proxy, user session upstream),
  // then open the properties tool so the result is visible (the tool lists
  // from the server — the truth — and shows the honest sign-in state on 401).
  const handleSaveProperty = useCallback(() => {
    const nodeId = cardNodeId ?? inspectedRef.current?.parcelNodeId ?? null;
    void recordPeGtmEvent({
      eventType: "pe_save_property",
      parcelNodeId: nodeId,
    });
    if (nodeId) {
      const address = inspectedRef.current?.card.situsAddress ?? null;
      // WB6: seed the dossier (savedAt/address + current map drawings) —
      // savePropertyWithDossier merges into an existing dossier, never clobbers.
      const drawings = sanitizeDrawings(
        toolsControllerRef.current?.getDrawings() ?? null,
      );
      void savePropertyWithDossier(nodeId, {
        label: address,
        address,
        drawings: drawings ?? undefined,
      });
    }
    setOpenWorkbenchTool("properties");
  }, [cardNodeId]);

  const handleUpgrade = useCallback(async () => {
    setCheckoutBusy(true);
    const nodeId = cardNodeId ?? inspectedRef.current?.parcelNodeId ?? null;
    const result = await startPeCheckout({ parcelNodeId: nodeId });
    setCheckoutBusy(false);
    if (!result.ok) {
      setCheckoutNote(result.message ?? "Checkout unavailable");
      return;
    }
    setCheckoutNote(result.honestNote ?? null);
    if (result.checkoutUrl) {
      window.location.assign(result.checkoutUrl);
    }
  }, [cardNodeId]);

  // Two-products: PE is map + inspect card + exports only. County ledger /
  // node-graph balance sheet stays in Command Center (operator), never here.
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <FloatingMap
        ref={mapRef}
        floating={false}
        useFixture={false}
        // Mount-time seed ONLY (stable identity). Subject changes re-point the
        // live handle via rebindProperty — the center prop never re-points.
        center={DEFAULT_CENTER}
        parcelTiles={PARCEL_TILES}
        overlays={mapOverlays}
        visibleLayers={visibleLayers ?? undefined}
        onParcelSelect={handleParcelSelect}
        onParcelClick={handleParcelClick}
        onViewportChange={handleViewportChange}
        style={{ position: "absolute", inset: 0 }}
      />

      {/* ONE upper-right toolset (item 1): tools (satellite, measure, draw,
          marker, clear, GPS) merged with the layer checklist. Layer toggles are
          driven through the substrate (getVisibleLayers seed + visibleLayers
          prop — no shadow paint state); tools operate on the LIVE persistent
          map via the shared handle — never remounts the map. Per-layer honest
          state (degraded / not-survey-grade / honest-empty) is pinned to the
          layer rows via `layerStates` so it outlives the transient toasts. */}
      {visibleLayers && knownLayers && (
        <MapToolset
          mapRef={mapRef}
          known={knownLayers}
          visible={visibleLayers}
          onLayersChange={(next) => setVisibleLayers(new Set(next))}
          layerStates={layerStates}
          onToolsController={handleToolsController}
        />
      )}

      {/* Transient notification area (item 2): layer-state chips appear on
          change, stay long enough to read, then fade — never stacking stale
          entries. Persistent honesty lives in the toolset's layer rows. */}
      <TransientChips chips={chips} />

      {/* PE WORKBENCH (WB1): top-right bubble cluster + the ONE shared dock.
          One tool open at a time; per-property persistent state via the
          chassis store; the brief is the first live tool. The bottom-right
          MapToolset bubble is a SEPARATE cluster (map utilities) — untouched. */}
      <Workbench
        tools={WORKBENCH_TOOLS}
        openToolId={openWorkbenchTool}
        onOpenToolChange={setOpenWorkbenchTool}
        activeParcelNodeId={activeParcelNodeId}
        host={workbenchHost}
      />

      {/* Type-ahead search (rebuilt Find bar): grouped suggestions with
          viewport bias; kind-aware landing (parcel → inspect card, address →
          existing lookup or honest map-only landing, street → extent fit +
          fading highlight, place → dock over its bbox). Raw submit keeps the
          original parcel-id / address direct behavior. */}
      <SearchBar
        busy={lookupBusy}
        error={lookupError}
        onSelect={handleSearchSelect}
        onSubmitRaw={(q) => void runParcelLookup(q)}
        getBias={getSearchBias}
      />

      {card && (
        <InspectCard
          card={card}
          parcelNodeId={cardNodeId}
          isSubject={isSubject}
          onClose={closeInspect}
          onEnvelope={handleEnvelope}
          onMakeSubject={handleMakeSubject}
          onResearch={handleResearch}
          onSaveProperty={handleSaveProperty}
        />
      )}

      {paywallOpen && (
        <PaywallGate
          message={`${paywallMessage ?? "Deep research and cited property reports (R1–R10) require sign-in and Pro entitlement."} Checkout runs in test or live mode depending on cortex Stripe config — browse stays free. ${iccCitationStatus().live ? "" : iccCitationStatus().message}`}
          checkoutNote={checkoutNote}
          onUpgrade={() => void handleUpgrade()}
          onClose={() => setPaywallOpen(false)}
          busy={checkoutBusy}
        />
      )}
    </div>
  );
}
