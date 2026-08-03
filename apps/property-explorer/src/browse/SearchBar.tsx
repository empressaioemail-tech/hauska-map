// apps/property-explorer/src/browse/SearchBar.tsx
//
// The Find bar, rebuilt as world-class TYPE-AHEAD map search. A thin React
// renderer over the pure suggest state machine (src/lib/search-suggest.ts):
// debounced grouped suggestions (parcel / address / street / place) with
// viewport bias, keyboard + mouse navigation, matched-substring highlighting,
// loading shimmer, honest empty + geocoder-down states, and localStorage
// recents. The faint helper line under the old bar is REMOVED.
//
// Landing is kind-aware and owned by the parent (ExplorerMap) via onSelect —
// this component never decides what a selection does to the map.

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  createSuggestController,
  type SuggestSnapshot,
} from "../lib/search-suggest";
import {
  fetchGeocodeSuggestions,
  type GeocodeBias,
} from "../lib/geocodeClient";
import {
  highlightRanges,
  KIND_LABELS,
  type Suggestion,
  type SuggestionKind,
} from "../lib/search-kinds";
import {
  clearRecents as clearStoredRecents,
  loadRecents,
  saveRecents,
} from "../lib/search-recents";
import { searchBarWrapStyle, searchDropdownStyle } from "./mobile-layout";
import { useMobilePanel } from "./MobilePanelContext";
import { Button } from "../components/Button";

export interface SearchBarProps {
  busy?: boolean;
  error?: string | null;
  /** A suggestion was chosen (keyboard Enter or click). */
  onSelect: (suggestion: Suggestion) => void;
  /** Enter with no highlighted row — today's raw submit (id or address). */
  onSubmitRaw: (query: string) => void;
  /** Current map center/zoom for geocoder viewport bias. */
  getBias: () => GeocodeBias | null;
  initialValue?: string;
  /** Test seam — replaces the BFF-backed suggestion fetcher. */
  fetchSuggestionsImpl?: (
    query: string,
    signal: AbortSignal,
  ) => Promise<Suggestion[]>;
}

const FONT = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

const form: CSSProperties = {
  display: "flex",
  gap: 6,
  padding: 6,
  borderRadius: 8,
  background: "rgba(13,17,23,0.92)",
  border: "1px solid rgba(154,166,178,0.4)",
  boxShadow: "0 4px 18px rgba(0,0,0,0.35)",
};

const input: CSSProperties = {
  flex: 1,
  minWidth: 0,
  border: "none",
  outline: "none",
  background: "transparent",
  color: "var(--text-body, #e5e7eb)",
  font: `13px/1.3 ${FONT}`,
  padding: "6px 8px",
};

const errStyle: CSSProperties = {
  font: `11px/1.3 ${FONT}`,
  color: "var(--semantic-warning, #F59E0B)",
  padding: "0 4px",
};

const groupHeader: CSSProperties = {
  font: `600 9.5px/1 ${FONT}`,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--surface-muted, #94A3B8)",
  padding: "8px 12px 4px",
};

const rowBase: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "7px 12px",
  cursor: "pointer",
  font: `12.5px/1.3 ${FONT}`,
  color: "#c3ccd6",
  border: "none",
  background: "transparent",
  width: "100%",
  textAlign: "left",
};

const rowActive: CSSProperties = {
  ...rowBase,
  background: "var(--brand-blue-bg, rgba(59,130,246,0.12))",
  color: "var(--text-body, #e5e7eb)",
};

const sublabelStyle: CSSProperties = {
  font: `11px/1.2 ${FONT}`,
  color: "var(--surface-muted, #94A3B8)",
  marginLeft: "auto",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: "45%",
};

const infoRow: CSSProperties = {
  font: `12px/1.4 ${FONT}`,
  color: "var(--surface-muted, #94A3B8)",
  padding: "10px 12px",
};

const footer: CSSProperties = {
  font: `10px/1.2 ${FONT}`,
  color: "#6b7684",
  padding: "5px 12px 7px",
  borderTop: "1px solid rgba(154,166,178,0.15)",
};

const SHIMMER_KEYFRAMES = `
@keyframes pe-search-shimmer {
  0% { background-position: -160px 0; }
  100% { background-position: 160px 0; }
}
`;

const shimmerBar = (width: string): CSSProperties => ({
  height: 10,
  width,
  borderRadius: 4,
  margin: "8px 12px",
  background:
    "linear-gradient(90deg, rgba(154,166,178,0.12) 25%, rgba(154,166,178,0.28) 50%, rgba(154,166,178,0.12) 75%)",
  backgroundSize: "320px 100%",
  animation: "pe-search-shimmer 1.1s linear infinite",
});

