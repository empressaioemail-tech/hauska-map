import {
  createReadContract,
  createWidthedConfidence,
} from "../read-contract/index.js";

/**
 * Cotality-shaped GIS fixture — dense Bastrop viewport mesh for dataviz QA.
 * Source: cc-agent-C cotalityFixtures.ts parcel geometry + assessor field shapes.
 * Used when live /gis-layer quota or keys are unhealthy; swaps to live automatically.
 *
 * Generates a full-coverage tessellated parcel choropleth, a fire-palette
 * rent-AVM point field, and a federal flood band so the styling can be tuned to
 * the dataviz bar without live Cotality.
 */

/** 205 Javelina Trl, Bastrop TX — national map QA anchor */
export const FIXTURE_CENTER = { latitude: 30.1109, longitude: -97.3153 };

const COLS = 16;
const ROWS = 12;
const CELL_LON = 0.00055;
const CELL_LAT = 0.00072;
const GUTTER = 0.08;

/** Mesh extent in degrees — shared by DEM, flow, and parcel fixtures. */
export function meshExtent() {
  return {
    halfLon: (COLS / 2) * CELL_LON,
    halfLat: (ROWS / 2) * CELL_LAT,
  };
}

/** Allowed build height (ft) by land-use code for fill-extrusion demo. */
function allowedHeightFt(landUseCode) {
  const map = {
    "P-5": 85,
    "P-4": 65,
    COM: 55,
    IND: 45,
    MF: 48,
    "P-2": 38,
    SFR: 35,
    AG: 28,
  };
  return map[landUseCode] ?? 32;
}

