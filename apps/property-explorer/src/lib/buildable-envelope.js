/**
 * Buildable-envelope client — PORTED from hauska-brief-extension
 * src/lib/buildable-envelope.js. The extension version routed through the MV3
 * worker proxy (workerFetch) and derived its base URL from chrome-stored
 * settings via effectiveBriefApiUrl(). Those two chrome.* couplings are the
 * ONLY things changed here:
 *
 *   - base URL: taken as an explicit argument (the same-origin cortex proxy,
 *     e.g. '/api/spine/cortex/api'), so the browser holds NO credential — the
 *     serverless api/spine.ts proxy attaches CORTEX_SERVICE_API_KEY server-side.
 *   - fetch: plain window.fetch (same-origin), not the worker proxy shim.
 *
 * Everything else — the wire-shape parsing, the honesty contract, the field
 * names, the parcel_node_id resolution — is ported VERBATIM because it is the
 * load-bearing part and the cortex-api contract is unchanged.
 *
 * ENDPOINT (POST form so we never mint a placeKey ourselves):
 *   POST {cortexBase}/brokerage/v1/place/buildable-envelope   { address } | { lat, lng }
 *
 * HONESTY (commitment #1): notSurveyGrade is ALWAYS true and confidence is
 * always `asserted`, so every consumer MUST render an "approximate — not survey
 * grade, verify with city" treatment. This module returns the disclosure +
 * coverage reason + edgeSignal so the UI can surface them; it never fabricates a
 * polygon and returns an honest {ok:false, reason} on any non-ok status.
 */

/** Round a coordinate for the request body (avoids over-precise float noise). */
function round6(n) {
  return Number.isFinite(n) ? Math.round(n * 1e6) / 1e6 : null;
}

/**
 * Build the POST body from the subject. ALWAYS prefer a real address; fall back
 * to lat/lng only when no address is present. Returns null when neither is
 * usable (never fabricates input). Address-primary is authoritative: the
 * backend situs-matches an address to the CORRECT parcel AND resolves its
 * jurisdiction (so setbacks draw); a bare coord does point-in-polygon on the
 * geocode centroid and can land on an adjacent lot.
 *
 * @param {{ address?: string|null, lat?: number|null, lng?: number|null }} sel
 * @returns {object|null}
 */
export function envelopeRequestBody(sel) {
  const address = typeof sel?.address === "string" ? sel.address.trim() : "";
  if (address) return { address };
  const lat = round6(sel?.lat);
  const lng = round6(sel?.lng);
  if (lat != null && lng != null) return { lat, lng };
  return null;
}

/** Read a Response body as JSON without throwing. */
async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

/**
 * Parse the backend's AUTHORITATIVE geocode out of a `placeKey` of the form
 * `coord:<lat>:<lng>`. That coord IS the backend's resolution of the subject to
 * a point (the same resolution that produced the parcel_node_id), so it is the
 * source of truth for "where is this property". Returns `{ lat, lng }` or null.
 *
 * @param {string|null|undefined} placeKey
 * @returns {{ lat: number, lng: number } | null}
 */
export function parsePlaceKey(placeKey) {
  if (typeof placeKey !== "string") return null;
  const m = placeKey.trim().match(/^coord:(-?\d+(?:\.\d+)?)[:,](-?\d+(?:\.\d+)?)$/i);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/**
 * Read the resolved parcel's `parcel_node_id` from the envelope response — the
 * canvas-free subject identity. Present whenever the parcel RESOLVES, even for
 * `no-buildable-area` / `no-setbacks` jurisdictions. DEFENSIVE by design: reads
 * from every plausible location, falls back to null.
 *
 * @param {object} json     the full response envelope
 * @param {object} payload  json.payload
 * @param {object|null} props  the envelope feature's properties (may carry it)
 * @returns {string|null}
 */
export function parcelNodeIdFromEnvelope(json, payload, props) {
  const p = payload?.parcel ?? {};
  const raw =
    p.parcel_node_id ??
    p.parcelNodeId ??
    payload?.parcel_node_id ??
    payload?.parcelNodeId ??
    json?.parcel_node_id ??
    props?.parcel_node_id ??
    props?.parcelNodeId ??
    null;
  return raw != null && String(raw).trim() ? String(raw) : null;
}

/**
 * The setbacks SLOT patched onto the subject node (front/side/rear/district),
 * matching the BE areaContext contract field names exactly. Null when absent.
 */
export function setbacksFromProps(props) {
  const s = props?.setbacks;
  if (!s || typeof s !== "object") return null;
  const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    front_ft: num(s.front_ft),
    side_ft: num(s.side_ft),
    rear_ft: num(s.rear_ft),
    district: typeof s.district === "string" ? s.district : null,
  };
}

/**
 * The store-projected envelope SUMMARY (the fields patched onto the subject
 * node's `envelope` slot). Numbers only; no geometry.
 *
 * @param {object} props   the envelope feature's properties
 * @param {object} wrapper the payload/wrapper (for approximate/confidence)
 * @returns {object}
 */