/** Small stroke icon per suggestion kind (14px, inherits currentColor). */
function KindIcon({ kind }: { kind: SuggestionKind | "recent" }) {
  const common = {
    width: 13,
    height: 13,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    style: { flexShrink: 0, opacity: 0.75 },
    "aria-hidden": true,
  };
  switch (kind) {
    case "parcel":
      return (
        <svg {...common}>
          <rect x="2.5" y="2.5" width="11" height="11" rx="1" />
          <path d="M2.5 8h11M8 2.5v11" />
        </svg>
      );
    case "address":
      return (
        <svg {...common}>
          <path d="M8 14s-4.5-4.1-4.5-7.3A4.5 4.5 0 0 1 8 2.2a4.5 4.5 0 0 1 4.5 4.5C12.5 9.9 8 14 8 14Z" />
          <circle cx="8" cy="6.7" r="1.6" />
        </svg>
      );
    case "street":
      return (
        <svg {...common}>
          <path d="M4 14 6.5 2M12 14 9.5 2" />
          <path d="M8 4v1.6M8 8v1.6M8 12v1.6" strokeDasharray="0.1 3" />
        </svg>
      );
    case "place":
      return (
        <svg {...common}>
          <path d="M2.5 13.5v-7l3-2v9M5.5 13.5v-9l4 2.5v6.5M9.5 13.5V7l4-2v8.5" />
          <path d="M1.5 13.5h13" />
        </svg>
      );
    case "recent":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="5.7" />
          <path d="M8 5v3.2l2.2 1.4" />
        </svg>
      );
  }
}

/** Label with matched substrings emphasized. */
function HighlightedLabel({ label, query }: { label: string; query: string }) {
  const ranges = highlightRanges(label, query);
  if (!ranges.length) return <span>{label}</span>;
  const parts: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((r, i) => {
    if (r.start > cursor) parts.push(label.slice(cursor, r.start));
    parts.push(
      <span key={i} style={{ fontWeight: 700, color: "var(--text-body, #e5e7eb)" }}>
        {label.slice(r.start, r.end)}
      </span>,
    );
    cursor = r.end;
  });
  if (cursor < label.length) parts.push(label.slice(cursor));
  return <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{parts}</span>;
}

export interface SuggestDropdownProps {
  snap: SuggestSnapshot;
  onPick: (index: number) => void;
  onHover: (index: number) => void;
  onClearRecents: () => void;
}

/**
 * Pure presentational dropdown — exported for static-render tests. Draws
 * grouped suggestion rows (icons + kind labels), recents, the loading
 * shimmer, the honest empty state, the honest geocoder-down state, and the
 * "search © OSM" attribution footer.
 */
export function SuggestDropdown({
  snap,
  onPick,
  onHover,
  onClearRecents,
  isMobile = false,
}: SuggestDropdownProps & { isMobile?: boolean }) {
  if (!snap.open) return null;
  const rows = snap.showingRecents ? snap.recents : snap.items;

  let body: ReactNode;
  if (snap.loading) {
    body = (
      <div data-testid="search-loading">
        <style>{SHIMMER_KEYFRAMES}</style>
        <div style={shimmerBar("62%")} />
        <div style={shimmerBar("48%")} />
        <div style={shimmerBar("55%")} />
      </div>
    );
  } else if (snap.unavailable) {
    body = (
      <div data-testid="search-unavailable" style={{ ...infoRow, color: "var(--semantic-warning, #F59E0B)" }}>
        Search unavailable — could not reach the geocoder. Parcel ids (48021:34177)
        still open directly.
      </div>
    );
  } else if (!snap.showingRecents && snap.empty) {
    body = (
      <div data-testid="search-empty" style={infoRow}>
        No matches — try a fuller address
      </div>
    );
  } else if (!rows.length) {
    return null;
  } else {
    let lastKind: string | null = null;
    const nodes: ReactNode[] = [];
    if (snap.showingRecents) {
      nodes.push(
        <div key="h-recent" style={groupHeader}>
          Recent
        </div>,
      );
    }
    rows.forEach((s, i) => {
      if (!snap.showingRecents && s.kind !== lastKind) {
        lastKind = s.kind;
        nodes.push(
          <div key={`h-${s.kind}`} style={groupHeader}>
            {KIND_LABELS[s.kind]}
          </div>,
        );
      }
      nodes.push(
        <button
          key={`r-${i}`}
          type="button"
          data-testid={`search-row-${i}`}
          style={i === snap.highlighted ? rowActive : rowBase}
          onMouseEnter={() => onHover(i)}
          onClick={() => onPick(i)}
        >
          <KindIcon kind={snap.showingRecents ? "recent" : s.kind} />
          <HighlightedLabel label={s.label} query={snap.query} />
          {s.sublabel && <span style={sublabelStyle}>{s.sublabel}</span>}
        </button>,
      );
    });
    if (snap.showingRecents) {
      nodes.push(
        <button
          key="clear-recents"
          type="button"
          data-testid="search-clear-recents"
          style={{ ...rowBase, color: "var(--surface-muted, #94A3B8)", font: `11px/1.2 ${FONT}` }}
          onClick={() => onClearRecents()}
        >
          Clear recent searches
        </button>,
      );
    }
    body = <div>{nodes}</div>;
  }

  return (
    <div
      data-testid="search-suggest-dropdown"
      style={searchDropdownStyle(isMobile)}
      // Keep input focus while clicking rows (blur would close before click).
      onMouseDown={(e) => e.preventDefault()}
    >
      {body}
      <div style={footer}>search © OSM</div>
    </div>
  );
}

