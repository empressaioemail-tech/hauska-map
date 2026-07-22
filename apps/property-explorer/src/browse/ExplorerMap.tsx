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
import { postDeepResearch } from "../lib/auth";
import { cortexClient } from "../lib/cortexClient";
import { parcelNodes } from "../lib/parcel-node-store.js";
import { startPeCheckout } from "../lib/billingClient";
import { recordPeGtmEvent, type Persona } from "../lib/gtmClient";
import { iccCitationStatus } from "../lib/iccCitation";
import { InspectCard } from "./InspectCard";
import { LayersControl } from "./LayersControl";
import { MapTools } from "./MapTools";
import { PaywallGate } from "./PaywallGate";
import {
  normalizeEnvelope,
  envelopeInsetOverlay,
  setbackConsumedOverlay,
  insetParcelBySetbacks,
} from "./envelope-overlay";
import {
  MIN_PARCEL_ZOOM,
  LIVE_PARCELS_KEY,
  layersForZoom,
  fetchGisLayer,
  toLiveOverlays,
  selectionToCard,
  parcelNodeIdFromSelection,
  type GisLayerResponse,
  type LiveLayerKey,
  type LiveLayerState,
  type ParcelCardData,
} from "./liveGis";

interface LayerSlot {
  fetch: LiveLayerState;
  data: GisLayerResponse | null;
}
const IDLE: LayerSlot = { fetch: { status: "idle" }, data: null };

/** Consumer-honest layer filter — no AVM/valuation layers on browse (WDLL 27). */
const CONSUMER_EXCLUDED_LAYERS = new Set<LayerKey>(["rent-heat"]);

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

const chipStyle = (sev: "info" | "warn" | "error"): React.CSSProperties => ({
  fontSize: 10.5,
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  fontWeight: 600,
  padding: "3px 9px",
  borderRadius: 5,
  pointerEvents: "none",
  whiteSpace: "nowrap",
  color: sev === "error" ? "#fca5a5" : sev === "warn" ? "#fcd34d" : "#9aa6b2",
  background: "rgba(13,17,23,0.82)",
  border: `0.5px solid ${
    sev === "error"
      ? "rgba(248,113,113,0.55)"
      : sev === "warn"
        ? "rgba(252,211,77,0.5)"
        : "rgba(154,166,178,0.35)"
  }`,
});