/** Deterministic [0,1) hash so the fixture renders identically every load. */
function noise(i, j) {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function gauss(gx, gy, cx, cy, sx, sy) {
  const dx = (gx - cx) / sx;
  const dy = (gy - cy) / sy;
  return Math.exp(-(dx * dx + dy * dy) / 2);
}

function cellCenter(center, i, j) {
  return {
    lon: center.longitude + (i - (COLS - 1) / 2) * CELL_LON,
    lat: center.latitude + (j - (ROWS - 1) / 2) * CELL_LAT,
  };
}

function cellRing(lon, lat) {
  const dLon = (CELL_LON / 2) * (1 - GUTTER);
  const dLat = (CELL_LAT / 2) * (1 - GUTTER);
  return [
    [lon - dLon, lat - dLat],
    [lon + dLon, lat - dLat],
    [lon + dLon, lat + dLat],
    [lon - dLon, lat + dLat],
    [lon - dLon, lat - dLat],
  ];
}

/** Land-use class for a normalized grid cell — corridor, core, nodes, fringe. */
function classifyCell(i, j) {
  const gx = i / (COLS - 1);
  const gy = j / (ROWS - 1);
  const n = noise(i, j);

  // Agricultural fringe at the outer edge.
  if (gx < 0.1 || gx > 0.92 || gy < 0.08 || gy > 0.93) {
    return { landUseCode: "AG", landUseDescription: "Agricultural / open", zoningCode: "AG" };
  }
  // Industrial pocket, NE-ish corner.
  if (gx > 0.78 && gy > 0.18 && gy < 0.4) {
    return { landUseCode: "IND", landUseDescription: "Industrial / warehouse", zoningCode: "IND" };
  }
  // Downtown mixed-use core.
  if (gauss(gx, gy, 0.55, 0.58, 0.12, 0.12) > 0.5) {
    return n > 0.5
      ? { landUseCode: "P-5", landUseDescription: "Mixed use district", zoningCode: "P-5" }
      : { landUseCode: "P-4", landUseDescription: "Mixed use core", zoningCode: "P-4" };
  }
  // Commercial main-street corridor (a horizontal band).
  if (gy > 0.5 && gy < 0.66 && gx > 0.18 && gx < 0.86) {
    return n > 0.4
      ? { landUseCode: "COM", landUseDescription: "Commercial retail", zoningCode: "COM" }
      : { landUseCode: "COM", landUseDescription: "Commercial office", zoningCode: "COM" };
  }
  // Multi-family nodes flanking the corridor.
  if (
    gauss(gx, gy, 0.32, 0.46, 0.09, 0.09) > 0.5 ||
    gauss(gx, gy, 0.72, 0.64, 0.08, 0.08) > 0.5
  ) {
    return { landUseCode: "MF", landUseDescription: "Multi-family residential", zoningCode: "MF" };
  }
  // Single-family fills the rest of the neighborhood fabric.
  return n > 0.5
    ? { landUseCode: "P-2", landUseDescription: "Single-family residential", zoningCode: "P-2" }
    : { landUseCode: "SFR", landUseDescription: "Single-family residential", zoningCode: "SFR" };
}

/** Synthetic market rent index (5..100) — downtown + premium nodes, textured. */
function rentIndex(i, j) {
  const gx = i / (COLS - 1);
  const gy = j / (ROWS - 1);
  let rent =
    24 +
    68 * gauss(gx, gy, 0.55, 0.58, 0.22, 0.2) + // downtown core
    38 * gauss(gx, gy, 0.3, 0.32, 0.16, 0.18) + // SW premium node
    26 * gauss(gx, gy, 0.78, 0.72, 0.18, 0.16) + // NE amenity node
    8 * gy + // gentle north premium
    9 * (noise(i, j) - 0.5); // texture
  return Math.max(5, Math.min(100, rent));
}

/** @param {{ latitude: number, longitude: number }} [center] */
export function buildFixtureParcelCollection(center = FIXTURE_CENTER) {
  const features = [];
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLS; i++) {
      const { lon, lat } = cellCenter(center, i, j);
      const cls = classifyCell(i, j);
      const id = `p-${i}-${j}`;
      const isSubject = i === Math.floor(COLS / 2) && j === Math.floor(ROWS / 2);
      features.push({
        type: "Feature",
        id,
        properties: {
          clip: `fixture-${id}`,
          apn: `BASTROP-${id}`,
          landUseCode: cls.landUseCode,
          landUseDescription: cls.landUseDescription,
          zoningCode: cls.zoningCode,
          zoningDescription: cls.landUseDescription,
          allowedHeightFt: allowedHeightFt(cls.landUseCode),
          situsAddress: isSubject
            ? "205 Javelina Trl"
            : `${100 + i * 4 + j} Mesh Ln`,
        },
        geometry: { type: "Polygon", coordinates: [cellRing(lon, lat)] },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

/** Rent-AVM point field (one weighted point per parcel) for the heat surface. */
export function buildFixtureRentPoints(center = FIXTURE_CENTER) {
  const features = [];
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLS; i++) {
      const { lon, lat } = cellCenter(center, i, j);
      features.push({
        type: "Feature",
        id: `rent-${i}-${j}`,
        properties: { rent: Math.round(rentIndex(i, j)) },
        geometry: { type: "Point", coordinates: [lon, lat] },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

/** @param {{ latitude: number, longitude: number }} [center] */
export function buildFixtureFemaCollection(center = FIXTURE_CENTER) {
  const { latitude: lat, longitude: lon } = center;
  const halfLon = (COLS / 2) * CELL_LON;
  const halfLat = (ROWS / 2) * CELL_LAT;
  // A river-style floodway band cutting diagonally across the lower mesh.
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "fema-ae-1",
        properties: { FLD_ZONE: "AE", ZONE_SUBTY: "FLOODWAY", FLOOD_ZONE: "AE" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [lon - halfLon, lat - halfLat * 0.2],
              [lon - halfLon * 0.2, lat - halfLat * 0.78],
              [lon + halfLon * 0.5, lat - halfLat * 0.95],
              [lon + halfLon * 0.5, lat - halfLat * 0.62],
              [lon - halfLon * 0.2, lat - halfLat * 0.45],
              [lon - halfLon, lat + halfLat * 0.12],
              [lon - halfLon, lat - halfLat * 0.2],
            ],
          ],
        },
      },
      {
        type: "Feature",
        id: "fema-x-1",
        properties: { FLD_ZONE: "X", ZONE_SUBTY: "0.2 PCT ANNUAL CHANCE", FLOOD_ZONE: "X" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [lon - halfLon, lat + halfLat * 0.12],
              [lon - halfLon * 0.2, lat - halfLat * 0.45],
              [lon + halfLon * 0.5, lat - halfLat * 0.62],
              [lon + halfLon * 0.5, lat - halfLat * 0.4],
              [lon - halfLon * 0.15, lat - halfLat * 0.2],
              [lon - halfLon, lat + halfLat * 0.34],
              [lon - halfLon, lat + halfLat * 0.12],
            ],
          ],
        },
      },
    ],
  };
}

