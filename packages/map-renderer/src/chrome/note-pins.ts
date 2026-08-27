// Map-pin note marks: up to 10 distinct colours, assigned in drop order.
// Gold may appear as a mark colour; it is not an action.

export const NOTE_PIN_COLORS = [
  "#3B82F6",
  "#22C55E",
  "#F59E0B",
  "#A855F7",
  "#EF4444",
  "#06B6D4",
  "#F97316",
  "#EC4899",
  "#84CC16",
  "#14B8A6",
] as const;

export function noteColorAt(index: number): string {
  const n = NOTE_PIN_COLORS.length;
  const i = Number.isFinite(index) ? Math.trunc(index) : 0;
  const wrapped = ((i % n) + n) % n;
  return NOTE_PIN_COLORS[wrapped];
}

/** Hover text is the note body. Empty / whitespace-only notes have none. */
export function noteHoverText(text: string | null | undefined): string | null {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}
