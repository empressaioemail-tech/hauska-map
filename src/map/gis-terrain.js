/**
 * Fixture DEM hillshade + 5 m contour lines — no Cotality dependency.
 * Terrarium-encoded raster-dem for MapLibre terrain + hillshade layers.
 */

import { FIXTURE_CENTER, meshExtent } from "./gis-fixture-data.js";

const GRID_COLS = 48;
const GRID_ROWS = 36;
const CONTOUR_INTERVAL_M = 5;
const METERS_PER_DEG_LAT = 111320;

/** @typedef {{ width: number, height: number, values: Float32Array, west: number, south: number, east: number, north: number, cellSizeM: number }} DemGrid */

function metersPerDegLon(lat) {
  return METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

function elevationAt(lon, lat, center) {
  const gx = (lon - center.longitude) / (meshExtent().halfLon * 2) + 0.5;
  const gy = (lat - center.latitude) / (meshExtent().halfLat * 2) + 0.5;
  const ridge =
    118 *
    Math.exp(-(((gx - 0.38) ** 2) / 0.018 + ((gy - 0.62) ** 2) / 0.022)) +
    92 * Math.exp(-(((gx - 0.72) ** 2) / 0.02 + ((gy - 0.28) ** 2) / 0.016));
  const valley = 28 * Math.exp(-(((gx - 0.42) ** 2) / 0.04 + ((gy - 0.22) ** 2) / 0.05));
  const slope = (gx - 0.5) * 14 + (gy - 0.5) * 9;
  const ripple =
    3.2 * Math.sin(gx * 28 + gy * 19) + 2.1 * Math.cos(gx * 17 - gy * 23);
  return Math.max(92, Math.min(198, 108 + ridge - valley + slope + ripple));
}

/** Build a regular DEM grid over the fixture mesh extent. */
export function buildFixtureDemGrid(center = FIXTURE_CENTER) {
  const { halfLon, halfLat } = meshExtent();
  const west = center.longitude - halfLon * 1.05;
  const east = center.longitude + halfLon * 1.05;
  const south = center.latitude - halfLat * 1.05;
  const north = center.latitude + halfLat * 1.05;
  const values = new Float32Array(GRID_COLS * GRID_ROWS);
  for (let row = 0; row < GRID_ROWS; row++) {
    const lat = south + (row / (GRID_ROWS - 1)) * (north - south);
    for (let col = 0; col < GRID_COLS; col++) {
      const lon = west + (col / (GRID_COLS - 1)) * (east - west);
      values[row * GRID_COLS + col] = elevationAt(lon, lat, center);
    }
  }
  const cellSizeM =
    ((east - west) * metersPerDegLon(center.latitude)) / (GRID_COLS - 1);
  return {
    width: GRID_COLS,
    height: GRID_ROWS,
    values,
    west,
    south,
    east,
    north,
    cellSizeM,
  };
}

/** Terrarium RGB encoding for MapLibre raster-dem. */
function terrariumPixel(elevM) {
  const enc = Math.round((elevM + 32768) * 256);
  const r = (enc >> 16) & 255;
  const g = (enc >> 8) & 255;
  const b = enc & 255;
  return [r, g, b, 255];
}

/**
 * Raster-dem ImageData for fixture hillshade + terrain.
 * @param {DemGrid} grid
 */
export function demGridToImageData(grid) {
  const { width, height, values } = grid;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < values.length; i++) {
    const px = terrariumPixel(values[i]);
    const o = i * 4;
    data[o] = px[0];
    data[o + 1] = px[1];
    data[o + 2] = px[2];
    data[o + 3] = px[3];
  }
  return new ImageData(data, width, height);
}

/** @param {DemGrid} grid */
export function demGridToCanvas(grid) {
  const canvas = document.createElement("canvas");
  canvas.width = grid.width;
  canvas.height = grid.height;
  canvas.getContext("2d").putImageData(demGridToImageData(grid), 0, 0);
  return canvas;
}
export function computeHillshadeImageData(grid) {
  const { width, height, values, cellSizeM } = grid;
  const az = (315 * Math.PI) / 180;
  const alt = (42 * Math.PI) / 180;
  const zFactor = 2.2;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const idx = row * width + col;
      const z = values[idx];
      const zL = values[row * width + Math.max(0, col - 1)];
      const zR = values[row * width + Math.min(width - 1, col + 1)];
      const zU = values[Math.max(0, row - 1) * width + col];
      const zD = values[Math.min(height - 1, row + 1) * width + col];
      const dzdx = ((zR - zL) / (2 * cellSizeM)) * zFactor;
      const dzdy = ((zD - zU) / (2 * cellSizeM)) * zFactor;
      const slope = Math.atan(Math.hypot(dzdx, dzdy));
      const aspect = Math.atan2(dzdy, -dzdx);
      let shade =
        255 *
        (Math.cos(alt) * Math.cos(slope) +
          Math.sin(alt) * Math.sin(slope) * Math.cos(az - aspect));
      shade = Math.max(0, Math.min(255, shade));
      const o = idx * 4;
      data[o] = shade * 0.42 + 36;
      data[o + 1] = shade * 0.4 + 32;
      data[o + 2] = shade * 0.36 + 28;
      data[o + 3] = 210;
    }
  }
  return new ImageData(data, width, height);
}

