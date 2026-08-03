// apps/property-explorer/src/shared/atom-chip/atom-accent.ts
//
// RESERVED ATOM ACCENT (R2). ONE hue means "openable recorded atom evidence"
// and is used for NOTHING else in the app. Extracted MECHANICALLY (no value
// change) from workbench/tools/chat-citations.ts so browse/InspectCard.tsx
// can render provenance chips in the same reserved hue without a
// browse/ -> workbench/tools/ import; chat-citations.ts re-exports these
// names unchanged.

export const ATOM_ACCENT = "#4CC9C0";
export const ATOM_ACCENT_BORDER = "rgba(76,201,192,0.5)";
export const ATOM_ACCENT_BG = "rgba(76,201,192,0.14)";
/** Text color when a chip is filled with the accent (open state). */
export const ATOM_ACCENT_CONTRAST = "#0b0f14";
