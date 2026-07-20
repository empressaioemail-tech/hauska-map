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
//     patched with setbacks/envelope when the envelope resolves.
//
// NO brief, NO AI on click. Anonymous — no auth needed to browse.
//
// SEAMS:
//   Track A (persistent-map rebind): the map mounts ONCE and is stable. When
//     the persistent-map API lands, rebind here. Fine as mount-once today.
//   Track B (baked-node reads): PMTiles + live-GIS is the "read live like the
//     extension does" path; rebind PARCEL_TILES / the read to the baked-node
//     tileset when it ships.

import { useCallback, useMemo, useRef, useState } from "react";
import { FloatingMap } from "@hauska/map-renderer";
import type {
  FloatingMapHandle,
  OverlaySpec,
  ParcelSelection,
  ViewportState,
} from "@hauska/map-renderer";
import "@hauska/map-renderer/styles.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { DEFAULT_CENTER, PARCEL_TILES } from "../lib/config";
import { cortexClient } from "../lib/cortexClient";
import { parcelNodes } from "../lib/parcel-node-store.js";
import { InspectCard } from "./InspectCard";
import {
  MIN_PARCEL_ZOOM,
  LIVE_PARCELS_KEY,
  layersForZoom,
  fetchGisLayer,
  toLiveOverlays,
  selectionToCard,
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
  const abortRef = useRef<AbortController | null>(null);

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

  // Parcel click -> inspect-in-place. Fold the clicked parcel into the ported
  // node store as `inspected`, then draw the InspectCard.
  const handleParcelSelect = useCallback((sel: ParcelSelection) => {
    if (sel.layerKey === LIVE_PARCELS_KEY) {
      const next = selectionToCard(sel);
      setCard(next);
      parcelNodes.setInspected(
        {
          id: next.apn ?? (next.lat != null ? `coord:${next.lat}:${next.lng}` : null),
          source: "map-click",
          centroid: next.lat != null && next.lng != null ? { lat: next.lat, lng: next.lng } : null,
          address: next.situsAddress,
          attrs: { apn: next.apn, owner: next.owner, county: next.county },
        },
        "inspect-parcel",
      );
      return;
    }
    // A PMTiles baked-parcel click (no live-GIS properties) — recenter/inspect
    // with what the tile carries.
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
    setCard(bareCard);
    parcelNodes.setInspected(
      {
        id: sel.apn ?? `coord:${sel.lat}:${sel.lng}`,
        source: "map-click",
        centroid: { lat: sel.lat, lng: sel.lng },
        address: sel.address ?? null,
      },
      "inspect-parcel",
    );
  }, []);

  // When the envelope resolves, patch setbacks/envelope onto the inspected node
  // (the store is the subject/inspected source of truth — the ask/report path
  // will read it via getSubjectAreaContext when auth lands).
  const handleEnvelope = useCallback((result: any) => {
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

  const mapOverlays = useMemo<OverlaySpec[]>(
    () =>
      toLiveOverlays(
        parcels.data ? { status: "ok", response: parcels.data } : parcels.fetch,
        fema.data ? { status: "ok", response: fema.data } : fema.fetch,
      ),
    [parcels, fema],
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

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex" }}>
      <FloatingMap
        ref={mapRef}
        floating={false}
        useFixture={false}
        center={DEFAULT_CENTER}
        parcelTiles={PARCEL_TILES}
        overlays={mapOverlays}
        onParcelSelect={handleParcelSelect}
        onViewportChange={handleViewportChange}
        style={{ flex: 1, minHeight: 0 }}
      />

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
      </div>

      {card && (
        <InspectCard
          card={card}
          onClose={() => {
            setCard(null);
            parcelNodes.setInspected(null, "close-inspect");
          }}
          onEnvelope={handleEnvelope}
          // STUB seam (Track D / AI): ask/report path is behind auth.
          onResearch={() => {
            // TODO(Track D + AI): open the authed ask/report flow. No-op today.
            // eslint-disable-next-line no-console
            console.info("[explorer] Research this — stubbed (auth + ask/report track)");
          }}
        />
      )}
    </div>
  );
}
