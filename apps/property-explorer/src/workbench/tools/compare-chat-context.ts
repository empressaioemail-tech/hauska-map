// apps/property-explorer/src/workbench/tools/compare-chat-context.ts
//
// UI QA Batch 7 (2026-09-08). "AI Chat panel can't read what's loaded in the
// Compare panel (Property A / Property B), so 'compare these two' prompts a
// re-ask instead of acting." Done looks like: when Compare has two properties
// loaded, AI Chat can answer "compare these two" from that state directly.
//
// SAME SHAPE AS dossier-chat-context.ts's user-work block, and for the same
// reason: this rides the MESSAGE, not `subject`/`areaContext`. chat-research.ts
// builds the request body from an explicit allowlist (areaContext.subject
// names its fields one by one) and the backend has a strict schema besides —
// an unlisted field is dropped before the fetch ever reaches the model, which
// is the exact dormant-mechanism trap dossier-chat-context.ts's own header
// documents from its first cut. The message text is the transport already
// proven to reach the model verbatim (chat-attach.ts, dossier-chat-context.ts).
//
// REUSE, DON'T FORK: the two columns are built with deriveCompareColumn, the
// exact function CompareTool itself renders from (compare-facts.ts), so this
// can never tell the model a value the Compare panel does not also show —
// same present/absent/pending honesty idioms, no second derivation.

import {
  COMPARE_ROWS,
  deriveCompareColumn,
  type CompareColumn,
  type CompareStoredState,
} from "./compare-facts";

export interface ChatCompareContext {
  a: CompareColumn;
  b: CompareColumn;
}

/**
 * Both compare slots, ONLY when both are selected AND both payloads have
 * already been fetched. A half-loaded compare (one slot picked, or a payload
 * still in flight) is not "two properties loaded" — it stays null rather than
 * describing one column truthfully and inventing the other, or telling the
 * model about a slot whose facts have not resolved yet.
 */
export function chatCompareContextFrom(
  stored: CompareStoredState | null,
): ChatCompareContext | null {
  if (!stored?.a || !stored?.b) return null;
  const a = stored.payloads[stored.a];
  const b = stored.payloads[stored.b];
  if (!a || !b) return null;
  return { a: deriveCompareColumn(a), b: deriveCompareColumn(b) };
}

function columnLines(column: CompareColumn): string[] {
  const lines = [
    `  ${column.address ?? column.parcelNodeId}`,
    `    Verdict: ${column.verdict.line}`,
  ];
  for (const row of COMPARE_ROWS) {
    const cell = column.cells[row.id];
    lines.push(`    ${row.label}: ${cell.value}`);
  }
  return lines;
}

/**
 * Render the block that goes INTO the message. Composable with
 * composeMessageWithAttachments / composeMessageWithUserWork — each wraps the
 * PREVIOUS result and re-appends its own "User question: ..." line, the same
 * nesting the two existing composers already use together, so this reads
 * `message` as whatever came before it in the chain and does not itself
 * append the trailing "User question:" line — the outermost composer in the
 * chain owns that.
 */
export function composeMessageWithCompareContext(
  message: string,
  compare: ChatCompareContext | null,
): string {
  if (!compare) return message;
  const lines = [
    "--- PROPERTIES CURRENTLY LOADED IN THE COMPARE PANEL ---",
    'The user has these two properties side by side right now. When they say',
    '"these two", "compare them" or similar without naming a property, they',
    "mean the two below. Every value is the same one the Compare panel",
    "renders — present, absent or pending exactly as shown there. Do not",
    "restate a value this block marks absent or pending as a known fact.",
    "",
    "Property A:",
    ...columnLines(compare.a),
    "",
    "Property B:",
    ...columnLines(compare.b),
  ];
  return [lines.join("\n"), "", `User question: ${message}`].join("\n");
}
