// Thin re-export — layered chrome lives in @hauska/map-renderer (CC-A WDLL 7).
// Relative source path (not package barrel) so PE vitest resolves without a build.
export { MapToolset, ToolsetToolsSection } from "../../../../packages/map-renderer/src/chrome/MapToolset";
export type { LayerStateBadge } from "../../../../packages/map-renderer/src/chrome/MapToolset";
