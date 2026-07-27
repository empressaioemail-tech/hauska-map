// Thin re-export — layered chrome lives in @hauska/map-renderer (CC-A WDLL 7).
export { installMapTools } from "../../../../packages/map-renderer/src/chrome/mapToolsController";
export type {
  MapToolsController,
  ToolsSnapshot,
  ToolKind,
  MeasureMode,
} from "../../../../packages/map-renderer/src/chrome/mapToolsController";
