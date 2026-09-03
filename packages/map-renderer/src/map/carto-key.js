/**
 * CARTO retired keyless raster basemaps (verified live 2026-09-02: an
 * unkeyed request to basemaps.cartocdn.com now returns HTTP 200 with an
 * "API KEY REQUIRED" watermark PNG, not an error status -- a naive
 * status-code check would miss the defect entirely). The keyed equivalent
 * is the SAME style path with ?key= appended -- NOT a renamed
 * `rastertiles/<style>` path; that prefix belongs only to the newer
 * `voyager` style family (confirmed against CartoDB/basemap-styles, the
 * style-list source of truth, and live-tested: a keyed request to the bare
 * `dark_all` path returns a real, watermark-free tile; `light_only_labels`
 * likewise).
 *
 * MAP-BASEMAP-KEY (F-01). Shared by gis-map-paint.js (dark_all) and
 * basemap-labels.js (light_only_labels) so both read the key the same way.
 */

/** Publishable client-side key; the operator domain-restricts it in the CARTO dashboard. Trimmed -- the Secret Manager value carries a trailing CRLF. */
export function cartoApiKey() {
  const key =
    typeof import.meta !== "undefined" ? import.meta.env?.VITE_CARTO_API_KEY : undefined;
  return typeof key === "string" ? key.trim() : "";
}

/** Keyed tile URL set for one CARTO raster style, subdomains a/b/c, @2x retina. */
export function keyedCartoTileUrls(style) {
  const key = cartoApiKey();
  const suffix = key ? `?key=${key}` : "";
  return ["a", "b", "c"].map(
    (sub) => `https://${sub}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}@2x.png${suffix}`,
  );
}