function fixtureReadContract(intervalWidth = 0.12, stratum = "routine") {
  return createReadContract({
    calibratedConfidence: createWidthedConfidence({
      estimate: 0.72,
      n: 24,
      intervalWidth,
      provenance: "asserted",
    }),
    assertedConfidence: createWidthedConfidence({
      estimate: 0.68,
      n: 0,
      intervalWidth: 0.35,
      provenance: "asserted",
    }),
    consequence: {
      derivation: {
        source: "asce7-risk-category",
        asce7RiskCategory: stratum === "essential" ? "IV" : "II",
        ibcOccupancyGroup: "B",
      },
      stratum,
      assertedAt: "2026-06-21T12:00:00.000Z",
    },
  });
}

function fixtureEnvelope(layerKey, payload, center, reason, adapterKey, intervalWidth = 0.12) {
  return {
    payload,
    source: {
      provider: "fixture/synthetic",
      adapterKey,
    },
    readContract: fixtureReadContract(intervalWidth),
    dataVintage: "2026-06-21-fixture-wave2",
    coverage: {
      reason:
        reason ||
        `Fixture/synthetic — ${layerKey} near ${center.latitude.toFixed(4)}, ${center.longitude.toFixed(4)}`,
    },
  };
}

function fixtureSlot(layerKey, proxyLayer, fc, center, opts = {}) {
  const count = fc?.features?.length ?? 0;
  const payload = opts.payload || { geojson: fc };
  return {
    layerKey,
    proxyLayer,
    status: "ok",
    meshMode: true,
    featureCount: count,
    fixture: true,
    envelope: fixtureEnvelope(
      layerKey,
      payload,
      center,
      opts.reason,
      opts.adapterKey || `fixture:${layerKey}`,
    ),
  };
}

/** D8-style flow paths draining toward the fixture flood band. */
export function buildFixtureFlowCollection(center = FIXTURE_CENTER) {
  const { halfLon, halfLat } = meshExtent();
  const lo = center.longitude;
  const la = center.latitude;
  const features = [];
  const seeds = [
    [lo - halfLon * 0.55, la + halfLat * 0.62],
    [lo + halfLon * 0.42, la + halfLat * 0.48],
    [lo - halfLon * 0.2, la + halfLat * 0.35],
    [lo + halfLon * 0.65, la + halfLat * 0.22],
    [lo - halfLon * 0.7, la - halfLat * 0.05],
    [lo + halfLon * 0.15, la + halfLat * 0.72],
  ];
  const sink = [lo - halfLon * 0.15, la - halfLat * 0.55];
  seeds.forEach((start, idx) => {
    const coords = [start];
    let [x, y] = start;
    for (let step = 0; step < 14; step++) {
      const dx = sink[0] - x;
      const dy = sink[1] - y;
      const mag = Math.hypot(dx, dy) || 1;
      const jitter = (noise(idx, step) - 0.5) * 0.00008;
      x += (dx / mag) * 0.00042 + jitter;
      y += (dy / mag) * 0.00038 - jitter * 0.5;
      coords.push([x, y]);
      if (mag < 0.00035) break;
    }
    features.push({
      type: "Feature",
      id: `flow-${idx}`,
      properties: { accumulation: 12 + idx * 4, layerKey: "hydrology-flow" },
      geometry: { type: "LineString", coordinates: coords },
    });
  });
  return { type: "FeatureCollection", features };
}

