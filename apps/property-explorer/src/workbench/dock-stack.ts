// apps/property-explorer/src/workbench/dock-stack.ts
//
// THE DOCK STACK, as pure rules.
//
// Chrome v2 SPEC section 2: opening a tool expands it and FOLDS every other
// open tool to its 36px header. Nothing is closed on the user's behalf — the
// close control is separate, and a folded header is the whole hit target that
// brings its tool back at the scroll position it had.
//
// This file is the rule and nothing else, so the behaviour is provable in a
// node test with no click harness. It follows the precedent `nextOpenToolId`
// set in Workbench.tsx: the chassis owns layout, the rule owns the decision.
//
// HISTORY, because reversing it later should be a decision and not a surprise:
// this repo shipped "ONE tool open at a time, never two docks" as design law,
// with guard tests written to stop multi-open returning. The operator retired
// that ruling on 2026-08-27 after using the single-dock v2 chrome. The guards
// were replaced, deliberately and by name, with the stacking assertions below.

export interface DockStack {
  /** Every open tool id, OLDEST FIRST. Order is arrival order, not rail order. */
  open: readonly string[];
  /** The one expanded tool. Null exactly when `open` is empty. */
  expanded: string | null;
}

export const EMPTY_STACK: DockStack = { open: [], expanded: null };

/** The newest still-open tool, which is what inherits focus when one closes. */
function newest(open: readonly string[]): string | null {
  return open.length > 0 ? open[open.length - 1] : null;
}

/**
 * Tapping a rail bubble.
 *
 *   the expanded tool   -> closes it (a second tap on the active bubble is how
 *                          you put a tool away; that has always been true)
 *   an open but folded  -> expands it, folding whatever was expanded
 *   a closed tool       -> opens it on top of the stack and expands it
 */
export function tapDock(stack: DockStack, tapped: string): DockStack {
  if (stack.expanded === tapped) return closeOneDock(stack, tapped);
  if (stack.open.includes(tapped)) return { open: stack.open, expanded: tapped };
  return { open: [...stack.open, tapped], expanded: tapped };
}

/**
 * Clicking a folded dock's header. Expands it and folds the rest. Never
 * closes anything — the header and the close control are different targets,
 * which is why the close control must stopPropagation.
 */
export function expandDock(stack: DockStack, id: string): DockStack {
  if (!stack.open.includes(id)) return stack;
  return { open: stack.open, expanded: id };
}

/**
 * The close control on one dock. Removes exactly that tool; the newest
 * remaining tool takes the expanded slot so the column is never left with
 * every dock folded and nothing readable.
 */
export function closeOneDock(stack: DockStack, id: string): DockStack {
  if (!stack.open.includes(id)) return stack;
  const open = stack.open.filter((x) => x !== id);
  return {
    open,
    expanded: stack.expanded === id ? newest(open) : stack.expanded,
  };
}

/**
 * Reconcile with the app shell, which owns a SINGLE `openToolId` and is the
 * caller of record for `ensureWorkbenchTool("brief")` and friends.
 *
 * The shell setting a tool means "make this one expanded", not "close the
 * others" — that is the whole behaviour change. The shell setting NULL still
 * means the dock is closed, which under stacking means the column empties;
 * that preserves what `closeDock()` and the inspect-card teardown already do.
 */
export function syncStack(
  stack: DockStack,
  openToolId: string | null,
): DockStack {
  if (openToolId === null) return EMPTY_STACK;
  if (stack.expanded === openToolId) return stack;
  if (stack.open.includes(openToolId)) {
    return { open: stack.open, expanded: openToolId };
  }
  return { open: [...stack.open, openToolId], expanded: openToolId };
}

/** Drop any tool that is no longer registered (a registry change mid-session). */
export function pruneStack(
  stack: DockStack,
  known: ReadonlySet<string>,
): DockStack {
  const open = stack.open.filter((id) => known.has(id));
  if (open.length === stack.open.length) return stack;
  return {
    open,
    expanded:
      stack.expanded && known.has(stack.expanded)
        ? stack.expanded
        : newest(open),
  };
}