/** @param {DemGrid} grid */
export function hillshadeGridToCanvas(grid) {
  const canvas = document.createElement("canvas");
  canvas.width = grid.width;
  canvas.height = grid.height;
  canvas.getContext("2d").putImageData(computeHillshadeImageData(grid), 0, 0);
  return canvas;
}

/**
 * Marching-squares contour tracer (minimal inline, 5 m interval).
 * @param {DemGrid} grid
 * @param {number} [intervalM]
 */
export function contoursFromDemGrid(grid, intervalM = CONTOUR_INTERVAL_M) {
  const { width, height, values, west, south, east, north } = grid;
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const features = [];
  const lonStep = (east - west) / (width - 1);
  const latStep = (north - south) / (height - 1);

  function cornerXY(corner, col, row) {
    if (corner === 0) return [west + col * lonStep, south + row * latStep];
    if (corner === 1) return [west + (col + 1) * lonStep, south + row * latStep];
    if (corner === 2) return [west + (col + 1) * lonStep, south + (row + 1) * latStep];
    return [west + col * lonStep, south + (row + 1) * latStep];
  }

  function cornerVal(corner, col, row) {
    if (corner === 0) return values[row * width + col];
    if (corner === 1) return values[row * width + col + 1];
    if (corner === 2) return values[(row + 1) * width + col + 1];
    return values[(row + 1) * width + col];
  }

  /** Edge index → corner pair (TL=0, TR=1, BR=2, BL=3). */
  const EDGES = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
  ];

  /** @type {Record<number, [number, number][]>} */
  const MARCH = {
    0: [],
    1: [[3, 2]],
    2: [[0, 1]],
    3: [[0, 2]],
    4: [[1, 2]],
    5: [
      [0, 1],
      [2, 3],
    ],
    6: [[0, 2]],
    7: [[1, 3]],
    8: [[2, 3]],
    9: [[0, 3]],
    10: [
      [0, 3],
      [1, 2],
    ],
    11: [[1, 3]],
    12: [[1, 2]],
    13: [[0, 1]],
    14: [[2, 3]],
    15: [],
  };

  function edgeCrossing(edgeIdx, col, row, level) {
    const [ca, cb] = EDGES[edgeIdx];
    const va = cornerVal(ca, col, row);
    const vb = cornerVal(cb, col, row);
    const t = (level - va) / (vb - va || 1e-9);
    const [ax, ay] = cornerXY(ca, col, row);
    const [bx, by] = cornerXY(cb, col, row);
    return [ax + t * (bx - ax), ay + t * (by - ay)];
  }

  for (let level = Math.ceil(min / intervalM) * intervalM; level <= max; level += intervalM) {
    for (let row = 0; row < height - 1; row++) {
      for (let col = 0; col < width - 1; col++) {
        let mask = 0;
        for (let c = 0; c < 4; c++) {
          if (cornerVal(c, col, row) >= level) mask |= 1 << c;
        }
        const pairs = MARCH[mask] || [];
        for (const [e1, e2] of pairs) {
          features.push({
            type: "Feature",
            id: `ctr-${level}-${features.length}`,
            properties: { elevationM: level, intervalM },
            geometry: {
              type: "LineString",
              coordinates: [edgeCrossing(e1, col, row, level), edgeCrossing(e2, col, row, level)],
            },
          });
        }
      }
    }
  }
  return { type: "FeatureCollection", features };
}

export const TERRAIN_SOURCE_ID = "hauska-fixture-dem";
export const HILLSHADE_LAYER_ID = "hauska-terrain-hillshade";
export const CONTOUR_SOURCE_ID = "hauska-gis-topography-contours";

export const HILLSHADE_PAINT = {
  "hillshade-illumination-direction": 315,
  "hillshade-illumination-altitude": 42,
  "hillshade-exaggeration": 0.55,
  "hillshade-shadow-color": "#0a0e14",
  "hillshade-highlight-color": "#c4b8a4",
  "hillshade-accent-color": "#3a3228",
  "hillshade-opacity": 0.72,
};

export const CONTOUR_PAINT = {
  "line-color": "#9a8f7e",
  "line-width": 0.65,
  "line-opacity": 0.42,
};

export function terrainExaggeration() {
  return 1.35;
}
