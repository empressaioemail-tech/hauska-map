// Share-view dossier drawings — a SIMPLE STATIC SVG sketch (honest+simple by
// design): the sharer's saved map annotations projected into a small square
// viewBox, normalized to the drawings' own bounding box. Schematic only —
// labeled "not to scale", no basemap, no parcel claim, nothing fabricated.
// Pure module so the projection is unit-testable.

export interface SketchPath {
  /** SVG path data in the 0..100 viewBox. */
  d: string;
  /** Closed shapes (polygons) get a translucent fill; lines stay open. */
  closed: boolean;
}

export interface SketchPoint {
  x: number;
  y: number;
}

export interface DrawingsSketch {
  viewBox: string;
  paths: SketchPath[];
  points: SketchPoint[];
  featureCount: number;
}

interface FeatureLike {
  type?: unknown;
  geometry?: { type?: unknown; coordinates?: unknown } | null;
}

const VIEW = 100;
const PAD = 6;

type Ring = Array<[number, number]>;

function isPosition(v: unknown): v is [number, number] {
  return (
    Array.isArray(v) &&
    typeof v[0] === "number" &&
    typeof v[1] === "number" &&
    Number.isFinite(v[0]) &&
    Number.isFinite(v[1])
  );
}

function positionsOf(coordinates: unknown, depth = 0): Ring[] {
  // Normalize any GeoJSON coordinate nesting into a list of position runs.
  if (isPosition(coordinates)) return [[coordinates]];
  if (!Array.isArray(coordinates) || depth > 4) return [];
  if (coordinates.every(isPosition)) {
    return [coordinates as Ring];
  }
  const runs: Ring[] = [];
  for (const child of coordinates) {
    runs.push(...positionsOf(child, depth + 1));
  }
  return runs;
}

/**
 * Project the saved drawings into a static sketch. Returns null when there
 * is nothing drawable — the share view then lists the summary line only.
 */
export function drawingsToSketch(drawings: {
  features?: FeatureLike[] | null;
} | null): DrawingsSketch | null {
  const features = drawings?.features ?? [];
  if (!Array.isArray(features) || features.length === 0) return null;

  interface Shape {
    runs: Ring[];
    kind: "point" | "line" | "polygon";
  }
  const shapes: Shape[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const feature of features) {
    const geom = feature?.geometry;
    const type = typeof geom?.type === "string" ? geom.type : null;
    if (!type) continue;
    const runs = positionsOf(geom?.coordinates);
    if (runs.length === 0) continue;
    for (const run of runs) {
      for (const [x, y] of run) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    const kind = type.includes("Polygon")
      ? "polygon"
      : type.includes("LineString")
        ? "line"
        : "point";
    shapes.push({ runs, kind });
  }

  if (shapes.length === 0 || !Number.isFinite(minX) || !Number.isFinite(minY)) {
    return null;
  }

  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const span = Math.max(spanX, spanY) || 1e-9;
  const scale = (VIEW - PAD * 2) / span;
  // Center the smaller axis; flip Y (SVG y grows downward, latitude upward).
  const offsetX = PAD + ((VIEW - PAD * 2) - spanX * scale) / 2;
  const offsetY = PAD + ((VIEW - PAD * 2) - spanY * scale) / 2;
  const px = (x: number) => offsetX + (x - minX) * scale;
  const py = (y: number) => VIEW - (offsetY + (y - minY) * scale);

  const paths: SketchPath[] = [];
  const points: SketchPoint[] = [];
  for (const shape of shapes) {
    if (shape.kind === "point") {
      for (const run of shape.runs) {
        for (const [x, y] of run) {
          points.push({ x: round2(px(x)), y: round2(py(y)) });
        }
      }
      continue;
    }
    for (const run of shape.runs) {
      if (run.length < 2) continue;
      const d =
        run
          .map(
            ([x, y], i) =>
              `${i === 0 ? "M" : "L"}${round2(px(x))} ${round2(py(y))}`,
          )
          .join(" ") + (shape.kind === "polygon" ? " Z" : "");
      paths.push({ d, closed: shape.kind === "polygon" });
    }
  }

  if (paths.length === 0 && points.length === 0) return null;
  return {
    viewBox: `0 0 ${VIEW} ${VIEW}`,
    paths,
    points,
    featureCount: features.length,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Honest one-line summary of what was drawn ("3 shapes · 2 markers"). */
export function drawingsSummaryLine(drawings: {
  features?: FeatureLike[] | null;
} | null): string | null {
  const features = drawings?.features ?? [];
  if (!Array.isArray(features) || features.length === 0) return null;
  let markers = 0;
  let shapes = 0;
  for (const f of features) {
    const type = typeof f?.geometry?.type === "string" ? f.geometry!.type : "";
    if (String(type).includes("Point")) markers += 1;
    else shapes += 1;
  }
  const parts: string[] = [];
  if (shapes > 0) parts.push(`${shapes} shape${shapes === 1 ? "" : "s"}`);
  if (markers > 0) parts.push(`${markers} marker${markers === 1 ? "" : "s"}`);
  return parts.join(" · ") || null;
}
