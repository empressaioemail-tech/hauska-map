// apps/property-explorer/src/shared/atom-chip/index.ts
//
// Barrel for the shared atom-chip primitives — the fetch-on-tap cache, the
// reserved accent constants, and the minimal chip/popover components. Used
// by browse/InspectCard.tsx directly, and re-exported (unchanged names) from
// workbench/tools/chat-atom-card.ts + chat-citations.ts so ChatTool.tsx and
// its tests are unaffected by the extraction.

export {
  fetchAtomByDid,
  resetAtomFetchCache,
  type AtomFetchOutcome,
  type AtomFetcher,
} from "./atom-fetch";
export {
  ATOM_ACCENT,
  ATOM_ACCENT_BORDER,
  ATOM_ACCENT_BG,
  ATOM_ACCENT_CONTRAST,
} from "./atom-accent";
export { AtomChip } from "./AtomChip";
export { AtomDetailPopover } from "./AtomDetailPopover";
