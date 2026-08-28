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
  fetchMergedSearchSuggestions,
  type GeocodeBias,
} from "../lib/geocodeClient";
import {
  highlightRanges,
  isAmbiguousSuggestionSet,
  KIND_LABELS,
  suggestionLookupTarget,
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
import { PE, MOTION } from "../styles/pe-chrome";

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
  /**
   * Subject the bar follows when the input is not focused. Present situs, or
   * the parcel node id. Never a leftover Find string. Null leaves the current
   * value.
   */
  subjectDisplay?: string | null;
  /** Test seam — replaces the BFF-backed suggestion fetcher. */
  fetchSuggestionsImpl?: (
    query: string,
    signal: AbortSignal,
  ) => Promise<Suggestion[]>;
}

/** Next input value when the subject changes. Focused typing is not yanked. */
/** @deprecated Prefer searchBarValueOnSubjectCommit when the subject store commits. */
export function nextSearchBarValue(args: {
  focused: boolean;
  subjectDisplay: string | null;
  current: string;
}): string {
  if (args.focused) return args.current;
  if (args.subjectDisplay == null) return args.current;
  return args.subjectDisplay;
}

/**
 * Find input after subjectStore commits (map click or successful Find).
 * WDLL 2026-08-25 item 3: always mirror the standing subject; do not leave
 * a prior query string or open typeahead rows from parcel A.
 */
export function searchBarValueOnSubjectCommit(args: {
  subjectDisplay: string | null;
  current: string;
}): string {
  if (args.subjectDisplay == null) return args.current;
  return args.subjectDisplay;
}

/**
 * What the Find bar shows for the standing subject. Present situs wins;
 * otherwise the parcel node id. A Travis-style `, TX` sentinel is not an
 * address and must not be written into the input.
 */
export function subjectDisplayFromIdentity(identity: {
  parcelNodeId: string;
  situsAddress: { state: string; value?: string };
}): string {
  if (identity.situsAddress.state === "present") {
    const value = identity.situsAddress.value?.trim() ?? "";
    if (value && !/^,\s*(TX)?\s*$/i.test(value)) {
      return identity.situsAddress.value as string;
    }
  }
  return identity.parcelNodeId;
}

const FONT = PE.ui;

/** The find bar: 40 tall — the ONE control allowed above 34. */
const form = (focused: boolean): CSSProperties => ({
  // The wrap now spans the space LEFT OF the expanded dock rather than being
  // a fixed centred box, so the bar takes its natural width up to 436 and
  // shrinks with the space instead of sliding under the column.
  width: "min(436px, 100%)",
  display: "flex",
  alignItems: "center",
  gap: 8,
  height: PE.hFind,
  padding: "0 6px 0 12px",
  borderRadius: PE.rFloat,
  background: PE.panelLight,
  border: `1px solid ${focused ? PE.blue : PE.line14}`,
  boxShadow: focused
    ? `0 8px 28px rgba(0,0,0,.45), ${PE.shFocus}`
    : "0 8px 28px rgba(0,0,0,.45)",
  transition: `border-color ${MOTION.state}, box-shadow ${MOTION.state}`,
});

const input: CSSProperties = {
  flex: 1,
  minWidth: 0,
  border: "none",
  outline: "none",
  background: "transparent",
  color: PE.t2,
  font: `13.5px/1.3 ${FONT}`,
  padding: 0,
};

const errStyle: CSSProperties = {
  font: `11.5px/1.35 ${FONT}`,
  color: PE.warn,
  padding: "0 4px",
};

const groupHeader: CSSProperties = {
  font: `600 10px/1 ${FONT}`,
  letterSpacing: ".13em",
  textTransform: "uppercase",
  color: PE.t6,
  padding: "10px 12px 5px",
};

/** 38px suggestion rows. */
const rowBase: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  height: 38,
  padding: "0 12px",
  cursor: "pointer",
  font: `12.5px/1.3 ${FONT}`,
  color: PE.t3,
  border: "none",
  background: "transparent",
  width: "100%",
  textAlign: "left",
};

