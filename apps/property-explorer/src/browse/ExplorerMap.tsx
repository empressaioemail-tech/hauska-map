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
import "./pe-mobile.css";
import { DEFAULT_CENTER, PARCEL_TILES } from "../lib/config";
import { cortexClient } from "../lib/cortexClient";
import { parcelNodes } from "../lib/parcel-node-store.js";
import { recordPeGtmEvent } from "../lib/gtmClient";
import { savePropertyWithDossier } from "../lib/savedPropertiesClient";
import { sanitizeDrawings } from "../lib/propertyDossier";
import {
  SAVED_PINS_LAYER_KEY,
  SAVED_PINS_LAYER_LABEL,
  SAVED_PINS_LEGEND,
  resolvePinForSave,
} from "../lib/saved-pins";
import { SavedPropertyPins } from "./SavedPropertyPins";
import { iccCitationStatus } from "../lib/iccCitation";
import { InspectCard } from "./InspectCard";
import { Workbench } from "../workbench/Workbench";
import { WORKBENCH_TOOLS } from "../workbench/registry";
import type { WorkbenchHostActions } from "../workbench/types";
import {
  SHARED_ANALYSIS_TOOL_ID,
  sharedAnalysisToolDef,
  type ShareFunnelBinding,
} from "../share/SharedDossierDock";
import { MapToolset, type LayerStateBadge } from "./MapToolset";
import type { MapToolsController } from "./mapToolsController";
import { asMaplibreMap } from "./satelliteBase";
import { createFloodMapOverlayController } from "./flood-map-overlay";
import { SmartSiteBadge, MapSourceInfo } from "./MapCornerChrome";
import { SearchBar } from "./SearchBar";
import { PaywallGate } from "./PaywallGate";
import {
  MobilePanelProvider,
  MobileSheet,
  useMobilePanel,
} from "./MobilePanelContext";
import { useMobileViewport } from "./useMobileViewport";
import {
  deepLinkLookupQuery,
  resolveLookupToParcelNodeId,
} from "../lib/parcel-lookup";
import { factSheetResolver } from "../lib/fact-sheet-resolver";
import { setSubjectByParcelNodeId } from "../lib/subject-store";
import { cardFromSheet } from "../lib/sheet-to-card";
import { UnplaceableParcelCard } from "./UnplaceableParcelCard";
import type { UnplaceableParcel } from "@empressaio/parcel-fact-sheet";
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
  PEDESTRIAN_WAYS_TOGGLE_KEY,
  ROAD_NODES_TOGGLE_KEY,
  type AttachingRoadWire,
} from "./road-overlay";
import { countyFipsForViewportCenter } from "./county-fips-viewport";
import {
  consumerKnownLayers,
  consumerColdOpenVisible,
  HYDROGRAPHY_TOGGLE_KEY,
} from "./consumer-layers";
import {
  MIN_PARCEL_ZOOM,
  MIN_TOPO_ZOOM,
  MIN_HYDROGRAPHY_ZOOM,
  DETAIL_OPPORTUNITY_ZONE_ZOOM,
  LIVE_PARCELS_KEY,
  layersForZoom,
  fetchGisLayer,
  fetchTopographyLayer,
  fetchHydrographyLayer,
  fetchOpportunityZoneLayer,
  fetchTexasOpportunityZoneLayer,
  contourTierLabel,
  hydrographyHonestReason,
  hydrographyProvenanceLabel,
  opportunityZoneHonestReason,
  opportunityZoneProvenanceLabel,
  toLiveOverlays,
  toTopoOverlay,
  toHydrographyOverlay,
  toOpportunityZoneOverlay,
  selectionToCard,
  parcelNodeIdFromSelection,
  type GisLayerResponse,
  type LiveLayerKey,
  type LiveLayerState,
  type TopoLayerResponse,
  type TopoLayerState,
  type HydrographyLayerResponse,
  type HydrographyLayerState,
  type OpportunityZoneLayerResponse,
  type OpportunityZoneLayerState,
  type ParcelCardData,
} from "./liveGis";

/** The registry key whose LAYERS-panel toggle now controls the LIVE contour
 *  overlay. Toggling this row shows/hides the real engine contours. */
const TOPO_TOGGLE_KEY = "topography-contours" as LayerKey;
/** PE topography BFF — free browse contour layer (engine topography-1ft slot). */
const PE_TOPOGRAPHY_URL = "/api/pe-topography";
/** PE hydrography BFF — free browse county-mapped streams (engine hydrography
 *  slot). Feature-detected: until the engine leg deploys, the layer reports an
 *  honest "Hydrography not yet available" state, never an error. */
const PE_HYDROGRAPHY_URL = "/api/pe-hydrography";
/** PE Opportunity Zone BFF — CDFI designated tracts × Census 2010 TIGER/Line. */
const PE_OPPORTUNITY_ZONE_URL = "/api/pe-opportunity-zone";
/** LAYERS-panel registry key for Opportunity Zone tracts. */
const OPPORTUNITY_ZONE_TOGGLE_KEY = "opportunity-zone-tract" as LayerKey;