/** Composite buildable-envelope slot (Track 3 preview) — fixture only. */
export function buildFixtureBuildableEnvelope(center = FIXTURE_CENTER) {
  const parcels = buildFixtureParcelCollection(center);
  const clipped = parcels.features.filter(
    (f) => !["AG", "IND"].includes(f.properties.landUseCode),
  );
  return {
    type: "FeatureCollection",
    features: clipped.map((f) => ({
      ...f,
      properties: {
        ...f.properties,
        buildablePct: Math.round(55 + noise(f.id?.length || 0, 3) * 35),
        layerKey: "buildable-envelope",
      },
    })),
  };
}

/** @param {{ latitude: number, longitude: number }} [center] */
export function buildFixtureConstraintDensity(center = FIXTURE_CENTER) {
  const parcels = buildFixtureParcelCollection(center);
  return {
    type: "FeatureCollection",
    features: parcels.features.map((f, i) => ({
      ...f,
      properties: {
        ...f.properties,
        constraintCount: 1 + Math.floor(noise(i, 2) * 4),
        layerKey: "constraint-density",
      },
    })),
  };
}

/** OZ × deal-score cross-filter fixture heat. */
export function buildFixtureOzDealCrossfilter(center = FIXTURE_CENTER) {
  const parcels = buildFixtureParcelCollection(center);
  return {
    type: "FeatureCollection",
    features: parcels.features
      .filter((_, i) => noise(i, 5) > 0.72)
      .map((f) => ({
        ...f,
        properties: {
          ...f.properties,
          inOz: true,
          dealScore: Math.round(55 + noise(f.id?.length || 0, 7) * 40),
          layerKey: "oz-deal-crossfilter",
        },
      })),
  };
}

/** Motivated-seller composite fixture heat. */
export function buildFixtureMotivatedSeller(center = FIXTURE_CENTER) {
  const parcels = buildFixtureParcelCollection(center);
  return {
    type: "FeatureCollection",
    features: parcels.features.map((f, i) => ({
      type: "Feature",
      id: `ms-${i}`,
      properties: {
        leadHeat: Math.round(
          100 *
            noise(i, 1) *
            noise(i, 2) *
            (0.4 + noise(i, 3) * 0.6) *
            (0.3 + noise(i, 4) * 0.7),
        ),
        layerKey: "motivated-seller",
      },
      geometry: f.geometry,
    })),
  };
}

function reasoningEnvelope(layerKey, payload, center, readContract, reason) {
  return {
    payload,
    source: { provider: "fixture/synthetic", adapterKey: `fixture:${layerKey}` },
    readContract,
    dataVintage: "2026-06-21-fixture-wave2",
    coverage: { reason: reason || `Fixture reasoning layer ${layerKey}` },
  };
}

function consequenceStratumForCell(i, j) {
  const gx = i / 15;
  const gy = j / 11;
  if (gauss(gx, gy, 0.55, 0.58, 0.1, 0.1) > 0.65) return "essential";
  if (gauss(gx, gy, 0.3, 0.35, 0.12, 0.12) > 0.55) return "critical";
  if (noise(i, j) > 0.82) return "elevated";
  return "routine";
}

