// apps/property-explorer/src/lib/search-suggest.ts
//
// The type-ahead SUGGEST STATE MACHINE — framework-free so debounce, stale-
// request cancellation, keyboard navigation, and recents behavior are pure
// unit-testable logic. The React SearchBar component is a thin renderer over
// this controller.
//
// Behavior contract (operator-ratified spec):
//   - suggestions from the first keystrokes (MIN_CHARS=2), debounced ~250ms,
//   - stale in-flight requests are aborted (AbortController) AND late results
//     for an old query are dropped (double guard),
//   - parcel-id-shaped input (/^\d{5}:\S+/) short-circuits: the fast-path
//     suggestion renders immediately, no geocoder call,
//   - ArrowUp/Down wrap across the flattened item list, Enter selects the
//     highlighted row (or falls back to raw submit), Esc closes,
//   - recents (max 6) show when the box is focused and EMPTY; clearable,
//   - geocoder-down is an honest "unavailable" state, never a fake empty.

import {
  groupSuggestions,
  looksLikeParcelId,
  parcelIdSuggestion,
  type Suggestion,
} from "./search-kinds";
import type { RecentEntry } from "./search-recents";
import { pushRecent } from "./search-recents";

export const SUGGEST_DEBOUNCE_MS = 250;
export const SUGGEST_MIN_CHARS = 2;
export const SUGGEST_MAX_RESULTS = 7;

export interface SuggestSnapshot {
  query: string;
  open: boolean;
  loading: boolean;
  /** Geocoder unreachable — honest state, parcel-id path still works. */
  unavailable: boolean;
  /** Flattened, group-ordered suggestion rows. */
  items: Suggestion[];
  /** Highlighted row index into items (or recents when showingRecents). -1 none. */
  highlighted: number;
  recents: RecentEntry[];
  /** True when the dropdown is showing recents (focused + empty input). */
  showingRecents: boolean;
  /** True when a completed fetch found nothing (honest empty state). */
  empty: boolean;
}

export interface SuggestControllerOpts {
  fetchSuggestions: (query: string, signal: AbortSignal) => Promise<Suggestion[]>;
  onChange: (snap: SuggestSnapshot) => void;
  loadRecents?: () => RecentEntry[];
  saveRecents?: (recents: RecentEntry[]) => void;
  debounceMs?: number;
  minChars?: number;
  maxResults?: number;
}

export interface SuggestController {
  getSnapshot(): SuggestSnapshot;
  focus(): void;
  input(query: string): void;
  close(): void;
  moveHighlight(delta: 1 | -1): void;
  setHighlight(index: number): void;
  /** Select a row (highlighted row when index omitted). Returns it, or null. */
  select(index?: number): Suggestion | null;
  /** Record an out-of-band selection (e.g. raw-submit fallback) into recents. */
  recordSelection(entry: RecentEntry): void;
  clearRecents(): void;
  /** Close dropdown and drop in-flight suggestions when the subject commits. */
  syncToSubjectCommit(): void;
  /** Dispose timers/in-flight fetches (component unmount). */
  dispose(): void;
}

