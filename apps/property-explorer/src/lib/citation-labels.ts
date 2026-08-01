// Human-readable citation labels for GIS zoning provenance and chat chips.
// Raw ArcGIS service table names (e.g. Zoned_Parcels) are operator-facing only.

const GIS_LAYER_LABELS: Record<string, string> = {
  Zoned_Parcels: "City of Bastrop zoning map",
  Zoning_Districts: "City zoning districts map",
  Zoning_Place_Type: "City zoning place-type map",
};

/** Turn a GIS cityKey (bastrop-city-tx) into a short place label. */
export function formatCityKeyLabel(cityKey: string): string {
  const parts = cityKey.trim().toLowerCase().replace(/_/g, "-").split("-");
  const state = parts.length > 1 ? parts[parts.length - 1]!.toUpperCase() : null;
  const cityParts = state ? parts.slice(0, -1) : parts;
  const citySlug = cityParts.filter((p) => p !== "city").join(" ");
  if (!citySlug) return cityKey;
  const cityName = citySlug
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return state ? `${cityName}, ${state}` : cityName;
}

/** Human label for a GIS layer + optional cityKey provenance pair. */
export function humanizeGisZoningSourceLabel(
  layerName: string,
  cityKey?: string | null,
): string {
  const base =
    GIS_LAYER_LABELS[layerName] ??
    layerName.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const place = cityKey ? formatCityKeyLabel(cityKey) : null;
  return place ? `${base} (${place})` : base;
}

/** If label looks like "Zoned_Parcels (bastrop-city-tx)", rewrite it. */
export function humanizeCitationLabel(label: string): string {
  const m = label.match(/^([A-Za-z0-9_]+)\s*\(([^)]+)\)\s*$/);
  if (!m) return label;
  const [, layer, cityKey] = m;
  if (!layer.includes("_")) return label;
  return humanizeGisZoningSourceLabel(layer, cityKey);
}