export function ExplorerMap() {
  const mapRef = useRef<FloatingMapHandle>(null);
  const [parcels, setParcels] = useState<LayerSlot>(IDLE);
  const [fema, setFema] = useState<LayerSlot>(IDLE);
  const [zoom, setZoom] = useState<number | null>(null);
  const [card, setCard] = useState<ParcelCardData | null>(null);
  // The clicked parcel's stable baked-node id, kept alongside `card` so the
  // InspectCard can read its baked facet snapshot (the preferred pure-read
  // source). Null for a live-GIS-only selection with no baked id.
  const [cardNodeId, setCardNodeId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // The buildable-envelope wedge visual, drawn through the SUPPORTED overlays
  // path (OverlaySpec + reconcileOverlays) on the LIVE map — never a remount.
  // Holds 0..2 specs: the amber inset fill+dashed-edge (status "ok"), or a
  // dashed full-parcel outline for the honest 0%/"entirely setback" case.
  const [envelopeOverlays, setEnvelopeOverlays] = useState<OverlaySpec[]>([]);
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
  const [researchNotice, setResearchNotice] = useState<string | null>(null);
  const [persona, setPersona] = useState<Persona>("homeowner");
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutNote, setCheckoutNote] = useState<string | null>(null);

  // Extension #34 handoff: ?parcelNodeId=48453:907247 (WDLL 30)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const handoff =
      params.get("parcelNodeId")?.trim() || params.get("parcel")?.trim();
    if (!handoff) return;
    void recordPeGtmEvent({
      eventType: "pe_browse_started",
      payload: { extensionHandoff: handoff },
    });
  }, []);
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

  // Viewport loader — bbox-scoped live-GIS fetch on load + debounced move/zoom.
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
    setCard(null);
    setCardNodeId(null);
    parcelNodes.setInspected(null, "close-inspect");
  }, []);

  const mapOverlays = useMemo<OverlaySpec[]>(
    () => [
      ...toLiveOverlays(
        parcels.data ? { status: "ok", response: parcels.data } : parcels.fetch,
        fema.data ? { status: "ok", response: fema.data } : fema.fetch,
      ),
      // The buildable-envelope wedge, drawn last so it sits above the parcels.
      ...envelopeOverlays,
    ],
    [parcels, fema, envelopeOverlays],
  );

  const chips: Array<{ key: string; sev: "info" | "warn" | "error"; text: string }> = [];
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
  const attribution =
    parcels.fetch.status === "ok" && parcels.fetch.response.provider
      ? `${parcels.fetch.response.provider}${
          parcels.fetch.response.notSurveyGrade ? " · not survey grade" : ""
        }`
      : null;

  const isSubject =
    !!card &&
    inspectedRef.current?.parcelNodeId != null &&
    inspectedRef.current.parcelNodeId === subjectNodeIdRef.current;

  const handleResearch = useCallback(async () => {
    const nodeId = cardNodeId ?? inspectedRef.current?.parcelNodeId ?? null;
    void recordPeGtmEvent({
      eventType: "pe_research_clicked",
      persona,
      parcelNodeId: nodeId,
    });

    if (!nodeId) {
      setResearchNotice("Select a parcel with a baked node id to research.");
      return;
    }

    setResearchNotice("Checking access…");
    try {
      const res = await postDeepResearch(
        "api/property-explorer/v1/research/brief",
        { parcelNodeId: nodeId },
      );
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (res.status === 401) {
        setResearchNotice("Sign in to unlock deep research on this parcel.");
        return;
      }
      if (res.status === 402) {
        void recordPeGtmEvent({
          eventType: "pe_paywall_hit",
          persona,
          parcelNodeId: nodeId,
        });
        setResearchNotice(null);
        setCheckoutNote(null);
        setPaywallOpen(true);
        return;
      }
      if (res.status === 503 && body.error === "report_not_ready") {
        setResearchNotice(
          "Property brief path is wired; spine report_run integration pending.",
        );
        return;
      }
      setResearchNotice(body.message ?? `Research request returned ${res.status}.`);
    } catch {
      setResearchNotice("Could not reach the research service.");
    }
  }, [cardNodeId, persona]);

  const handleSaveProperty = useCallback(() => {
    const nodeId = cardNodeId ?? inspectedRef.current?.parcelNodeId ?? null;
    void recordPeGtmEvent({
      eventType: "pe_save_property",
      persona,
      parcelNodeId: nodeId,
    });
  }, [cardNodeId, persona]);

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

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex" }}>
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
        style={{ flex: 1, minHeight: 0 }}
      />

      {/* Layer toggles driven through the substrate (getVisibleLayers seed +
          visibleLayers prop). No local shadow paint state. */}
      {visibleLayers && knownLayers && (
        <LayersControl
          known={knownLayers}
          visible={visibleLayers}
          onChange={(next) => setVisibleLayers(new Set(next))}
        />
      )}

      {/* Satellite base toggle + measure/draw/marker/GPS tools. Operates on the
          LIVE persistent map via the shared handle — never remounts the map. */}
      <MapTools mapRef={mapRef} />

      {/* Honest live-layer state chips. */}
      <div
        data-testid="live-chips"
        style={{
          position: "absolute",
          left: 12,
          bottom: 12,
          zIndex: 8,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 5,
        }}
      >
        {chips.map((c) => (
          <span key={c.key} style={chipStyle(c.sev)}>
            {c.text}
          </span>
        ))}
        {attribution && <span style={chipStyle("info")}>{attribution}</span>}
        {researchNotice && (
          <span data-testid="research-notice" style={chipStyle("info")}>
            {researchNotice}
          </span>
        )}
      </div>

      {card && (
        <InspectCard
          card={card}
          parcelNodeId={cardNodeId}
          isSubject={isSubject}
          onClose={closeInspect}
          onEnvelope={handleEnvelope}
          onMakeSubject={handleMakeSubject}
          onResearch={() => void handleResearch()}
          onSaveProperty={handleSaveProperty}
          persona={persona}
          onPersonaChange={setPersona}
        />
      )}

      {paywallOpen && (
        <PaywallGate
          message={`Deep research and cited property reports (R1–R10) require sign-in and Pro entitlement. Checkout runs in test or live mode depending on cortex Stripe config — browse stays free. ${iccCitationStatus().live ? "" : iccCitationStatus().message}`}
          checkoutNote={checkoutNote}
          onUpgrade={() => void handleUpgrade()}
          onClose={() => setPaywallOpen(false)}
          busy={checkoutBusy}
        />
      )}
    </div>
  );
}
