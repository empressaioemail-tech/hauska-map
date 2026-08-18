// Mobile panel orchestration — single primary sheet at a time on phone widths.
//
// Pattern: fixed bottom nav (Map | Property | Research | Layers) switches the
// active sheet. Search suggestions occupy their own overlay band below the
// Find bar (does not stack with other panels). Desktop consumers ignore this
// context (isMobile=false → sheets inert, children render as today).
//
// W4 (2026-08-18). Operator, verbatim: "In the mobile version when i pull up
// the menus and make a selection the menu needs to collapse." The root cause
// was in the API, not in any call site: this context exposed `openSheet` and
// NO close primitive at all, and exactly one place in the app (the inspect
// card's own Close button) got back to the map by calling openSheet("map").
// A sheet therefore could not dismiss itself because the vocabulary could not
// express it. Added here: `closeSheet`, `toggleSheet`, and an auto-collapse
// that fires when a selection inside a sheet did NOT navigate somewhere else.
//
// THE NAVIGATION GUARD, and why it is not optional: several in-sheet controls
// already move to another sheet (Research opens the research sheet). A naive
// "any button closes the sheet" would run AFTER that handler and undo it. So
// the dismissal is deferred one tick and applied with a functional state
// update that only collapses if the active sheet is still the one that was
// open when the click happened. A handler that navigated always wins.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import {
  PE_MOBILE_NAV_HEIGHT_PX,
  MAP_PANEL_Z,
  resolveMobileSheetConflict,
  shouldDismissSheetOnClick,
  type MobileSheetId,
  type SheetClickNode,
} from "./mobile-layout";
import {
  MAP_PANEL_DISMISS_EVENT,
  type MapPanelDismissDetail,
} from "../../../../packages/map-renderer/src/chrome/panelLayering";

export interface MobilePanelContextValue {
  isMobile: boolean;
  activeSheet: MobileSheetId;
  searchFocused: boolean;
  openSheet: (id: MobileSheetId) => void;
  /** Collapse whatever sheet is open, back to the bare map. */
  closeSheet: () => void;
  /** Open `id`, or collapse it when it is already the open sheet. */
  toggleSheet: (id: MobileSheetId) => void;
  /**
   * Collapse the sheet that was open when a selection was made — but ONLY if
   * nothing else has since navigated. Deferred a tick so in-sheet handlers
   * that open another sheet keep their result.
   */
  dismissSheetIfUnchanged: (from: MobileSheetId) => void;
  setSearchFocused: (focused: boolean) => void;
}

const MobilePanelContext = createContext<MobilePanelContextValue | null>(null);

export function useMobilePanel(): MobilePanelContextValue {
  const ctx = useContext(MobilePanelContext);
  if (!ctx) {
    return {
      isMobile: false,
      activeSheet: "map",
      searchFocused: false,
      openSheet: () => {},
      closeSheet: () => {},
      toggleSheet: () => {},
      dismissSheetIfUnchanged: () => {},
      setSearchFocused: () => {},
    };
  }
  return ctx;
}

const NAV_ITEMS: { id: MobileSheetId; label: string; testId: string }[] = [
  { id: "map", label: "Map", testId: "mobile-nav-map" },
  { id: "property", label: "Property", testId: "mobile-nav-property" },
  { id: "research", label: "Research", testId: "mobile-nav-research" },
  { id: "layers", label: "Layers", testId: "mobile-nav-layers" },
];

