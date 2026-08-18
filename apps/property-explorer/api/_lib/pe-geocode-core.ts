// apps/property-explorer/api/_lib/pe-geocode-core.ts
//
// Pure helpers for the Property Explorer geocode BFF (type-ahead search).
// Framework-free so param validation, upstream-URL construction, and the
// Photon feature -> wire-suggestion mapping are unit-testable without a
// serverless runtime.
//
// Upstream: the public OSM-based Photon API (photon.komoot.io) — no API key,
// typeahead-grade, native location bias via lat/lon. The BFF exists so:
//   - the base URL is env-tunable (GEOCODER_URL),
//   - we control caching (edge-cache 60s on the handler),
//   - we send a proper User-Agent and never expose client IPs to the
//     third party beyond necessity.
//
// Results are OSM data — the suggest dropdown carries a "search © OSM"
// attribution footer (basemap already credits © OSM).

export const DEFAULT_GEOCODER_URL = 'https://photon.komoot.io'

/** Max suggestions the BFF returns (the client caps at 7 by default). */
export const GEOCODE_MAX_LIMIT = 10
export const GEOCODE_DEFAULT_LIMIT = 7

export interface GeocodeParams {
  q: string
  /** Viewport bias — current map center (Photon ranks nearer results first). */
  lat: number | null
  lon: number | null
  /** Photon location_bias_scale companion — current map zoom. */
  zoom: number | null
  limit: number
}

function finiteInRange(v: unknown, lo: number, hi: number): number | null {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN
  if (!Number.isFinite(n) || n < lo || n > hi) return null
  return n
}

/** Validate + normalise query params into GeocodeParams, or an error message. */
export function parseGeocodeParams(
  query: Record<string, unknown>,
): { ok: true; params: GeocodeParams } | { ok: false; message: string } {
  const rawQ = query.q
  const q = typeof rawQ === 'string' ? rawQ.trim() : ''
  if (!q) return { ok: false, message: 'q is required' }
  if (q.length > 256) return { ok: false, message: 'q too long (max 256 chars)' }

  const lat = finiteInRange(query.lat, -90, 90)
  const lon = finiteInRange(query.lon, -180, 180)
  const zoom = finiteInRange(query.zoom, 0, 24)
  const rawLimit = finiteInRange(query.limit, 1, GEOCODE_MAX_LIMIT)
  const limit = rawLimit ? Math.floor(rawLimit) : GEOCODE_DEFAULT_LIMIT

  return {
    ok: true,
    // Bias only when BOTH coords came through (Photon needs the pair).
    params: { q, lat: lon == null ? null : lat, lon: lat == null ? null : lon, zoom, limit },
  }
}

/** Build the upstream Photon URL. Passes q/limit always, lat+lon+zoom when given. */
export function buildPhotonUrl(base: string, params: GeocodeParams): string {
  const trimmedBase = base.replace(/\/+$/, '')
  const qs = new URLSearchParams({ q: params.q, limit: String(params.limit) })
  if (params.lat != null && params.lon != null) {
    qs.set('lat', String(params.lat))
    qs.set('lon', String(params.lon))
    if (params.zoom != null) qs.set('zoom', String(Math.round(params.zoom)))
  }
  qs.set('lang', 'en')
  return `${trimmedBase}/api?${qs.toString()}`
}

/**
 * The trimmed wire feature the BFF returns to the client — only the fields the
 * suggest UI needs. `extent` is Photon's [minLon, maxLat, maxLon, minLat].
 */
export interface GeocodeWireFeature {
  name: string | null
  housenumber: string | null
  street: string | null
  city: string | null
  county: string | null
  state: string | null
  postcode: string | null
  countrycode: string | null
  osmKey: string | null
  osmValue: string | null
  /** Photon result type when present (house | street | district | city | …). */
  type: string | null
  lat: number
  lng: number
  extent: [number, number, number, number] | null
}

export interface GeocodeWireResponse {
  features: GeocodeWireFeature[]
  attribution: 'search © OSM'
}

/**
 * The ONLY country this surface serves, and therefore the whole exclusion set.
 *
 * Photon is a worldwide index and `buildPhotonUrl` sends no country filter, so
 * "Bastrop" or "Spring Street" returned matches on other continents. Every
 * downstream path here is a US jurisdictional lookup — a parcel node id is a
 * US county FIPS plus a prop id — so a non-US hit can only ever be a dead end.
 *
 * A feature with NO countrycode is also dropped, deliberately: this is a filter
 * on what we can PLACE in a US jurisdiction, and an uncountried OSM node is not
 * something we can. Photon populates the field for addressable results.
 */
export const GEOCODE_ALLOWED_COUNTRY_CODES: ReadonlySet<string> = new Set(['US'])

/** True when a mapped wire feature is inside the served country set. */
export function isServedCountry(feature: GeocodeWireFeature): boolean {
  const code = feature.countrycode
  return code !== null && GEOCODE_ALLOWED_COUNTRY_CODES.has(code.toUpperCase())
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/**
 * Map a raw Photon FeatureCollection onto the trimmed wire shape. Skips any
 * feature without a usable Point coordinate. Never throws on malformed JSON —
 * a bad payload maps to an empty feature list (the client shows the honest
 * empty state).
 */
export function mapPhotonResponse(payload: unknown): GeocodeWireResponse {
  const empty: GeocodeWireResponse = { features: [], attribution: 'search © OSM' }
  const p = payload as Record<string, unknown> | null
  const features = p?.features
  if (!Array.isArray(features)) return empty

  const out: GeocodeWireFeature[] = []
  for (const f of features) {
    const feat = f as Record<string, unknown> | null
    const geom = feat?.geometry as Record<string, unknown> | undefined
    const coords = geom?.coordinates
    if (!Array.isArray(coords) || coords.length < 2) continue
    const lng = coords[0]
    const lat = coords[1]
    if (typeof lng !== 'number' || typeof lat !== 'number') continue
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
    const props = (feat?.properties ?? {}) as Record<string, unknown>
    const rawExtent = props.extent
    const extent =
      Array.isArray(rawExtent) &&
      rawExtent.length === 4 &&
      rawExtent.every((n) => typeof n === 'number' && Number.isFinite(n))
        ? ([rawExtent[0], rawExtent[1], rawExtent[2], rawExtent[3]] as [
            number,
            number,
            number,
            number,
          ])
        : null
    out.push({
      name: str(props.name),
      housenumber: str(props.housenumber),
      street: str(props.street),
      city: str(props.city),
      county: str(props.county),
      state: str(props.state),
      postcode: str(props.postcode),
      countrycode: str(props.countrycode),
      osmKey: str(props.osm_key),
      osmValue: str(props.osm_value),
      type: str(props.type),
      lat,
      lng,
      extent,
    })
  }
  // US-only, filtered HERE (server side) rather than in the dropdown, so the
  // limit the client asked for is spent on results it can actually open.
  return {
    features: out.filter(isServedCountry),
    attribution: 'search © OSM',
  }
}

/** The honest error wire shape the handler returns on upstream failure. */
export interface GeocodeErrorShape {
  error: 'invalid_request' | 'geocoder_unreachable' | 'method_not_allowed'
  message: string
}

export function geocoderBaseUrl(): string {
  // globalThis-guarded so this file typechecks in the BROWSER program too
  // (src/lib imports the wire types from here; no node types there).
  const proc = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process
  const env = proc?.env?.GEOCODER_URL
  return env && env.trim() ? env.trim() : DEFAULT_GEOCODER_URL
}
