// apps/property-explorer/src/shared/atom-chip/atom-accent.ts
//
// RESERVED ATOM ACCENT (R2). ONE hue means "openable recorded atom evidence"
// and is used for NOTHING else in the app. Extracted MECHANICALLY (no value
// change) from workbench/tools/chat-citations.ts so browse/InspectCard.tsx
// can render provenance chips in the same reserved hue without a
// browse/ -> workbench/tools/ import; chat-citations.ts re-exports these
// names unchanged.

// STONE PORT. ATOM_ACCENT moved off the v2 teal to the value below, in lockstep
// with --ss-atom in pe-tokens.css. The retired hue is deliberately NOT spelled
// anywhere in this file: its whole job is that exactly one colour literal lives
// here. It is deliberately still a SPELLED HEX and cannot become
// var(--ss-atom): chat-tool.test.tsx asserts this literal appears in exactly
// two files (this one and pe-tokens.css), and a var() would match everywhere.
// The two spellings of one hue are held together by that audit, and by nothing
// else — so they must be edited in the same change or the chip renders a v2
// word inside a Stone box.
export const ATOM_ACCENT = "#6FC1B8";
export const ATOM_ACCENT_BORDER =
  "color-mix(in oklab, var(--ss-atom) 50%, transparent)";
export const ATOM_ACCENT_BG = "color-mix(in oklab, var(--ss-atom) 13%, transparent)";
/** Text color when a chip is filled with the accent (open state). Was the v2
 *  near-black #0b0f14; Stone's darkest step is the token below and no literal
 *  is needed for it, so this one is retired rather than re-spelled. */
export const ATOM_ACCENT_CONTRAST = "var(--ss-void)";