function MobileBottomNav({
  active,
  onSelect,
}: {
  active: MobileSheetId;
  onSelect: (id: MobileSheetId) => void;
}) {
  return (
    <nav
      data-testid="mobile-bottom-nav"
      aria-label="Map panels"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        height: PE_MOBILE_NAV_HEIGHT_PX,
        zIndex: MAP_PANEL_Z.nav,
        display: "flex",
        borderTop: "1px solid rgba(154,166,178,0.35)",
        background: "rgba(13,17,23,0.96)",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {NAV_ITEMS.map((item) => {
        const selected = active === item.id;
        return (
          <button
            key={item.id}
            type="button"
            data-testid={item.testId}
            aria-current={selected ? "page" : undefined}
            onClick={() => onSelect(item.id)}
            style={{
              flex: 1,
              border: "none",
              background: "transparent",
              color: selected ? "var(--brand-blue, #3B82F6)" : "var(--surface-muted, #94A3B8)",
              fontSize: 11,
              fontWeight: selected ? 700 : 600,
              cursor: "pointer",
              padding: "6px 4px",
            }}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

/**
 * Walk from the clicked node up to the sheet root, describing each element for
 * the pure rule in mobile-layout.ts. The DOM lives here; the DECISION does not.
 */
function sheetClickChain(
  target: EventTarget | null,
  root: HTMLElement,
): SheetClickNode[] {
  const chain: SheetClickNode[] = [];
  let node = target as HTMLElement | null;
  let guard = 0;
  while (node && guard < 40) {
    guard += 1;
    if (typeof node.getAttribute !== "function") break;
    chain.push({
      tag: node.tagName ? node.tagName.toLowerCase() : "",
      dismiss: node.hasAttribute("data-sheet-dismiss"),
      keepOpen: node.hasAttribute("data-sheet-keep-open"),
      stateful:
        node.hasAttribute("aria-expanded") || node.hasAttribute("aria-pressed"),
    });
    if (node === root) break;
    node = node.parentElement;
  }
  return chain;
}

/** Backdrop + scroll region for sheet content (property / layers). */
export function MobileSheet({
  open,
  testId,
  children,
  /**
   * Collapse the sheet when a selection is made inside it. Default ON — this
   * is the operator-reported behaviour. Controls that must NOT collapse it
   * mark themselves `data-sheet-keep-open`; controls that always should mark
   * themselves `data-sheet-dismiss`. Form controls and anything carrying
   * aria-expanded / aria-pressed are already exempt.
   */
  dismissOnSelect = true,
}: {
  open: boolean;
  testId: string;
  children: ReactNode;
  dismissOnSelect?: boolean;
}) {
  const { isMobile, activeSheet, dismissSheetIfUnchanged } = useMobilePanel();
  if (!open) return null;
  const onClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!dismissOnSelect || !isMobile) return;
    const chain = sheetClickChain(event.target, event.currentTarget);
    if (!shouldDismissSheetOnClick(chain)) return;
    dismissSheetIfUnchanged(activeSheet);
  };
  return (
    <div
      data-testid={testId}
      onClick={onClick}
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: PE_MOBILE_NAV_HEIGHT_PX,
        zIndex: MAP_PANEL_Z.sheet,
        maxHeight: `calc(100vh - ${PE_MOBILE_NAV_HEIGHT_PX}px - 56px)`,
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        background: "rgba(13,17,23,0.98)",
        borderTop: "1px solid rgba(154,166,178,0.28)",
        boxShadow: "0 -10px 36px rgba(0,0,0,0.45)",
      }}
    >
      {children}
    </div>
  );
}

export function MobilePanelProvider({
  isMobile,
  children,
  /** Test seam — force initial sheet without nav clicks. */
  initialSheet = "map",
}: {
  isMobile: boolean;
  children: ReactNode;
  initialSheet?: MobileSheetId;
}) {
  const [activeSheet, setActiveSheet] = useState<MobileSheetId>(initialSheet);
  const [searchFocused, setSearchFocusedState] = useState(false);

  const openSheet = useCallback(
    (id: MobileSheetId) => {
      if (!isMobile) return;
      setActiveSheet((cur) => resolveMobileSheetConflict(cur, id));
      if (id !== "map") setSearchFocusedState(false);
    },
    [isMobile],
  );

  const closeSheet = useCallback(() => {
    if (!isMobile) return;
    setActiveSheet("map");
  }, [isMobile]);

  const toggleSheet = useCallback(
    (id: MobileSheetId) => {
      if (!isMobile) return;
      setActiveSheet((cur) =>
        cur === id ? "map" : resolveMobileSheetConflict(cur, id),
      );
      if (id !== "map") setSearchFocusedState(false);
    },
    [isMobile],
  );

  const dismissSheetIfUnchanged = useCallback(
    (from: MobileSheetId) => {
      if (!isMobile) return;
      // One tick later, and only if nothing navigated in the meantime. The
      // functional update reads the CURRENT sheet, so there is no stale
      // closure to get this wrong.
      setTimeout(() => {
        setActiveSheet((cur) => (cur === from ? "map" : cur));
      }, 0);
    },
    [isMobile],
  );

  const setSearchFocused = useCallback(
    (focused: boolean) => {
      if (!isMobile) return;
      setSearchFocusedState(focused);
      if (focused) setActiveSheet("map");
    },
    [isMobile],
  );

  // The map chrome lives in the shared renderer package and cannot import this
  // context, so it asks for a dismissal over a window event instead. Activating
  // a map tool from the layers sheet fires this — you cannot draw on a map that
  // a sheet is covering. Inert on desktop and in Command Center.
  useEffect(() => {
    if (!isMobile || typeof window === "undefined") return;
    const onDismiss = (event: Event) => {
      const detail = (event as CustomEvent<MapPanelDismissDetail>).detail;
      // Layer checkboxes deliberately do NOT dispatch this — you could never
      // turn two layers on. Only tool activation and an explicit hide do.
      if (detail && detail.reason === "layer-toggled") return;
      setActiveSheet("map");
    };
    window.addEventListener(MAP_PANEL_DISMISS_EVENT, onDismiss);
    return () => window.removeEventListener(MAP_PANEL_DISMISS_EVENT, onDismiss);
  }, [isMobile]);

  const value = useMemo<MobilePanelContextValue>(
    () => ({
      isMobile,
      activeSheet: isMobile ? activeSheet : "map",
      searchFocused: isMobile && searchFocused,
      openSheet,
      closeSheet,
      toggleSheet,
      dismissSheetIfUnchanged,
      setSearchFocused,
    }),
    [
      isMobile,
      activeSheet,
      searchFocused,
      openSheet,
      closeSheet,
      toggleSheet,
      dismissSheetIfUnchanged,
      setSearchFocused,
    ],
  );

  return (
    <MobilePanelContext.Provider value={value}>
      <div
        data-pe-mobile={isMobile ? "1" : undefined}
        style={
          isMobile
            ? ({
                "--pe-mobile-nav-height": `${PE_MOBILE_NAV_HEIGHT_PX}px`,
              } as React.CSSProperties)
            : undefined
        }
      >
        {children}
        {isMobile && (
          <MobileBottomNav
            active={activeSheet}
            // Tapping the tab you are already on collapses its sheet — the
            // second way out, next to any in-sheet selection.
            onSelect={(id) => toggleSheet(id)}
          />
        )}
      </div>
    </MobilePanelContext.Provider>
  );
}