function readContractForParcel(stratum, intervalWidth = 0.12) {
  const riskMap = { routine: "II", elevated: "II", critical: "III", essential: "IV" };
  return createReadContract({
    calibratedConfidence: createWidthedConfidence({
      estimate: 0.72,
      n: stratum === "routine" ? 24 : 8,
      intervalWidth,
      provenance: "asserted",
    }),
    assertedConfidence: createWidthedConfidence({
      estimate: 0.68,
      n: 0,
      intervalWidth: 0.35,
      provenance: "asserted",
    }),
    consequence: {
      derivation: {
        source: "asce7-risk-category",
        asce7RiskCategory: riskMap[stratum] || "II",
        ibcOccupancyGroup: stratum === "essential" ? "I-2" : "B",
      },
      stratum,
      assertedAt: "2026-06-21T12:00:00.000Z",
    },
  });
}

export function buildConsequenceChoroplethCollection(center = FIXTURE_CENTER) {
  const parcels = buildFixtureParcelCollection(center);
  return {
    type: "FeatureCollection",
    features: parcels.features.map((f, idx) => {
      const parts = String(f.id || idx).split("-");
      const i = Number(parts[1] ?? idx);
      const j = Number(parts[2] ?? 0);
      const stratum = consequenceStratumForCell(i, j);
      return {
        ...f,
        properties: {
          ...f.properties,
          layerKey: "consequence-choropleth",
          consequenceStratum: stratum,
          readContract: readContractForParcel(stratum, 0.1),
        },
      };
    }),
  };
}

export function buildContestedGroundCollection(center = FIXTURE_CENTER) {
  const { halfLon, halfLat } = meshExtent();
  const lo = center.longitude;
  const la = center.latitude;
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "contested-d8-fema",
        properties: {
          layerKey: "contested-ground",
          conflictType: "hydrology-d8-vs-fema",
          sources: ["fixture:d8-flow", "fixture:fema-nfhl"],
          readContract: readContractForParcel("elevated", 0.42),
        },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [lo - halfLon * 0.35, la - halfLat * 0.55],
              [lo + halfLon * 0.15, la - halfLat * 0.72],
              [lo + halfLon * 0.42, la - halfLat * 0.48],
              [lo + halfLon * 0.08, la - halfLat * 0.28],
              [lo - halfLon * 0.35, la - halfLat * 0.55],
            ],
          ],
        },
      },
    ],
  };
}

export function buildTriageStateCollection(center = FIXTURE_CENTER) {
  const parcels = buildFixtureParcelCollection(center);
  return {
    type: "FeatureCollection",
    features: parcels.features
      .map((f, idx) => {
        const parts = String(f.id || idx).split("-");
        const i = Number(parts[1] ?? idx);
        const j = Number(parts[2] ?? 0);
        const stratum = consequenceStratumForCell(i, j);
        const width = 0.08 + noise(i, j) * 0.38;
        let triageState = "ok";
        if (["critical", "essential"].includes(stratum) && width > 0.28) {
          triageState = width > 0.34 ? "human-required" : "verify";
        } else if (stratum === "elevated" && width > 0.32) {
          triageState = "verify";
        }
        if (triageState === "ok") return null;
        return {
          ...f,
          properties: {
            ...f.properties,
            layerKey: "triage-state",
            triageState,
            intervalWidth: width,
            consequenceStratum: stratum,
            readContract: readContractForParcel(stratum, width),
          },
        };
      })
      .filter(Boolean),
  };
}

