/**
 * Central-TX county FIPS for a viewport center. PE is Bastrop-first;
 * expand as coverage lands. Null → skip road fetch (honest empty layer).
 */
export function countyFipsForViewportCenter(
  lat: number,
  lng: number,
): string | null {
  // Bastrop County rough bounds
  if (lng > -97.65 && lng < -97.0 && lat > 29.85 && lat < 30.45) return "48021";
  // Travis
  if (lng > -98.05 && lng < -97.4 && lat > 30.05 && lat < 30.55) return "48453";
  // Hays
  if (lng > -98.2 && lng < -97.7 && lat > 29.85 && lat < 30.25) return "48209";
  // Williamson
  if (lng > -97.95 && lng < -97.3 && lat > 30.4 && lat < 30.9) return "48491";
  return null;
}
