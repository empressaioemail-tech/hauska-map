// Thin re-export — layered chrome lives in @hauska/map-renderer (CC-A WDLL 7).
export {
  haversineMeters,
  polylineLengthMeters,
  ringAreaSqMeters,
  formatDistance,
  formatArea,
} from "../../../../packages/map-renderer/src/chrome/geoMeasure";
export type { LngLat } from "../../../../packages/map-renderer/src/chrome/geoMeasure";
