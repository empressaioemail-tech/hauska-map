// Pure state-transition helpers for HelpWidget.tsx (P-118), split out so the
// turn-management logic is directly unit-testable without a DOM — same
// separation ChatTool.tsx uses for chat-sessions.ts / chat-research.ts.

import type { HelpWidgetOutcome, HelpWidgetTurn } from "../lib/help-widget-client";

export const MAX_HELP_WIDGET_HISTORY_TURNS = 8;

export interface HelpWidgetDisplayTurn extends HelpWidgetTurn {
  /** True only for a turn that failed — rendered as an honest error line,
   *  never mixed into the history sent to the model on the next turn. */
  failed?: boolean;
}

/** Append the user's new message as an optimistic turn. Pure. */
export function appendUserTurn(
  turns: HelpWidgetDisplayTurn[],
  message: string,
): HelpWidgetDisplayTurn[] {
  return [...turns, { role: "user", content: message }];
}

/** Append the resolved outcome (answer or honest failure) as a turn. Pure. */
export function appendOutcomeTurn(
  turns: HelpWidgetDisplayTurn[],
  outcome: HelpWidgetOutcome,
): HelpWidgetDisplayTurn[] {
  return [
    ...turns,
    {
      role: "assistant",
      content: outcome.message,
      ...(outcome.kind === "error" ? { failed: true } : {}),
    },
  ];
}

/**
 * The history to send with the NEXT request: clean (role, content) pairs
 * only, failed turns excluded (a fabricated-answer placeholder must never
 * ride back into the model's own context), windowed to the last N — mirrors
 * ChatTool.tsx's own "last-8-turn history window" convention.
 */
export function historyForRequest(
  turns: HelpWidgetDisplayTurn[],
): HelpWidgetTurn[] {
  return turns
    .filter((t) => !t.failed)
    .slice(-MAX_HELP_WIDGET_HISTORY_TURNS)
    .map((t) => ({ role: t.role, content: t.content }));
}
