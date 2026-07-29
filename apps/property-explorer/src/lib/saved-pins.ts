// Saved-property map PINS (Workbench WB7c+d) — the pure logic behind the
// ambient portfolio layer: which pins exist, what they look like, and how a
// save resolves its pin coordinate.
//
// DATA PATH (server is the truth, same as every saved-properties surface):
//   listSavedProperties() → rows → snapshot.pin (captured at save time) →
//   pinsFromListOutcome(). Signed-out ('sign-in') and every error outcome
//   yield ZERO pins — the layer degrades silently, never an error surface.
//
// THE DESIGN LAW: pins are map DECORATION (small anchored markers), not a
// panel. Clicking a pin reuses host.openProperty (the #104 reopen flight) —
// no second surface, no duplicated flow.

import { resolveParcelLookup, type LookupResult } from "./parcel-lookup";
import {
  sanitizePin,
  savedRowDisplayLabel,
  type DossierPin,
  type DossierStatus,
} from "./propertyDossier";
import type {
  SavedPropertiesListOutcome,
  SavedPropertyRow,
} from "./savedPropertiesClient";

/** The LAYERS-panel row key for the pin layer. PE-side only: it is stripped
 *  before the visible-layer set reaches the renderer (no registry entry). */
export const SAVED_PINS_LAYER_KEY = "saved-properties";

/** Layer-row label (the shared toolset renders registry labels; this key is
 *  not in the registry, so PE passes it via `extraLabels`). */
export const SAVED_PINS_LAYER_LABEL = "My properties";

// ---------------------------------------------------------------------------
// Status accents — one source of truth for pin fill, status chips, and the
// legend line. PE dark-theme language (same hexes as the toolset badges).
// ---------------------------------------------------------------------------

export const PIN_STATUS_ACCENTS: Record<DossierStatus | "unset", string> = {
  researching: "#fcd34d", // amber
  offer: "#4ade80", // green
  passed: "#9aa6b2", // muted gray
  unset: "#7dd3fc", // PE accent blue (default)
};

export function pinAccent(status: DossierStatus | null): string {
  return PIN_STATUS_ACCENTS[status ?? "unset"];
}

/** Legend line — surfaced as the layer row's tooltip (LayerStateBadge note). */
export const SAVED_PINS_LEGEND =
  "Saved-property pins — amber: researching · green: offer · gray: passed · blue: no status";

// ---------------------------------------------------------------------------
// Pins from the saved list.
// ---------------------------------------------------------------------------

export interface SavedPin {
  parcelNodeId: string;
  lat: number;
  lng: number;
  status: DossierStatus | null;
  /** Display label (label → dossier address → parcel id) for the tooltip. */
  title: string;
}

/** Rows WITH a save-time pin become pins; rows without stay honestly unpinned. */
export function pinsFromRows(rows: SavedPropertyRow[]): SavedPin[] {
  const pins: SavedPin[] = [];
  for (const row of rows) {
    const pin = row.snapshot?.pin ?? null;
    if (!pin) continue;
    pins.push({
      parcelNodeId: row.parcelNodeId,
      lat: pin.lat,
      lng: pin.lng,
      status: row.snapshot?.status ?? null,
      title: savedRowDisplayLabel(row),
    });
  }
  return pins;
}

/** Signed-out / error / unreachable → NO pins (auth-gated list, no errors). */
export function pinsFromListOutcome(
  outcome: SavedPropertiesListOutcome,
): SavedPin[] {
  return outcome.kind === "ready" ? pinsFromRows(outcome.items) : [];
}

// ---------------------------------------------------------------------------
// The marker element — a small star, restrained size, anchored center so it
// never obscures parcel interaction around it. DOM-injectable for tests.
// ---------------------------------------------------------------------------

/** Star glyph markup — accent fill + dark outline for both base styles. */
export function pinSvgMarkup(accent: string): string {
  return (
    `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">` +
    `<path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.3l6.5-.9L12 2.5z" ` +
    `fill="${accent}" stroke="rgba(13,17,23,0.9)" stroke-width="1.5" stroke-linejoin="round"/>` +
    `</svg>`
  );
}

/** Minimal structural typing so tests can inject a fake document (node env). */
export interface PinElementLike {
  innerHTML: string;
  title: string;
  style: Record<string, string>;
  setAttribute(name: string, value: string): void;
  addEventListener(
    type: string,
    listener: (ev: { stopPropagation(): void }) => void,
  ): void;
}

export interface PinDocumentLike {
  createElement(tag: string): PinElementLike;
}

/**
 * Build the marker DOM element for one pin. Click opens the saved property
 * via the host's reopen flow (stopPropagation so the underlying parcel fill
 * never also fires an inspect).
 */
export function savedPinElement(
  pin: SavedPin,
  onOpen: (parcelNodeId: string) => void,
  doc: PinDocumentLike = document as unknown as PinDocumentLike,
): PinElementLike {
  const el = doc.createElement("button");
  el.innerHTML = pinSvgMarkup(pinAccent(pin.status));
  el.title = `${pin.title} — open saved property`;
  el.setAttribute("type", "button");
  el.setAttribute("aria-label", `Open saved property ${pin.title}`);
  el.setAttribute("data-testid", "saved-property-pin");
  el.setAttribute("data-parcel-node-id", pin.parcelNodeId);
  el.style.display = "flex";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";
  el.style.width = "18px";
  el.style.height = "18px";
  el.style.padding = "0";
  el.style.background = "transparent";
  el.style.border = "none";
  el.style.cursor = "pointer";
  el.style.filter = "drop-shadow(0 1px 2px rgba(0,0,0,0.6))";
  el.addEventListener("click", (ev) => {
    ev.stopPropagation();
    onOpen(pin.parcelNodeId);
  });
  return el;
}

// ---------------------------------------------------------------------------
// Save-time pin resolution — the coordinate the save flow already touches
// (inspect card / facets center), else ONE pass through the #104
// center-resolution chain (resolveParcelLookup). Still unknown → null,
// honestly no pin.
// ---------------------------------------------------------------------------

export async function resolvePinForSave(
  parcelNodeId: string,
  lat: number | null | undefined,
  lng: number | null | undefined,
  resolveImpl: (query: string) => Promise<LookupResult> = resolveParcelLookup,
): Promise<DossierPin | null> {
  const direct = sanitizePin({ lat, lng });
  if (direct) return direct;
  try {
    const result = await resolveImpl(parcelNodeId);
    if (result.ok) {
      return sanitizePin({
        lat: result.target.card.lat,
        lng: result.target.card.lng,
      });
    }
  } catch {
    /* honest absence — a save never fails because the pin could not resolve */
  }
  return null;
}
