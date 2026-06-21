/**
 * V3 placeholder — static layer registry for Wave 1.
 * Per-app allocation lands in Wave 2 (V3).
 */

export const LAYER_REGISTRY = [
  { key: "parcel-polygon", label: "Parcel boundary", group: "parcel", fixture: true, live: true, fuelGated: false },
  { key: "parcel-extrusion", label: "Allowed height (3D)", group: "parcel", fixture: true, live: false, fuelGated: false },
  { key: "zoning", label: "Zoning / land use", group: "regulatory", fixture: true, live: true, fuelGated: true },
  { key: "flood-zone", label: "FEMA flood zone", group: "hazard", fixture: true, live: true, fuelGated: false },
  { key: "floodway", label: "Regulatory floodway", group: "hazard", fixture: true, live: true, fuelGated: false },
  { key: "dem-hillshade", label: "Hillshade relief", group: "terrain", fixture: true, live: false, fuelGated: false },
  { key: "topography-contours", label: "5 m contours", group: "terrain", fixture: true, live: true, fuelGated: false },
  { key: "hydrology-flow", label: "Hydrology flow (D8)", group: "hydrology", fixture: true, live: false, fuelGated: false },
  { key: "buildable-envelope", label: "Buildable envelope", group: "reasoning", fixture: true, live: false, fuelGated: false },
  { key: "constraint-density", label: "Constraint density", group: "reasoning", fixture: true, live: false, fuelGated: false },
  { key: "oz-deal-crossfilter", label: "OZ × deal score", group: "reasoning", fixture: true, live: false, fuelGated: false },
  { key: "motivated-seller", label: "Motivated seller heat", group: "investor", fixture: true, live: false, fuelGated: true },
  { key: "ssurgo-soils", label: "SSURGO soils", group: "subsurface", fixture: false, live: false, fuelGated: false },
  { key: "groundwater", label: "Groundwater (NWIS)", group: "subsurface", fixture: false, live: false, fuelGated: false },
  { key: "mud-pid", label: "MUD/PID districts", group: "regulatory", fixture: false, live: false, fuelGated: false },
  { key: "edwards-aquifer", label: "Edwards Aquifer", group: "regulatory", fixture: false, live: false, fuelGated: false },
  { key: "texas-rrc", label: "Texas RRC O&G", group: "subsurface", fixture: false, live: false, fuelGated: false },
  { key: "opportunity-zone-tract", label: "Opportunity Zone tract", group: "regulatory", fixture: true, live: true, fuelGated: false },
  { key: "rent-heat", label: "Rent heat (AVM)", group: "investor", fixture: true, live: false, fuelGated: true },
  { key: "etj", label: "Extraterritorial jurisdiction", group: "regulatory", fixture: false, live: false, fuelGated: true, pending: true },
  { key: "calibrated-accuracy", label: "Calibrated accuracy", group: "calibration", fixture: false, live: false, fuelGated: true, wave2: true },
  { key: "contested-ground", label: "Contested ground overlay", group: "calibration", fixture: false, live: false, fuelGated: true, wave2: true },
  { key: "triage-state", label: "Triage state", group: "calibration", fixture: false, live: false, fuelGated: true, wave2: true },
];

/** Wave 1 default visible layers */
export const DEFAULT_VISIBLE_LAYERS = new Set([
  "parcel-polygon",
  "flood-zone",
  "dem-hillshade",
  "topography-contours",
  "hydrology-flow",
  "rent-heat",
  "zoning",
]);

export function legendEntriesForRegistry(visibleKeys = DEFAULT_VISIBLE_LAYERS) {
  return LAYER_REGISTRY.filter((l) => visibleKeys.has(l.key) && !l.wave2).map((l) => ({
    key: l.key,
    label: l.label,
    group: l.group,
    status: l.pending ? "pending" : l.fixture ? "fixture/synthetic" : l.live ? "live" : "no-coverage",
    encodes: legendEncodes(l.key),
  }));
}

function legendEncodes(key) {
  const map = {
    "parcel-polygon": "Assessor parcel polygon; land-use choropleth fill",
    "flood-zone": "FEMA NFHL zone class",
    "rent-heat": "Rent AVM intensity (fixture fire ramp)",
    "dem-hillshade": "Synthetic DEM relief under data",
    "topography-contours": "5 m elevation contours from fixture DEM",
    "hydrology-flow": "D8-style flow channels (fixture)",
    "parcel-extrusion": "Allowed build height extrusion (ft)",
    zoning: "Municipal zoning / land-use code",
    "calibrated-accuracy": "Wave 2 — width-as-uncertainty saturation (fuel-gated)",
    "contested-ground": "Wave 2 — disagreeing layer inputs",
    "triage-state": "Wave 2 — thin accuracy + high consequence",
  };
  return map[key] || "GIS layer from EngineEnvelope slot";
}
