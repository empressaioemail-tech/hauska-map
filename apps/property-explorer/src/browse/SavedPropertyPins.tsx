// Saved-property PIN LAYER (Workbench WB7c) — ambient portfolio visibility on
// the browse map. Renders one small star marker per saved property that
// carries a save-time pin coordinate; clicking a pin reopens that property via
// the SAME flow as the My Properties list (host.openProperty → the #104
// find/fly+inspect flight). Map DECORATION only — no panel, no second surface.
//
// Data path: listSavedProperties() on mount + on every change notification
// (the one save flow notifies after any mutation). Signed-out or any error →
// zero pins, zero errors. The server stays the only source of truth; this
// component holds only the transient fetched pin list.
//
// Rendering: maplibre DOM Markers on the LIVE map (mapRef.getMap()) — the same
// live-handle seam the toolset uses. Never remounts FloatingMap; markers are
// added/removed in place when the list, visibility toggle, or map changes.

import { useEffect, useRef, useState, type RefObject } from "react";
import { Marker } from "maplibre-gl";
import type { Map as MaplibreMap } from "maplibre-gl";
import type { FloatingMapHandle } from "@hauska/map-renderer";
import {
  listSavedProperties,
  subscribeSavedPropertiesChanged,
} from "../lib/savedPropertiesClient";
import {
  pinsFromListOutcome,
  savedPinElement,
  type SavedPin,
} from "../lib/saved-pins";

export function SavedPropertyPins({
  mapRef,
  visible,
  onOpenProperty,
}: {
  mapRef: RefObject<FloatingMapHandle | null>;
  /** The LAYERS-panel "My properties" toggle state. */
  visible: boolean;
  /** Reopen seam — the host's openProperty (never a duplicated flow). */
  onOpenProperty: (parcelNodeId: string) => void;
}) {
  const [map, setMap] = useState<MaplibreMap | null>(null);
  const [pins, setPins] = useState<SavedPin[]>([]);
  // Latest handler via ref so marker rebuilds don't churn on callback identity.
  const onOpenRef = useRef(onOpenProperty);
  onOpenRef.current = onOpenProperty;

  // Resolve the live maplibre map from the renderer handle (FloatingMap mounts
  // asynchronously — poll briefly, same pattern as the map toolset).
  useEffect(() => {
    let raf = 0;
    let tries = 0;
    const tick = () => {
      const m = mapRef.current?.getMap?.() as MaplibreMap | null;
      if (m && typeof m.getContainer === "function") {
        setMap(m);
        return;
      }
      if (tries++ < 120) raf = window.requestAnimationFrame(tick);
    };
    tick();
    return () => window.cancelAnimationFrame(raf);
  }, [mapRef]);

  // Fetch the saved list on mount + refetch on every mutation notification
  // (save/remove/status change from ANY entry point — one flow, one seam).
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const outcome = await listSavedProperties();
      if (!cancelled) setPins(pinsFromListOutcome(outcome));
    };
    void refresh();
    const unsubscribe = subscribeSavedPropertiesChanged(() => {
      if (!cancelled) void refresh();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Draw the markers on the LIVE map; torn down when the pin list, toggle, or
  // map changes. Anchor center + 18px hit target — restrained, never blocking
  // parcel clicks around it (the marker element captures only its own clicks).
  useEffect(() => {
    if (!map || !visible || pins.length === 0) return;
    const markers = pins.map((pin) =>
      new Marker({
        element: savedPinElement(pin, (id) => onOpenRef.current(id)) as unknown as HTMLElement,
        anchor: "center",
      })
        .setLngLat([pin.lng, pin.lat])
        .addTo(map),
    );
    return () => {
      for (const m of markers) m.remove();
    };
  }, [map, visible, pins]);

  return null;
}