/** Zoom gate for viewport road-node layer (same altitude as parcels). */
const MIN_ROAD_ZOOM = MIN_PARCEL_ZOOM;

/** WB7c: the LAYERS-panel row key for saved-property pins. PE-side layer (DOM
 *  markers) — the key never reaches the renderer's visible-layer set. */
const SAVED_PINS_KEY = SAVED_PINS_LAYER_KEY as LayerKey;

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

interface HydrographySlot {
  fetch: HydrographyLayerState;
  data: HydrographyLayerResponse | null;
}
const HYDROGRAPHY_IDLE: HydrographySlot = { fetch: { status: "idle" }, data: null };

interface OpportunityZoneSlot {
  fetch: OpportunityZoneLayerState;
  data: OpportunityZoneLayerResponse | null;
}
const OPPORTUNITY_ZONE_IDLE: OpportunityZoneSlot = { fetch: { status: "idle" }, data: null };

// Consumer-honest layer filter: lives in consumer-layers.ts so the panel
// contract — including the D8 `hydrology-flow` retirement — is unit-testable
// (imported above with the other browse modules).

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

export function ExplorerMap({
  share = null,
}: {
  /** SHARE FUNNEL binding (ShareFunnelApp): non-null only on a share landing.
   *  Prepends the read-only shared-analysis dock tool, auto-opens it, and
   *  flies to the shared property via the SAME reopen chain the workbench
   *  uses (runParcelLookup — never a second resolver). Null → normal app. */
  share?: ShareFunnelBinding | null;
} = {}) {
  const isMobileViewport = useMobileViewport();
  return (
    <MobilePanelProvider isMobile={isMobileViewport}>
      <ExplorerMapSurface share={share} />
    </MobilePanelProvider>
  );
}

