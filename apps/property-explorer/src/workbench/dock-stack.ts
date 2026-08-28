// apps/property-explorer/src/workbench/dock-stack.ts
//
// THE DOCK STACK, as pure rules.
//
// OPEN MEANS OPEN. Opening a tool does NOT fold the others. Several docks can
// be expanded at once and the column scrolls through all of them as one
// surface; folding is something the USER does to a dock, per dock, by
// clicking its header. Nothing is ever folded or closed on their behalf.
//
// This is the second cut. The first read SPEC section 2's "the newest expands,
// the rest fold" as an accordion and auto-folded on every open, which is not
// what was asked for — "I need to be able to open multiple containers and then
// just scroll through them" (operator, twice). The auto-fold is gone. What
// survives from the spec is that a folded dock keeps its 36px header and comes
// back in one click.
//
// This file is the rule and nothing else, so the behaviour is provable in a
// node test with no click harness, following the precedent `nextOpenToolId`
// set in Workbench.tsx: the chassis owns layout, the rule owns the decision.

export interface DockStack {
  /** Every open tool id, OLDEST FIRST. Arrival order, not rail order. */
  open: readonly string[];
  /** Which of the open tools are folded to their header. A user choice. */
  folded: readonly string[];
}

export const EMPTY_STACK: DockStack = { open: [], folded: [] };

/** The newest still-open tool — what the app shell tracks as `openToolId`. */
export function newestOpen(stack: DockStack): string | null {
  return stack.open.length > 0 ? stack.open[stack.open.length - 1] : null;
}

/** Expanded = open and not folded. Derived, never stored. */
export function isExpandedIn(stack: DockStack, id: string): boolean {
  return stack.open.includes(id) && !stack.folded.includes(id);
}

/**
 * Tapping a rail bubble.
 *
 *   already open -> closes it (a second tap on the active bubble puts a tool
 *                   away; that has always been true and is the only way a
 *                   bubble removes anything)
 *   not open     -> opens it, EXPANDED, on top of the stack, and leaves every
 *                   other open dock exactly as the user left it
 */
export function tapDock(stack: DockStack, tapped: string): DockStack {
  if (stack.open.includes(tapped)) return closeOneDock(stack, tapped);
  return { open: [...stack.open, tapped], folded: stack.folded };
}

/**
 * Clicking a dock header. Folds an expanded dock, unfolds a folded one, and
 * touches nothing else. This is the ONLY thing that folds a dock.
 */
export function toggleFold(stack: DockStack, id: string): DockStack {
  if (!stack.open.includes(id)) return stack;
  return {
    open: stack.open,
    folded: stack.folded.includes(id)
      ? stack.folded.filter((x) => x !== id)
      : [...stack.folded, id],
  };
}

/** Force a dock expanded (the shell opening a tool must not land it folded). */
export function expandDock(stack: DockStack, id: string): DockStack {
  if (!stack.open.includes(id) || !stack.folded.includes(id)) return stack;
  return { open: stack.open, folded: stack.folded.filter((x) => x !== id) };
}

/** The close control on one dock. Removes exactly that tool. */
export function closeOneDock(stack: DockStack, id: string): DockStack {
  if (!stack.open.includes(id)) return stack;
  return {
    open: stack.open.filter((x) => x !== id),
    folded: stack.folded.filter((x) => x !== id),
  };
}

/**
 * Reconcile with the app shell, which owns a SINGLE `openToolId` and is the
 * caller of record for `ensureWorkbenchTool("brief")` and friends.
 *
 * The shell naming a tool means "this one should be open and readable", never
 * "close the others". The shell setting NULL still empties the column, which
 * preserves what `closeDock()` and the inspect-card teardown already do.
 */
export function syncStack(
  stack: DockStack,
  openToolId: string | null,
): DockStack {
  if (openToolId === null) return EMPTY_STACK;
  if (!stack.open.includes(openToolId)) {
    return { open: [...stack.open, openToolId], folded: stack.folded };
  }
  return expandDock(stack, openToolId);
}

/** Drop any tool no longer in the registry (a registry change mid-session). */
export function pruneStack(
  stack: DockStack,
  known: ReadonlySet<string>,
): DockStack {
  const open = stack.open.filter((id) => known.has(id));
  if (open.length === stack.open.length) return stack;
  return { open, folded: stack.folded.filter((id) => known.has(id)) };
}