export function envelopeSummaryFromProps(props, wrapper) {
  const p = props || {};
  const w = wrapper || {};
  return {
    buildableAreaSqFt: p.buildableAreaSqFt ?? null,
    buildableAreaPct: p.buildableAreaPct ?? null,
    parcelAreaSqFt: p.parcelAreaSqFt ?? null,
    maxHeightFt: p.maxHeightFt ?? null,
    maxLotCoveragePct: p.maxLotCoveragePct ?? null,
    maxFootprintSqFt: p.maxFootprintSqFt ?? null,
    notSurveyGrade: p.notSurveyGrade ?? true,
    approximate: p.approximate ?? w.approximate ?? true,
    edgeSignal: p.edgeSignal ?? null,
    disclosure: p.disclosure ?? null,
    citationUrl: p.citationUrl ?? w.citationUrl ?? null,
    district: p.setbacks?.district ?? w.district ?? null,
  };
}

/**
 * Fetch the buildable envelope for a subject selection and normalize it into a
 * draw-ready result. Never throws for an honest backend "no envelope" state —
 * those resolve to { ok:false, status, reason } so the caller can surface the
 * reason (commitment #1) without drawing a fabricated polygon. A thrown network
 * error (proxy unreachable) rejects — the caller catches and shows "couldn't
 * load".
 *
 * @param {{ address?: string|null, lat?: number|null, lng?: number|null }} sel
 * @param {string} cortexBase  the same-origin cortex proxy base, e.g.
 *                             '/api/spine/cortex/api'
 * @param {(input: string, init?: object) => Promise<Response>} [fetchImpl]
 *                             defaults to window.fetch (same-origin, keyless)
 * @returns {Promise<object>}
 */
export async function fetchBuildableEnvelope(sel, cortexBase, fetchImpl = fetch) {
  const body = envelopeRequestBody(sel);
  if (!body) {
    return {
      ok: false,
      status: "no-input",
      reason: "No address or coordinates to derive a buildable envelope.",
      empty: true,
    };
  }

  const base = String(cortexBase || "").replace(/\/$/, "");
  const res = await fetchImpl(`${base}/brokerage/v1/place/buildable-envelope`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await safeJson(res);
  const status = json?.status ?? (res.ok ? "ok" : `http-${res.status}`);
  const earlyPayload = json?.payload ?? {};

  // Honest non-ok backend states: no fabricated geometry, surface the reason.
  // The parcel can still RESOLVE without an envelope to draw (`no-setbacks` is a
  // corpus gap — the parcel is real, there is just no setback rule), so we
  // surface the canvas-free parcelNodeId even here.
  if (!res.ok || (status !== "ok" && status !== "no-buildable-area")) {
    return {
      ok: false,
      status,
      reason:
        json?.reason ||
        json?.message ||
        `Buildable envelope unavailable (${status}).`,
      empty: true,
      parcelNodeId: parcelNodeIdFromEnvelope(json, earlyPayload, null),
    };
  }

  const payload = json?.payload ?? {};
  const fc = payload.geojson ?? json?.geojson ?? null;
  const feature =
    fc && Array.isArray(fc.features) && fc.features.length ? fc.features[0] : null;
  const props = feature?.properties ?? null;
  const geometry = feature?.geometry ?? null; // Polygon (inset buildable) or null
  const parcelNodeId = parcelNodeIdFromEnvelope(json, payload, props);

  const coverage = json?.coverage ?? {};
  const confidence = json?.confidence ?? null;
  const empty = status === "no-buildable-area" || payload.empty === true || !geometry;

  const setbacks = setbacksFromProps(props);
  const summary = envelopeSummaryFromProps(props, {
    ...payload,
    approximate: payload.approximate,
    district: payload.district,
    citationUrl: payload.citationUrl,
  });

  if (empty) {
    return {
      ok: false,
      status: "no-buildable-area",
      reason:
        props?.emptyReason ||
        props?.disclosure ||
        coverage.reason ||
        "No buildable area — setbacks exceed the lot.",
      empty: true,
      setbacks,
      summary,
      disclosure: props?.disclosure ?? null,
      parcelNodeId,
    };
  }

  return {
    ok: true,
    empty: false,
    status,
    geometry, // GeoJSON Polygon — the inset buildable area
    properties: props,
    setbacks,
    summary,
    disclosure: props?.disclosure ?? null,
    coverageReason: coverage.reason ?? null,
    coverageDegraded: coverage.degraded === true,
    confidence, // { value, kind:"asserted" }
    edgeSignal: props?.edgeSignal ?? null,
    approximate: props?.approximate ?? payload.approximate ?? true,
    notSurveyGrade: props?.notSurveyGrade ?? true,
    citationUrl: props?.citationUrl ?? payload.citationUrl ?? null,
    parcel: payload.parcel ?? null,
    parcelNodeId,
  };
}