/** @param {{ latitude: number, longitude: number }} [center] */
export function getGisFixtureSlots(coords = FIXTURE_CENTER) {
  const center = {
    latitude: Number.isFinite(coords?.latitude) ? coords.latitude : FIXTURE_CENTER.latitude,
    longitude: Number.isFinite(coords?.longitude) ? coords.longitude : FIXTURE_CENTER.longitude,
  };
  const parcels = buildFixtureParcelCollection(center);
  const fema = buildFixtureFemaCollection(center);
  const rent = buildFixtureRentPoints(center);
  const flow = buildFixtureFlowCollection(center);
  const buildable = buildFixtureBuildableEnvelope(center);
  const constraint = buildFixtureConstraintDensity(center);
  const ozDeal = buildFixtureOzDealCrossfilter(center);
  const motivated = buildFixtureMotivatedSeller(center);
  return [
    fixtureSlot("dem-hillshade", "dem", null, center, {
      payload: { demFixture: true },
      adapterKey: "fixture:usgs-dem",
      reason: "Fixture/synthetic DEM grid — USGS 3DEP-shaped relief for QA",
    }),
    fixtureSlot("topography-contours", "contours", null, center, {
      payload: { demFixture: true },
      adapterKey: "fixture:contours-5m",
      reason: "Fixture/synthetic 5 m contours from DEM",
    }),
    fixtureSlot("hydrology-flow", "hydrology", flow, center, {
      adapterKey: "fixture:d8-flow",
      reason: "Fixture/synthetic D8 flow accumulation channels",
    }),
    fixtureSlot("flood-zone", "fema", fema, center, {
      adapterKey: "fixture:fema-nfhl",
    }),
    fixtureSlot("parcel-polygon", "parcels", parcels, center, {
      adapterKey: "fixture:parcels-mesh",
    }),
    fixtureSlot("parcel-extrusion", "extrusion", parcels, center, {
      adapterKey: "fixture:allowed-height",
      reason: "Fixture/synthetic allowed-height fill-extrusion envelopes",
    }),
    fixtureSlot("buildable-envelope", "buildable", buildable, center, {
      adapterKey: "fixture:buildable-composite",
      reason: "Fixture/synthetic buildable envelope (Track 3 preview)",
    }),
    fixtureSlot("constraint-density", "constraint", constraint, center, {
      adapterKey: "fixture:constraint-density",
      reason: "Fixture/synthetic encumbrance density heat",
    }),
    fixtureSlot("oz-deal-crossfilter", "oz-deal", ozDeal, center, {
      adapterKey: "fixture:oz-deal-crossfilter",
      reason: "Fixture/synthetic OZ × deal-score cross-filter",
    }),
    fixtureSlot("motivated-seller", "motivated", motivated, center, {
      adapterKey: "fixture:motivated-seller",
      reason: "Fixture/synthetic motivated-seller lead heat",
    }),
    fixtureSlot("rent-heat", "rent", rent, center, {
      adapterKey: "fixture:rent-avm",
    }),
    {
      layerKey: "consequence-choropleth",
      proxyLayer: "consequence",
      status: "ok",
      meshMode: true,
      featureCount: buildConsequenceChoroplethCollection(center).features.length,
      fixture: true,
      envelope: reasoningEnvelope(
        "consequence-choropleth",
        { geojson: buildConsequenceChoroplethCollection(center) },
        center,
        fixtureReadContract(0.1, "elevated"),
        "Fixture F2 consequence stratum choropleth (demo until E enrichment lands)",
      ),
    },
    {
      layerKey: "contested-ground",
      proxyLayer: "contested",
      status: "ok",
      meshMode: false,
      featureCount: 1,
      fixture: true,
      envelope: reasoningEnvelope(
        "contested-ground",
        { geojson: buildContestedGroundCollection(center) },
        center,
        fixtureReadContract(0.42, "elevated"),
        "Fixture F5 contested band — D8 flow vs FEMA NFHL disagreement",
      ),
    },
    {
      layerKey: "triage-state",
      proxyLayer: "triage",
      status: "ok",
      meshMode: true,
      featureCount: buildTriageStateCollection(center).features.length,
      fixture: true,
      envelope: reasoningEnvelope(
        "triage-state",
        { geojson: buildTriageStateCollection(center) },
        center,
        fixtureReadContract(0.32, "critical"),
        "Fixture triage flags — thin width × high consequence parcels",
      ),
    },
  ];
}

export function slotHasGeoJson(slot) {
  const payload = slot?.envelope?.payload;
  if (payload?.demFixture) return true;
  const fc = payload?.geojson;
  return Boolean(fc?.features?.length || fc?.type === "Feature");
}
