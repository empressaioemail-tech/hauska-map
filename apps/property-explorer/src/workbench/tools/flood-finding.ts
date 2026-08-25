// 4b — the flood headline is the first one or two sentences of the existing
// briefing. No new copy. Empty briefing is absence, not a fabricated finding.

export function floodFindingLead(briefing: string | null | undefined): string | null {
  if (typeof briefing !== "string") return null;
  const trimmed = briefing.trim();
  if (!trimmed) return null;
  let taken = 0;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch !== "." && ch !== "!" && ch !== "?") continue;
    if (i > 0 && /\d/.test(trimmed[i - 1]) && /\d/.test(trimmed[i + 1] ?? "")) {
      continue;
    }
    const rest = trimmed.slice(i + 1);
    const space = rest.match(/^\s*/)?.[0] ?? "";
    const next = rest[space.length];
    if (next && !/[A-Z]/.test(next)) continue;
    taken += 1;
    if (taken >= 2) {
      return trimmed.slice(0, i + 1).replace(/\s+/g, " ").trim();
    }
  }
  return trimmed.replace(/\s+/g, " ").trim();
}
