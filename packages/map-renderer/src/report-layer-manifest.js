/**
 * Report-to-manifest contract (architecture homes doc 01).
 *
 * Reports declare visualizable spatial layers; the shared map renderer
 * reads the manifest and pulls layer data from the spine through the gate.
 * Reports own narrative + manifest; hauska-map owns rendering.
 */

export const REPORT_LAYER_MANIFEST_VERSION = "1.0.0";

/**
 * @typedef {Object} ReportLayerManifestEntry
 * @property {string} layerKey — registry key (hauska-map LAYER_REGISTRY)
 * @property {string} label — human label for legend/audit
 * @property {string} [sourceAtom] — spine atom family supplying geometry
 * @property {boolean} [defaultOn] — initial visibility
 * @property {string} [readContractRole] — which axis drives styling
 */

/**
 * @typedef {Object} ReportLayerManifest
 * @property {string} manifestVersion
 * @property {string} reportType
 * @property {string} [appId]
 * @property {string} parcelBinding — how manifest binds to report parcel
 * @property {ReportLayerManifestEntry[]} layers
 * @property {string} [narrativeAtom] — reasoning atom carrying report prose
 */

/** @type {Record<string, ReportLayerManifest>} */
export const REPORT_LAYER_MANIFESTS = {
  hydrology: {
    manifestVersion: REPORT_LAYER_MANIFEST_VERSION,
    reportType: "hydrology",
    appId: "cortex",
    parcelBinding: "report.parcel.placeKey",
    narrativeAtom: "site-drainage",
    layers: [
      {
        layerKey: "hydrology-flow",
        label: "Drainage (D8 flow)",
        sourceAtom: "site-drainage",
        defaultOn: true,
        readContractRole: "calibratedConfidence",
      },
      {
        layerKey: "flood-zone",
        label: "Flood depth / zone",
        sourceAtom: "site-drainage",
        defaultOn: true,
        readContractRole: "calibratedConfidence",
      },
      {
        layerKey: "topography-contours",
        label: "Elevation contours",
        sourceAtom: "site-topography",
        defaultOn: true,
        readContractRole: "assertedConfidence",
      },
      {
        layerKey: "contested-ground",
        label: "Contested hydrology overlay",
        sourceAtom: "site-drainage",
        defaultOn: true,
        readContractRole: "consequence",
      },
    ],
  },
};

/**
 * Resolve manifest for a report run.
 * @param {{ appId?: string, reportType: string, manifest?: ReportLayerManifest }} input
 * @returns {ReportLayerManifest | null}
 */
export function resolveReportLayerManifest(input) {
  if (input.manifest?.layers?.length) return input.manifest;
  const key = input.reportType;
  const base = REPORT_LAYER_MANIFESTS[key];
  if (!base) return null;
  if (input.appId && base.appId && base.appId !== input.appId) return null;
  return base;
}

/**
 * Apply manifest → visible layer set for renderer.
 * @param {ReportLayerManifest} manifest
 * @param {Set<string>} [existing]
 * @returns {Set<string>}
 */
export function visibleLayersFromManifest(manifest, existing = new Set()) {
  const next = new Set(existing);
  for (const entry of manifest.layers) {
    if (entry.defaultOn !== false) next.add(entry.layerKey);
  }
  return next;
}

/**
 * Validate a wire manifest from cortex-api reporting.
 * @param {unknown} value
 * @returns {{ ok: boolean, manifest?: ReportLayerManifest, errors?: string[] }}
 */
export function parseReportLayerManifest(value) {
  if (!value || typeof value !== "object") {
    return { ok: false, errors: ["manifest must be an object"] };
  }
  const m = value;
  const errors = [];
  if (!m.manifestVersion) errors.push("manifestVersion required");
  if (!m.reportType) errors.push("reportType required");
  if (!Array.isArray(m.layers) || !m.layers.length) errors.push("layers[] required");
  for (const layer of m.layers || []) {
    if (!layer.layerKey) errors.push("each layer requires layerKey");
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, manifest: m };
}
