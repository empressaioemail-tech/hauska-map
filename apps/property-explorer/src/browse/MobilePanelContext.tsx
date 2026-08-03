// Mobile panel orchestration — single primary sheet at a time on phone widths.
//
// Pattern: fixed bottom nav (Map | Property | Research | Layers) switches the
// active sheet. Search suggestions occupy their own overlay band below the
// Find bar (does not stack with other panels). Desktop consumers ignore this
// context (isMobile=false → sheets inert, children render as today).

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  PE_MOBILE_NAV_HEIGHT_PX,
  resolveMobileSheetConflict,
  type MobileSheetId,
} from "./mobile-layout";

export interface MobilePanelContextValue {
  isMobile: boolean;
  activeSheet: MobileSheetId;
  searchFocused: boolean;
  openSheet: (id: MobileSheetId) => void;
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
        zIndex: 20,
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

/** Backdrop + scroll region for sheet content (property / layers). */
export function MobileSheet({
  open,
  testId,
  children,
}: {
  open: boolean;
  testId: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      data-testid={testId}
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: PE_MOBILE_NAV_HEIGHT_PX,
        zIndex: 13,
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

  const setSearchFocused = useCallback(
    (focused: boolean) => {
      if (!isMobile) return;
      setSearchFocusedState(focused);
      if (focused) setActiveSheet("map");
    },
    [isMobile],
  );

  const value = useMemo<MobilePanelContextValue>(
    () => ({
      isMobile,
      activeSheet: isMobile ? activeSheet : "map",
      searchFocused: isMobile && searchFocused,
      openSheet,
      setSearchFocused,
    }),
    [isMobile, activeSheet, searchFocused, openSheet, setSearchFocused],
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
            onSelect={(id) => openSheet(id)}
          />
        )}
      </div>
    </MobilePanelContext.Provider>
  );
}