function ExplorerMapSurface({
  share = null,
}: {
  share?: ShareFunnelBinding | null;
}) {
  const { isMobile, activeSheet, openSheet } = useMobilePanel();
  const mapRef = useRef<FloatingMapHandle>(null);
  const [parcels, setParcels] = useState<LayerSlot>(IDLE);
  const [fema, setFema] = useState<LayerSlot>(IDLE);
  const [topo, setTopo] = useState<TopoSlot>(TOPO_IDLE);
  const topoAbortRef = useRef<AbortController | null>(null);
  const [hydrography, setHydrography] = useState<HydrographySlot>(HYDROGRAPHY_IDLE);
  const hydrographyAbortRef = useRef<AbortController | null>(null);
  const [opportunityZone, setOpportunityZone] = useState<OpportunityZoneSlot>(OPPORTUNITY_ZONE_IDLE);
  const opportunityZoneAbortRef = useRef<AbortController | null>(null);
  // Viewport zoom re-render trigger. The value itself is no longer read (the
  // old transient zoom chip was removed in the REBRAND map-chrome pass); the
  // setter is kept because zoom-gated layer fetches re-run on the state change.
  const setZoom = useState<number | null>(null)[1];
  const [card, setCard] = useState<ParcelCardData | null>(null);
  // The clicked parcel's stable baked-node id, kept alongside `card` so the
  // InspectCard can read its baked facet snapshot (the preferred pure-read
  // source). Null for a live-GIS-only selection with no baked id.
  const [cardNodeId, setCardNodeId] = useState<string | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  // AMENDMENT 1: a parcel we hold the record for but cannot place. NOT an error
  // and NOT a subject — its own designed state, rendered where the inspect card
  // would be. It never silently becomes a sheet.
  const [unplaceable, setUnplaceable] = useState<UnplaceableParcel | null>(null);
  // closeInspect is declared further down the body; hold it through a ref so
  // the lookup callback can clear the card without a declaration-order hazard.
  const closeInspectRef = useRef<(() => void) | null>(null);
  // Type-ahead search landing state: the brief fading street-extent highlight
  // overlay. The coverage-miss "chip" value is no longer rendered (the transient
  // notifications were removed in the REBRAND map-chrome pass); the setter is
  // kept so the existing search-landing plumbing (showSearchChip) still runs
  // without change.
  const setSearchChip = useState<string | null>(null)[1];
  const [searchOverlays, setSearchOverlays] = useState<OverlaySpec[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const deepLinkDoneRef = useRef(false);

  // The buildable-envelope wedge visual, drawn through the SUPPORTED overlays
  // path (OverlaySpec + reconcileOverlays) on the LIVE map — never a remount.
  // Holds 0..2 specs: the amber inset fill+dashed-edge (status "ok"), or a
  // dashed full-parcel outline for the honest 0%/"entirely setback" case.
  const [envelopeOverlays, setEnvelopeOverlays] = useState<OverlaySpec[]>([]);
  // Track B1-map: viewport road-node network (streets + optional pedestrian).
  // Raw wires kept so pedestrian visibility can flip without re-fetch.
  const [roadWires, setRoadWires] = useState<AttachingRoadWire[]>([]);
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
  // active-property binding re-renders when the subject changes. A share
  // landing opens with the shared-analysis dock already docked.
  const [openWorkbenchTool, setOpenWorkbenchToolState] = useState<string | null>(
    share ? SHARED_ANALYSIS_TOOL_ID : null,
  );
  const setOpenWorkbenchTool = useCallback(
    (next: string | null) => {
      setOpenWorkbenchToolState(next);
      if (isMobile && next) openSheet("research");
    },
    [isMobile, openSheet],
  );
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
  // FD2 flood overlay: ONE controller per mount; the map handle is read per
  // call (the map mounts after the controller exists). The dock's flood
  // section drives it via host.setFloodMapOverlay; the property-switch
  // effect below auto-clears (the WB6 dossier-overlay precedent).
  const floodOverlay = useMemo(
    () =>
      createFloodMapOverlayController(() =>
        asMaplibreMap(mapRef.current?.getMap?.() ?? null),
      ),
    [],
  );
  useEffect(() => () => floodOverlay.destroy(), [floodOverlay]);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallMessage, setPaywallMessage] = useState<string | null>(null);
  // R1: the unified unlock flow's Pro-only variant (terrain) — set per open.
  const [paywallProOnly, setPaywallProOnly] = useState(false);

  // Phase 0A cold-open: parcel line-only visible; full consumer catalog known
  // so presets / checkboxes can disclose layers. Pins are chrome (not a map layer).
  useEffect(() => {
    if (visibleLayers) return;
    const h = mapRef.current;
    if (!h) return;
    // Wait until the renderer handle is live (getVisibleLayers exists).
    if (typeof h.getVisibleLayers !== "function") return;
    const visible = consumerColdOpenVisible();
    visible.add(SAVED_PINS_KEY);
    const known = consumerKnownLayers();
    known.add(SAVED_PINS_KEY);
    setVisibleLayers(new Set(visible));
    setKnownLayers(new Set(known));
  });

  // The renderer's visible-layer set MUST NOT carry the PE-side pins key —
  // strip it before threading `visibleLayers` into FloatingMap.
  const rendererVisibleLayers = useMemo(() => {
    if (!visibleLayers) return undefined;
    const next = new Set(visibleLayers);
    next.delete(SAVED_PINS_KEY);
    return next;
  }, [visibleLayers]);

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

    // Live hydrography — REAL county-mapped streams (engine hydrography slot).
    // Own abort controller so a hydrography fetch in flight doesn't cancel the
    // parcel/FEMA/topo batches (separate BFF, separate latency). Honest states
    // pass through: ok honest-empty keeps its reason; a county without a
    // configured source is honest-unavailable; and until the engine slot is
    // DEPLOYED the fetch resolves the feature-detect "unavailable" state
    // ("Hydrography not yet available") — never an error.
    hydrographyAbortRef.current?.abort();
    const hydrographyCtrl = new AbortController();
    hydrographyAbortRef.current = hydrographyCtrl;
    if (vp.zoom < MIN_HYDROGRAPHY_ZOOM) {
      setHydrography({ fetch: { status: "zoom-gated" }, data: null });
    } else {
      setHydrography((s) => ({ ...s, fetch: { status: "loading" } }));
      const hcenter = {
        lat: (vp.bbox.south + vp.bbox.north) / 2,
        lng: (vp.bbox.west + vp.bbox.east) / 2,
      };
      fetchHydrographyLayer(PE_HYDROGRAPHY_URL, vp.bbox, hcenter, hydrographyCtrl.signal)
        .then((state) => {
          if (hydrographyCtrl.signal.aborted) return;
          setHydrography({ fetch: state, data: state.status === "ok" ? state.response : null });
        })
        .catch((err) => {
          if (hydrographyCtrl.signal.aborted || (err as Error)?.name === "AbortError") return;
          setHydrography({
            fetch: { status: "error", message: `hydrography: ${(err as Error)?.message}` },
            data: null,
          });
        });
    }

    // Live Opportunity Zone tracts — Texas statewide LOD (cached once) at any
    // zoom for the regional pocket pattern; full-detail viewport join when
    // zoomed in. No zoom→empty gate (OZ is a statewide pattern layer).
    opportunityZoneAbortRef.current?.abort();
    const ozCtrl = new AbortController();
    opportunityZoneAbortRef.current = ozCtrl;
    const wantOzDetail = vp.zoom >= DETAIL_OPPORTUNITY_ZONE_ZOOM;
    const applyOz = (state: OpportunityZoneLayerState) => {
      if (ozCtrl.signal.aborted) return;
      setOpportunityZone({
        fetch: state,
        data: state.status === "ok" ? state.response : null,
      });
    };
    void (async () => {
      try {
        const texas = await fetchTexasOpportunityZoneLayer(
          PE_OPPORTUNITY_ZONE_URL,
          ozCtrl.signal,
        );
        if (ozCtrl.signal.aborted) return;
        if (!wantOzDetail) {
          applyOz(texas);
          return;
        }
        // Keep statewide pockets visible while the detail fetch lands.
        if (texas.status === "ok") applyOz(texas);
        else setOpportunityZone((s) => ({ ...s, fetch: { status: "loading" } }));

        const ozCenter = {
          lat: (vp.bbox.south + vp.bbox.north) / 2,
          lng: (vp.bbox.west + vp.bbox.east) / 2,
        };
        const detail = await fetchOpportunityZoneLayer(
          PE_OPPORTUNITY_ZONE_URL,
          vp.bbox,
          ozCenter,
          ozCtrl.signal,
        );
        if (ozCtrl.signal.aborted) return;
        if (detail.status === "ok") {
          applyOz(detail);
        } else if (texas.status === "ok") {
          // Detail degraded — keep Texas pockets, surface the detail error.
          setOpportunityZone({
            fetch: detail,
            data: texas.response,
          });
        } else {
          applyOz(detail);
        }
      } catch (err) {
        if (ozCtrl.signal.aborted || (err as Error)?.name === "AbortError") return;
        setOpportunityZone({
          fetch: {
            status: "error",
            message: `opportunity-zone: ${(err as Error)?.message}`,
          },
          data: null,
        });
      }
    })();

    // Road NETWORK in view (Track B1-map reopen) — not per-parcel attaching.
    roadAbortRef.current?.abort();
    const roadCtrl = new AbortController();
    roadAbortRef.current = roadCtrl;
    if (vp.zoom < MIN_ROAD_ZOOM) {
      setRoadWires([]);
      return;
    }
    const midLat = (vp.bbox.south + vp.bbox.north) / 2;
    const midLng = (vp.bbox.west + vp.bbox.east) / 2;
    const fips = countyFipsForViewportCenter(midLat, midLng);
    if (!fips) {
      setRoadWires([]);
      return;
    }
    void fetchRoadsNearBbox(vp.bbox, fips, roadCtrl.signal)
      .then((roads) => {
        if (roadCtrl.signal.aborted) return;
        setRoadWires(roads);
      })
      .catch((err) => {
        if (roadCtrl.signal.aborted || (err as Error)?.name === "AbortError") return;
        setRoadWires([]);
      });
  }, []);

  // Both road children are driven by the LAYERS panel. Note the `: false`
  // fallbacks: before the seed lands, `visibleLayers` is null and BOTH stay
  // hidden. Other layers here fall back to `true` because they are on at cold
  // open; road nodes are off at cold open (SS-W10 / P-46), so falling back to
  // true would flash them on for the first frames and contradict the default.
  const roadOverlays = useMemo(
    () =>
      roadOverlaysFromAttachingRoads(roadWires, {
        pedestrianVisible: visibleLayers
          ? visibleLayers.has(PEDESTRIAN_WAYS_TOGGLE_KEY as LayerKey)
          : false,
        streetVisible: visibleLayers
          ? visibleLayers.has(ROAD_NODES_TOGGLE_KEY as LayerKey)
          : false,
      }),
    [roadWires, visibleLayers],
  );

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
      if (isMobile) openSheet("property");
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
    [isMobile, openSheet],
  );

  // EVERY entry point makes the parcel THE subject (invariant I1). A map click
  // paints its card instantly from the tile feature it already has, and the
  // sealed sheet lands a moment later and replaces it — so the card the user
  // reads and the sheet every export is keyed on converge on ONE parcel.
  //
  // The click's own ring is handed to the resolver as a geometry seed: it is
  // the best boundary evidence anywhere in the app at that moment, and passing
  // it saves the resolver from re-deriving what the click already knew.
  const adoptSubject = useCallback(
    (
      parcelNodeId: string | null,
      geometry: unknown,
      origin: "map-click" | "share" | "compare",
    ) => {
      if (!parcelNodeId) {
        // No stable id: there is nothing a sheet could be sealed against, so
        // the previous subject stands rather than being replaced by a guess.
        return;
      }
      factSheetResolver.hint(parcelNodeId, { geometry });
      void setSubjectByParcelNodeId(parcelNodeId, origin)
        .then((outcome) => {
          // Only adopt if this parcel is STILL the one being inspected — a
          // fast second click must not have its card overwritten by the first.
          if (inspectedRef.current?.parcelNodeId !== parcelNodeId) return;
          if (outcome.kind === "unplaceable") {
            // Reachable only for a click on a parcel whose boundary the map
            // drew but whose record carries no placement. Keep the click's own
            // card; the subject stays where it was, and an export refuses.
            return;
          }
          const next = cardFromSheet(outcome.subject.sheet);
          inspectedRef.current = { card: next, parcelNodeId };
          setCard(next);
        })
        .catch(() => {
          // Honest degrade: the card stays on what the click carried. The
          // export seam refuses rather than exporting against a stale subject.
        });
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
        // 1. Query -> parcel node id. That is the ONLY thing the lookup path
        //    is authoritative for; it no longer reads a single parcel fact.
        const found = await resolveLookupToParcelNodeId(q);
        if (!found.ok) {
          if (!opts?.quiet) setLookupError(found.reason);
          return false;
        }
        // 2. ONE resolve, ONE sealed sheet, and it becomes THE subject. Every
        //    panel and every export reads it from here (invariant I1).
        const outcome = await setSubjectByParcelNodeId(
          found.parcelNodeId,
          opts?.fromDeepLink ? "deep-link" : "search",
        );
        if (outcome.kind === "unplaceable") {
          // We hold the record and cannot place it. Say so, in its own state,
          // rather than failing the Find or flying the map somewhere invented.
          // The PREVIOUS subject is left standing on purpose.
          closeInspectRef.current?.();
          setUnplaceable(outcome.parcel);
          if (isMobile) openSheet("property");
          void recordPeGtmEvent({
            eventType: "pe_browse_started",
            payload: {
              lookupQuery: q,
              lookupSource: found.source,
              parcelNodeId: outcome.parcel.parcelNodeId,
              unplaceable: true,
            },
          });
          return true;
        }
        const sheet = outcome.subject.sheet;
        setUnplaceable(null);

        if (opts?.fromDeepLink) {
          void recordPeGtmEvent({
            eventType: "pe_browse_started",
            payload: {
              extensionHandoff: sheet.identity.parcelNodeId,
              lookupSource: found.source,
            },
          });
        } else {
          void recordPeGtmEvent({
            eventType: "pe_browse_started",
            payload: {
              lookupQuery: q,
              lookupSource: found.source,
              parcelNodeId: sheet.identity.parcelNodeId,
            },
          });
        }

        // 3. The card RENDERS the sheet — it is a projection, not a re-lookup.
        inspectInPlace(
          cardFromSheet(sheet),
          sheet.identity.parcelNodeId,
          sheet.geometry.rings.length
            ? {
                type: "Polygon",
                coordinates: [sheet.geometry.rings[0]],
              }
            : null,
        );

        // 4. I5: the camera follows the parcel's GEOMETRY. The centroid is
        //    always present, so a parcel with no situs address moves the map
        //    exactly like one with an address — a data gap is a display gap
        //    now, never a broken Find.
        const handle = mapRef.current;
        const center = toCenter(
          sheet.geometry.centroid.lat,
          sheet.geometry.centroid.lng,
        );
        if (handle && center) {
          handle.rebindProperty({
            center,
            address:
              sheet.identity.situsAddress.state === "present"
                ? sheet.identity.situsAddress.value
                : undefined,
            parcelState: {
              parcelNodeId: sheet.identity.parcelNodeId,
              inspected: true,
            },
          });
          handle.resolveSubjectAndFit({
            parcelNodeId: sheet.identity.parcelNodeId,
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
    [inspectInPlace, isMobile, openSheet],
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
        "line-color": "#7dd3fc", // INTERACTION cyan (taxonomy) — search highlight only
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

  // SHARE FUNNEL flight: once the share token resolves, fly/dock the LIVE map
  // to the shared property through the SAME find/fly+inspect chain the
  // workbench reopen uses (runParcelLookup → resolveParcelLookup's
  // center-resolution chain → inspectInPlace + rebindProperty +
  // resolveSubjectAndFit). Quiet: a resolution miss never paints the search
  // error line — the docked analysis still renders from the token-gated BFF.
  const shareFlightDoneRef = useRef(false);
  useEffect(() => {
    if (!share || share.phase.kind !== "ready" || shareFlightDoneRef.current) {
      return;
    }
    shareFlightDoneRef.current = true;
    void runParcelLookup(share.phase.data.property.parcelNodeId, {
      quiet: true,
    });
  }, [share, runParcelLookup]);

  // The workbench cluster: share landings get the read-only shared-analysis
  // tool PREPENDED (top bubble); everything else is the standard registry —
  // outside the share grant the app behaves exactly as anonymous.
  const workbenchTools = useMemo(
    () => (share ? [sharedAnalysisToolDef(share), ...WORKBENCH_TOOLS] : WORKBENCH_TOOLS),
    [share],
  );

  // Live-GIS overlay parcel click -> inspect-in-place. Fold the clicked parcel
  // into the ported node store as `inspected` and draw the InspectCard.
  const handleParcelSelect = useCallback(
    (sel: ParcelSelection) => {
      if (sel.layerKey === LIVE_PARCELS_KEY) {
        // The live-parcel feature carries the parcel ring — thread it so the 0%
        // case can outline the lot and the inset fallback can inset it.
        const geom =
          (sel.feature as { geometry?: unknown } | undefined)?.geometry ?? null;
        const nodeId = parcelNodeIdFromSelection(sel);
        inspectInPlace(selectionToCard(sel), nodeId, geom);
        adoptSubject(nodeId, geom, "map-click");
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
      adoptSubject(parcelNodeIdFromSelection(sel), null, "map-click");
    },
    [inspectInPlace, adoptSubject],
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
      // PMTiles rings are clipped per tile, so they are NOT offered to the
      // resolver as a boundary seed — a clipped ring would measure a lot short.
      adoptSubject(parcelNodeId, null, "map-click");
    },
    [inspectInPlace, adoptSubject],
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
  closeInspectRef.current = closeInspect;

  const mapOverlays = useMemo<OverlaySpec[]>(
    () => [
      // Live contours FIRST so they draw beneath parcel lines / the wedge. The
      // LAYERS-panel `topography-contours` toggle controls their visibility
      // (visible flag), so unchecking that row now hides a REAL layer.
      ...toTopoOverlay(
        topo.data ? { status: "ok", response: topo.data } : topo.fetch,
        visibleLayers ? visibleLayers.has(TOPO_TOGGLE_KEY) : true,
      ),
      // Live hydrography (real county-mapped streams) beneath the parcel lines
      // / wedge. The LAYERS-panel `hydrography` toggle controls visibility. An
      // honest-empty or unavailable response draws nothing (never a squiggle).
      ...toHydrographyOverlay(
        hydrography.data
          ? { status: "ok", response: hydrography.data }
          : hydrography.fetch,
        visibleLayers ? visibleLayers.has(HYDROGRAPHY_TOGGLE_KEY) : true,
      ),
      ...toOpportunityZoneOverlay(
        opportunityZone.data
          ? { status: "ok", response: opportunityZone.data }
          : opportunityZone.fetch,
        visibleLayers ? visibleLayers.has(OPPORTUNITY_ZONE_TOGGLE_KEY) : true,
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
    [parcels, fema, topo, hydrography, opportunityZone, roadOverlays, envelopeOverlays, searchOverlays, visibleLayers],
  );

  // REBRAND map-chrome (2026-08-03): the transient scroll notifications
  // (TransientChips) were removed as redundant chrome. What SURVIVES is the
  // REQUIRED source/attribution — now a persistent, collapsible ⓘ bubble in the
  // lower-right (MapSourceInfo) rather than fading toasts. `sourceLines` are the
  // live provenance strings for whatever is currently served + toggled on
  // (parcel provider + not-survey-grade, contour tier, hydrography provenance,
  // Opportunity Zone provenance). Transient STATE notices (zoom/loading/
  // no-coverage/error/degraded/honest-empty) are NOT source attribution; their
  // persistent home is the per-layer `layerStates` badges built below.
  const sourceLines: string[] = [];
  // Parcel provider + not-survey-grade disclosure.
  if (parcels.fetch.status === "ok" && parcels.fetch.response.provider) {
    sourceLines.push(
      `${parcels.fetch.response.provider}${
        parcels.fetch.response.notSurveyGrade ? " · not survey grade" : ""
      }`,
    );
  }
  // Contour source — only when the topo toggle is on and served. The label
  // FOLLOWS the served tier per viewport (1-ft in Bastrop, 3DEP elsewhere).
  const topoToggledOn = visibleLayers ? visibleLayers.has(TOPO_TOGGLE_KEY) : true;
  if (
    topoToggledOn &&
    topo.fetch.status === "ok" &&
    topo.data
  ) {
    const dz = topo.data.degraded ? " · degraded" : "";
    sourceLines.push(`${contourTierLabel(topo.data)}${dz}`);
  }
  // Hydrography source — only when the toggle is on and real streams are served
  // (source provenance). Honest-empty / unavailable carry no source line.
  const hydrographyToggledOn = visibleLayers
    ? visibleLayers.has(HYDROGRAPHY_TOGGLE_KEY)
    : true;
  if (
    hydrographyToggledOn &&
    hydrography.fetch.status === "ok" &&
    hydrography.data &&
    !hydrographyHonestReason(hydrography.fetch)
  ) {
    const dz = hydrography.data.degraded ? " · degraded" : "";
    sourceLines.push(
      `${hydrographyProvenanceLabel(hydrography.data)} — ${
        hydrography.data.featureCount ?? 0
      } streams${dz}`,
    );
  }
  // Opportunity Zone source — only when on and served (provenance).
  const opportunityZoneToggledOn = visibleLayers
    ? visibleLayers.has(OPPORTUNITY_ZONE_TOGGLE_KEY)
    : true;
  if (
    opportunityZoneToggledOn &&
    opportunityZone.fetch.status === "ok" &&
    opportunityZone.data &&
    !opportunityZoneHonestReason(opportunityZone.fetch)
  ) {
    sourceLines.push(
      `${opportunityZoneProvenanceLabel(opportunityZone.data)} — ${
        opportunityZone.data.featureCount ?? 0
      } tracts`,
    );
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
  // WB7c: pin-layer legend rides the layer row's tooltip (info tone = quiet,
  // tooltip-only — the panel stays clean; the honest legend stays discoverable).
  layerStates[SAVED_PINS_KEY] = { tone: "info", note: SAVED_PINS_LEGEND };
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
  if (hydrographyToggledOn) {
    if (hydrography.fetch.status === "error") {
      layerStates[HYDROGRAPHY_TOGGLE_KEY] = {
        tone: "warn",
        note: `Hydrography degraded — ${hydrography.fetch.message}`,
      };
    } else if (hydrography.fetch.status === "no-coverage") {
      layerStates[HYDROGRAPHY_TOGGLE_KEY] = {
        tone: "warn",
        note: hydrography.fetch.detail || "No county hydrography source here",
      };
    } else if (hydrography.fetch.status === "unavailable") {
      // Feature-detect: the engine hydrography slot is not deployed yet (or the
      // BFF route is absent on this deploy). Quiet info state, never an error.
      layerStates[HYDROGRAPHY_TOGGLE_KEY] = {
        tone: "info",
        note: hydrography.fetch.detail || "Hydrography not yet available",
      };
    } else if (hydrography.fetch.status === "ok" && hydrography.data) {
      const emptyReason = hydrographyHonestReason(hydrography.fetch);
      // Provenance rides the row tooltip: county source + vintage.
      layerStates[HYDROGRAPHY_TOGGLE_KEY] = emptyReason
        ? { tone: "info", note: `Hydrography — none: ${emptyReason}` }
        : {
            tone: hydrography.data.degraded ? "warn" : "ok",
            note: `${hydrographyProvenanceLabel(hydrography.data)} — ${
              hydrography.data.featureCount ?? 0
            } streams${hydrography.data.degraded ? " · degraded" : ""}`,
          };
    }
  }
  if (opportunityZoneToggledOn) {
    if (opportunityZone.fetch.status === "error") {
      layerStates[OPPORTUNITY_ZONE_TOGGLE_KEY] = {
        tone: "warn",
        note: `Opportunity Zone degraded — ${opportunityZone.fetch.message}`,
      };
    } else if (opportunityZone.fetch.status === "no-coverage") {
      layerStates[OPPORTUNITY_ZONE_TOGGLE_KEY] = {
        tone: "warn",
        note: opportunityZone.fetch.detail || "No Opportunity Zone coverage here",
      };
    } else if (opportunityZone.fetch.status === "ok" && opportunityZone.data) {
      const emptyReason = opportunityZoneHonestReason(opportunityZone.fetch);
      layerStates[OPPORTUNITY_ZONE_TOGGLE_KEY] = emptyReason
        ? { tone: "info", note: `Opportunity Zone — none: ${emptyReason}` }
        : {
            tone: "ok",
            note: `${opportunityZoneProvenanceLabel(opportunityZone.data)} — ${
              opportunityZone.data.featureCount ?? 0
            } tracts`,
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
    if (isMobile) openSheet("research");
  }, [cardNodeId, isMobile, openSheet]);

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
      openPaywall: (message: string, opts?: { proOnly?: boolean }) => {
        setPaywallMessage(message);
        setPaywallProOnly(opts?.proOnly === true);
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
      // FD2: the flood study's main-map overlay (water gradient / fallback
      // fills + flow arrows + catchment glow). Draw + clear delegate to the
      // one controller; property-switch auto-clear runs in the effect below.
      setFloodMapOverlay: (study, forParcelNodeId) => {
        floodOverlay.set(study, forParcelNodeId ?? null);
      },
    }),
    [runParcelLookup, floodOverlay],
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
    // FD2: same rule for the flood water overlay — never lingers over a
    // different property (the controller no-ops when nothing is drawn).
    floodOverlay.onActivePropertyChange(activeParcelNodeId);
  }, [activeParcelNodeId, floodOverlay]);

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
      const inspCard = inspectedRef.current?.card ?? null;
      const address = inspCard?.situsAddress ?? null;
      // WB6: seed the dossier (savedAt/address + current map drawings) —
      // savePropertyWithDossier merges into an existing dossier, never clobbers.
      const drawings = sanitizeDrawings(
        toolsControllerRef.current?.getDrawings() ?? null,
      );
      // WB7c: capture the pin coordinate at save time — the inspect card's
      // center when it carries one, else ONE pass through the #104
      // center-resolution chain; still unknown → honestly no pin.
      void (async () => {
        const pin = await resolvePinForSave(
          nodeId,
          inspCard?.lat ?? null,
          inspCard?.lng ?? null,
        );
        void savePropertyWithDossier(nodeId, {
          label: address,
          address,
          drawings: drawings ?? undefined,
          pin: pin ?? undefined,
        });
      })();
    }
    setOpenWorkbenchTool("properties");
  }, [cardNodeId, setOpenWorkbenchTool]);

  // R1: checkout handling moved INTO the unified unlock flow (UnlockFlow.tsx
  // useUnlockChoices actions) — the modal is self-contained; ExplorerMap only
  // owns open/close + the value line + the Pro-only variant flag.

  // SHARE FUNNEL: on mobile, open the research sheet when landing with share.
  useEffect(() => {
    if (share && isMobile) openSheet("research");
  }, [share, isMobile, openSheet]);

  // Two-products: PE is map + inspect card + exports only. County ledger /
  // node-graph balance sheet stays in Command Center (operator), never here.
  return (
    <div
      style={{ position: "absolute", inset: 0 }}
      data-mobile-research-open={
        isMobile && activeSheet === "research" ? "1" : undefined
      }
    >
      <FloatingMap
        ref={mapRef}
        floating={false}
        useFixture={false}
        // The required © OSM / © CARTO / Esri credits are folded into the
        // MapSourceInfo ⓘ "Sources" panel below, so MapLibre's own
        // AttributionControl is suppressed — otherwise TWO attribution UIs pile
        // into the same lower-right corner (a floating imagery strip overlapping
        // the ⓘ / layers bubbles). One attribution place, not two.
        suppressAttributionControl
        // Mount-time seed ONLY (stable identity). Subject changes re-point the
        // live handle via rebindProperty — the center prop never re-points.
        center={DEFAULT_CENTER}
        parcelTiles={PARCEL_TILES}
        overlays={mapOverlays}
        visibleLayers={rendererVisibleLayers}
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
          extraLabels={{ [SAVED_PINS_KEY]: SAVED_PINS_LAYER_LABEL }}
          onToolsController={handleToolsController}
          isMobile={isMobile}
          layersSheetOpen={isMobile && activeSheet === "layers"}
          // Aerial ON by default on landing — makes a better first impression
          // than the dark basemap (operator decision, 2026-08-03).
          defaultSatellite={true}
        />
      )}

      {/* WB7c: saved-property pins — ambient portfolio decoration on the LIVE
          map (small star markers from the server list; signed-out renders
          none). Clicking a pin reuses the SAME reopen flow as My Properties
          (runParcelLookup — find/fly+inspect; workbench re-scopes itself). */}
      <SavedPropertyPins
        mapRef={mapRef}
        visible={visibleLayers ? visibleLayers.has(SAVED_PINS_KEY) : false}
        onOpenProperty={(id) => void runParcelLookup(id)}
      />

      {/* Lower-left: the ONLY corner element now is the Smart Site brand chip.
          The transient scroll notifications were removed (redundant chrome —
          per-layer honest state lives in the toolset's layer rows / inspect
          card). */}
      <SmartSiteBadge isMobile={isMobile} />

      {/* Lower-right: the REQUIRED source/attribution AND the single attribution
          place for the map, collapsed by default into a circular ⓘ bubble next
          to the layers bubble (MapToolset). Clicking the ⓘ expands the live
          source lines PLUS the required basemap/imagery credit (© OSM / © CARTO,
          Esri) — MapLibre's own AttributionControl is suppressed on this mount
          path (suppressAttributionControl above) so there is one credit UI, not
          two overlapping in this corner. */}
      <MapSourceInfo lines={sourceLines} isMobile={isMobile} />

      {/* PE WORKBENCH (WB1): top-right bubble cluster + the ONE shared dock.
          One tool open at a time; per-property persistent state via the
          chassis store; the brief is the first live tool. The bottom-right
          MapToolset bubble is a SEPARATE cluster (map utilities) — untouched. */}
      <Workbench
        tools={workbenchTools}
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

      {unplaceable && !isMobile && (
        <UnplaceableParcelCard
          parcel={unplaceable}
          onClose={() => setUnplaceable(null)}
        />
      )}

      {unplaceable && isMobile && (
        <MobileSheet
          open={activeSheet === "property"}
          testId="mobile-property-sheet"
        >
          <UnplaceableParcelCard
            embedded
            parcel={unplaceable}
            onClose={() => {
              setUnplaceable(null);
              openSheet("map");
            }}
          />
        </MobileSheet>
      )}

      {card && !isMobile && (
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

      {card && isMobile && (
        <MobileSheet
          open={activeSheet === "property"}
          testId="mobile-property-sheet"
        >
          <InspectCard
            card={card}
            parcelNodeId={cardNodeId}
            isSubject={isSubject}
            onClose={() => {
              closeInspect();
              openSheet("map");
            }}
            onEnvelope={handleEnvelope}
            onMakeSubject={handleMakeSubject}
            onResearch={handleResearch}
            onSaveProperty={handleSaveProperty}
          />
        </MobileSheet>
      )}

      {/* R1: the unified two-choice unlock flow (replaces the Pro-hardcoded
          "R1–R10 … Pro entitlement" copy). Value line comes from the bubble
          that gated; prices come from the pricing config module. */}
      {paywallOpen && (
        <PaywallGate
          parcelNodeId={activeParcelNodeId}
          valueLine={
            paywallMessage ??
            "The full brief, AI chat, reports, and share links are the paid toolkit on this property — the inspect card and map stay free."
          }
          proOnly={paywallProOnly}
          statusNote={iccCitationStatus().live ? null : iccCitationStatus().message}
          onClose={() => setPaywallOpen(false)}
        />
      )}
    </div>
  );
}