export function createSuggestController(
  opts: SuggestControllerOpts,
): SuggestController {
  const debounceMs = opts.debounceMs ?? SUGGEST_DEBOUNCE_MS;
  const minChars = opts.minChars ?? SUGGEST_MIN_CHARS;
  const maxResults = opts.maxResults ?? SUGGEST_MAX_RESULTS;

  let snap: SuggestSnapshot = {
    query: "",
    open: false,
    loading: false,
    unavailable: false,
    items: [],
    highlighted: -1,
    recents: opts.loadRecents ? opts.loadRecents() : [],
    showingRecents: false,
    empty: false,
  };

  let timer: ReturnType<typeof setTimeout> | null = null;
  let inflight: AbortController | null = null;
  /** Monotonic fetch generation — drops late results for superseded queries. */
  let generation = 0;

  const emit = (next: Partial<SuggestSnapshot>) => {
    snap = { ...snap, ...next };
    opts.onChange(snap);
  };

  const cancelPending = () => {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
    inflight?.abort();
    inflight = null;
  };

  const rowsFor = (s: SuggestSnapshot): number =>
    s.showingRecents ? s.recents.length : s.items.length;

  const startFetch = (query: string) => {
    const gen = ++generation;
    const ctrl = new AbortController();
    inflight = ctrl;
    emit({ loading: true, unavailable: false, empty: false });
    opts
      .fetchSuggestions(query, ctrl.signal)
      .then((results) => {
        if (gen !== generation || ctrl.signal.aborted) return; // stale
        const items = groupSuggestions(results, maxResults);
        emit({
          loading: false,
          items,
          empty: items.length === 0,
          unavailable: false,
          highlighted: items.length ? 0 : -1,
        });
      })
      .catch((err) => {
        if (gen !== generation || (err as Error)?.name === "AbortError") return;
        // Honest unavailable state — parcel-id fast path still works.
        emit({ loading: false, items: [], empty: false, unavailable: true, highlighted: -1 });
      });
  };

  const controller: SuggestController = {
    getSnapshot: () => snap,

    focus() {
      const query = snap.query.trim();
      if (!query) {
        emit({ open: snap.recents.length > 0, showingRecents: true, highlighted: -1 });
      } else {
        emit({ open: true });
      }
    },

    input(rawQuery: string) {
      const query = rawQuery;
      const trimmed = query.trim();
      cancelPending();

      if (!trimmed) {
        // Empty box: recents (when any) — never a stale result list.
        emit({
          query,
          open: snap.recents.length > 0,
          showingRecents: true,
          items: [],
          loading: false,
          unavailable: false,
          empty: false,
          highlighted: -1,
        });
        return;
      }

      // Parcel-id fast path: immediate suggestion, no geocoder call.
      if (looksLikeParcelId(trimmed)) {
        const fast = parcelIdSuggestion(trimmed);
        emit({
          query,
          open: true,
          showingRecents: false,
          items: fast ? [fast] : [],
          loading: false,
          unavailable: false,
          empty: !fast,
          highlighted: fast ? 0 : -1,
        });
        return;
      }

      if (trimmed.length < minChars) {
        emit({
          query,
          open: true,
          showingRecents: false,
          items: [],
          loading: false,
          unavailable: false,
          empty: false,
          highlighted: -1,
        });
        return;
      }

      emit({ query, open: true, showingRecents: false, loading: true, empty: false });
      timer = setTimeout(() => {
        timer = null;
        startFetch(trimmed);
      }, debounceMs);
    },

    close() {
      cancelPending();
      emit({ open: false, loading: false, highlighted: -1 });
    },

    moveHighlight(delta) {
      const count = rowsFor(snap);
      if (!count) return;
      if (!snap.open) emit({ open: true });
      const current = snap.highlighted;
      const next =
        current < 0
          ? delta === 1
            ? 0
            : count - 1
          : (current + delta + count) % count;
      emit({ highlighted: next });
    },

    setHighlight(index) {
      const count = rowsFor(snap);
      if (index < -1 || index >= count) return;
      emit({ highlighted: index });
    },

    select(index) {
      const rows = snap.showingRecents ? snap.recents : snap.items;
      const i = index ?? snap.highlighted;
      const chosen = i >= 0 && i < rows.length ? rows[i] : null;
      if (!chosen) return null;
      controller.recordSelection(chosen);
      cancelPending();
      emit({ open: false, loading: false, highlighted: -1 });
      return chosen;
    },

    recordSelection(entry) {
      const recents = pushRecent(snap.recents, entry);
      snap = { ...snap, recents };
      opts.saveRecents?.(recents);
      opts.onChange(snap);
    },

    clearRecents() {
      snap = { ...snap, recents: [], showingRecents: snap.showingRecents, open: snap.showingRecents ? false : snap.open, highlighted: -1 };
      opts.saveRecents?.([]);
      opts.onChange(snap);
    },

    syncToSubjectCommit() {
      cancelPending();
      emit({
        open: false,
        loading: false,
        highlighted: -1,
        items: [],
        unavailable: false,
        empty: false,
        showingRecents: false,
      });
    },

    dispose() {
      cancelPending();
      generation++;
    },
  };

  return controller;
}