export function SearchBar({
  busy = false,
  error = null,
  onSelect,
  onSubmitRaw,
  getBias,
  initialValue = "",
  fetchSuggestionsImpl,
}: SearchBarProps) {
  const { isMobile, setSearchFocused } = useMobilePanel();
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const getBiasRef = useRef(getBias);
  getBiasRef.current = getBias;
  const fetchRef = useRef(fetchSuggestionsImpl);
  fetchRef.current = fetchSuggestionsImpl;

  const [snap, setSnap] = useState<SuggestSnapshot | null>(null);
  const controller = useMemo(
    () =>
      createSuggestController({
        fetchSuggestions: (q, signal) =>
          fetchRef.current
            ? fetchRef.current(q, signal)
            : fetchGeocodeSuggestions(q, getBiasRef.current(), signal),
        onChange: setSnap,
        loadRecents: () => loadRecents(),
        saveRecents: (r) => saveRecents(r),
      }),
    [],
  );
  useEffect(() => () => controller.dispose(), [controller]);

  const pick = (index?: number) => {
    const chosen = controller.select(index);
    if (chosen) {
      setValue(chosen.kind === "parcel" ? chosen.parcelNodeId ?? chosen.label : chosen.label);
      onSelect(chosen);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      controller.moveHighlight(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      controller.moveHighlight(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const current = controller.getSnapshot();
      const hasRow =
        current.open &&
        current.highlighted >= 0 &&
        (current.showingRecents
          ? current.recents.length > current.highlighted
          : current.items.length > current.highlighted);
      if (hasRow) {
        pick();
      } else {
        const q = value.trim();
        if (q && !busy) {
          controller.close();
          onSubmitRaw(q);
        }
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      controller.close();
      inputRef.current?.blur();
    }
  };

  return (
    <div data-testid="parcel-lookup-bar" style={searchBarWrapStyle(isMobile)}>
      <div style={form}>
        <input
          ref={inputRef}
          data-testid="parcel-lookup-input"
          type="search"
          name="parcel-lookup"
          placeholder="Search parcel id, address, street, or place"
          aria-label="Search parcel id, address, street, or place"
          aria-expanded={snap?.open ?? false}
          role="combobox"
          aria-autocomplete="list"
          value={value}
          disabled={busy}
          onChange={(e) => {
            setValue(e.target.value);
            controller.input(e.target.value);
          }}
          onFocus={() => {
            controller.focus();
            setSearchFocused(true);
          }}
          onBlur={() => {
            controller.close();
            setSearchFocused(false);
          }}
          onKeyDown={handleKeyDown}
          style={input}
          autoComplete="off"
        />
        <Button
          variant="primary"
          dense
          data-testid="parcel-lookup-submit"
          type="button"
          disabled={busy || !value.trim()}
          onClick={() => {
            const current = controller.getSnapshot();
            if (current.open && current.highlighted >= 0) {
              pick();
              return;
            }
            const q = value.trim();
            if (q && !busy) {
              controller.close();
              onSubmitRaw(q);
            }
          }}
        >
          {busy ? "…" : "Find"}
        </Button>
      </div>
      {snap && (
        <SuggestDropdown
          snap={snap}
          isMobile={isMobile}
          onPick={(i) => pick(i)}
          onHover={(i) => controller.setHighlight(i)}
          onClearRecents={() => {
            controller.clearRecents();
            clearStoredRecents();
          }}
        />
      )}
      {error && (
        <div data-testid="parcel-lookup-error" style={errStyle}>
          {error}
        </div>
      )}
    </div>
  );
}
