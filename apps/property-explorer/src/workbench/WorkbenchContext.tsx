// apps/property-explorer/src/workbench/WorkbenchContext.tsx
//
// PE WORKBENCH CHASSIS — the tool-facing React seam (WB1).
//
//   useWorkbench()           → { activeParcelNodeId, closeDock, host }
//   useDockToolState<T>(id)  → [state, setState] for tool `id`, ALREADY scoped
//                              to the active property and persisted per
//                              property (in-memory + localStorage, latest ~10
//                              properties). Switching the active property
//                              re-scopes automatically; the setter no-ops with
//                              no active property (property-scoped tools never
//                              reach that: the dock shows the honest
//                              "select a property first" state instead).
//
// The setter identity is bound to the active property at RENDER time, so an
// async completion (e.g. a fetch started for property A) that calls a captured
// setter writes to A even if the user has since switched to B.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import type { WorkbenchHostActions, WorkbenchToolContext } from "./types";
import {
  workbenchToolState,
  type WorkbenchToolStateStore,
} from "./tool-state-store";

interface WorkbenchContextValue extends WorkbenchToolContext {
  store: WorkbenchToolStateStore;
}

const Ctx = createContext<WorkbenchContextValue | null>(null);

export function WorkbenchProvider({
  activeParcelNodeId,
  closeDock,
  host,
  store = workbenchToolState,
  children,
}: {
  activeParcelNodeId: string | null;
  closeDock: () => void;
  host: WorkbenchHostActions;
  /** Injectable for tests; defaults to the app-wide singleton. */
  store?: WorkbenchToolStateStore;
  children: ReactNode;
}) {
  const value = useMemo<WorkbenchContextValue>(
    () => ({ activeParcelNodeId, closeDock, host, store }),
    [activeParcelNodeId, closeDock, host, store],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The chassis context — tools call this instead of receiving props. */
export function useWorkbench(): WorkbenchContextValue {
  const value = useContext(Ctx);
  if (!value) {
    throw new Error("useWorkbench must be used inside <WorkbenchProvider>");
  }
  return value;
}

/**
 * Per-property persistent tool state (the WB1 pinned hook).
 *
 * `T` must be plain JSON-serializable data for the localStorage leg; a
 * non-serializable value still works for the session (memory-only).
 * Pass null to clear the slot for the active property.
 */
export function useDockToolState<T>(
  toolId: string,
): readonly [T | null, (next: T | null) => void] {
  const { activeParcelNodeId, store } = useWorkbench();

  const read = useCallback(
    () => store.get(activeParcelNodeId, toolId) as T | null,
    [store, activeParcelNodeId, toolId],
  );
  // Same snapshot for client and server render (react-dom/server tests).
  const state = useSyncExternalStore(store.subscribe, read, read);

  const setState = useCallback(
    (next: T | null) => {
      if (!activeParcelNodeId) return; // no phantom-property writes.
      store.set(activeParcelNodeId, toolId, next);
    },
    [store, activeParcelNodeId, toolId],
  );

  return [state, setState] as const;
}