const rowActive: CSSProperties = {
  ...rowBase,
  background: PE.blueBg,
  color: PE.t1,
};

/** Metadata rides the right edge in mono — it is a code, not prose. */
const sublabelStyle: CSSProperties = {
  fontFamily: PE.mono,
  fontSize: 11,
  lineHeight: 1.2,
  color: PE.t6,
  marginLeft: "auto",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: "45%",
};

const infoRow: CSSProperties = {
  font: `12.5px/1.45 ${FONT}`,
  color: PE.t4,
  padding: "12px",
};

const footer: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  font: `10.5px/1.2 ${FONT}`,
  color: PE.t6,
  padding: "7px 12px 8px",
  borderTop: `1px solid ${PE.line06}`,
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
      <span key={i} style={{ fontWeight: 700, color: PE.t3 }}>
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
      <div data-testid="search-unavailable" style={{ ...infoRow, color: PE.warn }}>
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
        <Button
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
        </Button>,
      );
    });
    if (snap.showingRecents) {
      nodes.push(
        <Button
          key="clear-recents"
          type="button"
          data-testid="search-clear-recents"
          style={{ ...rowBase, color: PE.t4, font: `11px/1.2 ${FONT}` }}
          onClick={() => onClearRecents()}
        >
          Clear recent searches
        </Button>,
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
      <div style={footer}>
        <span style={{ flex: 1 }}>
          Parcel id, address, street, or place
        </span>
        <span style={{ fontFamily: PE.mono, color: PE.t6 }}>
          ↑↓ move · ↵ open
        </span>
        <span>search © OSM</span>
      </div>
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
  subjectDisplay = null,
  fetchSuggestionsImpl,
}: SearchBarProps) {
  const { isMobile, setSearchFocused } = useMobilePanel();
  const [focused, setFocused] = useState(false);
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusedRef = useRef(false);
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
            : fetchMergedSearchSuggestions(q, getBiasRef.current(), signal),
        onChange: setSnap,
        loadRecents: () => loadRecents(),
        saveRecents: (r) => saveRecents(r),
      }),
    [],
  );
  useEffect(() => () => controller.dispose(), [controller]);

  useEffect(() => {
    controller.syncToSubjectCommit();
    setValue((current) =>
      searchBarValueOnSubjectCommit({ subjectDisplay, current }),
    );
  }, [subjectDisplay, controller]);

  const pick = (index?: number) => {
    const chosen = controller.select(index);
    if (chosen) {
      // The input carries the FULL lookup target, so pressing Find afterwards
      // re-submits exactly what the suggestion resolved. Writing the display
      // label here truncated every address to house number plus street.
      setValue(suggestionLookupTarget(chosen));
      onSelect(chosen);
    }
  };

  const canPickHighlighted = (current: NonNullable<typeof snap>): boolean => {
    const hasRow =
      current.open &&
      current.highlighted >= 0 &&
      (current.showingRecents
        ? current.recents.length > current.highlighted
        : current.items.length > current.highlighted);
    if (!hasRow) return false;
    if (current.showingRecents) return true;
    const ambiguous = isAmbiguousSuggestionSet(current.items);
    if (!ambiguous || current.items.length <= 1) return true;
    return current.highlightExplicit;
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
      if (canPickHighlighted(current)) {
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
      <div style={form(focused)}>
        {/* The search glyph turns blue on focus — the one place the action
            colour signals "this field is live". */}
        <svg
          viewBox="0 0 24 24"
          width={15}
          height={15}
          aria-hidden
          fill="none"
          stroke={focused ? PE.blue : PE.t5}
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flex: "none", transition: `stroke ${MOTION.state}` }}
        >
          <path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3" />
        </svg>
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
            focusedRef.current = true;
            controller.focus();
            setSearchFocused(true);
            setFocused(true);
          }}
          onBlur={() => {
            focusedRef.current = false;
            controller.close();
            setSearchFocused(false);
            setFocused(false);
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
            if (canPickHighlighted(current)) {
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
